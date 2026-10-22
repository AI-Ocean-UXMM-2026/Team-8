import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient,ApiError} from '../../src/shared/api';
import {createCourierMockTransport} from '../../src/shared/api/courier-mock';
import {checkedAssignments,checkedDelivery} from '../../src/shared/api/courier';
const store=()=>{const saved=new Map<string,string>();return{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{saved.set(k,v)}}};
const key=()=>crypto.randomUUID();
test('courier gets own in-house assignments and accept/pickup cannot complete delivery',async()=>{
 const api=createApiClient(createCourierMockTransport(store())),assignments=await api.listRiderAssignments();assert.equal(assignments.length,3);assert.equal((await api.getMe()).memberships[0].role,'rider');
 const id=assignments[0].shipment_id,initial=await api.getCourierDelivery(id);assert.equal(initial.shipment.delivery_mode,'in_house');
 await assert.rejects(api.recordCourierAction(id,{kind:'pickup',expected_version:1,note:'Pickup'},{idempotencyKey:key()}));
 const accepted=await api.recordCourierAction(id,{kind:'accept',expected_version:1,note:'Accept assigned delivery'},{idempotencyKey:key()});assert.equal(accepted.kind,'delivery');
 const picked=await api.recordCourierAction(id,{kind:'pickup',expected_version:2,note:'Physical pickup verified'},{idempotencyKey:key()});assert.equal(picked.kind,'delivery');if(picked.kind==='delivery')assert.equal(picked.detail.shipment.status,'picked_up');
 await assert.rejects(api.getCourierDelivery(key()),(e:ApiError)=>e.status===403);
});
test('proof needs recipient and recorded evidence; replay/reload preserves one pending proof without marking delivered',async()=>{
 const storage=store(),api=createApiClient(createCourierMockTransport(storage)),id=(await api.listRiderAssignments())[2].shipment_id,detail=await api.getCourierDelivery(id);
 const body={kind:'proof' as const,expected_version:1,note:'Delivery evidence recorded',received_by:'Test recipient',evidence_id:detail.shipment.evidence[0].id};
 await assert.rejects(api.recordCourierAction(id,{...body,received_by:''},{idempotencyKey:key()}));
 const operation=key();await api.recordCourierAction(id,body,{idempotencyKey:operation});
 const reloaded=createApiClient(createCourierMockTransport(storage));await reloaded.recordCourierAction(id,body,{idempotencyKey:operation});
 const updated=await reloaded.getCourierDelivery(id);assert.equal(updated.shipment.status,'in_transit');assert.equal(updated.proofs.length,1);assert.equal(updated.proofs[0].confirmed_at,null);
 await assert.rejects(reloaded.recordCourierAction(id,{...body,note:'Different payload'},{idempotencyKey:operation}),(e:ApiError)=>e.status===409);
});
test('repeat issue reports match a case; storage failures do not mutate assignment state',async()=>{
 const storage=store(),api=createApiClient(createCourierMockTransport(storage)),id=(await api.listRiderAssignments())[0].shipment_id,body={kind:'report' as const,type:'recipient_unavailable' as const,note:'Recipient unavailable',evidence_ids:[]};
 const a=await api.recordCourierAction(id,body,{idempotencyKey:key()}),b=await api.recordCourierAction(id,body,{idempotencyKey:key()});assert.deepEqual(a,b);
 const failing=createApiClient(createCourierMockTransport({getItem:storage.getItem,setItem:()=>{throw Error('Full')}}));
 await assert.rejects(failing.recordCourierAction(id,{kind:'accept',expected_version:1,note:'Accept'},{idempotencyKey:key()}));assert.equal((await failing.getCourierDelivery(id)).assignments[0].accepted_at,null);
});
test('courier response validation rejects mismatched ids, malformed timestamps and missing assignment projections',async()=>{
 const api=createApiClient(createCourierMockTransport(store())),assignments=await api.listRiderAssignments(),id=assignments[0].shipment_id,d=await api.getCourierDelivery(id);
 assert.throws(()=>checkedAssignments([{...assignments[0],assigned_at:'not-a-date'}]));assert.throws(()=>checkedDelivery(d,key()));assert.throws(()=>checkedDelivery({...d,assignments:null},id));assert.throws(()=>checkedDelivery(d,id,d.shipment.version));
});

