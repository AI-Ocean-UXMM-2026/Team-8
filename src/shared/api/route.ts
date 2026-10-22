import {ApiError,isUUID} from './transport';
export type DeliveryRoute={provider:'openrouteservice';profile:'car';coordinates:[number,number][];distance_m:number;duration_ms:number;traffic_aware:false;destination_source:'courier_selected'};
export type RouteRequest={origin_latitude:number;origin_longitude:number;destination_latitude:number;destination_longitude:number;consent:true};
export function checkedRoute(value:unknown):DeliveryRoute{
 const r=value as DeliveryRoute;
 if(!r||r.provider!=='openrouteservice'||r.profile!=='car'||r.traffic_aware!==false||r.destination_source!=='courier_selected'||!Number.isFinite(r.distance_m)||r.distance_m<0||!Number.isFinite(r.duration_ms)||r.duration_ms<0||!Array.isArray(r.coordinates)||r.coordinates.length<2||r.coordinates.length>10000||r.coordinates.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||Math.abs(p[0])>180||!Number.isFinite(p[1])||Math.abs(p[1])>90))throw new ApiError(502,'INVALID_RESPONSE','The route could not be verified. Try again.');
 return r;
}

export type SharedDeliveryRoute=DeliveryRoute&{shipment_id:string;assignment_id:string;saved_at:string;expires_at:string;origin:[number,number];destination:[number,number]};
export function checkedSharedRoute(value:unknown,id:string):SharedDeliveryRoute|null{
 if(value===null)return null;
 const route=checkedRoute(value) as SharedDeliveryRoute;
 if(!isUUID(id)||route.shipment_id!==id||!isUUID(route.assignment_id)||!Number.isFinite(Date.parse(route.saved_at))||!Number.isFinite(Date.parse(route.expires_at))||Date.parse(route.expires_at)<=Date.parse(route.saved_at)||[route.origin,route.destination].some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||Math.abs(p[0])>180||!Number.isFinite(p[1])||Math.abs(p[1])>90))throw new ApiError(502,'INVALID_RESPONSE','The shared route could not be verified.');
 return route;
}

export type CalculatedRoute=SharedDeliveryRoute|(DeliveryRoute&{shipment_id:string;sharing_status:'unconfirmed'});
export function checkedCalculatedRoute(value:unknown,id:string):CalculatedRoute{
 const route=checkedRoute(value) as CalculatedRoute;
 if('sharing_status' in route){if(route.sharing_status!=='unconfirmed'||route.shipment_id!==id)throw new ApiError(502,'INVALID_RESPONSE','The calculated route could not be verified.');return route;}
 const shared=checkedSharedRoute(route,id);if(!shared)throw new ApiError(502,'INVALID_RESPONSE','The calculated route could not be verified.');return shared;
}
