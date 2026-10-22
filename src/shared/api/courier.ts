import {ApiError,isUUID,type Schemas} from './transport';
export type RiderAssignment={id:string;shipment_id:string;reference:string;status:string;version:number;assigned_at:string;accepted_at:string|null;picked_up_at:string|null};
export type CourierDelivery={shipment:Schemas['ShipmentDetail'];assignments:Array<{id:string;shipment_id:string;accepted_at:string|null;picked_up_at:string|null;cancelled_at:string|null;completed_at:string|null}>;proofs:Array<{id:string;shipment_id:string;received_by:string;evidence_id:string;confirmed_at:string|null}>};
export type CourierAction={kind:'accept'|'pickup'|'proof';expected_version:number;note:string;evidence_id?:string;received_by?:string}|{kind:'report';type:'recipient_unavailable'|'delivery_failed'|'transit_damage'|'courier_delay';note:string;evidence_ids:string[]};
const invalid=():never=>{throw new ApiError(502,'INVALID_RESPONSE','Delivery response could not be verified. Retry the same saved request.');};
const date=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export function checkedAssignments(value:unknown):RiderAssignment[]{
 if(!Array.isArray(value)||!value.every(a=>a&&isUUID(a.id)&&isUUID(a.shipment_id)&&typeof a.reference==='string'&&typeof a.status==='string'&&Number.isSafeInteger(a.version)&&a.version>0&&date(a.assigned_at)&&(a.accepted_at===null||date(a.accepted_at))&&(a.picked_up_at===null||date(a.picked_up_at))))invalid();
 return value as RiderAssignment[];
}
export function checkedDelivery(value:unknown,id:string,previousVersion=0):CourierDelivery{
 const d=value as CourierDelivery,s=d?.shipment;
 if(!s||s.id!==id||!isUUID(s.warehouse_id)||!isUUID(s.sme_id)||s.direction!=='outbound'||s.delivery_mode!=='in_house'||!Number.isSafeInteger(s.version)||s.version<=previousVersion||typeof s.status!=='string'||typeof s.reference!=='string'||!date(s.created_at)||!Array.isArray(s.items)||!s.items.every(i=>isUUID(i.product_id)&&typeof i.name==='string'&&typeof i.sku==='string'&&Number.isSafeInteger(i.expected_qty)&&i.expected_qty>=0)||!Array.isArray(s.events)||!s.events.every(e=>isUUID(e.id)&&typeof e.type==='string'&&typeof e.notes==='string'&&date(e.verified_at)&&date(e.recorded_at))||!Array.isArray(s.evidence)||!s.evidence.every(e=>isUUID(e.id)&&typeof e.label==='string'&&typeof e.verified==='boolean')||!Array.isArray(d.assignments)||!d.assignments.every(a=>isUUID(a.id)&&a.shipment_id===id&&(a.accepted_at===null||date(a.accepted_at))&&(a.picked_up_at===null||date(a.picked_up_at))&&(a.cancelled_at===null||date(a.cancelled_at))&&(a.completed_at===null||date(a.completed_at)))||!Array.isArray(d.proofs)||!d.proofs.every(p=>isUUID(p.id)&&p.shipment_id===id&&isUUID(p.evidence_id)&&typeof p.received_by==='string'&&(p.confirmed_at===null||date(p.confirmed_at))))invalid();
 return d;
}
