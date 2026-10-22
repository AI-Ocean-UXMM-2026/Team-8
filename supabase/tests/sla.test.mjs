import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const q=(sql,params=[])=>db.query(sql,params),one=async(sql,params=[])=>(await q(sql,params)).rows[0];
const w='10000000-0000-4000-8000-000000000001',tenant='20000000-0000-4000-8000-000000000001';
const owner=randomUUID(),staff=randomUUID(),sme=randomUUID();
const as=async(user,fn,role='authenticated')=>{await q(`set role ${role}`);await q("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);try{return await fn()}finally{await q('reset role')}};
const reject=(fn,code)=>assert.rejects(fn,e=>e.code===code);
const policies=async()=>(await one('select public.sla_policies_read($1) r',[w])).r;
const save=async(body,key=randomUUID(),type='courier_delay',priority='normal')=>(await one('select public.sla_policy_write($1,$2,$3,$4,$5::jsonb) r',[w,type,priority,key,JSON.stringify(body)])).r;
const view=async(id)=>(await one("select public.sla_cases_read($1,$2,null,1,'all',true) r",[w,id])).r.items[0];
const create=async(age=0,priority='normal')=>{const shipment=randomUUID(),id=randomUUID();await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction,status,delivery_mode) values($1,$2,$3,$4,'outbound','ready','in_house')",[shipment,w,tenant,'SLA-TEST-'+shipment]);await q("insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,priority,summary,created_at) values($1,$2,$3,$4,'outbound','courier_delay',$5,'SLA unit test',now()-make_interval(secs=>$6))",[id,shipment,w,tenant,priority,age]);return id;};
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const dir=new URL('../migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 for(const [id,role]of [[owner,'owner'],[staff,'staff'],[sme,'sme']]){await q('insert into auth.users(id,email) values($1,$2)',[id,role+'@example.test']);await q('insert into public.profiles(id,display_name) values($1,$2)',[id,role]);await q('insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,$4)',[id,w,role==='sme'?tenant:null,role]);}
 await as(sme,()=>reject(()=>policies(),'42501'));await as(staff,()=>reject(()=>save({}),'42501'));
 await as(owner,async()=>{const p=await policies();assert.equal(p.policies.length,40);assert.equal(p.can_edit,true);assert.equal(p.manager_count,1);const key=randomUUID(),body={expected_revision:0,first_response_minutes:1,resolution_minutes:2,at_risk_percent:80};const saved=await save(body,key);assert.equal(saved.revision,1);assert.deepEqual(await save(body,key),saved);await reject(()=>save({...body,at_risk_percent:90},key),'22023');await reject(()=>save(body),'40001');await reject(()=>save({...body,expected_revision:1,resolution_minutes:0}),'23514');});
 const fresh=await create(0),risk=await create(50),overdue=await create(130),responded=await create(130),resolved=await create(130);
 await as(staff,async()=>{assert.equal((await view(fresh)).first_response_flag,'on_track');assert.equal((await view(risk)).first_response_flag,'at_risk');assert.equal((await view(overdue)).first_response_flag,'overdue');assert.equal((await view(overdue)).resolution_flag,'overdue');await reject(()=>q('select public.run_sla_escalations()'),'42501');
 const key=randomUUID();const result=(await one('select public.sla_response($1,$2,$3,$4) r',[w,responded,key,'Customer contacted with an update'])).r;assert.equal(result.first_response_flag,'breached');assert.deepEqual((await one('select public.sla_response($1,$2,$3,$4) r',[w,responded,key,'Customer contacted with an update'])).r,result);
 await reject(()=>q('select public.sla_response($1,$2,$3,$4)',[w,responded,key,'Changed note']),'22023');});
 await q("update public.exception_cases set status='resolved',verified_by=$2,verified_at=now(),resolution_note='Verified physical outcome' where id=$1",[resolved,staff]);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select count(*)::int n from public.sla_escalations where case_id=$1',[overdue])).n,2);
 assert.equal((await one('select count(*)::int n from public.sla_escalations where case_id=$1',[responded])).n,1);
 assert.equal((await one('select count(*)::int n from public.sla_escalations where case_id=$1',[resolved])).n,0);
 const escalated=await one('select owner_id,handling_mode,status from public.exception_cases where id=$1',[overdue]);assert.equal(escalated.owner_id,owner);assert.equal(escalated.handling_mode,'human');assert.equal(escalated.status,'new');
 await as(owner,()=>save({expected_revision:1,first_response_minutes:3,resolution_minutes:5,at_risk_percent:80}));
 await as(staff,async()=>{assert.equal((await view(fresh)).first_response_minutes,1);assert((await policies()).scheduler_last_run);await reject(()=>q('update public.sla_policies set revision=99'),'42501');});
 const newCase=await create();await as(staff,()=>reject(()=>q("insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload) values($1,$2,$3,$4,'staff','action','{}')",[newCase,w,tenant,staff]),'42501'));
 // Public direct event inserts are denied; domain actions are represented below as DB fixture setup.
 await q("insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload) values($1,$2,$3,$4,'staff','action','{}')",[newCase,w,tenant,staff]);
 await as(staff,async()=>{assert.equal((await view(newCase)).first_response_minutes,3);assert.equal((await view(newCase)).first_response_flag,'met');});
 await q("update public.exception_cases set priority='critical' where id=$1",[fresh]);await as(staff,()=>assert.doesNotReject(async()=>assert.equal((await view(fresh)).first_response_minutes,15)));
 await q('update public.memberships set active=false where profile_id=$1',[owner]);const unassigned=await create(400);await q("update public.exception_cases set status='awaiting_information' where id=$1",[unassigned]);await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select manager_id from public.case_slas where case_id=$1',[unassigned])).manager_id,null);assert.equal((await one('select status from public.exception_cases where id=$1',[unassigned])).status,'awaiting_information');
 await as(staff,async()=>{const page=(await one("select public.sla_cases_read($1,null,null,1,'escalated',false) r",[w])).r;assert.equal(page.items.length,1);assert(page.next_cursor);await reject(()=>q("select public.sla_cases_read($1,null,null,101,'all',false)",[w]),'22023');});
 // A newly configured manager must receive existing unassigned breaches once.
 const alertCount=(await one('select count(*)::int n from public.sla_escalations where case_id=$1',[unassigned])).n;
 await q('update public.memberships set active=true where profile_id=$1',[owner]);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select manager_id from public.case_slas where case_id=$1',[unassigned])).manager_id,owner);
 assert.equal((await one('select owner_id,status from public.exception_cases where id=$1',[unassigned])).status,'awaiting_information');
 assert.equal((await one('select count(*)::int n from public.sla_escalations where case_id=$1',[unassigned])).n,alertCount);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one("select count(*)::int n from public.case_events where case_id=$1 and type='sla_manager_assigned'",[unassigned])).n,1);
 // Losing the only active manager clears the assignment without losing the alert.
 await q('update public.memberships set active=false where profile_id=$1',[owner]);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select manager_id from public.case_slas where case_id=$1',[unassigned])).manager_id,null);
 assert.equal((await one('select owner_id from public.exception_cases where id=$1',[unassigned])).owner_id,null);
 // Replacement manager receives existing alerts; terminal cases retain their history.
 const replacement=randomUUID();
 await q('insert into auth.users(id,email) values($1,$2)',[replacement,'replacement@example.test']);
 await q('insert into public.profiles(id,display_name) values($1,$2)',[replacement,'replacement manager']);
 await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'owner')",[replacement,w]);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select owner_id from public.exception_cases where id=$1',[unassigned])).owner_id,replacement);
 assert.equal((await one('select count(*)::int n from public.sla_escalations where case_id=$1 and manager_id=$2',[unassigned,replacement])).n,alertCount);
 await q("update public.exception_cases set status='resolved',verified_by=$2,verified_at=now(),resolution_note='Verified test outcome' where id=$1",[unassigned,staff]);
 await q('update public.memberships set active=false where profile_id=$1',[replacement]);
 await q('update public.memberships set active=true where profile_id=$1',[owner]);
 await as(null,()=>q('select public.run_sla_escalations()'),'service_role');
 assert.equal((await one('select manager_id from public.case_slas where case_id=$1',[unassigned])).manager_id,replacement);
 assert.equal((await one('select manager_id from public.case_slas where case_id=$1',[overdue])).manager_id,owner);
 await as(staff,()=>reject(()=>q('select private.sla_detect_escalations()'),'42501'));
 console.log('PASS SLA: 40 defaults, owner-only edits, immutable snapshots, risk/overdue boundaries, first response, completion, automatic manager assignment, deduplication, no-manager fallback, policy changes, pagination and tenant guards.');
}catch(e){console.error(e.message,e.code,e.position,e.where);process.exitCode=1}finally{await db.close()}
