import {ApiError,isUUID} from './transport';
export type OrderInput = {
 warehouse_id:string;sme_id:string;customer_name:string;customer_phone:string;address:string;notes:string;maps_url:string;
 latitude:number;longitude:number;lines:{product_id:string;expected_qty:number;name?:string;sku?:string}[];
};
export type SmeOrder = {id:string;warehouse_id:string;sme_id:string;created_at:string;status:'pending'|'accepted'|'rejected'|'cancelled';payload:OrderInput;note:string;shipment_id:string|null;shipment_status?:string|null};
export function checkedOrder(value:unknown):SmeOrder {
 const o=value as SmeOrder,p=o?.payload;
 if(!o||!isUUID(o.id)||!isUUID(o.warehouse_id)||!isUUID(o.sme_id)||!['pending','accepted','rejected','cancelled'].includes(o.status)||!Number.isFinite(Date.parse(o.created_at))||typeof o.note!=='string'||(o.shipment_id!==null&&!isUUID(o.shipment_id))||!p||p.warehouse_id!==o.warehouse_id||p.sme_id!==o.sme_id||typeof p.customer_name!=='string'||!p.customer_name||typeof p.customer_phone!=='string'||typeof p.address!=='string'||typeof p.notes!=='string'||typeof p.maps_url!=='string'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Array.isArray(p.lines)||!p.lines.length||p.lines.some(l=>!isUUID(l.product_id)||!Number.isInteger(l.expected_qty)||l.expected_qty<=0))throw new ApiError(502,'INVALID_RESPONSE','Order result could not be verified. Retry the same request.');
 return o;
}
export function googleMapsUrl(value:string):URL|null {
 try {const u=new URL(value.trim());if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 if(u.hostname==='maps.app.goo.gl')return u;
 if(u.hostname==='goo.gl'&&u.pathname.startsWith('/maps/'))return u;
 if(['google.com','www.google.com'].includes(u.hostname)&&/^\/maps(?:\/|$)/.test(u.pathname))return u;
 if(u.hostname==='maps.google.com')return u;
 }catch{}return null;
}
export function mapsCoordinates(value:string):[number,number]|null {
 const u=googleMapsUrl(value);if(!u)return null;
 // A viewport center is not a customer pin. Prefer the place marker.
 let data:string;try{data=decodeURIComponent(u.pathname+u.search);}catch{return null;}
 const marker=data.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
 const query=u.searchParams.get('query')??u.searchParams.get('q')??u.searchParams.get('destination');
 const pair=marker??query?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
 if(!pair)return null;const lat=Number(pair[1]),lng=Number(pair[2]);
 return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180?[lat,lng]:null;
}
