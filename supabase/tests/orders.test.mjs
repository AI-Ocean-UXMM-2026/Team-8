import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
const db=new PGlite();
try{
 await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
 for(const f of (await readdir('supabase/migrations')).sort())await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
 await db.exec(await readFile('supabase/seed.sql','utf8'));
 const w='10000000-0000-4000-8000-000000000001',s='20000000-0000-4000-8000-000000000001';
 const actor=randomUUID(),staff=randomUUID(),foreign=randomUUID(),product=randomUUID();
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 for(const id of [actor,staff,foreign]){await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.invalid']);await q('insert into public.profiles(id,display_name) values($1,$2)',[id,'Orders test']);}
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme'),($4,$2,null,'staff')",[actor,w,s,staff]);
 await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1,$2,$3,'ORD-TEST','Order product',10)",[product,w,s]);
 const as=async(id,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await q('reset role');}};
 const body={warehouse_id:w,sme_id:s,customer_name:'Test',customer_phone:'091234567',address:'Yangon',latitude:16.84,longitude:96.17,maps_url:'https://maps.app.goo.gl/abc',notes:'Floor 2',lines:[{product_id:product,expected_qty:7}]};
 const command=async(id,b,key=randomUUID())=>(await one('select public.sme_order_command($1,$2,$3,$4::jsonb) r',[w,key,id,JSON.stringify(b)])).r;
 let order;const key=randomUUID();
 await as(actor,async()=>{order=await command(null,body,key);assert.equal((await command(null,body,key)).id,order.id);await assert.rejects(()=>command(null,{...body,notes:'changed'},key),/idempotency_conflict/);await assert.rejects(()=>command(null,body),/stock_unavailable/);await assert.rejects(()=>command(order.id,{action:'accept',delivery_mode:'in_house'}),/forbidden/);});
 assert.equal((await one('select available_qty,reserved_qty from public.products where id=$1',[product])).reserved_qty,7);
 await as(actor,async()=>{const list=(await one('select public.sme_orders_read($1,$2) r',[w,s])).r;assert.equal(list[0].payload.lines[0].name,'Order product');const overview=(await one("select public.tenant_feed('overview',$1) r",[s])).r;assert.equal(overview.inventory.find(p=>p.id===product).available_qty,3);});
 await as(foreign,async()=>{await assert.rejects(()=>command(null,body),/forbidden/);assert.equal((await q('select * from public.sme_orders')).rows.length,0);});
 await as(actor,async()=>{await command(order.id,{action:'cancel'});await assert.rejects(()=>command(order.id,{action:'cancel'}),/stale_version/);});
 assert.equal((await one('select reserved_qty from public.products where id=$1',[product])).reserved_qty,0);
 await as(actor,async()=>{order=await command(null,body);});
 await as(staff,async()=>{await assert.rejects(()=>command(order.id,{action:'reject',note:''}),/reason_required/);await command(order.id,{action:'reject',note:'Cannot deliver'});});
 assert.equal((await one('select reserved_qty from public.products where id=$1',[product])).reserved_qty,0);
 await as(actor,async()=>{order=await command(null,body);});
 await as(staff,async()=>{order=await command(order.id,{action:'accept',delivery_mode:'in_house'});});
 assert.ok(order.shipment_id);assert.equal((await one('select delivery_destination from public.shipments where id=$1',[order.shipment_id])).delivery_destination.latitude,16.84);
 assert.equal((await one('select reserved_qty from public.products where id=$1',[product])).reserved_qty,7);
 await assert.rejects(()=>q('update public.products set available_qty=2 where id=$1',[product]),/check constraint/);

 const corr=randomUUID();
 const event=async(type,version,key=randomUUID())=>(await one("select public.ops_command($1,'event',$2,$3,$4::jsonb,$5) r",[w,key,order.shipment_id,JSON.stringify({type,expected_version:version,notes:'Verified physically',verified_at:new Date().toISOString(),evidence_ids:[]}),corr])).r;
 await as(staff,async()=>{
  await assert.rejects(()=>event('dispatched',1),/event_not_allowed/);
  assert.equal((await one('select reserved_qty from public.products where id=$1',[product])).reserved_qty,7);
  await event('picked',1);await event('packed',2);
 });
 const rider=randomUUID(),riderId=randomUUID();
 await q('insert into auth.users(id,email) values($1,$2)',[rider,'order-rider@test.invalid']);await q("insert into public.profiles(id,display_name) values($1,'Order rider')",[rider]);
 await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider')",[rider,w]);await q('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[riderId,w,rider]);
 await q('insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id,accepted_at,picked_up_at) values($1,$2,$3,$4,now(),now())',[order.shipment_id,w,s,riderId]);
 await as(rider,async()=>{assert.equal((await one('select public.order_customer($1) r',[order.shipment_id])).r.customer_name,'Test');});
 const dispatchKey=randomUUID(),dispatchBody={type:'dispatched',expected_version:3,notes:'Verified dispatch',verified_at:new Date().toISOString(),evidence_ids:[]};
 const dispatch=()=>one("select public.ops_command($1,'event',$2,$3,$4::jsonb,$5) r",[w,dispatchKey,order.shipment_id,JSON.stringify(dispatchBody),corr]);
 await as(staff,async()=>{await dispatch();await dispatch();});
 assert.deepEqual(await one('select available_qty,reserved_qty from public.products where id=$1',[product]),{available_qty:3,reserved_qty:0});
 const small={...body,lines:[{product_id:product,expected_qty:2}]};
 await as(actor,async()=>{order=await command(null,small);});
 await as(staff,async()=>{order=await command(order.id,{action:'accept',delivery_mode:'third_party'});});
 const cancel=()=>one("select public.delivery_command('cancel',$1,$2,$3::jsonb,$4) r",[order.shipment_id,randomUUID(),JSON.stringify({expected_version:1,note:'Order cancelled by warehouse'}),corr]);
 await as(staff,cancel);assert.equal((await one('select reserved_qty from public.products where id=$1',[product])).reserved_qty,0);
 await as(actor,async()=>{order=await command(null,small);});
 await as(staff,async()=>{order=await command(order.id,{action:'accept',delivery_mode:'third_party'});});
 const record=await as(staff,async()=>(await one("select public.register_evidence($1,'image/png',20,true) r",[order.shipment_id])).r);
 await q("insert into storage.objects(bucket_id,name) values('parcelcare-evidence',$1)",[record.path]);
 const created=(await one('select created_at from public.shipments where id=$1',[order.shipment_id])).created_at;
 const handoverBody={expected_version:1,note:'Carrier acceptance verified',evidence_id:record.id,courier_name:'Fixture carrier',waybill:'ORD-001',tracking_url:'https://carrier.test/ORD-001',accepted_at:created,package_condition:'Intact',package_count:1};
 const handoverKey=randomUUID();const handover=()=>one("select public.delivery_command('handover',$1,$2,$3::jsonb,$4) r",[order.shipment_id,handoverKey,JSON.stringify(handoverBody),corr]);
 await as(staff,async()=>{await handover();await handover();});
 assert.deepEqual(await one('select available_qty,reserved_qty from public.products where id=$1',[product]),{available_qty:1,reserved_qty:0});

 const timedProduct=randomUUID();await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1,$2,$3,'TIMED','Timed release',10)",[timedProduct,w,s]);
 const timed={...body,order_kind:'sme_self_delivery',delivery_due_at:new Date(Date.now()+86400000).toISOString(),lines:[{product_id:timedProduct,expected_qty:7}]};
 await as(actor,async()=>{
  for(const due of [null,new Date(Date.now()-1000).toISOString(),new Date(Date.now()+31*86400000).toISOString()])await assert.rejects(()=>command(null,{...timed,delivery_due_at:due}),/invalid_delivery_deadline/);
  const k=randomUUID(),auto=await command(null,timed,k);assert.equal(auto.status,'accepted');assert.ok(auto.shipment_id);assert.equal(auto.payload.delivery_due_at,timed.delivery_due_at);
  assert.equal((await command(null,timed,k)).shipment_id,auto.shipment_id);
  assert.equal((await one('select count(*)::int n from public.shipments where id=$1',[auto.shipment_id])).n,1);
  await assert.rejects(()=>command(null,timed),/stock_unavailable/);
  assert.equal((await one('select reserved_qty from public.products where id=$1',[timedProduct])).reserved_qty,7);
  await assert.rejects(()=>command(auto.id,{action:'accept',delivery_mode:'in_house'}),/forbidden/);
 });
 await as(actor,async()=>{
  const late={...timed,delivery_due_at:new Date(Date.now()+1000).toISOString(),lines:[{product_id:timedProduct,expected_qty:1}]},k=randomUUID();
  const saved=await command(null,late,k);await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal((await command(null,late,k)).shipment_id,saved.shipment_id);
  await assert.rejects(()=>command(null,late),/invalid_delivery_deadline/);
 });
 console.log('PASS deadline requests: atomic acceptance, reservation, shipment, deadline validation, replay and overbooking prevention');
 console.log('PASS orders: dispatch rollback/replay, assigned rider customer access, warehouse cancellation, third-party handover stock once');
 console.log('PASS orders: fresh migrations, tenant isolation, replay, overbooking, cancellation, rejection, acceptance and stock guard');
}finally{await db.close();}
