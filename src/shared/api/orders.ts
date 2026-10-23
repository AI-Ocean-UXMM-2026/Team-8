import {ApiError,isUUID} from './transport';
export type OrderInput = {
 warehouse_id:string;sme_id:string;customer_name:string;customer_phone:string;address:string;notes:string;maps_url:string;
 delivery_due_at?:string;order_kind?:'sme_self_delivery';save_delivery_profile?:boolean;recipient_name?:string;recipient_phone?:string;
 latitude:number;longitude:number;lines:{product_id:string;expected_qty:number;name?:string;sku?:string}[];
};
export type DeliveryProfile={recipient_name:string;recipient_phone:string;address:string;notes:string;maps_url:string;latitude:number;longitude:number};
export type WarehouseCatalogItem={id:string;warehouse_id:string;sku:string;name:string;available_qty:number;category?:string};
export function checkedProfile(value:unknown):DeliveryProfile {
 const p=value as DeliveryProfile;
 if(!p||typeof p.recipient_name!=='string'||!p.recipient_name.trim()||typeof p.recipient_phone!=='string'||p.recipient_phone.trim().length<3||typeof p.address!=='string'||!p.address.trim()||typeof p.notes!=='string'||typeof p.maps_url!=='string'||(p.maps_url!==''&&!googleMapsUrl(p.maps_url))||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)throw new ApiError(502,'INVALID_RESPONSE','SME delivery profile could not be verified.');
 return p;
}
export function checkedCatalog(value:unknown,warehouse:string):WarehouseCatalogItem[]{
 if(!Array.isArray(value))throw new ApiError(502,'INVALID_RESPONSE','Warehouse catalog could not be verified.');
 return value.map(p=>{
  if(!p||!isUUID(p.id)||p.warehouse_id!==warehouse||typeof p.name!=='string'||typeof p.sku!=='string'||!Number.isSafeInteger(p.available_qty)||p.available_qty<0)throw new ApiError(502,'INVALID_RESPONSE','Warehouse catalog could not be verified.');
  return {id:p.id,warehouse_id:p.warehouse_id,name:p.name,sku:p.sku,available_qty:p.available_qty};
 });
}
export type SmeOrder = {id:string;warehouse_id:string;sme_id:string;created_at:string;status:'pending'|'accepted'|'rejected'|'cancelled';payload:OrderInput;note:string;shipment_id:string|null;shipment_status?:string|null};
export function checkedOrder(value:unknown):SmeOrder {
 const o=value as SmeOrder,raw=o?.payload;
 const p=raw?{...raw,customer_name:raw.recipient_name??raw.customer_name,customer_phone:raw.recipient_phone??raw.customer_phone}:raw;
 if((p?.delivery_due_at!==undefined&&(typeof p.delivery_due_at!=='string'||!Number.isFinite(Date.parse(p.delivery_due_at))))||!o||!isUUID(o.id)||!isUUID(o.warehouse_id)||!isUUID(o.sme_id)||!['pending','accepted','rejected','cancelled'].includes(o.status)||!Number.isFinite(Date.parse(o.created_at))||typeof o.note!=='string'||(o.shipment_id!==null&&!isUUID(o.shipment_id))||!p||p.warehouse_id!==o.warehouse_id||p.sme_id!==o.sme_id||typeof p.customer_name!=='string'||!p.customer_name||typeof p.customer_phone!=='string'||typeof p.address!=='string'||typeof p.notes!=='string'||typeof p.maps_url!=='string'||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Array.isArray(p.lines)||!p.lines.length||p.lines.some(l=>!l||!isUUID(l.product_id)||!Number.isInteger(l.expected_qty)||l.expected_qty<=0))throw new ApiError(502,'INVALID_RESPONSE','Order result could not be verified. Retry the same request.');
 return {...o,payload:p};
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
export type CatalogProduct=WarehouseCatalogItem & {category:string};
export type CatalogPage={items:CatalogProduct[];selected_items:CatalogProduct[];next_cursor:string|null;total:number;categories:string[]};
export const catalogCategories:Record<string,string>={food_beverages:'Food & beverages',clothing_accessories:'Clothing & accessories',home_kitchen:'Home & kitchen',electronics:'Electronics',beauty_personal_care:'Beauty & personal care',health_medical:'Health & medical',office_stationery:'Office & stationery',other:'Other',uncategorized:'Uncategorized'};
export function checkedCatalogPage(value:unknown,warehouse:string):CatalogPage{
 const p=value as CatalogPage;
 if(!p||!Array.isArray(p.items)||!Array.isArray(p.selected_items)||!Array.isArray(p.categories)||!p.categories.every(c=>typeof c==='string'&&Object.hasOwn(catalogCategories,c))||!Number.isSafeInteger(p.total)||p.total<0||(p.next_cursor!==null&&typeof p.next_cursor!=='string'))throw new ApiError(502,'INVALID_RESPONSE','Product catalogue could not be verified.');
 const rows=(values:unknown[])=>checkedCatalog(values,warehouse).map((product,i)=>{const category=(values[i] as CatalogProduct).category??'uncategorized';if(!Object.hasOwn(catalogCategories,category))throw new ApiError(502,'INVALID_RESPONSE','Product category could not be verified.');return {...product,category};});
 return {...p,items:rows(p.items),selected_items:rows(p.selected_items)};
}
// Urgency is derived from the deadline, so it never depends on a scheduler.
export function releaseTiming(order:SmeOrder,now=Date.now()){
 const due=Date.parse(order.payload.delivery_due_at??'');
 if(!Number.isFinite(due))return {pool:'No deadline',label:'Legacy request — no delivery deadline',active:false};
 const active=order.status==='accepted'&&!['delivered','cancelled','returned'].includes(order.shipment_status??'');
 const remaining=due-now,minutes=Math.ceil(Math.abs(remaining)/60000),hours=Math.floor(minutes/60);
 const duration=hours>=24?`${Math.floor(hours/24)}d ${hours%24}h`:`${hours}h ${minutes%60}m`;
 return {pool:remaining<=72*3600000?'Urgent':'Can wait',label:!active?`Delivery deadline: ${new Date(due).toLocaleString()}`:remaining<=0?`Overdue by ${duration}`:`${duration} remaining`,active};
}
