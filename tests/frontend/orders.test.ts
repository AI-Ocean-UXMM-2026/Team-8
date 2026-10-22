import test from 'node:test';
import assert from 'node:assert/strict';
import {googleMapsUrl,mapsCoordinates} from '../../src/shared/api/orders';
import {generateDemoInbound,demoInboundShipments,createWarehouseMockTransport} from '../../src/shared/api/warehouse-mock';
import {createSmeTrackingMockTransport} from '../../src/shared/api/sme-tracking-mock';

test('SME demo inbound orders persist into warehouse receiving without adding stock early',async()=>{
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
