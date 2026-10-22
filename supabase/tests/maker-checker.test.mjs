import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testMakerChecker(db) {
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const w='10000000-0000-4000-8000-000000000001',sme='20000000-0000-4000-8000-000000000001',staff=randomUUID(),foreign=randomUUID(),customer=randomUUID();
 for(const [id,name] of [[staff,'AI staff'],[foreign,'Foreign staff'],[customer,'AI SME']]){
  await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);
  await q('insert into public.profiles(id,display_name) values($1,$2)',[id,name]);
 }
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$4,null,'staff'),($2,'10000000-0000-4000-8000-000000000002',null,'staff'),($3,$4,$5,'sme')",[staff,foreign,customer,w,sme]);
 const user=async(id,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn()}finally{await q('reset role')}};
 const command=async(kind,id,body,key=randomUUID())=>(await one('select public.case_command($1,$2,$3,$4::jsonb,$5) r',[kind,id,key,JSON.stringify(body),randomUUID()])).r;
 const read=async id=>(await one('select public.case_read($1) r',[id])).r;
 const priorRules=(await one('select rules from public.resolution_policies where sme_id=$1 order by version desc limit 1',[sme])).rules;
 async function prepare({action='save_summary',auto=true,human=false,missing=[]}={}){
  await q("update public.resolution_policies set rules=jsonb_set(rules,'{ai_auto_actions}',$2::jsonb) where sme_id=$1",[sme,JSON.stringify(auto?['save_summary','notify_sme','request_information','escalate']:[])]);
  const product=randomUUID(),shipment=randomUUID();
  await q("insert into public.products(id,warehouse_id,sme_id,sku,name) values($1::uuid,$2,$3,$1::uuid::text,'Recorded product')",[product,w,sme]);
  await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction) values($1::uuid,$2,$3,$1::uuid::text,'inbound')",[shipment,w,sme]);
  await q('insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty,received_qty) values($1,$2,$3,$4,100,90)',[shipment,w,sme,product]);
  let c,job;await user(staff,async()=>{c=await command('report',shipment,{stage:'inbound',type:'quantity_mismatch',note:'Recorded shortage 10',evidence_ids:[]});job=(await command('analyze',c.id,{expected_version:c.version,source_version:c.source_version,note:'Investigate current records',evidence_ids:[]})).job_id});
  const snapshot=(await one('select public.analysis_claim($1) r',[job])).r;
  const maker={policy_id:snapshot.policy_id,model:'fixture-maker',provider_response_id:'maker-'+job,configuration:{fake:true},input_tokens:10,output_tokens:10,proposal_hash:'a'.repeat(64),
   output:{exception_type:c.type,priority:c.priority,summary:'Recorded shortage is 10.',evidence_ids:[],recommended_action:action,requires_human:human,missing_information:missing}};
  await q("select public.analysis_stage($1,$2,'checker',$3::jsonb)",[job,snapshot.lease_token,JSON.stringify(maker)]);
  const checker={model:'fixture-checker',provider_response_id:'checker-'+job,configuration:{fake:true},input_tokens:10,output_tokens:10,
   output:{verdict:'approved',source_version:snapshot.source_version,proposal_hash:maker.proposal_hash,evidence_supported:true,classification_correct:true,priority_correct:true,action_authorized:true,findings:[]}};
  const result={maker,checker,checker_error:null};
  const finish=(value=result,error=null)=>(one('select public.analysis_finish($1,$2,$3::jsonb,$4) r',[job,snapshot.lease_token,JSON.stringify(value),error])).then(x=>x.r);
  return {c,job,snapshot,maker,checker,result,finish,product,shipment};
 }
 const noAction=async run=>assert.equal((await one('select count(*)::int n from public.action_executions where case_id=$1',[run.c.id])).n,0);
 try{
  const happy=await prepare();const first=await happy.finish();
  assert.equal(first.review_status,'approved');assert.equal(first.execution_status,'executed');
  assert.deepEqual(await happy.finish(),first);
  assert.equal((await one('select count(*)::int n from public.ai_analyses where job_id=$1',[happy.job])).n,1);
  const action=await one('select * from public.action_executions where case_id=$1',[happy.c.id]);
  assert.equal(action.execution_origin,'ai_maker_checker');assert.equal(action.analysis_id,first.analysis_id);
  assert.equal((await one('select available_qty from public.products where id=$1',[happy.product])).available_qty,0);
  await assert.rejects(()=>happy.finish({...happy.result,checker_error:'timeout'}),e=>e.message.includes('idempotency_conflict'));
  console.log('PASS MAKER-CHECKER: approved opted-in action executes atomically exactly once, with audit linkage and unchanged stock');

  for(const action of ['notify_sme','request_information','escalate']){
   const run=await prepare({action});assert.equal((await run.finish()).execution_status,'executed');
   if(action==='notify_sme'||action==='request_information')assert.equal((await one('select count(*)::int n from public.notifications where case_id=$1',[run.c.id])).n,1);
  }
  for(const change of ['reject','partial_check','wrong_hash','wrong_source','same_response','no_checker','timeout','legacy','substitution','foreign_evidence']){
   const run=await prepare(),result=structuredClone(run.result);
   if(change==='reject'){result.checker.output.verdict='rejected';result.checker.output.findings=['Unsupported conclusion'];}
   if(change==='partial_check')result.checker.output.priority_correct=false;
   if(change==='wrong_hash')result.checker.output.proposal_hash='b'.repeat(64);
   if(change==='wrong_source')result.checker.output.source_version='old';
   if(change==='same_response')result.checker.provider_response_id=result.maker.provider_response_id;
   if(change==='no_checker')result.checker=null;
   if(change==='timeout'){result.checker=null;result.checker_error='timeout';}
   if(change==='substitution')result.maker.output.summary='Replaced after review';
   if(change==='foreign_evidence')result.maker.output.evidence_ids=[randomUUID()];
   const saved=await run.finish(change==='legacy'?result.maker:result);
   assert.equal(saved.execution_status,'blocked',change);await noAction(run);
   await user(staff,async()=>{const c=await read(run.c.id);assert.equal(c.handling_mode,'human');assert.equal(c.status,'processing');assert.ok(c.events.some(e=>e.type==='ai_review_required'));});
  }
  console.log('PASS MAKER-CHECKER: rejected, malformed, missing, timed-out, legacy and substituted checker/proposal results block execution and enter human review');

  for(const options of [{auto:false},{human:true},{missing:['Physical count unverified']},{action:'propose_correction'},{action:'request_sme_decision'}]){
   const run=await prepare(options),saved=await run.finish();assert.equal(saved.review_status,'approved',JSON.stringify({options,saved}));assert.equal(saved.execution_status,'review_required');await noAction(run);
  }
  for(const action of ['update_workflow','dispatch','close','execute_sql']){const run=await prepare({action});assert.equal((await run.finish()).execution_status,'blocked');await noAction(run);}
  console.log('PASS MAKER-CHECKER: checker approval cannot override policy opt-in, human requirements, missing information or protected actions');

  for(const mutation of ['case','inventory','evidence','policy','revoked','closed']){
   const run=await prepare();
   if(mutation==='case')await q('update public.exception_cases set version=version+1 where id=$1',[run.c.id]);
   if(mutation==='inventory')await q('update public.products set available_qty=available_qty+1 where id=$1',[run.product]);
   if(mutation==='policy')await q("update public.resolution_policies set rules=rules||'{\"changed_during_review\":true}'::jsonb where id=$1",[run.snapshot.policy_id]);
   if(mutation==='evidence'){
    const id=randomUUID(),path=w+'/'+run.shipment+'/'+id;
    await q("insert into public.evidence(id,shipment_id,warehouse_id,sme_id,uploaded_by,object_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,$6,'image/jpeg',100)",[id,run.shipment,w,sme,staff,path]);
    await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[path]);
   }
   if(mutation==='revoked')await q('update public.memberships set active=false where profile_id=$1',[staff]);
   if(mutation==='closed')await q("update public.exception_cases set status='closed',closed_at=now(),resolution_note='Human verified closure',verified_at=now(),verified_by=$2,version=version+1 where id=$1",[run.c.id,staff]);
   assert.equal((await run.finish()).execution_status,'blocked',mutation);await noAction(run);
   if(mutation==='revoked')await q('update public.memberships set active=true where profile_id=$1',[staff]);
   if(mutation==='closed')assert.equal((await one('select status from public.exception_cases where id=$1',[run.c.id])).status,'closed');
  }
  console.log('PASS MAKER-CHECKER: changed case, inventory, evidence, policy, revoked requester and closed case invalidate execution');

  const denied=await prepare();
  for(const id of [staff,customer,foreign])await user(id,async()=>{
   await assert.rejects(()=>q('select public.analysis_finish($1,$2,$3::jsonb,null)',[denied.job,denied.snapshot.lease_token,JSON.stringify(denied.result)]),e=>e.code==='42501');
   await assert.rejects(()=>q("select public.analysis_stage($1,$2,'checker',$3::jsonb)",[denied.job,denied.snapshot.lease_token,JSON.stringify(denied.maker)]),e=>e.code==='42501');
  });
  await user(customer,async()=>{const c=await read(happy.c.id);assert.equal(c.analyses.length,0);assert.equal(c.jobs.length,0);});
  await assert.rejects(()=>q('select public.analysis_finish($1,$2,$3::jsonb,null)',[denied.job,randomUUID(),JSON.stringify(denied.result)]),e=>e.message.includes('stale_version'));
  await q("update public.analysis_jobs set lease_until=now()-interval '1 second' where id=$1",[denied.job]);
  await assert.rejects(()=>denied.finish(),e=>e.message.includes('stale_version'));
  console.log('PASS MAKER-CHECKER: user/SME/cross-tenant forgery denied, internal results hidden, wrong and expired leases rejected');
 }finally{await q('update public.resolution_policies set rules=$2::jsonb where sme_id=$1',[sme,JSON.stringify(priorRules)])}
}
