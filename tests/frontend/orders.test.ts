import test from 'node:test';
import assert from 'node:assert/strict';
import {googleMapsUrl,mapsCoordinates,checkedCatalog,checkedProfile} from '../../src/shared/api/orders';
import {generateDemoInbound,demoInboundShipments,createWarehouseMockTransport} from '../../src/shared/api/warehouse-mock';
import {createSmeTrackingMockTransport} from '../../src/shared/api/sme-tracking-mock';

test('Legacy inbound fixtures remain separate from shared-stock SME orders',async()=>{
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 const warehouse='10000000-0000-4000-8000-000000000001',sme='10000000-0000-4000-8000-000000000003';
 const shipment=generateDemoInbound(storage,sme,warehouse);
 assert.equal(shipment.direction,'inbound');assert.equal(shipment.status,'expected');
 assert.equal(shipment.items[0].received_qty,0);assert.match(shipment.events[0].notes,/Yangon/);
 assert.equal(demoInboundShipments(storage)[0].id,shipment.id);
 const staff=createWarehouseMockTransport(storage),merchant=createSmeTrackingMockTransport(storage);
 const detail=await staff<typeof shipment>({method:'GET',path:`/api/shipments/${shipment.id}?warehouse_id=${warehouse}`});
 assert.equal(detail.id,shipment.id);
 const overview=await merchant<{shipments:{id:string}[]}>({method:'GET',path:`/api/sme/overview?sme_id=${sme}`});
 assert.ok(overview.shipments.some(s=>s.id===shipment.id));
 const saved=storage.getItem('parcelcare.warehouse.demo.v1')!;
 assert.equal(JSON.parse(saved).data.inventory.find((p:{sme_id:string})=>p.sme_id===sme).available_qty,30);
 assert.throws(()=>generateDemoInbound(storage,sme,crypto.randomUUID()));
 assert.equal(storage.getItem('parcelcare.warehouse.demo.v1'),saved);
});
test('Google Maps links identify a customer marker, never a viewport',()=>{
 assert.deepEqual(mapsCoordinates('https://www.google.com/maps/search/?api=1&query=16.84,96.17'),[16.84,96.17]);
 assert.deepEqual(mapsCoordinates('https://www.google.com/maps/place/Customer/@17,97,12z/data=!3d16.84!4d96.17'),[16.84,96.17]);
 assert.equal(mapsCoordinates('https://www.google.com/maps/@16.84,96.17,12z'),null);
 assert.equal(mapsCoordinates('https://maps.app.goo.gl/abc'),null);
 assert.equal(mapsCoordinates('https://maps.google.com/?q=91,96'),null);
 for(const url of ['https://google.com.evil.test/maps','http://maps.app.goo.gl/x','https://user@maps.app.goo.gl/x','https://www.google.com/search?q=x','https://goo.gl/anything'])assert.equal(googleMapsUrl(url),null);
});

test('SME demo releases only its own stock to its shop, preserving profile and snapshot',async()=>{
 const {createApiClient}=await import('../../src/shared/api/client');
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const merchant=createApiClient(createSmeTrackingMockTransport(storage));const identity=await merchant.getMe();
 const {warehouse_id:warehouse,sme_id:sme}=identity.memberships[0];
  const catalog=await merchant.getWarehouseCatalog(warehouse,undefined,sme!);
  const firstPage=await merchant.getCatalogPage(warehouse,{smeId:sme!});assert.equal(firstPage.total,15);assert.equal(firstPage.items.length,10);assert(firstPage.next_cursor);const nextPage=await merchant.getCatalogPage(warehouse,{smeId:sme!,cursor:firstPage.next_cursor!,selectedIds:[firstPage.items[0].id]});assert.equal(nextPage.items.length,5);assert.equal(nextPage.selected_items[0].id,firstPage.items[0].id);
  assert.ok(firstPage.items.every((p,i)=>i===0||firstPage.items[i-1].sku.localeCompare(p.sku,undefined,{numeric:true})<=0));
 assert.equal(catalog.length,15);assert.ok(catalog.every(p=>!('sme_id' in p)&&!('shipment_ids' in p)));
 await assert.rejects(merchant.getCatalogPage(warehouse,{smeId:'10000000-0000-4000-8000-000000000002'}));
 await assert.rejects(merchant.submitOrder({warehouse_id:warehouse,sme_id:sme!,order_kind:'sme_self_delivery',customer_name:'Shop',customer_phone:'09123',address:'SME shop',latitude:16,longitude:96,notes:'',maps_url:'',lines:[{product_id:'91000000-0000-4000-8000-000000000001',expected_qty:1}]},crypto.randomUUID()));
 const profile={recipient_name:'SME shop',recipient_phone:'091234567',address:'SME shop, Yangon',latitude:16.84,longitude:96.17,maps_url:'',notes:''};
 assert.equal(await merchant.getSMEDeliveryProfile(warehouse,sme!),null);
 await merchant.saveSMEDeliveryProfile(warehouse,sme!,profile);
 const body={...profile,customer_name:profile.recipient_name,customer_phone:profile.recipient_phone,order_kind:'sme_self_delivery' as const,warehouse_id:warehouse,sme_id:sme!,lines:[{product_id:catalog[0].id,expected_qty:4}]};
 const key=crypto.randomUUID(),order=await merchant.submitOrder(body,key);
 assert.equal((await merchant.submitOrder(body,key)).id,order.id);
 assert.equal((await merchant.getWarehouseCatalog(warehouse,undefined,sme!)).find(p=>p.id===catalog[0].id)!.available_qty,catalog[0].available_qty-4);
 await merchant.saveSMEDeliveryProfile(warehouse,sme!,{...profile,address:'New shop'});
 assert.equal((await merchant.listOrders(warehouse,sme!))[0].payload.address,'SME shop, Yangon');
 const staff=createApiClient(createWarehouseMockTransport(storage));
 const accepted=await staff.actOnOrder(order.id,warehouse,{action:'accept',delivery_mode:'in_house'},crypto.randomUUID());
 assert.ok(accepted.shipment_id);
 const shipment=await staff.getShipment(accepted.shipment_id!,undefined,warehouse);
 assert.equal(shipment.direction,'outbound');assert.equal(shipment.sme_id,sme);
 assert.equal((await merchant.listOrders(warehouse,sme!))[0].status,'accepted');
 await assert.rejects(merchant.actOnOrder(order.id,warehouse,{action:'accept'},crypto.randomUUID()));
 const restored=createApiClient(createSmeTrackingMockTransport(storage));assert.equal((await restored.getSMEDeliveryProfile(warehouse,sme!))!.address,'New shop');
});
test('shared catalog and delivery-profile readers reject invalid providers and remove unrelated metadata',()=>{
 const w='10000000-0000-4000-8000-000000000001',id='90000000-0000-4000-8000-000000000001';
 assert.throws(()=>checkedCatalog([{id,warehouse_id:w,sku:'A',name:'Tea',available_qty:-1}],w));
 const p=checkedCatalog([{id,warehouse_id:w,sku:'A',name:'Tea',available_qty:10,shipment_ids:['secret']}],w)[0];assert.ok(!('shipment_ids' in p));
 assert.throws(()=>checkedProfile({recipient_name:'Shop',recipient_phone:'09123',address:'Shop',notes:'',maps_url:'',latitude:91,longitude:96}));
});


