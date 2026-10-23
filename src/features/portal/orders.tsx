'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {Button,Card,Input} from '../../shared/ui';
import {PageTitle,Loading,ErrorPanel,dateTime,human} from '../warehouse/shared';
import {usePolling} from './polling';
import {DeliveryMap,type MapPoint} from '../tracking/delivery-map';
import {googleMapsUrl,type OrderInput} from '../../shared/api/orders';
import {useCommand} from '../warehouse/command';
import '../tracking/tracking.css';

type Place={latitude:number;longitude:number;label:string};
export function SmeOrders(){
 const {api,warehouseId,smeId,identity,demo}=useSession();
 const resource=usePolling(`${warehouseId}:${smeId}`,async signal=>{const [inventory,profile]=await Promise.all([api!.getWarehouseCatalog(warehouseId,signal),api!.getSMEDeliveryProfile(warehouseId,smeId,signal)]);return {inventory,profile};});
 const [qty,setQty]=useState<Record<string,number>>({}),[name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[notes,setNotes]=useState('');
 const [point,setPoint]=useState<MapPoint|null>(null),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0),[attempted,setAttempted]=useState(false);
 const [query,setQuery]=useState(''),[submittedQuery,setSubmittedQuery]=useState(''),[searchAttempt,setSearchAttempt]=useState(0),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const prefilled=useRef(false),searchVersion=useRef(0),selectedQuery=useRef('');
 const [remember,setRemember]=useState(true);
 const command=useCommand<OrderInput,unknown>(`${demo?'demo-order-submit':'order-submit'}:${identity!.actor_id}:${warehouseId}:${smeId}`,(body,key)=>api!.submitOrder(body,key),()=>{setQty({});setConfirmed(false);setAttempted(false);setMessage('Order placed. Awaiting warehouse approval.');setRefresh(n=>n+1);resource.reload();});
 const uncertain=!!command.pending,locked=command.busy||uncertain;
 useEffect(()=>{
  if(!resource.data||!command.ready||prefilled.current)return;
  prefilled.current=true;
  if(command.pending){const p=command.pending.body;setName(p.customer_name);setPhone(p.customer_phone);setAddress(p.address);setNotes(p.notes);setPoint([p.latitude,p.longitude]);return;}
  const p=resource.data.profile;if(p){setName(p.recipient_name);setPhone(p.recipient_phone);setAddress(p.address);setNotes(p.notes);setPoint([p.latitude,p.longitude]);setRemember(false);}
 },[resource.data,command.ready,command.pending]);
 useEffect(()=>{
  const version=++searchVersion.current,controller=new AbortController();
  setPlaces([]);setSearchError('');setSearching(false);
  if(locked||submittedQuery.length<3||submittedQuery===selectedQuery.current)return ()=>controller.abort();
  setSearching(true);
  const timer=setTimeout(async()=>{
   try{const r=await fetch(`/api/places?q=${encodeURIComponent(submittedQuery)}`,{signal:controller.signal});if(!r.ok)throw new Error();const values:Place[]=await r.json();
    if(controller.signal.aborted||version!==searchVersion.current)return;
    const results=values.filter(p=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&typeof p.label==='string');
    setPlaces(results);if(results.length){setPoint([results[0].latitude,results[0].longitude]);setConfirmed(false);}else setSearchError('No places found. Try a nearby township or landmark, or click the map.');
   }catch{if(!controller.signal.aborted&&version===searchVersion.current)setSearchError('Location search is unavailable. Click the map to select your delivery location.');}
   finally{if(!controller.signal.aborted&&version===searchVersion.current)setSearching(false);}
  },150);
  return()=>{clearTimeout(timer);controller.abort();};
 },[submittedQuery,searchAttempt,locked]);
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 const inventory=resource.data.inventory;
 const lines=inventory.filter(p=>(qty[p.id]??0)>0).map(p=>({product_id:p.id,expected_qty:qty[p.id]}));
 const quantityError=inventory.some(p=>!Number.isInteger(qty[p.id]??0)||(qty[p.id]??0)<0||(qty[p.id]??0)>p.available_qty);
 const errors={products:!inventory.some(p=>p.available_qty>0)?'No shared warehouse stock is available to order. Ask the warehouse to add or replenish common stock.':quantityError?'Enter whole quantities between 0 and the available stock.':!lines.length?'Select at least one product with quantity 1 or more.':'',name:!name.trim()?'Enter the delivery contact name.':'',phone:phone.trim().length<3?'Enter a contact phone number with at least 3 characters.':'',address:!address.trim()?'Enter the street address, floor or landmark.':'',location:!point?'Search for a place or click the map to select a delivery location.':!confirmed?'Check the map pin and confirm the delivery location.':''};
 const valid=!Object.values(errors).some(Boolean);
 function choose(p:MapPoint){searchVersion.current++;setSearching(false);setSearchError('');setPlaces([]);setPoint(p);setConfirmed(false);}
 function error(key:keyof typeof errors){return attempted&&errors[key]?<p id={`order-${key}-error`} role="alert" className="mt-1 text-sm text-red-700">{errors[key]}</p>:null;}
 async function submit(){
  if(command.pending){await command.execute();return;}
  setAttempted(true);
  if(!valid||!point)return;
  if(!window.confirm(`Order ${lines.reduce((n,l)=>n+l.expected_qty,0)} unit(s) for delivery to ${address.trim()}? Stock will be reserved pending warehouse approval.`))return;
  await command.execute({warehouse_id:warehouseId,sme_id:smeId,customer_name:name.trim(),customer_phone:phone.trim(),address:address.trim(),notes:notes.trim(),maps_url:'',latitude:point[0],longitude:point[1],lines,order_kind:'sme_self_delivery',save_delivery_profile:remember});
 }
 return <><PageTitle title="Delivery orders" my="ပို့ဆောင်ရန် အော်ဒါများ" description="Order warehouse stock for delivery to your SME"/>
 <Card>{demo&&<p className="mb-4 text-sm">Demo orders stay in this browser session. No real delivery is requested.</p>}<form noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
 <fieldset disabled={locked} className="space-y-4"><legend className="text-lg font-semibold">1. Products</legend>
 {inventory.length?inventory.map(p=><label className="flex flex-wrap items-center justify-between gap-3 border-b py-3" key={p.id}><span><span data-user-content>{p.name} · {p.sku}</span> · Available {p.available_qty}</span><Input aria-label={`Quantity for ${p.name}`} aria-invalid={attempted&&(!Number.isInteger(qty[p.id]??0)||(qty[p.id]??0)<0||(qty[p.id]??0)>p.available_qty)} aria-describedby={attempted&&errors.products?'order-products-error':undefined} className="w-28" type="number" min={0} max={p.available_qty} step={1} value={qty[p.id]??0} onChange={e=>setQty(v=>({...v,[p.id]:Number(e.target.value)}))}/></label>):<p className="text-red-700">No shared warehouse products are available. Ask your warehouse operator to add common stock.</p>}
 {error('products')}<p className="text-sm text-muted">Choose products and quantities to deliver from the warehouse to your SME.</p>
 <h2 className="text-lg font-semibold">2. SME delivery contact</h2>
 <label className="block">Name<Input required maxLength={120} value={name} aria-invalid={attempted&&!!errors.name} aria-describedby={attempted&&errors.name?'order-name-error':undefined} onChange={e=>setName(e.target.value)}/>{error('name')}</label>
 <label className="block">Phone<Input required type="tel" minLength={3} maxLength={40} value={phone} aria-invalid={attempted&&!!errors.phone} aria-describedby={attempted&&errors.phone?'order-phone-error':undefined} onChange={e=>setPhone(e.target.value)}/>{error('phone')}</label>
 <label className="block">Address, floor and landmark<Input required maxLength={500} value={address} aria-invalid={attempted&&!!errors.address} aria-describedby={attempted&&errors.address?'order-address-error':undefined} onChange={e=>{setAddress(e.target.value);setConfirmed(false);}}/>{error('address')}</label>
 <h2 className="text-lg font-semibold">3. SME delivery location</h2>
 <label className="block">Search place or township<Input value={query} maxLength={200} placeholder="Type a place, township or landmark" onChange={e=>{searchVersion.current++;setSearching(false);setPlaces([]);setQuery(e.target.value);setPoint(null);setConfirmed(false);}} onBlur={()=>setSubmittedQuery(query.trim())} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSubmittedQuery(query.trim());setSearchAttempt(n=>n+1);}}}/></label>
 <p className="text-sm text-muted">Type at least 3 characters, then press Enter or leave the field. The map shows the first match; choose another result or adjust the pin.</p>
 {searching&&<p role="status">Finding locations…</p>}{searchError&&<p role="alert" className="text-red-700">{searchError}</p>}
 {places.map((p,i)=><button key={i} type="button" className="block w-full rounded border p-3 text-left" onClick={()=>{selectedQuery.current=p.label;choose([p.latitude,p.longitude]);setQuery(p.label);}}>{p.label}</button>)}
 </fieldset>
 <DeliveryMap destination={point} onDestination={locked?undefined:choose}/>
 <fieldset disabled={locked} className="my-4 space-y-4">
 {point&&<><p className="text-sm">Selected pin: {point[0].toFixed(6)}, {point[1].toFixed(6)}</p><label className="flex gap-3"><input aria-label="Confirm SME delivery pin" aria-invalid={attempted&&!!errors.location} aria-describedby={attempted&&errors.location?'order-location-error':undefined} type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>This map pin matches my delivery address.</label></>}
 {error('location')}
 <label className="block">Delivery instructions (optional)<Input maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
 <label className="flex gap-3"><input aria-label="Save address for future orders" type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Save this address when I place the order</label>
 </fieldset>
 {command.pending&&<section className="my-4 rounded border p-4"><h2 className="font-semibold">Submission awaiting confirmation</h2><p data-user-content>{command.pending.body.customer_name} · {command.pending.body.customer_phone}</p><p data-user-content>{command.pending.body.address}</p><p>Retry this saved order before starting another.</p></section>}
 <Button type="submit" disabled={command.busy||!command.ready}>{command.busy?'Placing order…':uncertain?'Retry same order':'Order stocks'}</Button>
 </form>{command.error&&<p role="alert" className="mt-3 text-red-700">{command.error}</p>}{message&&<p role="status" className="my-4">{message}</p>}</Card>
 <OrderList key={refresh} sme/>
 </>;
}

