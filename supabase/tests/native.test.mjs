import {testSharedStock} from './shared-stock.test.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testOperations } from './operations.test.mjs';
import { testCases } from './cases.test.mjs';
import { testMakerChecker } from './maker-checker.test.mjs';
import { testWorkflows } from './workflows.test.mjs';
import { testRisk } from './risk.test.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let embedded;
let embeddedDirectory;
let config;
if(process.argv.includes('--embedded')) {
 const {default:EmbeddedPostgres}=await import('embedded-postgres');
 await mkdir(path.resolve(root,'../test-results'),{recursive:true});
 const directory=await mkdtemp(path.resolve(root,'../test-results/postgres-'));
 embeddedDirectory=directory;
 config={host:'127.0.0.1',port:55439,user:'postgres',password:randomUUID(),database:'postgres'};
 embedded=new EmbeddedPostgres({databaseDir:directory,port:config.port,user:config.user,password:config.password,
  persistent:true,initdbFlags:['--no-sync','--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:message=>{if(String(message).includes('FATAL'))console.error(String(message));}});
 console.log('Initializing disposable native PostgreSQL (test-only --no-sync).');
 await embedded.initialise();
 console.log('Starting loopback native PostgreSQL.');
 // Windows can report readiness differently from the package's log matcher.
 // A real authenticated connection is the readiness check on every platform.
 const starting=embedded.start();
 const connected=(async()=>{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   const probe=new pg.Client({...config,connectionTimeoutMillis:1000});
   try{await probe.connect();return;}catch{}finally{await probe.end();}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Disposable PostgreSQL did not accept authenticated connections');
 })();
 await Promise.race([starting,connected]);
}
const admin=new pg.Client(config);
await admin.connect();
const clients=[];
try {
 await admin.query(await readFile(path.join(root,'tests/bootstrap.sql'),'utf8'));
 for(const file of (await readdir(path.join(root,'migrations'))).filter(f=>f.endsWith('.sql')).sort())await admin.query(await readFile(path.join(root,'migrations',file),'utf8'));
 await admin.query(await readFile(path.join(root,'seed.sql'),'utf8'));await admin.query(await readFile(path.join(root,'seed.sql'),'utf8'));
 await admin.query(await readFile(path.join(root,'tests/native-smoke.sql'),'utf8'));
 await testOperations(admin);
 await testCases(admin);
 await testMakerChecker(admin);
 await testWorkflows(admin);
 await testRisk(admin);
 await testSharedStock(admin);
 // Actual concurrent SME requests contend for the same common stock row.
 {
  const warehouse='10000000-0000-4000-8000-000000000001',product=randomUUID(),actors=[randomUUID(),randomUUID()];
  const tenants=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
  await admin.query("insert into public.products(id,warehouse_id,sku,name,available_qty) values($1,$2,$3,'Shared race stock',5)",[product,warehouse,product]);
  const raceClients=[];
  for(let i=0;i<2;i++){
   await admin.query('insert into auth.users(id,email) values($1,$2)',[actors[i],actors[i]+'@shared-race.test']);
   await admin.query("insert into public.profiles(id,display_name) values($1,'Shared race SME')",[actors[i]]);
   await admin.query("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme')",[actors[i],warehouse,tenants[i]]);
   const c=new pg.Client(config);await c.connect();clients.push(c);raceClients.push(c);
   await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[actors[i]]);
  }
  const results=await Promise.allSettled(raceClients.map((c,i)=>c.query('select public.sme_order_command($1,$2,null,$3::jsonb) r',[warehouse,randomUUID(),JSON.stringify({warehouse_id:warehouse,sme_id:tenants[i],order_kind:'sme_self_delivery',recipient_name:'Race SME',recipient_phone:'09123',address:'Yangon',latitude:16.8,longitude:96.1,lines:[{product_id:product,expected_qty:4}]})])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.message.includes('stock_unavailable')).length,1);
  assert.equal((await admin.query('select reserved_qty from public.products where id=$1',[product])).rows[0].reserved_qty,4);
  console.log('PASS SHARED STOCK CONCURRENCY: two SMEs race for five units; one four-unit order commits and the other rolls back');
 }
 const w='10000000-0000-4000-8000-000000000001',sme='20000000-0000-4000-8000-000000000001';
 const actor=randomUUID(),product=randomUUID(),corr=randomUUID();
 await admin.query('insert into auth.users(id,email) values($1,$2)',[actor,'race@example.test']);
 await admin.query("insert into public.profiles(id,display_name) values($1,'Race staff')",[actor]);
 await admin.query("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'staff')",[actor,w]);
 await admin.query("insert into public.products(id,warehouse_id,sme_id,sku,name) values($1,$2,$3,$4,'Race product')",[product,w,sme,product]);
 for(let i=0;i<2;i++){const c=new pg.Client(config);await c.connect();clients.push(c);}
 const sql='select public.ops_command($1,$2,$3,$4,$5::jsonb,$6) result';
 const args=(kind,id,body,key=randomUUID())=>[w,kind,key,id,JSON.stringify(body),corr];
 const begin=async(c,role='authenticated')=>{await c.query('begin');await c.query(role==='service_role'?'set local role service_role':'set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);};
 const invoke=async(kind,id,body,key)=>{await begin(clients[0]);try{const r=(await clients[0].query(sql,args(kind,id,body,key))).rows[0].result;await clients[0].query('commit');return r;}catch(e){await clients[0].query('rollback');throw e;}};
 const create=async(direction='inbound',qty=100)=>invoke('create',null,{sme_id:sme,reference:randomUUID(),direction,delivery_mode:direction==='inbound'?null:'in_house',lines:[{product_id:product,expected_qty:qty}]});
 const receipt=(qty,version=1)=>({expected_version:version,final:true,lines:[{product_id:product,received_qty:qty,damaged_qty:0}],evidence_ids:[],notes:'Verified race count'});
 async function race(a,b,statement=sql,role='authenticated') {
  await begin(clients[0],role);await begin(clients[1],role);
  try {
   const first=(await clients[0].query(statement,a)).rows[0].result;
   const second=clients[1].query(statement,b).then(r=>({result:r.rows[0].result}),e=>({error:e}));
   // Prove the second real server connection is blocked on our transaction.
   const deadline=Date.now()+5000;let waiting=false;
   while(Date.now()<deadline){
    const row=(await admin.query("select wait_event_type from pg_stat_activity where pid=$1",[clients[1].processID])).rows[0];
    if(row?.wait_event_type==='Lock'){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.ok(waiting,'Second native connection must actually contend on a database lock');
   await clients[0].query('commit');const next=await second;
   await clients[1].query(next.error?'rollback':'commit');return [first,next];
  } catch(e){await clients[0].query('rollback');await clients[1].query('rollback');throw e;}
 }
 let shipment=await create(),key=randomUUID(),body=receipt(90);
 let [first,next]=await race(args('receipt',shipment.id,body,key),args('receipt',shipment.id,body,key));
 assert.deepEqual(next.result,first);
 assert.equal((await admin.query('select count(*)::int n from public.receipts where shipment_id=$1',[shipment.id])).rows[0].n,1);
 console.log('PASS NATIVE: simultaneous identical receipt returns original result once');
 shipment=await create();
 [first,next]=await race(args('receipt',shipment.id,receipt(90)),args('receipt',shipment.id,receipt(90)));
 assert.equal(next.error?.message,'stale_version');
 assert.equal((await admin.query('select available_qty from public.products where id=$1',[product])).rows[0].available_qty,180);
 console.log('PASS NATIVE: different receipt keys on same version cannot double stock/cases');
 const a=await create(),b=await create();
 [first,next]=await race(args('receipt',a.id,receipt(40)),args('receipt',b.id,receipt(50)));
 assert.equal(next.result.received_qty,50);
 assert.equal((await admin.query('select available_qty from public.products where id=$1',[product])).rows[0].available_qty,270);
 console.log('PASS NATIVE: independent receipts serialize shared product updates without lost stock');
 const outbound=await create('outbound',200),outbound2=await create('outbound',200);
 for(const s of [outbound,outbound2]){
  for(const [type,version] of [['picked',1],['packed',2]])await invoke('event',s.id,{type,expected_version:version,notes:'Verified',verified_at:new Date().toISOString(),evidence_ids:[]});
 }
 const rider=randomUUID(),riderRow=randomUUID();
 await admin.query('insert into auth.users(id,email) values($1,$2)',[rider,'race-rider@example.test']);
 await admin.query("insert into public.profiles(id,display_name) values($1,'Race rider')",[rider]);
 await admin.query("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider')",[rider,w]);
 await admin.query('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[riderRow,w,rider]);
 for(const s of [outbound,outbound2])await admin.query('insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id,accepted_at,picked_up_at) values($1,$2,$3,$4,now(),now())',[s.id,w,sme,riderRow]);
 body={type:'dispatched',expected_version:3,notes:'Physical pickup verified',verified_at:new Date().toISOString(),evidence_ids:[]};key=randomUUID();
 [first,next]=await race(args('event',outbound.id,body,key),args('event',outbound2.id,body));
 assert.equal(next.error?.message,'stock_unavailable');
 console.log('PASS NATIVE: competing dispatches cannot consume the same available stock');
 [first,next]=await race(args('event',outbound.id,body,key),args('event',outbound.id,body,key));
 assert.deepEqual(next.result,first);
 assert.equal((await admin.query('select available_qty from public.products where id=$1',[product])).rows[0].available_qty,70);
 await assert.rejects(()=>invoke('event',outbound2.id,body),e=>e.message==='stock_unavailable');
 console.log('PASS NATIVE: concurrent dispatch retries debit once; another shipment cannot oversell');
 const caseShipment=await create();
 const caseSQL='select public.case_command($1,$2,$3,$4::jsonb,$5) result';
 const report={stage:'inbound',type:'quantity_mismatch',note:'Concurrent recorded count issue',evidence_ids:[]};
 [first,next]=await race(['report',caseShipment.id,randomUUID(),JSON.stringify(report),corr],['report',caseShipment.id,randomUUID(),JSON.stringify(report),corr],caseSQL);
 assert.equal(first.id,next.result.id);
 assert.equal((await admin.query('select count(*)::int n from public.exception_cases where shipment_id=$1',[caseShipment.id])).rows[0].n,1);
 assert.equal((await admin.query('select count(*)::int n from public.case_events where case_id=$1',[first.id])).rows[0].n,2);
 console.log('PASS NATIVE: simultaneous same-issue reports match one active case and append both reports');
 // Two real worker connections finish the same checked proposal concurrently.
 const aiCase=(await admin.query("select to_jsonb(c)||jsonb_build_object('source_version',private.case_source(c)) result from public.exception_cases c where id=$1",[first.id])).rows[0].result;
 await begin(clients[0]);
 const queued=(await clients[0].query(caseSQL,['analyze',aiCase.id,randomUUID(),JSON.stringify({expected_version:aiCase.version,source_version:aiCase.source_version,note:'Check records',evidence_ids:[]}),corr])).rows[0].result;
 await clients[0].query('commit');
 await admin.query("update public.resolution_policies set rules=jsonb_set(rules,'{ai_auto_actions}','[\"save_summary\"]') where sme_id=$1",[sme]);
 const snapshot=(await admin.query('select public.analysis_claim($1) result',[queued.job_id])).rows[0].result;
 const maker={policy_id:snapshot.policy_id,model:'race-maker',provider_response_id:'maker-'+queued.job_id,proposal_hash:'a'.repeat(64),configuration:{fake:true},input_tokens:10,output_tokens:10,
  output:{exception_type:'quantity_mismatch',priority:aiCase.priority,summary:'Independent checked summary',evidence_ids:[],recommended_action:'save_summary',requires_human:false,missing_information:[]}};
 await admin.query("select public.analysis_stage($1,$2,'checker',$3::jsonb)",[queued.job_id,snapshot.lease_token,JSON.stringify(maker)]);
 const pair={maker,checker:{model:'race-checker',provider_response_id:'checker-'+queued.job_id,configuration:{fake:true},input_tokens:10,output_tokens:10,
  output:{verdict:'approved',source_version:snapshot.source_version,proposal_hash:maker.proposal_hash,evidence_supported:true,classification_correct:true,priority_correct:true,action_authorized:true,findings:[]}},checker_error:null};
 const finishArgs=[queued.job_id,snapshot.lease_token,JSON.stringify(pair)];
 [first,next]=await race(finishArgs,finishArgs,'select public.analysis_finish($1,$2,$3::jsonb,null) result','service_role');
 assert.equal(first.execution_status,'executed');assert.deepEqual(next.result,first);
 assert.equal((await admin.query('select count(*)::int n from public.ai_analyses where job_id=$1',[queued.job_id])).rows[0].n,1);
 assert.equal((await admin.query("select count(*)::int n from public.action_executions where case_id=$1 and execution_origin='ai_maker_checker'",[aiCase.id])).rows[0].n,1);
 console.log('PASS NATIVE: simultaneous worker finishes execute a checked proposal exactly once');
 console.log('Native concurrency and operations passed on '+(await admin.query('select version()')).rows[0].version);
} finally {
 await Promise.all(clients.map(c=>c.end()));await admin.end();if(embedded)await embedded.stop();
 if(embeddedDirectory){
  const allowed=path.resolve(root,'../test-results')+path.sep+'postgres-';
  if(!path.resolve(embeddedDirectory).startsWith(allowed))throw Error('Refusing cleanup outside the disposable test directory');
  await rm(embeddedDirectory,{recursive:true,force:true,maxRetries:10,retryDelay:300});
 }
}
