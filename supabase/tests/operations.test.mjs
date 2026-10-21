import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Runs against both PGlite and native PostgreSQL. No mocked business functions.
export async function testOperations(db) {
 const id=(n,i)=>`${n}0000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
 const w=id(1,1), actor=randomUUID(), other=randomUUID(), correlation=randomUUID();
 const query=(sql,args=[])=>db.query(sql,args);
 const one=async(sql,args=[])=>(await query(sql,args)).rows[0];
 const user=async(who,fn)=>{await query('set role authenticated');await query("select set_config('request.jwt.claim.sub',$1,false)",[who]);try{return await fn();}finally{await query('reset role');}};
 await query('insert into auth.users(id,email) values($1,$2),($3,$4)',[actor,'ops@example.test',other,'ops-sme@example.test']);
 await query('insert into public.profiles(id,display_name) values($1,$2),($3,$4)',[actor,'Ops staff',other,'Ops SME']);
 await query("insert into public.memberships(profile_id,warehouse_id,role,sme_id) values($1,$2,'staff',null),($3,$2,'sme',$4)",[actor,w,other,id(2,1)]);
 const command=async(kind,entity,body,key=randomUUID())=>(await one('select public.ops_command($1,$2,$3,$4,$5::jsonb,$6) result',[w,kind,key,entity,JSON.stringify(body),correlation])).result;
 const read=async(kind,filters={})=>(await one('select public.ops_read($1,$2,$3::jsonb) result',[w,kind,JSON.stringify(filters)])).result;
 const rejects=(fn,msg)=>assert.rejects(fn,e=>e.message.includes(msg));
 let count=0;
 const test=async(name,fn)=>{await fn();count++;console.log('PASS OPS: '+name);};
 const product=randomUUID();
 await query("insert into public.products(id,warehouse_id,sme_id,sku,name) values($1,$2,$3,$4,'Operations test')",[product,w,id(2,1),'OPS-'+product]);
 let shipment, result;
 const receipt=(qty,damage=0,final=true,version=1)=>({expected_version:version,final,lines:[{product_id:product,received_qty:qty,damaged_qty:damage}],evidence_ids:[],notes:'Count verified'});
 await user(actor,async()=>{
  await test('scoped create/detail/list and keyset pagination',async()=>{
   shipment=await command('create',null,{sme_id:id(2,1),reference:'OPS-'+randomUUID(),direction:'inbound',delivery_mode:null,lines:[{product_id:product,expected_qty:100}]});
   assert.equal((await read('detail',{shipment_id:shipment.id})).items[0].expected_qty,100);
   const page=await read('shipments',{limit:2});assert.equal(page.items.length,2);assert.ok(page.next_cursor);
   const next=await read('shipments',{limit:2,cursor:page.next_cursor});assert.ok(next.items.every(x=>x.id>page.next_cursor));
   assert.ok(!(await read('shipments')).items.some(x=>x.warehouse_id!==w));
  });
  await test('90/100 final receipt is gap 10; immutable retry and separate facts',async()=>{
   const key=randomUUID();result=await command('receipt',shipment.id,receipt(90,5),key);
   assert.equal(result.shortage_qty,10);assert.equal(result.good_qty,85);assert.equal(result.damaged_qty,5);
   assert.equal(result.stock[0].available_qty,85);assert.equal(result.stock[0].quarantined_qty,5);
   assert.equal(result.case_ids.length,2);
   assert.deepEqual(await command('receipt',shipment.id,receipt(90,5),key),result);
   await rejects(()=>command('receipt',shipment.id,receipt(91,5),key),'idempotency_conflict');
   await rejects(()=>command('receipt',shipment.id,receipt(1),randomUUID()),'stale_version');
  });
 });
 await test('one receipt, one stock movement and typed numerical outbox facts',async()=>{
  assert.equal((await one('select count(*)::int n from public.receipts where shipment_id=$1',[shipment.id])).n,1);
  assert.equal((await one('select count(*)::int n from public.stock_movements where product_id=$1',[product])).n,1);
  const facts=(await query("select * from public.outbox_events where payload->>'shipment_id'=$1 order by event_type",[shipment.id])).rows;
  assert.equal(facts.length,2);assert.deepEqual(facts.map(x=>x.event_type),['receipt.damaged_goods','receipt.quantity_mismatch']);
  for(const fact of facts){assert.equal(fact.payload.shortage_qty,10);assert.equal(fact.payload.damaged_qty,5);assert.equal(fact.actor_id,actor);assert.equal(fact.correlation_id,correlation);}
 });
 await test('SME cannot read operational staff APIs or use retired legacy RPC',()=>user(other,async()=>{
  await rejects(()=>read('inventory'),'forbidden');
  await assert.rejects(()=>query('select public.receive_shipment($1,$2,$3::jsonb)',[shipment.id,randomUUID(),'[]']),e=>e.code==='42501');
 }));
 await user(actor,async()=>{
  await test('cross-SME product creation is rejected without orphan shipment',async()=>{
   const ref='bad-'+randomUUID();await rejects(()=>command('create',null,{sme_id:id(2,2),reference:ref,direction:'inbound',delivery_mode:null,lines:[{product_id:product,expected_qty:2}]}),'invalid_product');
   assert.equal((await read('shipments')).items.filter(s=>s.reference===ref).length,0);
  });
  let partial;
  await test('incremental partial receipts, overreceipt rollback and finalization',async()=>{
   partial=await command('create',null,{sme_id:id(2,1),reference:randomUUID(),direction:'inbound',delivery_mode:null,lines:[{product_id:product,expected_qty:100}]});
   const a=await command('receipt',partial.id,receipt(40,0,false));assert.equal(a.shipment.status,'partially_received');assert.equal(a.case_ids.length,0);
   await rejects(()=>command('receipt',partial.id,receipt(61,0,false,2)),'overreceipt_requires_review');
   const b=await command('receipt',partial.id,receipt(50,0,false,2));assert.equal(b.received_qty,90);
   const c=await command('receipt',partial.id,receipt(0,0,true,3));assert.equal(c.shortage_qty,10);assert.equal(c.case_ids.length,1);
   await rejects(()=>command('receipt',partial.id,receipt(1,0,true,4)),'receipt_not_allowed');
  });
  await test('foreign receipt line and invalid damage roll back version/stock',async()=>{
   const s=await command('create',null,{sme_id:id(2,1),reference:randomUUID(),direction:'inbound',delivery_mode:null,lines:[{product_id:product,expected_qty:10}]});
   await rejects(()=>command('receipt',s.id,{...receipt(1),lines:[{product_id:id(3,2),received_qty:1,damaged_qty:0}]}),'unknown_shipment_product');
   await rejects(()=>command('receipt',s.id,receipt(1,2)),'invalid_quantity');
   assert.equal((await read('detail',{shipment_id:s.id})).version,1);
  });
 });
 const evidence=randomUUID(), path=w+'/'+shipment.id+'/'+evidence;
 await query("insert into public.evidence(id,shipment_id,warehouse_id,sme_id,uploaded_by,object_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,$6,'image/png',100)",[evidence,shipment.id,w,id(2,1),actor,path]);
 await query("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[path]);
 await user(actor,async()=>{
  await test('correction needs uploaded evidence and version; cannot make stock negative',async()=>{
   const stock=await read('stock',{product_id:product});const body={expected_version:stock.version,available_delta:2,quarantined_delta:-2,notes:'Verified reclassification',evidence_ids:[evidence]};
   const key=randomUUID(),saved=await command('correction',product,body,key);
   assert.equal(saved.product.quarantined_qty,3);assert.deepEqual(await command('correction',product,body,key),saved);
   await rejects(()=>command('correction',product,{...body,expected_version:saved.version,available_delta:-10000}),'stock_unavailable');
   await rejects(()=>command('correction',product,{...body,expected_version:saved.version,evidence_ids:[randomUUID()]}),'invalid_evidence');
  });
  await test('pick/pack order, insufficient dispatch rollback, third-party and unassigned block',async()=>{
   const s=await command('create',null,{sme_id:id(2,1),reference:randomUUID(),direction:'outbound',delivery_mode:'in_house',lines:[{product_id:product,expected_qty:10000}]});
   const body=(type,version)=>({type,expected_version:version,notes:'Physical step confirmed',verified_at:new Date().toISOString(),evidence_ids:[]});
   await rejects(()=>command('event',s.id,body('packed',1)),'event_not_allowed');
   const picked=await command('event',s.id,body('picked',1));assert.deepEqual(picked.allowed_events,['packed']);
   const packed=await command('event',s.id,body('packed',2));assert.deepEqual(packed.allowed_events,[]);
   await rejects(()=>command('event',s.id,body('dispatched',3)),'event_not_allowed');
   const third=await command('create',null,{sme_id:id(2,1),reference:randomUUID(),direction:'outbound',delivery_mode:'third_party',lines:[{product_id:product,expected_qty:1}]});
   await rejects(()=>command('event',third.id,body('picked',1)),'event_not_allowed');
   // Real rider/active membership, accepted physical pickup, same warehouse.
   const rider=randomUUID(),riderRow=randomUUID();
   await query('reset role');
   await query('insert into auth.users(id,email) values($1,$2)',[rider,'ops-rider@example.test']);
   await query("insert into public.profiles(id,display_name) values($1,'Ops rider')",[rider]);
   await query("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider')",[rider,w]);
   await query('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[riderRow,w,rider]);
   await query('insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id,accepted_at,picked_up_at) values($1,$2,$3,$4,now(),now())',[s.id,w,id(2,1),riderRow]);
   await query('set role authenticated');
   await rejects(()=>command('event',s.id,body('dispatched',3)),'stock_unavailable');
   assert.equal((await read('detail',{shipment_id:s.id})).version,3);
   // Correct authoritative shipment plan only in test setup to exercise dispatch.
   await query('reset role');await query('update public.shipment_items set expected_qty=10 where shipment_id=$1',[s.id]);await query('set role authenticated');
   const key=randomUUID(),request=body('dispatched',3),saved=await command('event',s.id,request,key);
   assert.equal(saved.status,'in_transit');assert.deepEqual(saved.allowed_events,[]);
   assert.deepEqual(await command('event',s.id,request,key),saved);
   await rejects(()=>command('event',s.id,body('dispatched',4)),'event_not_allowed');
  });
 });
 console.log(`${count} warehouse operation integration scenarios passed.`);
}
