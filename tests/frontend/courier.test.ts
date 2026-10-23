import type {ApiRequest} from '../../src/shared/api/transport';
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
 const storage=store(),api=createApiClient(createCourierMockTransport(storage)),id=(await api.listRiderAssignments())[1].shipment_id,body={kind:'report' as const,type:'recipient_unavailable' as const,note:'Recipient unavailable',evidence_ids:[]};
 const a=await api.recordCourierAction(id,body,{idempotencyKey:key()}),b=await api.recordCourierAction(id,body,{idempotencyKey:key()});assert.deepEqual(a,b);
 const failing=createApiClient(createCourierMockTransport({getItem:storage.getItem,setItem:()=>{throw Error('Full')}}));
 const unaccepted=(await failing.listRiderAssignments())[0].shipment_id;
 await assert.rejects(failing.recordCourierAction(unaccepted,{kind:'accept',expected_version:1,note:'Accept'},{idempotencyKey:key()}));assert.equal((await failing.getCourierDelivery(unaccepted)).assignments[0].accepted_at,null);
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

test('SME reports are scoped, survive reload and replay without duplicate cases or delivery changes',async()=>{
 const storage=store(),api=createApiClient(createSmeTrackingMockTransport(storage)),who=await api.getMe();
 const sme=who.memberships[0].sme_id!,overview=await api.getSMEOverview(sme),shipment=overview.shipments[0];
 const body={shipment_id:shipment.id,stage:'outbound' as const,type:'delivery_failed' as const,note:'Unable to deliver to customer',evidence_ids:[]};
 const operation=key(),reported=await api.reportCase(body,operation);
 assert.equal(reported.sme_id,sme);
 const reload=createApiClient(createSmeTrackingMockTransport(storage));
 assert.deepEqual(await reload.reportCase(body,operation),reported);
 assert.equal((await reload.getSMEOverview(sme)).cases.length,1);
 assert.equal((await reload.getTrackingShipment(shipment.id)).status,shipment.status);
 assert.equal((await reload.getCase(reported.id)).id,reported.id);
 await assert.rejects(reload.reportCase({...body,note:'Different'},operation),(e:ApiError)=>e.status===409);
 await assert.rejects(reload.reportCase({...body,shipment_id:'10000000-0000-4000-8000-000000000020'},key()),(e:ApiError)=>e.status===403);
 await assert.rejects(reload.reportCase({...body,evidence_ids:[key()]},key()),(e:ApiError)=>e.status===422);
 await assert.rejects(reload.reportCase({...body,note:'   '},key()),(e:ApiError)=>e.status===422);
 const failed=createApiClient(createSmeTrackingMockTransport({getItem:storage.getItem,setItem:()=>{throw Error('full');}}));
 await assert.rejects(failed.reportCase({...body,type:'recipient_unavailable'},key()));
 assert.equal((await failed.getSMEOverview(sme)).cases.length,1);
});

test('SME demo release requests reserve SME-owned stock, replay once and release stock on cancellation',async()=>{
 const storage=store(),api=createApiClient(createSmeTrackingMockTransport(storage)),membership=(await api.getMe()).memberships[0];
 const sme=membership.sme_id!,warehouse=membership.warehouse_id,catalog=await api.getWarehouseCatalog(warehouse,undefined,sme),item=catalog.find(i=>i.available_qty>0)!;
 const body={warehouse_id:warehouse,sme_id:sme,order_kind:'sme_self_delivery' as const,customer_name:'Demo SME shop',customer_phone:'0912345678',address:'Yangon',notes:'Call on arrival',maps_url:'',latitude:16.8,longitude:96.15,lines:[{product_id:item.id,expected_qty:1}]};
 const operation=key(),order=await api.submitOrder(body,operation);
 const reload=createApiClient(createSmeTrackingMockTransport(storage));
 assert.equal((await reload.submitOrder(body,operation)).id,order.id);
 assert.equal((await reload.listOrders(warehouse,sme)).length,1);
 assert.equal((await reload.getWarehouseCatalog(warehouse,undefined,sme)).find(i=>i.id===item.id)!.available_qty,item.available_qty-1);
 await assert.rejects(reload.submitOrder({...body,sme_id:key()},key()),(e:ApiError)=>e.status===403);
 await reload.actOnOrder(order.id,warehouse,{action:'cancel'},key());
 assert.equal((await reload.getWarehouseCatalog(warehouse,undefined,sme)).find(i=>i.id===item.id)!.available_qty,item.available_qty);
});

