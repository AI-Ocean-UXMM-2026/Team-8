import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
const db=new PGlite();
try {
 await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
 for(const file of (await readdir('supabase/migrations')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 await db.exec(await readFile('supabase/seed.sql','utf8'));
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const w='10000000-0000-4000-8000-000000000001',s='20000000-0000-4000-8000-000000000001';
 const staff=randomUUID(),sme=randomUUID(),outsider=randomUUID(),p=randomUUID(),other=randomUUID(),corr=randomUUID();
 for(const actor of [staff,sme,outsider]){
  await q('insert into auth.users(id,email) values($1,$2)',[actor,actor+'@test.invalid']);
  await q("insert into public.profiles(id,display_name) values($1,'Outbound test')",[actor]);
 }
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,null,'staff'),($3,$2,$4,'sme')",[staff,w,sme,s]);
 for(const product of [p,other])await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1::uuid,$2,$3,($1::uuid)::text,'Outbound product',20)",[product,w,s]);
 const as=async(actor,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);try{return await fn();}finally{await q('reset role');}};
 const create=async(mode='third_party',qty=5)=>(await as(staff,()=>one("select public.ops_command($1,'create',$2,null,$3::jsonb,$4) r",[w,randomUUID(),JSON.stringify({sme_id:s,reference:randomUUID(),direction:'outbound',delivery_mode:mode,lines:[{product_id:p,expected_qty:qty}]}),corr]))).r;
 const act=async(id,kind,body,key=randomUUID(),actor=staff)=>(await as(actor,()=>one('select public.delivery_command($1,$2,$3,$4::jsonb,$5) r',[kind,id,key,JSON.stringify(body),corr]))).r;
 const evidence=async(id)=>{
  const e=(await as(staff,()=>one("select public.register_evidence($1,'image/png',20,true) r",[id]))).r;
  await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[e.path]);return e.id;
 };
 const stock=()=>one('select available_qty,quarantined_qty,reserved_qty from public.products where id=$1',[p]);
 const direct=await create();const e=await evidence(direct.id);
 const handover={expected_version:1,note:'Physical handover verified',evidence_id:e,courier_name:'Carrier',waybill:'TEST-1',accepted_at:direct.created_at,package_count:1,package_condition:'Intact'};
 const hk=randomUUID();await act(direct.id,'handover',handover,hk);await act(direct.id,'handover',handover,hk);
 assert.equal((await stock()).available_qty,15);
 assert.equal((await one("select count(*)::int n from public.stock_movements where reason=$1",['courier handover: '+direct.id])).n,1);
 await assert.rejects(()=>act(direct.id,'handover',{...handover,note:'Changed'},hk),/idempotency_conflict/);
 await act(direct.id,'courier',{expected_version:2,note:'Carrier delayed',evidence_id:e,status:'delayed'});
 await act(direct.id,'handover',{...handover,expected_version:3});
 assert.equal((await stock()).available_qty,15,'a later re-handover cannot debit stock twice');
 const rb={expected_version:4,note:'Counted physical return',evidence_id:e,lines:[{product_id:p,received_qty:3,damaged_qty:1}]};
 await assert.rejects(()=>act(direct.id,'return',rb),/invalid_return/);
 await act(direct.id,'cancel',{expected_version:4,note:'Return to warehouse'});
 assert.equal((await stock()).available_qty,15,'cancel does not manufacture returned stock');
 rb.expected_version=5;
 await assert.rejects(()=>act(direct.id,'return',rb,randomUUID(),sme),/forbidden/);
 await assert.rejects(()=>act(direct.id,'return',rb,randomUUID(),outsider),/forbidden/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,evidence_id:randomUUID()}),/invalid_return/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,lines:[...rb.lines,...rb.lines]}),/invalid_return/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,lines:[{product_id:p,received_qty:1,damaged_qty:0},{product_id:p.toUpperCase(),received_qty:1,damaged_qty:0}]}),/invalid_return/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,lines:[{product_id:p,received_qty:1.5,damaged_qty:0}]}),/invalid_return/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,lines:[...rb.lines,{product_id:other,received_qty:1,damaged_qty:0}]}),/invalid_return/);
 assert.equal((await stock()).available_qty,15,'bad later line rolls back earlier posting');
 const rk=randomUUID();const returned=await act(direct.id,'return',rb,rk);await act(direct.id,'return',rb,rk);
 assert.deepEqual(await stock(),{available_qty:17,quarantined_qty:1,reserved_qty:0});
 assert.deepEqual(returned.returns,[{product_id:p,received_qty:3,damaged_qty:1}]);
 await assert.rejects(()=>act(direct.id,'return',{...rb,note:'Different'},rk),/idempotency_conflict/);
 await assert.rejects(()=>act(direct.id,'return',rb),/stale_version/);
 await assert.rejects(()=>act(direct.id,'return',{...rb,expected_version:6}),/invalid_return/);
 await act(direct.id,'return',{...rb,expected_version:6,lines:[{product_id:p,received_qty:2,damaged_qty:0}]});
 assert.deepEqual(await stock(),{available_qty:19,quarantined_qty:1,reserved_qty:0});
 assert.equal((await one("select count(*)::int n from public.audit_records where action='delivery.return' and entity_id=$1",[direct.id])).n,2);
 assert.equal((await one("select count(*)::int n from public.outbox_events where event_type='delivery.return' and entity_id=$1",[direct.id])).n,2);
 await as(sme,async()=>{assert.equal((await one('select public.delivery_read($1) r',[direct.id])).r.returns[0].received_qty,5);await assert.rejects(()=>q('select * from private.shipment_return_totals'),/permission denied/);});
 const insufficient=await create('third_party',30),ie=await evidence(insufficient.id);
 await assert.rejects(()=>act(insufficient.id,'handover',{...handover,evidence_id:ie,accepted_at:insufficient.created_at}),/stock_unavailable/);
 assert.equal((await one('select status from public.shipments where id=$1',[insufficient.id])).status,'ready');
 assert.equal((await one('select count(*)::int n from public.handover_records where shipment_id=$1',[insufficient.id])).n,0);
 const neverSent=await create('in_house');await act(neverSent.id,'cancel',{expected_version:1,note:'Cancelled before pickup'});
 const ne=await evidence(neverSent.id);
 await assert.rejects(()=>act(neverSent.id,'return',{...rb,expected_version:2,evidence_id:ne}),/invalid_return/);
 // An order-backed external debit must also be eligible for physical returns.
 let order=(await as(sme,()=>one('select public.sme_order_command($1,$2,null,$3::jsonb) r',[w,randomUUID(),JSON.stringify({warehouse_id:w,sme_id:s,customer_name:'Test',customer_phone:'09123',address:'Yangon',latitude:16.8,longitude:96.1,lines:[{product_id:p,expected_qty:2}]})]))).r;
 order=(await as(staff,()=>one('select public.sme_order_command($1,$2,$3,$4::jsonb) r',[w,randomUUID(),order.id,JSON.stringify({action:'accept',delivery_mode:'third_party'})]))).r;
 const oe=await evidence(order.shipment_id),os=await one('select created_at from public.shipments where id=$1',[order.shipment_id]);
 await act(order.shipment_id,'handover',{...handover,evidence_id:oe,accepted_at:os.created_at});
 assert.equal((await stock()).available_qty,17);
 await act(order.shipment_id,'cancel',{expected_version:2,note:'Customer cancelled'});
 await act(order.shipment_id,'return',{...rb,expected_version:3,evidence_id:oe,lines:[{product_id:p,received_qty:2,damaged_qty:0}]});
 assert.equal((await stock()).available_qty,19);
 // In-house dispatch uses the same physical return path after cancellation.
 const internal=await create('in_house',5);
 const rider=randomUUID(),riderId=randomUUID();
 await q('insert into auth.users(id,email) values($1,$2)',[rider,rider+'@test.invalid']);
 await q("insert into public.profiles(id,display_name) values($1,'Return rider')",[rider]);
 await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider')",[rider,w]);
 await q('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[riderId,w,rider]);
 const event=async(type,version)=>as(staff,()=>one("select public.ops_command($1,'event',$2,$3,$4::jsonb,$5) r",[w,randomUUID(),internal.id,JSON.stringify({type,expected_version:version,notes:'Physical step verified',verified_at:new Date().toISOString(),evidence_ids:[]}),corr]));
 await event('picked',1);await event('packed',2);
 await q('insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id,accepted_at,picked_up_at) values($1,$2,$3,$4,now(),now())',[internal.id,w,s,riderId]);
 await event('dispatched',3);assert.equal((await stock()).available_qty,14);
 await act(internal.id,'cancel',{expected_version:4,note:'Delivery returned'});
 const ine=await evidence(internal.id);
 await assert.rejects(()=>act(internal.id,'return',{...rb,expected_version:5,evidence_id:ine},randomUUID(),rider),/forbidden/);
 await act(internal.id,'return',{...rb,expected_version:5,evidence_id:ine,lines:[{product_id:p,received_qty:4,damaged_qty:1}]});
 assert.deepEqual(await stock(),{available_qty:17,quarantined_qty:2,reserved_qty:0});
 const reserved=(await as(sme,()=>one('select public.sme_order_command($1,$2,null,$3::jsonb) r',[w,randomUUID(),JSON.stringify({warehouse_id:w,sme_id:s,customer_name:'Reserved',customer_phone:'09123',address:'Yangon',latitude:16.8,longitude:96.1,lines:[{product_id:p,expected_qty:16}]})]))).r;
 const competing=await create('third_party',2),ce=await evidence(competing.id);
 await assert.rejects(()=>act(competing.id,'handover',{...handover,evidence_id:ce,accepted_at:competing.created_at}),/stock_unavailable/);
 await as(sme,()=>one('select public.sme_order_command($1,$2,$3,$4::jsonb) r',[w,randomUUID(),reserved.id,JSON.stringify({action:'cancel'})]));
 assert.deepEqual(await stock(),{available_qty:17,quarantined_qty:2,reserved_qty:0});
 const historical=await create(),he=await evidence(historical.id);
 // Simulate a pre-migration direct handover, which had no physical debit.
 await q("select public.delivery_command_before_returns('handover',$1,$2,$3::jsonb,$4)",[historical.id,randomUUID(),JSON.stringify({...handover,evidence_id:he,accepted_at:historical.created_at}),corr]);
 await act(historical.id,'cancel',{expected_version:2,note:'Historical return'});
 await assert.rejects(()=>act(historical.id,'return',{...rb,expected_version:3,evidence_id:he}),/unposted_handover_return/);
 assert.deepEqual(await stock(),{available_qty:17,quarantined_qty:2,reserved_qty:0});
 // Delivery events often have no explicit verified_at. PostgreSQL text timestamps
 // end in +00, which the API's AwareDatetime rejects; JSON timestamps must use +00:00.
 const detail=(await as(staff,()=>one("select public.ops_read($1,'detail',$2::jsonb) r",[w,JSON.stringify({shipment_id:internal.id})]))).r;
 assert.ok(detail.events.length>0);
 for(const event of detail.events){
  assert.match(event.verified_at, /T.*(?:Z|[+-]\d{2}:\d{2})$/, 'verified_at must be an ISO timestamp with full timezone');
  assert.ok(Number.isFinite(Date.parse(event.verified_at)));
 }
 console.log('PASS outbound: direct and order handover stock once, re-handover, insufficient stock rollback, cancellation without restock, incremental evidenced returns, quarantine, limits, atomic rollback, replay, authorization, audit/outbox');
} finally {await db.close();}
