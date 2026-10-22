import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testRisk(db){
 const w='10000000-0000-4000-8000-000000000001',sme='20000000-0000-4000-8000-000000000001';
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const owner=randomUUID(),staff=randomUUID(),outsider=randomUUID(),tenant=randomUUID();
 for(const [id,role] of [[owner,'owner'],[staff,'staff'],[outsider,null],[tenant,'sme']]){
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@risk.test']);
  await db.query('insert into public.profiles(id,display_name) values($1,$2)',[id,'Risk '+role]);
  if(role)await db.query('insert into public.memberships(profile_id,warehouse_id,role,sme_id) values($1,$2,$3,$4)',[id,w,role,role==='sme'?sme:null]);
 }
 const user=async(id,fn)=>{await db.query('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.query('reset role');}};
 const reject=(fn,code)=>assert.rejects(fn,e=>e.code===code);
 const create=async(type='courier_delay',summary='Routine exception')=>{
  const shipment=randomUUID();await db.query("insert into public.shipments(id,warehouse_id,sme_id,reference,direction,status,delivery_mode) values($1,$2,$3,$4,'outbound','ready','in_house')",[shipment,w,sme,'RISK-'+shipment]);
  return (await one("insert into public.exception_cases(shipment_id,warehouse_id,sme_id,stage,type,summary) values($1,$2,$3,'outbound',$4,$5) returning *",[shipment,w,sme,type,summary]));
 };
 const queue=async(filters={})=>(await one('select public.case_queue_read($1,$2::jsonb) r',[w,JSON.stringify(filters)])).r;
 const read=async(id)=>(await one('select public.case_read($1) r',[id])).r;
 const command=async(c,body,key=randomUUID())=>(await one('select public.case_risk_command($1,$2,$3::jsonb,$4) r',[c.id,key,JSON.stringify({expected_version:c.version,source_version:c.source_version,note:'Checked shipment facts',...body}),randomUUID()])).r;
 const ordinary=await create(),urgent=await create('damaged_goods','Unsafe temperature damage');
 assert.equal(ordinary.priority,'normal');assert.equal(urgent.priority,'high');
 assert(ordinary.priority_classification.missing_attributes.includes('perishability'));
 await user(outsider,()=>reject(()=>queue(),'42501'));
 await user(tenant,()=>reject(()=>queue(),'42501'));
 await user(staff,async()=>{
  let c=await read(urgent.id);
  const context={perishability:'perishable',order_value_mmk:1000000,operational_impact:'severe'};
  const key=randomUUID(),body={kind:'context',context};const saved=await command(c,body,key);
  assert.equal(saved.priority,'critical');assert.equal(saved.priority_classification.policy_version,1);
  assert.equal(saved.priority_classification.reasons.perishability,25);
  assert.deepEqual(saved.priority_classification.missing_attributes,[]);
  assert.deepEqual(await command(c,body,key),saved);
  await reject(()=>command(c,{...body,note:'Different note'},key),'22023');
  await reject(()=>command(c,body),'40001');
  await reject(()=>command(saved,{kind:'escalation',escalated:true}),'42501');
  await reject(()=>command(saved,{kind:'priority',priority:'low'}),'42501');
  await reject(()=>command(saved,{kind:'context',context:{...context,order_value_mmk:-1}}),'22023');
  const page=await queue({limit:1,sort:'risk'});assert.equal(page.items[0].id,urgent.id);
  assert.equal(page.next_cursor,urgent.id);
  const next=await queue({limit:1,sort:'risk',cursor:page.next_cursor});assert.notEqual(next.items[0].id,urgent.id);
 });
 await user(owner,async()=>{
  let c=await read(urgent.id);const before={priority:c.priority,status:c.status,mode:c.handling_mode};
  c=await command(c,{kind:'escalation',escalated:true});assert.equal(c.escalated,true);
  assert.deepEqual({priority:c.priority,status:c.status,mode:c.handling_mode},before);
  assert.equal((await queue({escalated:true})).items.some(x=>x.id===c.id),true);
  c=await command(c,{kind:'escalation',escalated:false});assert.equal(c.escalated,false);
  c=await command(c,{kind:'priority',priority:'low'});assert.equal(c.priority_override,true);assert.equal(c.priority,'low');
  c=await command(c,{kind:'context',context:{perishability:'perishable',order_value_mmk:1000000,operational_impact:'severe'}});assert.equal(c.priority,'low');
  c=await command(c,{kind:'priority',priority:'automatic'});assert.equal(c.priority,'critical');assert.equal(c.priority_override,false);
  assert(c.events.some(e=>e.type==='risk_escalation'));
 });
 await db.query("update public.case_slas set first_response_minutes=1,resolution_minutes=2,first_response_due_at=now()+interval '10 seconds',resolution_due_at=now()+interval '70 seconds' where case_id=$1",[ordinary.id]);
 await user(staff,async()=>{const page=await queue({sla_risk:'at_risk'});assert(page.items.some(c=>c.id===ordinary.id),'Short SLA windows retain fractional-minute risk boundaries');});
 await db.query("update public.case_slas set first_response_due_at=now()-interval '1 minute' where case_id=$1",[ordinary.id]);
 await user(staff,async()=>{const page=await queue({sla_risk:'overdue'});assert(page.items.some(c=>c.id===ordinary.id));});
 await db.query("insert into public.sla_escalations(case_id,warehouse_id,milestone) values($1,$2,'first_response')",[ordinary.id,w]);
 assert.equal((await one('select escalated from public.exception_cases where id=$1',[ordinary.id])).escalated,true);
 console.log('PASS RISK: automatic creation classification, reasons, missing facts, tenant/owner guards, stable replay, stale edits, complete-queue ranking/pagination, override preservation, independent escalation and SLA integration');
}