export function OrderList({sme=false,onChanged}:{sme?:boolean;onChanged?:()=>void}){
 const {api,warehouseId,smeId,demo,identity}=useSession();
 const resource=usePolling(`${warehouseId}:${sme?smeId:'staff'}`,signal=>api!.listOrders(warehouseId,sme?smeId:undefined,signal));
 const [reason,setReason]=useState<Record<string,string>>({}),[modes,setModes]=useState<Record<string,'in_house'|'third_party'>>({});
 type Action={id:string;action:'accept'|'reject'|'cancel';delivery_mode:'in_house'|'third_party';note:string};
 const command=useCommand<Action,unknown>(`order-action:${identity!.actor_id}:${warehouseId}:${sme?smeId:'staff'}`,(task,key)=>{const {id,...body}=task;return api!.actOnOrder(id,warehouseId,body,key);},()=>{resource.reload();onChanged?.();});
 async function act(id:string,action:Action['action']){await command.execute({id,action,delivery_mode:modes[id]??'in_house',note:reason[id]??''});}
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <Card className="my-5"><h2 className="text-lg font-semibold">{sme?'Your orders':'SME delivery requests'}</h2>{command.error&&<p role="alert">{command.error}</p>}{command.pending&&<Button type="button" disabled={command.busy} onClick={()=>void command.execute()}>Retry same action</Button>}
 {!resource.data.length&&<p className="my-4">No orders yet</p>}
 {resource.data.map(o=><article key={o.id} className="my-4 space-y-3 rounded border p-4"><h3 className="font-semibold">ORD-{o.id.slice(0,8)} · {human(o.status)}{o.shipment_status?` · ${human(o.shipment_status)}`:''}</h3><p>{dateTime(o.created_at)}</p><p data-user-content>{o.payload.customer_name} · {o.payload.customer_phone}</p><p data-user-content>{o.payload.address}</p><p data-user-content>{o.payload.notes}</p><ul>{o.payload.lines.map(l=><li data-user-content key={l.product_id}>{l.name??'Product'}{l.sku?` · ${l.sku}`:''} × {l.expected_qty}</li>)}</ul>
 <a className="inline-block min-h-11 text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${o.payload.latitude},${o.payload.longitude}`} target="_blank" rel="noreferrer">Open SME delivery pin ↗</a>
 {o.payload.maps_url&&googleMapsUrl(o.payload.maps_url)&&<a className="ml-4 inline-block min-h-11 text-brand underline" href={o.payload.maps_url} target="_blank" rel="noreferrer">SME Maps link ↗</a>}
 {o.note&&<p>Reason: <span data-user-content>{o.note}</span></p>}
 {o.shipment_id&&<Link className="block text-brand underline" href={demo?(sme?'/demo/sme/tracking':`/demo/warehouse/shipments/${o.shipment_id}`):`${sme?'/sme':'/warehouse'}/shipments/${o.shipment_id}`}>View shipment / tracking →</Link>}
 {o.status==='pending'&&<fieldset disabled={command.busy||!!command.pending||!command.ready} className="flex flex-wrap items-end gap-3">{sme?<Button variant="outline" onClick={()=>void act(o.id,'cancel')}>Cancel order</Button>:<><label>Delivery mode<select className="block rounded border p-3" value={modes[o.id]??'in_house'} onChange={e=>setModes(v=>({...v,[o.id]:e.target.value as 'in_house'|'third_party'}))}><option value="in_house">In-house rider</option><option value="third_party">Third-party courier</option></select></label><Button onClick={()=>void act(o.id,'accept')}>Accept & create shipment</Button><label>Rejection reason<Input value={reason[o.id]??''} maxLength={2000} onChange={e=>setReason(v=>({...v,[o.id]:e.target.value}))}/></label><Button variant="outline" disabled={!reason[o.id]?.trim()} onClick={()=>void act(o.id,'reject')}>Reject</Button></>}</fieldset>}
 </article>)}
 </Card>;
}