test('both rider report reasons require accepted own assignments and preserve shipment status',async()=>{
 const api=createApiClient(createCourierMockTransport(store())),assignments=await api.listRiderAssignments();
 for(const type of ['delivery_failed','recipient_unavailable'] as const){
  const body={kind:'report' as const,type,note:'Delivery issue confirmed',evidence_ids:[]};
  await assert.rejects(api.recordCourierAction(assignments[0].shipment_id,body,{idempotencyKey:key()}),(e:ApiError)=>e.status===422);
  await assert.rejects(api.recordCourierAction(key(),body,{idempotencyKey:key()}),(e:ApiError)=>e.status===403);
  const id=assignments[1].shipment_id,before=await api.getCourierDelivery(id),operation=key();
  const result=await api.recordCourierAction(id,body,{idempotencyKey:operation});
  assert.equal(result.kind,'report');assert.deepEqual(await api.recordCourierAction(id,body,{idempotencyKey:operation}),result);
  assert.equal((await api.getCourierDelivery(id)).shipment.status,before.shipment.status);
 }
});
test('SME preview exposes only its own shipments and never supplies live GPS',async()=>{
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
import {demoRouteSnapshot,demoShipmentId,advanceDemoRoute,confirmDemoArrival,confirmDemoReceipt,resetDemoRoute} from '../../src/shared/api/demo-route';
import {checkedSharedRoute} from '../../src/shared/api/route';
test('demo moves only one road segment per click and ignores repeated clicks while moving',()=>{
 const storage=store(),start=100000;advanceDemoRoute(storage,start);advanceDemoRoute(storage,start+100);
 assert.equal(demoRouteSnapshot(storage,start+100).step,1);
 assert.equal(demoRouteSnapshot(storage,start+900).moving,false);
 assert.equal(demoRouteSnapshot(storage,start+90000).step,1);
 assert.ok(demoRouteSnapshot(storage,start).coordinates.length>100);
 confirmDemoArrival(storage,start+90000);confirmDemoReceipt(storage);
 assert.equal(demoRouteSnapshot(storage,start+90000).stage,'transit');
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

test('rider reports use the narrow endpoint and reject a wrong shipment acknowledgement',async()=>{
 const id='10000000-0000-4000-8000-000000000022',caseId='10000000-0000-4000-8000-000000000099';
 const body={kind:'report' as const,type:'courier_delay' as const,note:'Vehicle delayed',evidence_ids:[]};let wrong=false;
 const api=createApiClient(async<T>(request:ApiRequest)=>{assert.equal(request.path,`/api/deliveries/${id}/report`);assert.equal(request.method,'POST');assert.ok(request.idempotencyKey);assert.equal((request.body as Record<string,unknown>).stage,undefined);return {id:caseId,shipment_id:wrong?caseId:id,stage:'outbound',type:'courier_delay'} as T;});
 assert.deepEqual(await api.recordCourierAction(id,body,{idempotencyKey:key()}),{kind:'report',id:caseId});wrong=true;
 await assert.rejects(api.recordCourierAction(id,body,{idempotencyKey:key()}),(e:ApiError)=>e.status===502);
});

test('arrival is yellow/pending until explicit SME receipt and reset starts a fresh demo',()=>{
 const storage=store(),start=100000;
 for(let i=0;i<10;i++)advanceDemoRoute(storage,start+i*1000);
 const arrived=demoRouteSnapshot(storage,start+11000);assert.equal(arrived.completed,true);assert.equal(arrived.canArrive,true);assert.deepEqual(arrived.position,arrived.destination);
 confirmDemoReceipt(storage);assert.equal(demoRouteSnapshot(storage,start+11000).stage,'transit');
 confirmDemoArrival(storage,start+11000);assert.equal(demoRouteSnapshot(storage,start+11000).stage,'arrived');
 confirmDemoReceipt(storage);assert.equal(demoRouteSnapshot(storage,start+11000).stage,'delivered');
 advanceDemoRoute(storage,start+12000);assert.equal(demoRouteSnapshot(storage,start+12000).step,10);
 resetDemoRoute(storage);assert.equal(demoRouteSnapshot(storage,start+12000).step,0);
});

import {checkedSettings,checkedArrival} from '../../src/shared/api/tracking-control';
test('tracking control responses fail closed on wrong shipment, invalid coordinates or non-boolean switches',()=>{
 const id=crypto.randomUUID();assert.equal(checkedSettings({live_gps_enabled:false,demo_simulation_enabled:true}).live_gps_enabled,false);
 assert.throws(()=>checkedSettings({live_gps_enabled:'true',demo_simulation_enabled:true}));
 const arrival={shipment_id:id,arrived_at:new Date().toISOString(),latitude:16.8,longitude:96.1,delivered:false};
 assert.equal(checkedArrival(arrival,id)?.delivered,false);assert.equal(checkedArrival(null,id),null);
 for(const patch of [{shipment_id:crypto.randomUUID()},{latitude:100},{longitude:Infinity},{arrived_at:'bad'},{delivered:'true'}])assert.throws(()=>checkedArrival({...arrival,...patch},id));
});

import {createDemoHub,packetSnapshot,checkedDemoPacket} from '../../src/shared/api/demo-sync';
test('independent browser snapshots share authoritative demo progress and SME success',()=>{
 const hub=createDemoHub();let now=100000;
 const command=(action:any,settings?:any)=>hub.command({action,key:crypto.randomUUID(),revision:hub.read(now).revision,settings},now);
 const initial=hub.read(now),request={action:'advance' as const,key:crypto.randomUUID(),revision:initial.revision};hub.command(request,now);hub.command(request,now);
 assert.equal(hub.read(now).state.step,1);assert.equal(packetSnapshot(hub.read(now+1000),now+1000).step,1);
 assert.throws(()=>hub.command({...request,key:crypto.randomUUID()},now),/STALE_DEMO/);
 assert.throws(()=>command('arrive'),/ACTION_NOT_READY/);
 for(let i=1;i<10;i++){now+=1000;command('advance');}now+=1000;command('arrive');
 const warehouse=checkedDemoPacket(JSON.parse(JSON.stringify(hub.read(now))));assert.equal(warehouse.state.stage,'arrived');
 command('receive');assert.equal(hub.read(now).state.stage,'delivered');
 command('settings',{live_gps_enabled:true,demo_simulation_enabled:false});assert.throws(()=>command('reset'),/DEMO_DISABLED/);
 command('settings',{live_gps_enabled:false,demo_simulation_enabled:true});command('reset');assert.equal(hub.read(now).state.step,0);
 assert.throws(()=>checkedDemoPacket({...hub.read(now),state:{step:99}}));
});

import {previewRole,previewState} from '../../src/shared/api/delivery-preview';
test('delivery preview defaults to SME and keeps all role actions separate',()=>{
 assert.equal(previewRole(undefined),'sme');assert.equal(previewRole('owner'),'sme');assert.equal(previewRole('courier'),'courier');
 const state={stage:'transit' as const,ready:true,busy:false,moving:false,step:1,canArrive:false,enabled:true};
 assert.equal(previewState({role:'courier',...state}).canMove,true);
 for(const role of ['warehouse','sme'] as const){const p=previewState({role,...state});assert.equal(p.canMove,false);assert.equal(p.canArrive,false);assert.equal(p.canReceive,false);}
 const arrived={...state,stage:'arrived' as const,canArrive:true};assert.equal(previewState({role:'sme',...arrived}).canReceive,true);assert.equal(previewState({role:'warehouse',...arrived}).canReceive,false);
 for(const patch of [{ready:false},{busy:true},{enabled:false}])assert.equal(previewState({role:'sme',...arrived,...patch}).canReceive,false);
 assert.equal(previewState({role:'courier',...state,canArrive:true}).canArrive,true);
 assert.equal(previewState({role:'courier',...state,moving:true}).canMove,false);
 assert.equal(previewState({role:'sme',...arrived,stage:'delivered'}).canReceive,false);
});

test('shared demo restart has a new epoch even when its revision resets',()=>{
 const a=createDemoHub(),b=createDemoHub();assert.notEqual(a.read().epoch,b.read().epoch);assert.equal(b.read().revision,0);assert.ok(checkedDemoPacket(b.read()));
});


test('in-house transport progress requires physical steps and SME receipt, not proof alone',async()=>{
 const {inHouseFlow}=await import('../../src/shared/api/in-house-flow');
 const shipment={status:'ready',events:[]} as Pick<import('../../src/shared/api/transport').Schemas['ShipmentDetail'],'status'|'events'>;
 assert.equal(inHouseFlow(shipment,[],[]).next!.id,'prepare');
 shipment.events=['picked','packed'].map(type=>({type})) as typeof shipment.events;
 assert.equal(inHouseFlow(shipment,[],[]).next!.id,'assign');
 const assignments=[{accepted_at:null as string|null,picked_up_at:null as string|null}];
 assert.equal(inHouseFlow(shipment,assignments,[]).next!.id,'accept');
 assignments[0].accepted_at=new Date().toISOString();assert.equal(inHouseFlow(shipment,assignments,[]).next!.id,'pickup');
 assignments[0].picked_up_at=new Date().toISOString();assert.equal(inHouseFlow(shipment,assignments,[]).next!.id,'dispatch');
 shipment.events.push({type:'dispatched'} as typeof shipment.events[number]);shipment.status='in_transit';
 assert.equal(inHouseFlow(shipment,assignments,[]).next!.id,'proof');
 assert.equal(inHouseFlow(shipment,assignments,[{confirmed_at:null}]).next!.id,'receipt');
 shipment.status='delivered';assert.equal(inHouseFlow(shipment,[],[{confirmed_at:new Date().toISOString()}]).next,null);
 shipment.status='cancelled';assert.equal(inHouseFlow(shipment,assignments,[]).next,null);
});