// Viewer guards supplement the database's tenant-scoped tracking policies.
import {trackingAccess,checkedPosition} from '../../src/shared/api/tracking';
test('tracking viewer requires warehouse membership or exact SME ownership',()=>{
 const shipment={warehouse_id:'warehouse-a',sme_id:'sme-a'};
 assert.equal(trackingAccess([{warehouse_id:'warehouse-a',role:'staff'}],shipment),true);
 assert.equal(trackingAccess([{warehouse_id:'warehouse-b',role:'staff'}],shipment),false);
 assert.equal(trackingAccess([{warehouse_id:'warehouse-a',role:'sme',sme_id:'sme-a'}],shipment),true);
 assert.equal(trackingAccess([{warehouse_id:'warehouse-a',role:'sme',sme_id:'sme-b'}],shipment),false);
 assert.equal(trackingAccess([{warehouse_id:'warehouse-a',role:'rider'}],shipment),false);
});
test('GPS decoder rejects invalid coordinates and cross-session responses; unavailable clears coordinates',()=>{
 const id=crypto.randomUUID(),p={session_id:id,status:'live',latitude:16.8,longitude:96.1,accuracy_m:12,recorded_at:new Date().toISOString()};
 assert.equal(checkedPosition(p,id).latitude,16.8);
 for(const patch of [{latitude:91},{longitude:Infinity},{accuracy_m:-1},{recorded_at:'bad'},{session_id:crypto.randomUUID()}])assert.throws(()=>checkedPosition({...p,...patch},id));
 assert.equal(checkedPosition({...p,status:'unavailable'},id).latitude,null);
});
test('SME tracking reads use tenant-authorized delivery API, never staff-only operations',async()=>{
 const id=crypto.randomUUID(),warehouse=crypto.randomUUID(),sme=crypto.randomUUID(),session=crypto.randomUUID();
 const paths:string[]=[];
 const api=createApiClient(async<T>(request:import('../../src/shared/api/transport').ApiRequest)=>{paths.push(request.path);return {shipment:{id,warehouse_id:warehouse,sme_id:sme,reference:'PC-TEST',direction:'outbound',events:[]},session_id:session} as T;});
 assert.equal((await api.getTrackingShipment(id)).sme_id,sme);
 assert.equal(await api.getTrackingSession(id),session);
 assert.deepEqual(paths,[`/api/deliveries/${id}`,`/api/deliveries/${id}`]);
 const denied=createApiClient(async()=>{throw new ApiError(403,'FORBIDDEN','Not your shipment');});
 await assert.rejects(denied.getTrackingShipment(id),(e:ApiError)=>e.status===403);
});
import {checkedRoute} from '../../src/shared/api/route';
test('routing decoder preserves ORS longitude/latitude and rejects bad or misleading routes',()=>{
 const route={provider:'openrouteservice',profile:'car',coordinates:[[96.1,16.8],[96.2,16.9]],distance_m:1200,duration_ms:180000,traffic_aware:false,destination_source:'courier_selected'};
 assert.equal(checkedRoute(route).coordinates[0][0],96.1);
 for(const patch of [{coordinates:[[181,0],[96,16]]},{coordinates:[]},{duration_ms:NaN},{traffic_aware:true},{provider:'unknown'}])assert.throws(()=>checkedRoute({...route,...patch}));
});
import {createSmeTrackingMockTransport} from '../../src/shared/api/sme-tracking-mock';
test('SME GPS preview exposes only its own shipments and never supplies live GPS or writes',async()=>{
 const transport=createSmeTrackingMockTransport(),api=createApiClient(transport),identity=await api.getMe(),membership=identity.memberships[0];
 assert.equal(membership.role,'sme');
 const overview=await api.getSMEOverview(membership.sme_id!);
 assert.ok(overview.shipments.length>0);assert.ok(overview.shipments.every(s=>s.sme_id===membership.sme_id&&s.warehouse_id===membership.warehouse_id));
 assert.ok(overview.shipments.some(s=>s.direction==='outbound'&&s.delivery_mode==='in_house'));
 const selected=overview.shipments[0];assert.equal((await api.getTrackingShipment(selected.id)).sme_id,membership.sme_id);
 assert.equal(await api.getTrackingSession(selected.id),null);
 await assert.rejects(api.getSMEOverview(crypto.randomUUID()),(e:ApiError)=>e.status===403);
 await assert.rejects(api.getTrackingShipment('10000000-0000-4000-8000-000000000020'),(e:ApiError)=>e.status===403);
 await assert.rejects(api.startTracking(crypto.randomUUID()),(e:ApiError)=>e.status===403);
});
import {demoRouteSnapshot,setDemoRouteSharing,demoShipmentId} from '../../src/shared/api/demo-route';
import {checkedSharedRoute} from '../../src/shared/api/route';
test('demo route movement is shared across role views, stops at its last example point, and is never real GPS',()=>{
 const storage=store(),start=100000;
 assert.equal(demoRouteSnapshot(storage,start).sharing,false);
 setDemoRouteSharing(storage,true,start);
 assert.equal(demoRouteSnapshot(storage,start+8000).index,2);
 assert.deepEqual(demoRouteSnapshot(storage,start+8000).coordinates,demoRouteSnapshot(storage,start).coordinates);
 setDemoRouteSharing(storage,false,start+8000);
 assert.equal(demoRouteSnapshot(storage,start+90000).index,2);assert.equal(demoRouteSnapshot(storage,start+90000).sharing,false);
 assert.equal(demoRouteSnapshot(storage,start+90000).position.length,2);
});
test('shared route decoder binds saved geometry and destination to the requested shipment',()=>{
 const id=crypto.randomUUID(),route={provider:'openrouteservice',profile:'car',coordinates:[[96.1,16.8],[96.2,16.9]],distance_m:1200,duration_ms:180000,traffic_aware:false,destination_source:'courier_selected',shipment_id:id,assignment_id:crypto.randomUUID(),saved_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),origin:[96.1,16.8],destination:[96.2,16.9]};
 assert.equal(checkedSharedRoute(route,id)?.shipment_id,id);assert.equal(checkedSharedRoute(null,id),null);
 for(const patch of [{shipment_id:crypto.randomUUID()},{destination:[200,16]},{origin:null},{expires_at:'bad'},{assignment_id:'invalid'}])assert.throws(()=>checkedSharedRoute({...route,...patch},id));
});
test('courier shared demo shipment uses the same reference and id as warehouse and SME',async()=>{
 const api=createApiClient(createCourierMockTransport(store()));
 assert.ok((await api.listRiderAssignments()).some(a=>a.shipment_id===demoShipmentId&&a.reference==='PC-OUT-0003'));
});


test('completed demo route stops sharing and can replay without clearing browser storage',()=>{
 const storage=store(),start=100000;
 setDemoRouteSharing(storage,true,start);
 const completed=demoRouteSnapshot(storage,start+30000);
 assert.equal(completed.completed,true);assert.equal(completed.sharing,false);
 assert.deepEqual(completed.position,completed.destination);
 setDemoRouteSharing(storage,true,start+31000);
 const restarted=demoRouteSnapshot(storage,start+31000);
 assert.equal(restarted.completed,false);assert.equal(restarted.sharing,true);assert.equal(restarted.index,0);
 assert.equal(demoRouteSnapshot(storage,start+39000).index,2);
});
