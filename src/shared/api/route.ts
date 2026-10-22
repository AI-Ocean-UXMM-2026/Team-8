import {ApiError} from './transport';
export type DeliveryRoute={provider:'openrouteservice';profile:'car';coordinates:[number,number][];distance_m:number;duration_ms:number;traffic_aware:false;destination_source:'courier_selected'};
export type RouteRequest={origin_latitude:number;origin_longitude:number;destination_latitude:number;destination_longitude:number;consent:true};
export function checkedRoute(value:unknown):DeliveryRoute{
 const r=value as DeliveryRoute;
 if(!r||r.provider!=='openrouteservice'||r.profile!=='car'||r.traffic_aware!==false||r.destination_source!=='courier_selected'||!Number.isFinite(r.distance_m)||r.distance_m<0||!Number.isFinite(r.duration_ms)||r.duration_ms<0||!Array.isArray(r.coordinates)||r.coordinates.length<2||r.coordinates.length>100000||r.coordinates.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||Math.abs(p[0])>180||!Number.isFinite(p[1])||Math.abs(p[1])>90))throw new ApiError(502,'INVALID_RESPONSE','The route could not be verified. Try again.');
 return r;
}
