'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useSession} from '../auth/session';
import {Button,Card,Input} from '../../shared/ui';
import {PageTitle,Loading,ErrorPanel,dateTime,human} from '../warehouse/shared';
import {usePolling} from './polling';
import {DeliveryMap,type MapPoint} from '../tracking/delivery-map';
import {googleMapsUrl,type OrderInput} from '../../shared/api/orders';
import {useCommand} from '../warehouse/command';
import '../tracking/tracking.css';

export function SmeOrders(){
 const {api,warehouseId,smeId,identity}=useSession();
 const resource=usePolling(`${warehouseId}:${smeId}`,signal=>api!.getSMEOverview(smeId,signal));
 const [qty,setQty]=useState<Record<string,number>>({}),[name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[notes,setNotes]=useState(''),[maps,setMaps]=useState('');
 const [point,setPoint]=useState<MapPoint|null>(null),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[refresh,setRefresh]=useState(0);
 const [query,setQuery]=useState(''),[places,setPlaces]=useState<{latitude:number;longitude:number;label:string}[]>([]);
 const command=useCommand<OrderInput,unknown>(`order-submit:${identity!.actor_id}:${warehouseId}:${smeId}`,(body,key)=>api!.submitOrder(body,key),()=>{setQty({});setName('');setPhone('');setAddress('');setNotes('');setMaps('');setPoint(null);setConfirmed(false);setReview(false);setMessage('Order submitted · Warehouse အတည်ပြုရန် စောင့်နေသည်');setRefresh(n=>n+1);resource.reload();});
 const uncertain=!!command.pending;

 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 const inventory=resource.data.inventory;
 const lines=inventory.filter(p=>(qty[p.id]??0)>0).map(p=>({product_id:p.id,expected_qty:qty[p.id]}));
 const valid=lines.length>0&&lines.every(l=>Number.isInteger(l.expected_qty)&&l.expected_qty<=inventory.find(p=>p.id===l.product_id)!.available_qty)&&!!name.trim()&&phone.trim().length>=3&&!!address.trim()&&!!point&&confirmed&&(!maps||!!googleMapsUrl(maps));
 function choose(p:MapPoint){setPoint(p);setConfirmed(false);setReview(false);}
 async function resolve(){setBusy(true);setMessage('');try{const r=await fetch('/api/maps/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:maps})});const d=await r.json();if(d.point)choose(d.point);setMessage(d.error??d.message);}catch{setMessage('Link unavailable. Choose the customer pin on the map.');}finally{setBusy(false);}}
 async function search(){setBusy(true);setMessage('');try{const r=await fetch(`/api/places?q=${encodeURIComponent(query)}`);if(!r.ok)throw new Error();const d=await r.json();setPlaces(d);if(!d.length)setMessage('No results. Choose the customer pin on the map.');}catch{setMessage('Search unavailable. Choose the customer pin on the map.');}finally{setBusy(false);}}
 async function submit(){
  if(command.pending){await command.execute();return;}
  if(!valid||!point)return;
  await command.execute({warehouse_id:warehouseId,sme_id:smeId,customer_name:name.trim(),customer_phone:phone.trim(),address:address.trim(),notes:notes.trim(),maps_url:maps.trim(),latitude:point[0],longitude:point[1],lines});
 }

 return <><PageTitle title="Delivery orders" my="ပို့ဆောင်ရန် အော်ဒါများ" description="Send your warehouse stock to a customer · Warehouse ရှိပစ္စည်းကို customer ဆီ ပို့ရန်"/>
 <Card><form noValidate={uncertain} onSubmit={e=>{e.preventDefault();if(uncertain)void submit();else if(!review){if(valid)setReview(true);}else void submit();}}>
 <fieldset disabled={busy||command.busy||uncertain} className="space-y-4"><legend className="text-lg font-semibold">1. Products · ပစ္စည်းရွေးရန်</legend>
 {inventory.length?inventory.map(p=><label className="flex flex-wrap items-center justify-between gap-3 border-b py-3" key={p.id}><span>{p.name} · {p.sku} · Available {p.available_qty}</span><Input aria-label={`Quantity for ${p.name}`} className="w-28" type="number" min={0} max={p.available_qty} step={1} value={qty[p.id]??0} onChange={e=>{setQty(v=>({...v,[p.id]:Number(e.target.value)}));setReview(false);}}/></label>):<p>No stock available · ပစ္စည်း မရှိသေးပါ</p>}
 <h2 className="text-lg font-semibold">2. Customer · လက်ခံသူ</h2>
 <label className="block">Name · အမည်<Input required maxLength={120} value={name} onChange={e=>{setName(e.target.value);setReview(false);}}/></label>
 <label className="block">Phone · ဖုန်း<Input required type="tel" minLength={3} maxLength={40} value={phone} onChange={e=>{setPhone(e.target.value);setReview(false);}}/></label>
 <label className="block">Address, floor and landmark · လိပ်စာ၊ အထပ်၊ အမှတ်အသား<Input required maxLength={500} value={address} onChange={e=>{setAddress(e.target.value);setConfirmed(false);setReview(false);}}/></label>
 <h2 className="text-lg font-semibold">3. Customer location · ပို့ဆောင်ရမည့်နေရာ</h2>
 <label className="block">Google Maps link from customer<Input type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/…" value={maps} onChange={e=>{setMaps(e.target.value);setPoint(null);setConfirmed(false);setReview(false);}}/></label>
 <Button type="button" variant="outline" disabled={!googleMapsUrl(maps)} onClick={()=>void resolve()}>Read Maps link · Link မှ နေရာယူမည်</Button>
 <label className="block">Search place / township · နေရာရှာရန်<Input value={query} maxLength={200} onChange={e=>setQuery(e.target.value)}/></label>
 <Button type="button" variant="outline" disabled={query.trim().length<2} onClick={()=>void search()}>Search places</Button>
 {places.map((p,i)=><button key={i} type="button" className="block w-full rounded border p-3 text-left" onClick={()=>{choose([p.latitude,p.longitude]);setPlaces([]);}}>{p.label}</button>)}
 <p>Click the map to choose or adjust the customer pin · Map ပေါ်နှိပ်ပြီး နေရာရွေးပါ</p>
 </fieldset>
 <DeliveryMap destination={point} onDestination={busy||command.busy||uncertain?undefined:choose}/>
 <fieldset disabled={busy||command.busy||uncertain} className="my-4 space-y-4">
 {point&&<><p>{point[0].toFixed(6)}, {point[1].toFixed(6)}</p><label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setReview(false);}}/>Customer လိပ်စာနှင့် pin မှန်ကြောင်း စစ်ဆေးပြီးပါပြီ</label></>}
 <label className="block">Delivery instructions · မှတ်ချက်<Input maxLength={2000} value={notes} onChange={e=>{setNotes(e.target.value);setReview(false);}}/></label>
 </fieldset>
 {command.pending&&<section className="my-4 rounded border p-4"><h2 className="font-semibold">Submission awaiting confirmation</h2><p>{command.pending.body.customer_name} · {command.pending.body.customer_phone}</p><p>{command.pending.body.address}</p><p>Retry this saved order before starting another.</p></section>}
 {review&&<section aria-label="Order review" className="my-5 rounded border p-4"><h2 className="font-semibold">Review order · ပြန်စစ်ရန်</h2><p>{name} · {phone}</p><p>{address}</p>{lines.map(l=><p key={l.product_id}>{inventory.find(p=>p.id===l.product_id)?.name} × {l.expected_qty}</p>)}<p>{notes}</p><p>Stock is reserved when submitted. Warehouse will arrange the delivery.</p></section>}
 <Button type="submit" disabled={busy||command.busy||!command.ready||(!uncertain&&!valid)}>{busy||command.busy?'Please wait…':uncertain?'Retry same order':review?'Submit order · အော်ဒါတင်မည်':'Review order · ပြန်စစ်မည်'}</Button>
 {review&&!uncertain&&<Button className="ml-3" variant="outline" type="button" onClick={()=>setReview(false)}>Back to edit</Button>}
 </form>{command.error&&<p role="alert">{command.error}</p>}{message&&<p role="status" className="my-4">{message}</p>}</Card>
 <OrderList key={refresh} sme/>
 </>;
}

export function OrderList({sme=false}:{sme?:boolean}){
 const {api,warehouseId,smeId,demo,identity}=useSession();
 const resource=usePolling(`${warehouseId}:${sme?smeId:'staff'}`,signal=>api!.listOrders(warehouseId,sme?smeId:undefined,signal));
 const [reason,setReason]=useState<Record<string,string>>({}),[modes,setModes]=useState<Record<string,'in_house'|'third_party'>>({});
 type Action={id:string;action:'accept'|'reject'|'cancel';delivery_mode:'in_house'|'third_party';note:string};
 const command=useCommand<Action,unknown>(`order-action:${identity!.actor_id}:${warehouseId}:${sme?smeId:'staff'}`,(task,key)=>{const {id,...body}=task;return api!.actOnOrder(id,warehouseId,body,key);},resource.reload);
 async function act(id:string,action:Action['action']){await command.execute({id,action,delivery_mode:modes[id]??'in_house',note:reason[id]??''});}
 if(demo)return null;
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <Card className="my-5"><h2 className="text-lg font-semibold">{sme?'Your orders · မိမိအော်ဒါများ':'SME delivery requests · လက်ခံရန် အော်ဒါများ'}</h2>{command.error&&<p role="alert">{command.error}</p>}{command.pending&&<Button type="button" disabled={command.busy} onClick={()=>void command.execute()}>Retry same action</Button>}
 {!resource.data.length&&<p className="my-4">No orders yet · အော်ဒါ မရှိသေးပါ</p>}
 {resource.data.map(o=><article key={o.id} className="my-4 space-y-3 rounded border p-4"><h3 className="font-semibold">ORD-{o.id.slice(0,8)} · {human(o.status)}{o.shipment_status?` · ${human(o.shipment_status)}`:''}</h3><p>{dateTime(o.created_at)}</p><p>{o.payload.customer_name} · {o.payload.customer_phone}</p><p>{o.payload.address}</p><p>{o.payload.notes}</p><ul>{o.payload.lines.map(l=><li key={l.product_id}>{l.name??'Product'}{l.sku?` · ${l.sku}`:''} × {l.expected_qty}</li>)}</ul>
 <a className="inline-block min-h-11 text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${o.payload.latitude},${o.payload.longitude}`} target="_blank" rel="noreferrer">Open confirmed customer pin ↗</a>
 {o.payload.maps_url&&googleMapsUrl(o.payload.maps_url)&&<a className="ml-4 inline-block min-h-11 text-brand underline" href={o.payload.maps_url} target="_blank" rel="noreferrer">Customer Maps link ↗</a>}
 {o.note&&<p>Reason: {o.note}</p>}
 {o.shipment_id&&<Link className="block text-brand underline" href={`${sme?'/sme':'/warehouse'}/shipments/${o.shipment_id}`}>View shipment / tracking →</Link>}
 {o.status==='pending'&&<fieldset disabled={command.busy||!!command.pending||!command.ready} className="flex flex-wrap items-end gap-3">{sme?<Button variant="outline" onClick={()=>void act(o.id,'cancel')}>Cancel order · ပယ်ဖျက်မည်</Button>:<><label>Delivery mode<select className="block rounded border p-3" value={modes[o.id]??'in_house'} onChange={e=>setModes(v=>({...v,[o.id]:e.target.value as 'in_house'|'third_party'}))}><option value="in_house">In-house rider</option><option value="third_party">Third-party courier</option></select></label><Button onClick={()=>void act(o.id,'accept')}>Accept & create shipment</Button><label>Rejection reason<Input value={reason[o.id]??''} maxLength={2000} onChange={e=>setReason(v=>({...v,[o.id]:e.target.value}))}/></label><Button variant="outline" disabled={!reason[o.id]?.trim()} onClick={()=>void act(o.id,'reject')}>Reject</Button></>}</fieldset>}
 </article>)}
 </Card>;
}
