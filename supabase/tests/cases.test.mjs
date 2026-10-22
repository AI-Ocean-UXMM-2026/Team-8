import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testCases(db) {
 const w='10000000-0000-4000-8000-000000000001',sme='20000000-0000-4000-8000-000000000001';
 const staff=randomUUID(),customer=randomUUID(),other=randomUUID(),shipment=randomUUID(),product=randomUUID(),corr=randomUUID();
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const user=async(actor,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);try{return await fn();}finally{await q('reset role');}};
 const fail=(fn,message)=>assert.rejects(fn,e=>e.message.includes(message));
 for(const [actor,name] of [[staff,'staff'],[customer,'sme'],[other,'other']]){
  await q('insert into auth.users(id,email) values($1,$2)',[actor,actor+'@example.test']);
  await q('insert into public.profiles(id,display_name) values($1,$2)',[actor,name]);
 }
 await q("insert into public.memberships(profile_id,warehouse_id,role,sme_id) values($1,$4,'staff',null),($2,$4,'sme',$5),($3,$4,'sme',$6)",[staff,customer,other,w,sme,'20000000-0000-4000-8000-000000000002']);
 await q("insert into public.products(id,warehouse_id,sme_id,sku,name) values($1::uuid,$2,$3,$1::uuid::text,'Case product')",[product,w,sme]);
 await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction) values($1::uuid,$2,$3,$1::uuid::text,'inbound')",[shipment,w,sme]);
 await q('insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty,received_qty) values($1,$2,$3,$4,100,90)',[shipment,w,sme,product]);
 const command=async(kind,id,body,key=randomUUID())=>(await one('select public.case_command($1,$2,$3,$4::jsonb,$5) result',[kind,id,key,JSON.stringify(body),corr])).result;
 const read=async id=>(await one('select public.case_read($1) result',[id])).result;
 const body=c=>({expected_version:c.version,source_version:c.source_version,note:'Verified recorded facts',evidence_ids:[]});
 let c,approval;
 await user(staff,async()=>{
  const key=randomUUID(),report={stage:'inbound',type:'quantity_mismatch',note:'Expected 100, counted 90',evidence_ids:[]};
  c=await command('report',shipment,report,key);
  assert.deepEqual(await command('report',shipment,report,key),c);
  assert.equal((await command('report',shipment,report)).id,c.id);
  c=await read(c.id);assert.equal(c.events.length,2);
  assert.notEqual((await command('report',shipment,{...report,type:'damaged_goods'})).id,c.id);
  await fail(()=>command('close',c.id,body(c)),'closure_pending');
  await fail(()=>command('action',c.id,{...body(c),action:'escalate',policy_version:99}),'action_not_allowed');
  c=await command('action',c.id,{...body(c),action:'request_sme_decision',policy_version:1});
  approval=c.approvals[0].id;
  console.log('PASS CASE: report matching, distinct issues, retries, closure and policy guards');
 });
 await user(other,async()=>{await fail(()=>read(c.id),'forbidden');await fail(()=>command('decision',approval,{decision:'accept_partial',note:'Forged'}),'forbidden');});
 await user(customer,async()=>{
  const own=await read(c.id);assert.equal(own.analyses.length,0);
  await fail(()=>command('action',c.id,{...body(c),action:'escalate',policy_version:1}),'forbidden');
  c=await command('decision',approval,{decision:'await_remainder',note:'Await the remaining 10'});
  assert.equal(c.status,'awaiting_information');
  await fail(()=>command('decision',approval,{decision:'accept_partial',note:'Conflicting choice'}),'decision_not_allowed');
  const feed=(await one("select public.tenant_feed('notifications',$1) result",[sme])).result;
  assert.ok(feed.length);await q('select public.mark_notification_read($1)',[feed[0].id]);
  assert.ok((await one("select public.tenant_feed('notifications',$1) result",[sme])).result[0].read);
  console.log('PASS CASE: own-SME decisions persist independently; other SME/action forgery denied; read state persists');
 });
 const evidence=randomUUID(),objectPath=w+'/'+shipment+'/'+evidence;
 await q("insert into public.evidence(id,shipment_id,warehouse_id,sme_id,uploaded_by,object_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,$6,'image/jpeg',100)",[evidence,shipment,w,sme,staff,objectPath]);
 await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[objectPath]);
 await user(staff,async()=>{
  c=await read(c.id);
  for(const fact of ['count_verified','physical_handling_verified'])c=await command('verify',c.id,{...body(c),fact,evidence_ids:[evidence]});
  await fail(()=>command('close',c.id,body(c)),'closure_pending');
  c=await command('verify',c.id,{...body(c),fact:'remainder_completed',evidence_ids:[evidence]});
  c=await command('close',c.id,body(c));assert.equal(c.status,'closed');
  console.log('PASS CASE: await-remainder cannot close until verified completion; closure audited');
 });
 // A separate open case drives the durable provider lifecycle.
 let analysisCase,job;
 await user(staff,async()=>{
  analysisCase=await command('report',shipment,{stage:'warehouse',type:'missing_stock',note:'Investigate stored stock',evidence_ids:[evidence]});
  const queued=await command('analyze',analysisCase.id,body(analysisCase));job=queued.job_id;
  await fail(()=>q('select public.analysis_claim($1)',[job]),'permission denied');
 });
 let snapshot=(await one('select public.analysis_claim($1) result',[job])).result;
 assert.equal(snapshot.facts.shortage_qty,10);assert.ok(snapshot.lease_token);
 assert.equal((await one('select public.analysis_claim($1) result',[job])).result,null);
 await fail(()=>q('select public.analysis_finish($1,$2,null,$3)',[job,randomUUID(),'timeout']),'stale_version');
 await q('select public.analysis_finish($1,$2,null,$3)',[job,snapshot.lease_token,'timeout']);
 assert.equal((await one('select status from public.analysis_jobs where id=$1',[job])).status,'failed');
 await user(staff,async()=>{analysisCase=await read(analysisCase.id);job=(await command('analyze',analysisCase.id,body(analysisCase))).job_id;});
 snapshot=(await one('select public.analysis_claim($1) result',[job])).result;
 const maker={policy_id:snapshot.policy_id,model:'provider-test',input_tokens:20,output_tokens:10,configuration:{fake:true},provider_response_id:'fake-response',proposal_hash:'a'.repeat(64),
  output:{exception_type:'missing_stock',priority:'normal',summary:'Recorded shortage 10',evidence_ids:[evidence],recommended_action:'escalate',requires_human:true,missing_information:[]}};
 await q("select public.analysis_stage($1,$2,'checker',$3::jsonb)",[job,snapshot.lease_token,JSON.stringify(maker)]);
 const result={maker,checker:{model:'checker-test',provider_response_id:'checker-response',configuration:{fake:true},output:{verdict:'approved',source_version:snapshot.source_version,proposal_hash:maker.proposal_hash,evidence_supported:true,classification_correct:true,priority_correct:true,action_authorized:true,findings:[]}},checker_error:null};
 await q('select public.analysis_finish($1,$2,$3::jsonb,null)',[job,snapshot.lease_token,JSON.stringify(result)]);
 assert.equal((await one('select status from public.analysis_jobs where id=$1',[job])).status,'completed');
 await user(customer,async()=>{assert.equal((await read(analysisCase.id)).analyses.length,0);});
 console.log('PASS AI: durable lease, failure routes to review, independent checker and staff-only persistence');
}
