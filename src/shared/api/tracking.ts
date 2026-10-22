import {ApiError,isUUID} from './transport';
export type Position={session_id:string;status:'live'|'stale'|'unavailable';latitude:number|null;longitude:number|null;accuracy_m:number|null;recorded_at:string|null};
export function checkedPosition(value:unknown,session:string):Position{
 const p=value as Position;
 const validDate=typeof p?.recorded_at==='string'&&Number.isFinite(Date.parse(p.recorded_at));
 if(!p||!isUUID(session)||p.session_id!==session||!['live','stale','unavailable'].includes(p.status)||
 (p.status!=='unavailable'&&(!validDate||Date.parse(p.recorded_at!)>Date.now()+60000||typeof p.latitude!=='number'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||typeof p.accuracy_m!=='number'||!Number.isFinite(p.accuracy_m)||p.accuracy_m<0)))throw new ApiError(502,'INVALID_RESPONSE','Tracking position could not be verified.');
 return p.status==='unavailable'?{session_id:session,status:'unavailable',latitude:null,longitude:null,accuracy_m:null,recorded_at:null}:p;
}
export function trackingAccess(memberships:readonly {warehouse_id:string;sme_id?:string|null;role:string}[],shipment:{warehouse_id:string;sme_id:string}){
 return memberships.some(m=>m.warehouse_id===shipment.warehouse_id&&(['owner','staff'].includes(m.role)||(m.role==='sme'&&m.sme_id===shipment.sme_id)));
}