test('deadline timing automatically changes pools, flags overdue and stops completed countdowns',async()=>{
 const {releaseTiming}=await import('../../src/shared/api/orders');
 const due=Date.parse('2030-01-08T12:00:00Z');
 const order={status:'accepted',payload:{delivery_due_at:new Date(due).toISOString()},shipment_status:'ready'} as import('../../src/shared/api/orders').SmeOrder;
 assert.equal(releaseTiming(order,due-73*3600000).pool,'Can wait');
 assert.equal(releaseTiming(order,due-72*3600000).pool,'Urgent');
 assert.match(releaseTiming(order,due-3600000).label,/1h 0m remaining/);
 assert.match(releaseTiming(order,due+60000).label,/Overdue/);
 assert.equal(releaseTiming({...order,shipment_status:'delivered'},due+60000).active,false);
 assert.equal(releaseTiming({...order,payload:{...order.payload,delivery_due_at:undefined}},due).pool,'No deadline');
});

test('deadline demo requests reserve and create exactly one shipment without staff approval',async()=>{
 const {createApiClient}=await import('../../src/shared/api/client');
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const merchant=createApiClient(createSmeTrackingMockTransport(storage)),identity=await merchant.getMe();
 const {warehouse_id:w,sme_id:s}=identity.memberships[0],product=(await merchant.getCatalogPage(w,{smeId:s!})).items[0];
 const body={warehouse_id:w,sme_id:s!,order_kind:'sme_self_delivery' as const,customer_name:'Shop',customer_phone:'09123',address:'SME shop',latitude:16,longitude:96,notes:'',maps_url:'',lines:[{product_id:product.id,expected_qty:3}],delivery_due_at:new Date(Date.now()+86400000).toISOString()};
 for(const delivery_due_at of ['bad',new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+31*86400000).toISOString()])await assert.rejects(merchant.submitOrder({...body,delivery_due_at},crypto.randomUUID()));
 const key=crypto.randomUUID(),order=await merchant.submitOrder(body,key);assert.equal(order.status,'accepted');assert.ok(order.shipment_id);
 assert.equal((await merchant.submitOrder(body,key)).shipment_id,order.shipment_id);
 assert.equal((await merchant.getCatalogPage(w,{smeId:s!})).items.find(p=>p.id===product.id)!.available_qty,product.available_qty-3);
 const staff=createApiClient(createWarehouseMockTransport(storage));assert.equal((await staff.getShipment(order.shipment_id!,undefined,w)).status,'ready');
});


test('SME business identity is tenant scoped and uses its business name',async()=>{
 const {createApiClient}=await import('../../src/shared/api/client');const client=createApiClient(createSmeTrackingMockTransport());
 const membership=(await client.getMe()).memberships[0];const business=await client.getSMEBusiness(membership.warehouse_id,membership.sme_id!);
 assert.equal(business.name,'Lotus Living');assert.equal(business.id,membership.sme_id);
 await assert.rejects(client.getSMEBusiness(membership.warehouse_id,'10000000-0000-4000-8000-000000000002'));
});
