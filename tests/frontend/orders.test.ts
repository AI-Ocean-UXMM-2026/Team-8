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
 assert.equal(catalog.length,2);assert.ok(catalog.every(p=>!('sme_id' in p)&&!('shipment_ids' in p)));
 await assert.rejects(merchant.getCatalogPage(warehouse,{smeId:'10000000-0000-4000-8000-000000000002'}));
 await assert.rejects(merchant.submitOrder({warehouse_id:warehouse,sme_id:sme!,order_kind:'sme_self_delivery',customer_name:'Shop',customer_phone:'09123',address:'SME shop',latitude:16,longitude:96,notes:'',maps_url:'',lines:[{product_id:'90000000-0000-4000-8000-000000000003',expected_qty:1}]},crypto.randomUUID()));
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
