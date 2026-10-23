import {createSharedStockDemo} from './shared-stock-demo';
import fixture from '../../../contracts/fixtures/warehouse/initial.json';
import {ApiError,type Transport,type ApiRequest,type Schemas,validateRequest} from './transport';
import {checkedOrder,type SmeOrder,type OrderInput} from './orders';
import {demoInboundShipments} from './warehouse-mock';

// Fictitious SME session data. Never used by authenticated live sessions.
type State={cases:Schemas['CaseDetail'][];orders:SmeOrder[];replay:Record<string,{fingerprint:string;result:unknown}>};
const storageKey='parcelcare.sme.demo.reports.v1';
export function createSmeTrackingMockTransport(storage?:Pick<Storage,'getItem'|'setItem'>):Transport{
 const data=structuredClone(fixture.body),warehouse=data.directory.warehouse_id,sme=data.directory.smes[1].id;
 const shared=createSharedStockDemo(warehouse,sme,storage);
 let state:State={cases:[],orders:[],replay:{}};
 try{const saved=storage?.getItem(storageKey);if(saved)state=JSON.parse(saved);}catch{throw new ApiError(0,'DEMO_STORAGE_UNAVAILABLE','SME demo storage is unavailable.');}
 const deny=():never=>{throw new ApiError(403,'FORBIDDEN','This resource is not available in the SME preview.');};
 const ownShipment=(id:string)=>{const s=[...data.shipments,...shared.snapshot().shipments].find(s=>s.id===id&&s.sme_id===sme);if(!s)return deny();return s;};
 const inventory=()=>data.inventory.filter(i=>i.sme_id===sme).map(i=>({...i,available_qty:i.available_qty-state.orders.filter(o=>o.status==='pending').flatMap(o=>o.payload.lines).filter(l=>l.product_id===i.id).reduce((n,l)=>n+l.expected_qty,0)}));
 return async<T>(request:ApiRequest)=>{
  validateRequest(request);request.signal?.throwIfAborted();
  const managed=shared.handle(request);if(managed)return structuredClone(managed.value) as T;
  const url=new URL(request.path,'https://demo.invalid'),path=url.pathname;
  let value:unknown;
  if(request.method==='GET'){
   if(path==='/api/me')value={actor_id:'10000000-0000-4000-8000-000000000098',memberships:[{warehouse_id:warehouse,sme_id:sme,role:'sme'}]};
   else if(path==='/api/sme/business'){if(url.searchParams.get('warehouse_id')!==warehouse||url.searchParams.get('sme_id')!==sme)return deny();value={id:sme,warehouse_id:warehouse,name:data.directory.smes.find(s=>s.id===sme)!.name};}
   else if(path==='/api/sme/overview'&&url.searchParams.get('sme_id')===sme)value={inventory:inventory(),shipments:[...demoInboundShipments(storage).filter(s=>s.sme_id===sme),...data.shipments.filter(s=>s.sme_id===sme),...shared.snapshot().shipments.filter(s=>s.sme_id===sme)],cases:state.cases,approvals:[]};
   else if(/^\/api\/deliveries\/[^/]+$/.test(path))value={shipment:ownShipment(path.split('/')[3]),session_id:null};
   else if(/^\/api\/exceptions\/[^/]+$/.test(path)){value=state.cases.find(c=>c.id===path.split('/')[3]);if(!value)return deny();}
   else if(path==='/api/orders'&&url.searchParams.get('warehouse_id')===warehouse&&url.searchParams.get('sme_id')===sme)value=state.orders;
   else return deny();
   return structuredClone(value) as T;
  }
  if(request.method!=='POST')return deny();
  const body=request.body as Record<string,unknown>,fingerprint=JSON.stringify({path:request.path,body}),replayKey=request.idempotencyKey!;
  // Authorize before replaying saved demo commands.
  if(path==='/api/exceptions')ownShipment(String(body.shipment_id));
  else if(path==='/api/orders'){if(body.sme_id!==sme||body.warehouse_id!==warehouse)return deny();}
  else if(/^\/api\/orders\/[^/]+\/actions$/.test(path)){if(!state.orders.some(o=>o.id===path.split('/')[3])||url.searchParams.get('warehouse_id')!==warehouse)return deny();}
  else return deny();
  const old=state.replay[replayKey];if(old){if(old.fingerprint!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Request key already used.');return structuredClone(old.result) as T;}
  const next=structuredClone(state);
  if(path==='/api/exceptions'){
   const b=body as unknown as Schemas['CaseReport'];
   if(!b.note?.trim()||b.note.trim().length>2000||!['inbound','warehouse','outbound'].includes(b.stage)||!['delivery_failed','recipient_unavailable','courier_delay','transit_damage','quantity_mismatch','damaged_goods'].includes(b.type))throw new ApiError(422,'INVALID_REPORT','Choose an issue and write a note within 2000 characters.');
   const shipment=ownShipment(b.shipment_id);
   if(!Array.isArray(b.evidence_ids)||b.evidence_ids.some(id=>!shipment.evidence.some(e=>e.id===id&&e.verified)))throw new ApiError(422,'INVALID_EVIDENCE','Choose evidence attached to this shipment.');
   let c=next.cases.find(c=>c.shipment_id===b.shipment_id&&c.stage===b.stage&&c.type===b.type&&!['resolved','closed'].includes(c.status));
   const event={id:crypto.randomUUID(),actor_type:'sme',type:'report',created_at:new Date().toISOString(),payload:{note:b.note,evidence_ids:b.evidence_ids}};
   if(c){c.version++;c.source_version=String(c.version);c.events.push(event);}
   else{c={risk_context:{},priority_classification:{},priority_override:false,escalated:false,id:crypto.randomUUID(),shipment_id:b.shipment_id,warehouse_id:warehouse,sme_id:sme,stage:b.stage,type:b.type,priority:'normal',status:'open',handling_mode:'human',owner_id:null,responsible_party:'UNDETERMINED',responsibility_basis:null,summary:b.note.trim(),resolution_note:null,verified_by:null,verified_at:null,created_at:new Date().toISOString(),closed_at:null,version:1,source_version:'1',required_facts:[],events:[event],verifications:[],approvals:[],analyses:[],jobs:[],actions:[],evidence:[],policy_version:1,allowed_actions:[],job_id:null};next.cases.push(c);}
   for(const id of b.evidence_ids){if(!c.evidence.some(e=>e.id===id))c.evidence.push({...shipment.evidence.find(e=>e.id===id)!,uploaded:false});}
   value=c;
  }else if(path==='/api/orders'){
   const b=body as unknown as OrderInput;
   value=checkedOrder({id:crypto.randomUUID(),warehouse_id:warehouse,sme_id:sme,created_at:new Date().toISOString(),status:'pending',payload:b,note:'',shipment_id:null});
   const quantities=new Map<string,number>();for(const l of b.lines)quantities.set(l.product_id,(quantities.get(l.product_id)??0)+l.expected_qty);
   if([...quantities].some(([id,qty])=>qty>(inventory().find(i=>i.id===id)?.available_qty??0)))throw new ApiError(422,'INSUFFICIENT_STOCK','Choose available warehouse stock.');
   next.orders.push(value as SmeOrder);
  }else{
   const order=next.orders.find(o=>o.id===path.split('/')[3])!;
   if(body.action!=='cancel'||order.status!=='pending')throw new ApiError(422,'INVALID_ACTION','Only pending demo orders can be cancelled.');
   order.status='cancelled';value=order;
  }
  next.replay[replayKey]={fingerprint,result:structuredClone(value)};
  try{storage?.setItem(storageKey,JSON.stringify(next));}catch{throw new ApiError(0,'DEMO_STORAGE_UNAVAILABLE','Unable to save this demo submission. Retry the same request.');}
  state=next;return structuredClone(value) as T;
 };
}
