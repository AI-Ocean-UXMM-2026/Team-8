import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
export async function testSharedStock(db){
 const w='10000000-0000-4000-8000-000000000001',s='20000000-0000-4000-8000-000000000001';
 const actor=randomUUID(),staff=randomUUID(),foreign=randomUUID(),product=randomUUID(),second=randomUUID();
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 for(const id of [actor,staff,foreign,second]){await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.invalid']);await q('insert into public.profiles(id,display_name) values($1,$2)',[id,'Orders test']);}
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme'),($4,$2,null,'staff')",[actor,w,s,staff]);
 await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1,$2,$3,($1::uuid)::text,'Order product',10)",[product,w,s]);
 const as=async(id,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await q('reset role');}};
 const tenant2='20000000-0000-4000-8000-000000000002';
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme')",[second,w,tenant2]);
 const profile=(id,value=null)=>one('select public.sme_delivery_profile($1,$2,$3::jsonb) r',[w,id,value?JSON.stringify(value):null]);
 const legacy=randomUUID();await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1,$2,null,$1::text,'Unassigned stock',20)",[legacy,w]);
 await as(actor,async()=>{assert.equal((await profile(s)).r,null);await assert.rejects(()=>profile(tenant2),/forbidden/);await assert.rejects(()=>q('select public.warehouse_catalog($1)',['10000000-0000-4000-8000-000000000002']),/forbidden/);});
 const body={warehouse_id:w,sme_id:s,order_kind:'sme_self_delivery',save_delivery_profile:true,recipient_name:'Test SME shop',recipient_phone:'091234567',address:'Yangon',latitude:16.84,longitude:96.17,maps_url:'https://maps.app.goo.gl/abc',notes:'Floor 2',lines:[{product_id:product,expected_qty:7}]};
 const command=async(id,b,key=randomUUID())=>(await one('select public.sme_order_command($1,$2,$3,$4::jsonb) r',[w,key,id,JSON.stringify(b)])).r;
 let order;const key=randomUUID();
 await as(actor,async()=>{order=await command(null,body,key);assert.equal((await command(null,body,key)).id,order.id);await assert.rejects(()=>command(null,{...body,notes:'changed'},key),/idempotency_conflict/);await assert.rejects(()=>command(null,body),/stock_unavailable/);await assert.rejects(()=>command(order.id,{action:'accept',delivery_mode:'in_house'}),/forbidden/);});
 assert.equal((await one('select available_qty,reserved_qty from public.products where id=$1',[product])).reserved_qty,7);
 await as(actor,async()=>{
  const saved=(await profile(s)).r;assert.equal(saved.recipient_name,'Test SME shop');
  await profile(s,{...saved,address:'Updated shop address',latitude:17});
  await command(null,body,key);
  assert.equal((await profile(s)).r.address,'Updated shop address','replay must not overwrite a later profile');
  assert.equal((await one('select public.sme_orders_read($1,$2) r',[w,s])).r.find(o=>o.id===order.id).payload.address,'Yangon');
  await assert.rejects(()=>command(null,{...body,lines:[{product_id:legacy,expected_qty:1}]}),/invalid_product/);
  await assert.rejects(()=>command(null,{...body,lines:[{product_id:product,expected_qty:1.5}]}),/invalid_lines/);
  await assert.rejects(()=>command(null,{...body,lines:[{product_id:product,expected_qty:1},{product_id:product.toUpperCase(),expected_qty:1}]}),/invalid_lines/);
 });
 await as(second,async()=>{
  await assert.rejects(()=>command(null,{...body,sme_id:tenant2,lines:[{product_id:product,expected_qty:1}]}),/invalid_product/);
  await assert.rejects(()=>command(order.id,{action:'cancel'}),/forbidden/);
 });
 await as(staff,async()=>{assert.equal((await profile(s)).r.address,'Updated shop address');await assert.rejects(()=>profile(s,{recipient_name:'Staff',recipient_phone:'09123',address:'Wrong',latitude:16,longitude:96}),/forbidden/);});

 await as(actor,async()=>{const list=(await one('select public.sme_orders_read($1,$2) r',[w,s])).r;assert.equal(list.find(o=>o.id===order.id).payload.lines[0].name,'Order product');const catalog=(await one('select public.sme_stock_catalog($1,$2) r',[w,s])).r.items;assert.equal(catalog.find(p=>p.id===product).available_qty,3);assert.deepEqual(Object.keys(catalog.find(p=>p.id===product)).sort(),['available_qty','id','name','sku','warehouse_id']);assert.ok((await q('select * from public.products')).rows.some(p=>p.id===product));});
 await as(foreign,async()=>{await assert.rejects(()=>command(null,body),/forbidden/);assert.equal((await q('select * from public.sme_orders')).rows.length,0);await assert.rejects(()=>q('select public.warehouse_catalog($1)',[w]),/forbidden/);});
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
 await as(rider,async()=>{assert.equal((await one('select public.order_customer($1) r',[order.shipment_id])).r.customer_name,'Test SME shop');});
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
 const created=(await one('select created_at::text as created_at from public.shipments where id=$1',[order.shipment_id])).created_at;
 const handoverBody={expected_version:1,note:'Carrier acceptance verified',evidence_id:record.id,courier_name:'Fixture carrier',waybill:'ORD-001',tracking_url:'https://carrier.test/ORD-001',accepted_at:created,package_condition:'Intact',package_count:1};
 const handoverKey=randomUUID();const handover=()=>one("select public.delivery_command('handover',$1,$2,$3::jsonb,$4) r",[order.shipment_id,handoverKey,JSON.stringify(handoverBody),corr]);
 await as(staff,async()=>{await handover();await handover();});
 assert.deepEqual(await one('select available_qty,reserved_qty from public.products where id=$1',[product]),{available_qty:1,reserved_qty:0});

 // Shared product return is posted back to the same pool, including quarantine.
 const delivery=(kind,b,k=randomUUID())=>one('select public.delivery_command($1,$2,$3,$4::jsonb,$5) r',[kind,order.shipment_id,k,JSON.stringify(b),corr]);
 await as(staff,async()=>{
  const version=(await one('select version from public.shipments where id=$1',[order.shipment_id])).version;
  await delivery('cancel',{expected_version:version,note:'Physical return arranged'});
  const k=randomUUID(),b={expected_version:version+1,note:'Returned good and damaged units counted',evidence_id:record.id,lines:[{product_id:product,received_qty:2,damaged_qty:1}]};
  await delivery('return',b,k);await delivery('return',b,k);
 });
 assert.deepEqual(await one('select available_qty,quarantined_qty,reserved_qty from public.products where id=$1',[product]),{available_qty:2,quarantined_qty:1,reserved_qty:0});
 assert.equal((await one('select sme_id from public.products where id=$1',[product])).sme_id,null);
 await as(staff,async()=>{
  const version=(await one('select version from public.products where id=$1',[product])).version;
  const b={expected_version:version,available_delta:1,quarantined_delta:0,notes:'Verified warehouse common stock count',evidence_ids:[record.id]},k=randomUUID();
  await q("select public.ops_command($1,'correction',$2,$3,$4::jsonb,$5)",[w,k,product,JSON.stringify(b),corr]);
  await q("select public.ops_command($1,'correction',$2,$3,$4::jsonb,$5)",[w,k,product,JSON.stringify(b),corr]);
 });
 assert.equal((await one('select available_qty from public.products where id=$1',[product])).available_qty,3);
 console.log('PASS shared stock: cross-SME reservations, catalog privacy, profile authorization/snapshot/replay, legacy protection and evidenced common-stock returns');
 console.log('PASS shared stock: dispatch rollback/replay, assigned rider customer access, warehouse cancellation, third-party handover stock once');
 console.log('PASS shared stock: fresh migrations, tenant isolation, replay, overbooking, cancellation, rejection, acceptance and stock guard');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.chdir(fileURLToPath(new URL('../..',import.meta.url)));
 const db=new PGlite();try{
  await db.exec(await readFile('supabase/tests/bootstrap.sql','utf8'));
  for(const f of (await readdir('supabase/migrations')).sort())await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from public.products where sme_id is null')).rows[0].n,0,'migration must not invent shared stock');
  await testSharedStock(db);
 }finally{await db.close();}
}
