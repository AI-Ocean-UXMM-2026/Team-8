import {ApiError,type ApiRequest,type Schemas} from './transport';
import {checkedOrder,checkedProfile,type DeliveryProfile,type SmeOrder,type OrderInput,type WarehouseCatalogItem} from './orders';
type Store=Pick<Storage,'getItem'|'setItem'>;
type DemoOrder=SmeOrder&{reserved?:boolean};
type State={orders:DemoOrder[];profiles:Record<string,DeliveryProfile>;shipments:Schemas['ShipmentDetail'][];physical:Record<string,number>;replay:Record<string,{fingerprint:string;value:unknown}>};
const key='parcelcare.shared-stock.demo.v1';
export const demoCommonProducts=(warehouse:string):WarehouseCatalogItem[]=>[
 {id:'90000000-0000-4000-8000-000000000001',warehouse_id:warehouse,category:'food_beverages',sku:'COMMON-TEA',name:'Warehouse green tea',available_qty:100},
 {id:'90000000-0000-4000-8000-000000000002',warehouse_id:warehouse,category:'beauty_personal_care',sku:'COMMON-SOAP',name:'Warehouse botanical soap',available_qty:80},
];
// Fictitious shared state for SME and warehouse demos in this browser session.
export function createSharedStockDemo(warehouse:string,sme:string|null,storage?:Store){
 let memory:State={orders:[],profiles:{},shipments:[],physical:{},replay:{}};
 const read=():State=>{try{const raw=storage?.getItem(key);return raw?JSON.parse(raw):structuredClone(memory);}catch{throw new ApiError(0,'DEMO_STORAGE_UNAVAILABLE','Demo storage is unavailable.');}};
 const save=(s:State)=>{try{storage?.setItem(key,JSON.stringify(s));memory=structuredClone(s);}catch{throw new ApiError(0,'DEMO_STORAGE_UNAVAILABLE','Unable to save this demo submission. Retry the same request.');}};
 const deny=():never=>{throw new ApiError(403,'FORBIDDEN','This resource is not available in this demo workspace.');};
 const catalog=(s:State)=>demoCommonProducts(warehouse).map(p=>({...p,available_qty:(s.physical[p.id]??p.available_qty)-s.orders.filter(o=>o.reserved).flatMap(o=>o.payload.lines).filter(l=>l.product_id===p.id).reduce((n,l)=>n+l.expected_qty,0)}));
 return {
  snapshot(){const s=read();return {shipments:s.shipments,products:demoCommonProducts(warehouse).map(p=>({...p,sme_id:null,available_qty:s.physical[p.id]??p.available_qty,quarantined_qty:0,shipment_ids:s.shipments.filter(x=>x.items.some(i=>i.product_id===p.id)).map(x=>x.id)}))};},
  sync(data:Schemas['WarehouseFixture']){const s=read();for(const shipment of s.shipments){const updated=data.shipments.find(x=>x.id===shipment.id);if(updated){Object.assign(shipment,updated);if(updated.events.some(e=>e.type==='dispatched')){const o=s.orders.find(o=>o.shipment_id===updated.id);if(o)o.reserved=false;}}}for(const p of data.inventory.filter(p=>p.sme_id===null))s.physical[p.id]=p.available_qty;save(s);},
  handle(request:ApiRequest):{value:unknown}|undefined{
   const url=new URL(request.path,'https://demo.invalid'),path=url.pathname;
   if(!path.startsWith('/api/orders'))return undefined;
   if(url.searchParams.has('warehouse_id')&&url.searchParams.get('warehouse_id')!==warehouse)return deny();
   const state=read();
   if(request.method==='GET'){
    if(path==='/api/orders/catalog')return {value:catalog(state)};
    if(path==='/api/orders/catalog-page'){
     const all=catalog(state).map(p=>({...p,category:p.category??'uncategorized'})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
     const search=(url.searchParams.get('search')??'').toLowerCase(),category=url.searchParams.get('category'),stock=url.searchParams.get('in_stock_only')!=='false';
     const rows=all.filter(p=>(!stock||p.available_qty>0)&&(!category||p.category===category)&&(p.name+' '+p.sku).toLowerCase().includes(search));
     const offset=Number(url.searchParams.get('cursor')??0),limit=12,selected=url.searchParams.getAll('selected_ids');
     return {value:{items:rows.slice(offset,offset+limit),selected_items:all.filter(p=>selected.includes(p.id)),categories:[...new Set(all.map(p=>p.category))],total:rows.length,next_cursor:offset+limit<rows.length?String(offset+limit):null}};
    }

    if(path==='/api/orders/delivery-profile'){const id=url.searchParams.get('sme_id')!;if(!id||(sme&&id!==sme))return deny();return {value:state.profiles[id]??null};}
    if(path==='/api/orders'){if(sme&&url.searchParams.get('sme_id')!==sme)return deny();return {value:state.orders.filter(o=>!sme||o.sme_id===sme).map(o=>({...o,shipment_status:state.shipments.find(s=>s.id===o.shipment_id)?.status??null}))};}
    const match=path.match(/^\/api\/orders\/shipment\/([^/]+)\/customer$/);if(match){const o=state.orders.find(o=>o.shipment_id===match[1]);if(!o)return {value:null};if(sme&&o.sme_id!==sme)return deny();return {value:o.payload};}
    return deny();
   }
   if(request.method==='PUT'&&path==='/api/orders/delivery-profile'){
    if(!sme||url.searchParams.get('sme_id')!==sme)return deny();const profile=checkedProfile(request.body);state.profiles[sme]=structuredClone(profile);save(state);return {value:profile};
   }
   if(request.method!=='POST')return deny();
   const b=request.body as Record<string,unknown>,fingerprint=JSON.stringify({path:request.path,body:b});
   const id=path.split('/')[3],o=state.orders.find(o=>o.id===id);
   if(path==='/api/orders'){if(!sme||b.sme_id!==sme||b.warehouse_id!==warehouse)return deny();}
   else if(!o||(sme&&o.sme_id!==sme))return deny();
   if(sme&&path!=='/api/orders'&&b.action!=='cancel')return deny();
   const replay=state.replay[request.idempotencyKey!];if(replay){if(replay.fingerprint!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Request key already used.');return {value:structuredClone(replay.value)};}
   let value:unknown;
   if(path==='/api/orders'){
    const payload={...b,customer_name:b.recipient_name??b.customer_name,customer_phone:b.recipient_phone??b.customer_phone} as unknown as OrderInput;
    if(payload.order_kind!=='sme_self_delivery')throw new ApiError(422,'VALIDATION_ERROR','Choose shared warehouse stock.');
    const available=catalog(state);const seen=new Set();for(const l of payload.lines){if(seen.has(l.product_id)||!Number.isSafeInteger(l.expected_qty)||l.expected_qty<=0||l.expected_qty>(available.find(p=>p.id===l.product_id)?.available_qty??0))throw new ApiError(409,'STOCK_UNAVAILABLE','Choose available shared warehouse stock.');seen.add(l.product_id);}
    value=checkedOrder({id:crypto.randomUUID(),warehouse_id:warehouse,sme_id:sme,created_at:new Date().toISOString(),status:'pending',payload:{...payload,lines:payload.lines.map(l=>({...l,name:available.find(p=>p.id===l.product_id)?.name,sku:available.find(p=>p.id===l.product_id)?.sku}))},note:'',shipment_id:null,reserved:true});
    if(payload.save_delivery_profile)state.profiles[sme!]=checkedProfile({...payload,recipient_name:payload.customer_name,recipient_phone:payload.customer_phone});
    state.orders.unshift(value as DemoOrder);
   }else{
    if(o!.status!=='pending')throw new ApiError(409,'STALE_VERSION','Order is no longer pending.');
    if(b.action==='accept'&&!sme){
     const payload=o!.payload,shipment: Schemas['ShipmentDetail']={id:crypto.randomUUID(),warehouse_id:warehouse,sme_id:o!.sme_id,reference:'ORD-'+o!.id,direction:'outbound',delivery_mode:b.delivery_mode==='third_party'?'third_party':'in_house',status:'ready',version:1,created_at:new Date().toISOString(),evidence_ids:[],evidence:[],events:[],allowed_events:['picked'],items:payload.lines.map(l=>({product_id:l.product_id,sku:l.sku??'',name:l.name??'Product',expected_qty:l.expected_qty,received_qty:0,damaged_qty:0}))};
     state.shipments.push(shipment);o!.status='accepted';o!.shipment_id=shipment.id;
    }else if(b.action==='cancel'&&sme){o!.status='cancelled';o!.reserved=false;}
    else if(b.action==='reject'&&!sme){if(!String(b.note??'').trim())throw new ApiError(422,'VALIDATION_ERROR','Rejection reason is required.');o!.status='rejected';o!.note=String(b.note);o!.reserved=false;}
    else return deny();value=o;
   }
   state.replay[request.idempotencyKey!]={fingerprint,value:structuredClone(value)};save(state);return {value:structuredClone(value)};
  }
 };
}
