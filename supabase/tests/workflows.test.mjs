import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function testWorkflows(db){
 const w='10000000-0000-4000-8000-000000000001',sme='20000000-0000-4000-8000-000000000001';
 const staff=randomUUID(),customer=randomUUID(),rider=randomUUID(),other=randomUUID(),riderId=randomUUID(),product=randomUUID(),corr=randomUUID();
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const as=async(actor,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);try{return await fn();}finally{await q('reset role');await q("select set_config('request.jwt.claim.sub','',false)");}};
 const reject=(fn,message)=>assert.rejects(fn,error=>error.message.includes(message));
 for(const [id,name] of [[staff,'Staff'],[customer,'SME'],[rider,'Rider'],[other,'Other SME']]){await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);await q('insert into public.profiles(id,display_name) values($1,$2)',[id,name]);}
 for(const [id,role,tenant]of[[staff,'staff',null],[customer,'sme',sme],[rider,'rider',null],[other,'sme','20000000-0000-4000-8000-000000000002']])await q('insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,$4)',[id,w,tenant,role]);
 await q('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[riderId,w,rider]);
 await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1::uuid,$2,$3,$1::uuid::text,'Workflow product',100)",[product,w,sme]);
 const ops=async(kind,id,body,key=randomUUID())=>(await one('select public.ops_command($1,$2,$3,$4,$5::jsonb,$6) result',[w,kind,key,id,JSON.stringify(body),corr])).result;
 const deliver=async(kind,id,body,key=randomUUID())=>(await one('select public.delivery_command($1,$2,$3,$4::jsonb,$5) result',[kind,id,key,JSON.stringify(body),corr])).result;
 const cases=async(kind,id,body,key=randomUUID())=>(await one('select public.case_command($1,$2,$3,$4::jsonb,$5) result',[kind,id,key,JSON.stringify(body),corr])).result;
 const body=c=>({expected_version:c.version,source_version:c.source_version,note:'Recorded and physically checked',evidence_ids:[]});
 const create=async(mode='in_house')=>ops('create',null,{sme_id:sme,reference:randomUUID(),direction:'outbound',delivery_mode:mode,lines:[{product_id:product,expected_qty:5}]});
 const physical=(version,type)=>({expected_version:version,type,verified_at:new Date().toISOString(),notes:'Physically checked',evidence_ids:[]});
 let shipment,delivery,session,evidence,proof;
 await as(staff,async()=>{
  shipment=await create();
  await ops('event',shipment.id,physical(1,'picked'));await ops('event',shipment.id,physical(2,'packed'));
  delivery=await deliver('assign',shipment.id,{expected_version:3,note:'Assign active rider',rider_id:riderId});
  assert.equal(delivery.shipment.status,'assigned');
 });
 await as(other,()=>reject(()=>deliver('cancel',shipment.id,{expected_version:4,note:'Forged'}),'forbidden'));
 await as(rider,async()=>{
  delivery=await deliver('accept',shipment.id,{expected_version:4,note:'Accepted task'});
  await reject(()=>deliver('proof',shipment.id,{expected_version:5,note:'Premature',received_by:'Receiver'}),'incomplete_proof');
  delivery=await deliver('pickup',shipment.id,{expected_version:5,note:'Verified pickup'});
  session=(await one('select public.start_tracking($1,true) id',[delivery.assignments.find(a=>!a.cancelled_at).id])).id;
  await q('select public.record_location($1,16.8,96.1,5,$2)',[session,new Date().toISOString()]);
 });
 const routePayload={provider:'openrouteservice',profile:'car',coordinates:[[96.1,16.8],[96.2,16.9]],origin:[96.1,16.8],destination:[96.2,16.9],distance_m:2400,duration_ms:180000,traffic_aware:false,destination_source:'courier_selected'};
 const routeKey=randomUUID(),routeTime=new Date().toISOString();
 const writeRoute=async(payload=routePayload,key=routeKey,time=routeTime)=>(await one('select public.route_plan_write($1,$2::jsonb,$3,$4) result',[shipment.id,JSON.stringify(payload),key,time])).result;
 const readRoute=async()=>(await one('select public.route_plan_read($1) result',[shipment.id])).result;
 await as(rider,async()=>{
  const saved=await writeRoute();assert.equal(saved.shipment_id,shipment.id);assert.equal(saved.destination[0],96.2);
  assert.deepEqual(await writeRoute(),saved);
  await reject(()=>writeRoute({...routePayload,coordinates:[[200,16],[96,17]]},randomUUID()),'invalid_route');
  const older=await writeRoute({...routePayload,distance_m:1},randomUUID(),new Date(Date.parse(routeTime)-1000).toISOString());assert.equal(older.distance_m,2400);
 });
 await as(customer,async()=>{assert.equal((await readRoute()).distance_m,2400);assert.equal((await q('select * from public.shipment_route_plans')).rows.length,1);});
 await as(staff,async()=>{assert.equal((await readRoute()).distance_m,2400);await reject(()=>writeRoute(),'forbidden');});
 await as(other,async()=>{await reject(()=>readRoute(),'forbidden');assert.equal((await q('select * from public.shipment_route_plans')).rows.length,0);});
 await as(rider,async()=>{await q('select public.stop_tracking($1)',[session]);assert.ok(await readRoute());});
 await as(customer,async()=>assert.equal(await readRoute(),null));
 await as(staff,async()=>assert.equal(await readRoute(),null));
 await as(rider,async()=>{session=(await one('select public.start_tracking($1,true) id',[delivery.assignments.find(a=>!a.cancelled_at).id])).id;await q('select public.record_location($1,16.8,96.1,5,$2)',[session,new Date().toISOString()]);});
 console.log('PASS SHARED ROUTE: saved/replayed route, late requests, coordinates, tenant RLS and consent-session revocation');
 await as(customer,async()=>{
  assert.equal((await one('select public.can_receive_tracking_topic($1) ok',['tracking:'+session])).ok,true);
  await q("select set_config('realtime.topic',$1,false)",['tracking:'+session]);
  assert.ok((await q('select * from realtime.messages')).rows.length>0);
  await reject(()=>q("insert into realtime.messages(topic,extension,payload) values($1,'broadcast','{}')",['tracking:'+session]),'row-level security');
 });
 await as(other,async()=>{
  assert.equal((await one('select public.can_receive_tracking_topic($1) ok',['tracking:'+session])).ok,false);
  assert.equal((await q('select * from realtime.messages')).rows.length,0);
 });
 await as(staff,async()=>{await ops('event',shipment.id,physical(6,'dispatched'));});
 await as(rider,async()=>{
  const registered=(await one("select public.register_evidence($1,'image/png',20,true) result",[shipment.id])).result;evidence=registered.id;
  const access=(await one('select public.evidence_upload_access($1) result',[evidence])).result;assert.equal(access.size_bytes,20);
 });
 const path=(await one('select object_path from public.evidence where id=$1',[evidence])).object_path;
 await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[path]);
 await as(rider,async()=>{
  await reject(()=>q('select public.evidence_upload_access($1)',[evidence]),'forbidden');
  delivery=await deliver('proof',shipment.id,{expected_version:7,note:'Proof submitted, not delivered',evidence_id:evidence,received_by:'Fictitious receiver'});
  assert.equal(delivery.shipment.status,'in_transit');proof=delivery.proofs[0].id;
 });
 await as(other,()=>reject(()=>deliver('confirm',shipment.id,{expected_version:8,note:'Other SME',proof_id:proof}),'forbidden'));
 await as(customer,async()=>{
  const key=randomUUID(),request={expected_version:8,note:'Receiver confirmed physical arrival',proof_id:proof};
  delivery=await deliver('confirm',shipment.id,request,key);assert.equal(delivery.shipment.status,'delivered');
  assert.deepEqual(await deliver('confirm',shipment.id,request,key),delivery);
  await reject(()=>q('select public.get_live_location($1)',[session]),'forbidden');
  assert.equal((await one('select public.can_receive_tracking_topic($1) ok',['tracking:'+session])).ok,false);
  assert.equal(await readRoute(),null);
 });
 await q("update public.shipment_route_plans set expires_at=now()-interval '1 second' where shipment_id=$1",[shipment.id]);
 await q('select public.run_retention(24)');assert.equal((await q('select * from public.shipment_route_plans where shipment_id=$1',[shipment.id])).rows.length,0);
 console.log('PASS WORKFLOW: assignment, accept, pickup, dispatch, private topic scope, proof, receiver confirmation and ended sharing');
 await as(staff,async()=>{
  const external=await create('third_party');
  await reject(()=>deliver('assign',external.id,{expected_version:1,note:'Invalid external rider',rider_id:riderId}),'invalid_assignment');
  const record=(await one("select public.register_evidence($1,'image/png',20,true) result",[external.id])).result;
  await q('reset role');await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[record.path]);await q('set role authenticated');
  const handover={expected_version:1,note:'Physical carrier acceptance checked',evidence_id:record.id,courier_name:'Fictitious carrier',waybill:'TEST-001',tracking_url:'https://carrier.example.test/TEST-001',accepted_at:external.created_at,package_condition:'Intact',package_count:1};
  await reject(()=>deliver('handover',external.id,{...handover,package_count:0}),'invalid_handover');
  const key=randomUUID();const saved=await deliver('handover',external.id,handover,key);assert.equal(saved.shipment.status,'handed_over');assert.equal(saved.session_id,null);
  assert.deepEqual(await deliver('handover',external.id,handover,key),saved);
  const update=await deliver('courier',external.id,{expected_version:2,note:'Verified carrier delay',evidence_id:record.id,status:'delayed'});assert.equal(update.shipment.status,'delayed');
 });
 console.log('PASS WORKFLOW: external mode rejects riders, verifies handover, replays once and records actual carrier delay without GPS');
 let c,approval,notificationId;
 await as(staff,async()=>{
  const s=await create();
  c=await cases('report',s.id,{stage:'outbound',type:'recipient_unavailable',note:'Fictitious shop closed',evidence_ids:[]});
  c=await cases('action',c.id,{...body(c),action:'request_sme_decision',policy_version:1});approval=c.approvals[0];
  const page=(await one('select public.ops_read($1,$2,$3::jsonb) result',[w,'cases',JSON.stringify({issue_type:'recipient_unavailable',owner_id:'unassigned',limit:1})])).result;
  assert.equal(page.items[0].id,c.id);assert.equal(page.items[0].owner_id,null);
 });
 await as(staff,async()=>{c=await cases('information',c.id,body(c));});
 await as(customer,()=>reject(()=>cases('decision',approval.id,{decision:'reject',note:'Stale request',request_version:approval.requested_case_version}),'stale_version'));
 await as(staff,async()=>{c=await cases('action',c.id,{...body(c),action:'request_sme_decision',policy_version:1});assert.ok(c.approvals.some(a=>a.status==='cancelled'));approval=c.approvals.find(a=>a.status==='pending');});
 await as(customer,async()=>{
  const decision={decision:'propose_retry',note:'Please retry later',preferred_at:new Date(Date.now()+3600000).toISOString(),request_version:approval.requested_case_version};
  c=await cases('decision',approval.id,decision);const version=c.version,events=c.events.length;
  const replay=await cases('decision',approval.id,decision);assert.equal(replay.version,version);assert.equal(replay.events.length,events);
  const feed=(await one("select public.tenant_feed('notifications',$1) result",[sme])).result;assert.ok(feed.length);notificationId=feed[0].id;
  await q('select public.mark_notification_read($1)',[feed[0].id]);await q('select public.mark_notification_read($1)',[feed[0].id]);
  assert.equal((await one("select public.tenant_feed('notifications',$1) result",[sme])).result.find(n=>n.id===notificationId).read,true);
  assert.equal(Number((await one('select count(*) n from public.notification_reads where notification_id=$1 and profile_id=$2',[notificationId,customer])).n),1);
  await reject(()=>q("select public.tenant_feed('notifications',$1)",['20000000-0000-4000-8000-000000000002']),'forbidden');
  await reject(()=>q("select public.tenant_feed('overview',$1)",['20000000-0000-4000-8000-000000000002']),'forbidden');
 });
 await as(staff,async()=>{
  assert.equal((await one("select public.tenant_feed('notifications',$1) result",[sme])).result.find(n=>n.id===notificationId).read,false);
  await q('select public.mark_notification_read($1)',[notificationId]);
 });
 await as(customer,async()=>{
  await q('select public.mark_notification_unread($1)',[notificationId]);await q('select public.mark_notification_unread($1)',[notificationId]);
  assert.equal((await one("select public.tenant_feed('notifications',$1) result",[sme])).result.find(n=>n.id===notificationId).read,false);
 });
 await as(staff,async()=>assert.equal((await one("select public.tenant_feed('notifications',$1) result",[sme])).result.find(n=>n.id===notificationId).read,true));
 await as(other,()=>reject(()=>q('select public.mark_notification_unread($1)',[notificationId]),'forbidden'));
 await as(other,()=>reject(()=>q('select public.mark_notification_read($1)',[notificationId]),'forbidden'));
 console.log('PASS WORKFLOW: server-side case filters, duplicate decisions do not duplicate events, notification read/unread scope');
 const review=async payload=>(await one('select public.review_case($1,$2,$3::jsonb,$4) result',[c.id,randomUUID(),JSON.stringify(payload),corr])).result;
 await as(other,()=>reject(()=>review({...body(c),kind:'owner',owner_id:other}),'forbidden'));
 await as(staff,async()=>{
  await reject(()=>review({...body(c),kind:'owner',owner_id:other}),'invalid_owner');
  c=await review({...body(c),kind:'owner',owner_id:staff});assert.equal(c.owner_id,staff);
  await reject(()=>review({...body(c),kind:'responsibility',responsible_party:'THIRD_PARTY_COURIER',basis:'Unsupported claim'}),'invalid_responsibility_basis');
  c=await review({...body(c),kind:'responsibility',responsible_party:'UNDETERMINED',basis:'No verified attribution evidence'});
  assert.equal(c.responsible_party,'UNDETERMINED');assert.equal(c.responsibility_basis,'No verified attribution evidence');
 });
 console.log('PASS WORKFLOW: stale request supersession, staff-only owner assignment and evidence-required operational responsibility review');
 for(const filename of ['operations.sql','cases.sql']){const sql=await readFile(new URL('../seeds/'+filename,import.meta.url),'utf8');await (db.exec ? db.exec(sql) : db.query(sql));await (db.exec ? db.exec(sql) : db.query(sql));}
 assert.equal(Number((await one("select count(*) n from public.delivery_assignments where id='70000000-0000-4000-8000-000000009003'")).n),1);
 assert.equal(Number((await one("select count(*) n from public.approvals where id in ('a0000000-0000-4000-8000-000000009004','a0000000-0000-4000-8000-000000009005')")).n),2);
 assert.equal(Number((await one("select count(*) n from public.case_events where id in ('b0000000-0000-4000-8000-000000009004','b0000000-0000-4000-8000-000000009005')")).n),2);
 assert.equal(Number((await one("select count(*) n from public.notifications n join public.approvals a using(case_id,warehouse_id,sme_id) join public.exception_cases c on c.id=n.case_id and c.warehouse_id=n.warehouse_id and c.sme_id=n.sme_id where a.id in ('a0000000-0000-4000-8000-000000009004','a0000000-0000-4000-8000-000000009005')")).n),2);
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,'20000000-0000-4000-8000-000000000004','sme')",[customer,w]);
 await as(customer,async()=>{
  const seeded=(await one('select public.case_read($1) result',['80000000-0000-4000-8000-000000009004'])).result;
  assert.equal(seeded.approvals[0].status,'pending');
  const result=await cases('decision','a0000000-0000-4000-8000-000000009004',{decision:'accept_partial',note:'Fictitious seeded decision',request_version:1});
  assert.notEqual(result.status,'closed');
 });
 const seed=await readFile(new URL('../seeds/cases.sql',import.meta.url),'utf8');await (db.exec ? db.exec(seed) : db.query(seed));
 assert.equal((await one("select status,decision from public.approvals where id='a0000000-0000-4000-8000-000000009004'")).decision,'accept_partial');
 console.log('PASS WORKFLOW: separate repeatable operations/rider and BE2 case/approval/notification seeds');
}
