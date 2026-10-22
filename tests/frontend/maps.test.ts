import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMapController,type Leaflet,type MapPoint} from '../../src/shared/api/map-controller';
import {startWithFirstPosition,positionPayload} from '../../src/shared/api/location-start';
function fake(){
 const calls:string[]=[],points:MapPoint[]=[],events:Record<string,(e?:any)=>void>={};
 const layer=()=>({addTo(){return this},remove(){calls.push('layer-remove')},setLatLng(p:MapPoint){points.push(p)},on(event:string,fn:()=>void){events['tile-'+event]=fn}});
 const map={setView(){return this},fitBounds(){calls.push('fit')},invalidateSize(){calls.push('resize')},remove(){calls.push('destroy')},on(event:string,fn:(e:any)=>void){events[event]=fn}};
 const l:Leaflet={map(){calls.push('create');return map},tileLayer(){return layer()},circleMarker(p){points.push(p);calls.push('marker');return layer()},polyline(){calls.push('line');return layer()}};
 return {l,calls,points,events};
}
test('moving GPS updates existing markers without remounting map or resetting route bounds',()=>{
 const f=fake(),c=createMapController(f.l,{} as HTMLElement),route:MapPoint[]=[[16.8,96.1],[16.9,96.2]];
 c.update([16.8,96.1],[16.9,96.2],route);c.update([16.81,96.11],[16.9,96.2],route);
 assert.equal(f.calls.filter(v=>v==='create').length,1);assert.equal(f.calls.filter(v=>v==='marker').length,2);
 assert.equal(f.calls.filter(v=>v==='line').length,1);assert.equal(f.calls.filter(v=>v==='fit').length,1);
 assert.ok(f.points.some(p=>p[0]===16.81));
 c.update(null,null,[]);assert.equal(f.calls.filter(v=>v==='layer-remove').length,3);
});
test('removed maps ignore late resize and click callbacks; cleanup is idempotent',()=>{
 const f=fake(),dest:MapPoint[]=[],errors:boolean[]=[];const c=createMapController(f.l,{} as HTMLElement,{destination:p=>dest.push(p),tileError:e=>errors.push(e)});
 c.resize();f.events.click({latlng:{lat:16,lng:96}});f.events['tile-tileerror']();
 c.destroy();c.destroy();c.resize();c.update([17,96]);f.events.click({latlng:{lat:17,lng:96}});f.events['tile-tileload']();
 assert.equal(f.calls.filter(v=>v==='destroy').length,1);assert.equal(f.calls.filter(v=>v==='resize').length,1);
 assert.deepEqual(dest,[[16,96]]);assert.deepEqual(errors,[true]);
});
test('invalid map coordinates and routes never produce a marker or line',()=>{
 const f=fake(),c=createMapController(f.l,{} as HTMLElement);c.update([91,96],[16,181],[[16,96],[NaN,96]]);
 assert.equal(f.calls.includes('marker'),false);assert.equal(f.calls.includes('line'),false);
});
const first={coords:{latitude:16.8,longitude:96.1,accuracy:5},timestamp:Date.now()};
test('initial captured GPS fix is sent before watch startup can be reported successful',async()=>{
 const calls:string[]=[];
 const id=await startWithFirstPosition({position:first,active:()=>true,open:async()=>{calls.push('open');return 'session'},opened:()=>calls.push('save'),send:async(id,p)=>{calls.push('send');assert.equal(id,'session');assert.equal(p.latitude,16.8)},stop:async()=>{calls.push('stop')}});
 assert.equal(id,'session');assert.deepEqual(calls,['open','save','send']);
});
test('GPS start cancelled during server creation stops the new session without publishing',async()=>{
 let active=true;const calls:string[]=[];
 const result=await startWithFirstPosition({position:first,active:()=>active,open:async()=>{active=false;return 's'},opened:()=>{},send:async()=>{calls.push('send')},stop:async()=>{calls.push('stop')}});
 assert.equal(result,null);assert.deepEqual(calls,['stop']);
});
test('invalid GPS fix cannot create a session; failed first publish cannot claim success',async()=>{
 assert.throws(()=>positionPayload({...first,coords:{...first.coords,latitude:91}}));
 let opened=false;
 await assert.rejects(startWithFirstPosition({position:first,active:()=>true,open:async()=>{opened=true;return 's'},opened:()=>{},send:async()=>{throw Error('offline')},stop:async()=>{}}));
 assert.equal(opened,true);
});

import {checkedPosition,trackingAccess} from '../../src/shared/api/tracking';
import {checkedSharedRoute} from '../../src/shared/api/route';
test('future GPS, invalid ranges and session mismatch fail closed; unavailable clears coordinates',()=>{
 const id='10000000-0000-4000-8000-000000000073';
 const good={session_id:id,status:'live',latitude:16.8,longitude:96.1,accuracy_m:5,recorded_at:new Date().toISOString()};
 assert.equal(checkedPosition(good,id).latitude,16.8);
 for(const patch of [{session_id:crypto.randomUUID()},{latitude:91},{longitude:-181},{accuracy_m:-1},{recorded_at:new Date(Date.now()+120000).toISOString()}])assert.throws(()=>checkedPosition({...good,...patch},id));
 assert.equal(checkedPosition({...good,status:'unavailable'},id).latitude,null);
 assert.equal(trackingAccess([{warehouse_id:'w',sme_id:'s',role:'sme'}],{warehouse_id:'w',sme_id:'other'}),false);
 assert.equal(trackingAccess([{warehouse_id:'w',role:'staff'}],{warehouse_id:'other',sme_id:'s'}),false);
});
test('shared routes reject reversed expiry and cannot bind to a malformed shipment id',()=>{
 const id=crypto.randomUUID(),saved=new Date().toISOString(),route={provider:'openrouteservice',profile:'car',coordinates:[[96.1,16.8],[96.2,16.9]],distance_m:100,duration_ms:1000,traffic_aware:false,destination_source:'courier_selected',shipment_id:id,assignment_id:crypto.randomUUID(),saved_at:saved,expires_at:new Date(Date.now()+86400000).toISOString(),origin:[96.1,16.8],destination:[96.2,16.9]};
 assert.ok(checkedSharedRoute(route,id));assert.throws(()=>checkedSharedRoute({...route,expires_at:saved},id));
 assert.throws(()=>checkedSharedRoute({...route,shipment_id:'bad'},'bad'));
});
