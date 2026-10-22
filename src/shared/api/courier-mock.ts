import fixture from '../../../contracts/fixtures/warehouse/initial.json';
import {ApiError,type Transport,type ApiRequest,type Schemas} from './transport';
import type {CourierDelivery,RiderAssignment} from './courier';
const uid=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key='parcelcare.courier.demo.v2',actor=uid(99),warehouse=fixture.body.directory.warehouse_id;
type State={deliveries:CourierDelivery[];cases:Array<{id:string;shipment_id:string;type:string;note:string}>;replay:Record<string,{fingerprint:string;result:unknown}>};
export function createCourierMockTransport(storage:Pick<Storage,'getItem'|'setItem'>):Transport{
 const seed=():State=>({deliveries:[0,1,2].map(i=>{
  const shipment=structuredClone(fixture.body.shipments[2]) as Schemas['ShipmentDetail'];
  shipment.id=i===2?fixture.body.shipments[2].id:uid(i+1);shipment.reference=i===2?fixture.body.shipments[2].reference:`PC-COURIER-000${i+1}`;shipment.status=(['assigned','picked_up','in_transit'] as const)[i];shipment.version=1;
  shipment.evidence=[{id:uid(40+i),label:'Demo delivery evidence reference',verified:true}];shipment.evidence_ids=[uid(40+i)];shipment.allowed_events=[];
  shipment.events=[{id:uid(50+i),type:'packed',notes:'Demo fixture: warehouse packing verified.',verified_at:'2026-10-21T08:00:00Z',recorded_at:'2026-10-21T08:00:00Z',evidence_ids:[]}];
  if(i===2)shipment.events.push({id:uid(60+i),type:'dispatched',notes:'Demo fixture: warehouse dispatch verified.',verified_at:'2026-10-21T09:00:00Z',recorded_at:'2026-10-21T09:00:00Z',evidence_ids:[]});
  return{shipment,assignments:[{id:uid(10+i),shipment_id:shipment.id,accepted_at:i?'2026-10-21T08:00:00Z':null,picked_up_at:i?'2026-10-21T08:30:00Z':null,cancelled_at:null,completed_at:null}],proofs:[]};
 }),cases:[],replay:{}});
 let state:State;
 try{const saved=storage.getItem(key);state=saved?JSON.parse(saved):seed()}catch{throw new ApiError(0,'DEMO_STORAGE_UNAVAILABLE','Courier demo storage is unavailable.');}
 const fail=(status:number,code:string,message:string):never=>{throw new ApiError(status,code,message)};
 return async<T>(request:ApiRequest):Promise<T>=>{
  request.signal?.throwIfAborted();const path=request.path;
  if(request.method==='GET'){
   if(path==='/api/me')return {actor_id:actor,memberships:[{warehouse_id:warehouse,role:'rider',sme_id:null}]} as T;
   if(path==='/api/rider/assignments')return state.deliveries.filter(d=>!['delivered','cancelled'].includes(d.shipment.status)).map(d=>{const a=d.assignments.find(a=>!a.cancelled_at&&!a.completed_at)!;return{id:a.id,shipment_id:d.shipment.id,reference:d.shipment.reference,status:d.shipment.status,version:d.shipment.version,assigned_at:'2026-10-21T07:00:00Z',accepted_at:a.accepted_at,picked_up_at:a.picked_up_at} satisfies RiderAssignment}) as T;
   const d=state.deliveries.find(d=>path===`/api/deliveries/${d.shipment.id}`);if(d)return structuredClone(d) as T;
   return fail(403,'FORBIDDEN','This delivery is not assigned to you.');
  }
  if(!request.idempotencyKey)return fail(400,'MISSING_KEY','A saved request key is required.');
  const replayKey=path+request.idempotencyKey,fingerprint=JSON.stringify(request.body),old=state.replay[replayKey];
  if(old){if(old.fingerprint!==fingerprint)return fail(409,'IDEMPOTENCY_CONFLICT','Request key already used.');return structuredClone(old.result) as T;}
  const next=structuredClone(state),body=request.body as Record<string,unknown>,note=typeof body?.note==='string'?body.note.trim():'';
  if(!note||note.length>2000)return fail(422,'INVALID_NOTE','Write a note within 2000 characters.');
  let result:unknown;
  if(/^\/api\/deliveries\/[^/]+\/report$/.test(path)){
   const d=next.deliveries.find(d=>d.shipment.id===path.split('/')[3]);if(!d)return fail(403,'FORBIDDEN','This delivery is not assigned to you.');
   if(!d.assignments.some(a=>a.accepted_at&&!a.cancelled_at&&!a.completed_at)||['delivered','cancelled'].includes(d.shipment.status))return fail(422,'REPORT_NOT_ALLOWED','Accept an active delivery before reporting.');
   if(!['recipient_unavailable','delivery_failed','transit_damage','courier_delay'].includes(String(body.type)))return fail(422,'INVALID_TYPE','Choose a delivery issue.');
   let c=next.cases.find(c=>c.shipment_id===d.shipment.id&&c.type===body.type);
   if(!c){c={id:crypto.randomUUID(),shipment_id:d.shipment.id,type:String(body.type),note};next.cases.push(c);}result={...c,stage:'outbound'};
  }else{
   const d=next.deliveries.find(d=>path.startsWith(`/api/deliveries/${d.shipment.id}/`));if(!d)return fail(403,'FORBIDDEN','This delivery is not assigned to you.');
   if(body.expected_version!==d.shipment.version)return fail(409,'STALE_VERSION','Delivery changed. Refresh before submitting.');
   const a=d.assignments.find(a=>!a.cancelled_at&&!a.completed_at)!;const kind=path.split('/').at(-1),now=new Date().toISOString();
   if(kind==='accept'){if(a.accepted_at||d.shipment.status!=='assigned')return fail(422,'INVALID_ACTION','Assignment cannot be accepted now.');a.accepted_at=now;}
   else if(kind==='pickup'){if(!a.accepted_at||a.picked_up_at||d.shipment.status!=='assigned'||!d.shipment.events.some(e=>e.type==='packed'))return fail(422,'INVALID_ACTION','Accept the assignment and wait for verified packing.');a.picked_up_at=now;d.shipment.status='picked_up';}
   else if(kind==='proof'){
    if(d.shipment.status!=='in_transit'||!a.picked_up_at||!d.shipment.evidence.some(e=>e.id===body.evidence_id&&e.verified)||typeof body.received_by!=='string'||!body.received_by.trim()||body.received_by.length>200)return fail(422,'INCOMPLETE_PROOF','Recipient and recorded evidence are required.');
    if(d.proofs.some(p=>!p.confirmed_at))return fail(409,'PROOF_PENDING','Proof is already waiting for confirmation.');
    d.proofs.push({id:crypto.randomUUID(),shipment_id:d.shipment.id,received_by:body.received_by.trim(),evidence_id:String(body.evidence_id),confirmed_at:null});
   }else return fail(403,'FORBIDDEN','Only warehouse staff or the SME can confirm delivery.');
   d.shipment.version++;d.shipment.events.push({id:crypto.randomUUID(),type:`rider_${kind}`,notes:note,verified_at:now,recorded_at:now,evidence_ids:kind==='proof'?[String(body.evidence_id)]:[]});result=d;
  }
  next.replay[replayKey]={fingerprint,result:structuredClone(result)};
  try{storage.setItem(key,JSON.stringify(next))}catch{return fail(0,'DEMO_STORAGE_UNAVAILABLE','Unable to save the courier demo. Retry the same request.');}
  state=next;return structuredClone(result) as T;
 };
}
