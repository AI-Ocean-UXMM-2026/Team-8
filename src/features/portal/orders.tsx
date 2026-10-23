'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {Button,Card,Input} from '../../shared/ui';
import {PageTitle,Loading,ErrorPanel,dateTime,human} from '../warehouse/shared';
import {usePolling} from './polling';
import {DeliveryMap,type MapPoint} from '../tracking/delivery-map';
import {catalogCategories,googleMapsUrl,type CatalogProduct,type OrderInput,type SmeOrder} from '../../shared/api/orders';
import {useCommand} from '../warehouse/command';
import '../tracking/tracking.css';
import './orders.css';

type Place={latitude:number;longitude:number;label:string};
export function SmeOrders(){
 const session=useSession();return <Checkout key={`${session.identity!.actor_id}:${session.warehouseId}:${session.smeId}`}/>;
}
function Checkout(){
 const {api,warehouseId,smeId,identity,demo}=useSession();
 const [step,setStep]=useState(1),[qty,setQty]=useState<Record<string,number>>({}),[basket,setBasket]=useState<Record<string,CatalogProduct>>({});
 const [searchDraft,setSearchDraft]=useState(''),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[inStock,setInStock]=useState(true),[cursor,setCursor]=useState(''),[history,setHistory]=useState<string[]>([]);
 const selectedIds=Object.keys(qty).sort(),selectedKey=selectedIds.join(',');
 const catalog=usePolling(`${warehouseId}:${search}:${category}:${inStock}:${cursor}:${selectedKey}`,signal=>api!.getCatalogPage(warehouseId,{search,category,inStockOnly:inStock,cursor:cursor||undefined,selectedIds,signal}));
 const resource=usePolling(`${warehouseId}:${smeId}`,async signal=>({profile:await api!.getSMEDeliveryProfile(warehouseId,smeId,signal)}));
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[notes,setNotes]=useState('');
 const [point,setPoint]=useState<MapPoint|null>(null),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0),[attempted,setAttempted]=useState(false),[remember,setRemember]=useState(true);
 const [query,setQuery]=useState(''),[submittedQuery,setSubmittedQuery]=useState(''),[searchAttempt,setSearchAttempt]=useState(0),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const prefilled=useRef(false),searchVersion=useRef(0),selectedQuery=useRef(''),completedSearch=useRef('');
 const command=useCommand<OrderInput,SmeOrder>(`${demo?'demo-order-submit':'order-submit'}:${identity!.actor_id}:${warehouseId}:${smeId}`,(body,key)=>api!.submitOrder(body,key),()=>{setQty({});setBasket({});setConfirmed(false);setAttempted(false);setStep(1);setMessage('Order placed. Awaiting warehouse approval.');setRefresh(n=>n+1);resource.reload();catalog.reload();});
 const uncertain=!!command.pending,locked=command.busy||uncertain;
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(searchDraft.trim());setCursor('');setHistory([]);},350);return()=>clearTimeout(timer);},[searchDraft]);
 useEffect(()=>{
  if(!resource.data||!command.ready||prefilled.current)return;
  prefilled.current=true;
  const p=command.pending?.body;
  if(p){setName(p.customer_name);setPhone(p.customer_phone);setAddress(p.address);setNotes(p.notes);setPoint([p.latitude,p.longitude]);return;}
  const profile=resource.data.profile;if(profile){setName(profile.recipient_name);setPhone(profile.recipient_phone);setAddress(profile.address);setNotes(profile.notes);setPoint([profile.latitude,profile.longitude]);setRemember(false);}
 },[resource.data,command.ready,command.pending]);
 useEffect(()=>{
  const version=++searchVersion.current,controller=new AbortController();setPlaces([]);setSearchError('');setSearching(false);
  const searchToken=JSON.stringify([submittedQuery,searchAttempt]);
  if(locked||step!==2||submittedQuery.length<3||submittedQuery===selectedQuery.current||completedSearch.current===searchToken)return()=>controller.abort();
  setSearching(true);const timer=setTimeout(async()=>{
   try{const r=await fetch(`/api/places?q=${encodeURIComponent(submittedQuery)}`,{signal:controller.signal});if(!r.ok)throw new Error();const values:Place[]=await r.json();if(controller.signal.aborted||version!==searchVersion.current)return;
    const results=values.filter(p=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&typeof p.label==='string');completedSearch.current=searchToken;setPlaces(results);if(results.length){setPoint([results[0].latitude,results[0].longitude]);setConfirmed(false);}else setSearchError('No places found. Try another township or landmark, or click the map.');
   }catch{if(!controller.signal.aborted&&version===searchVersion.current)setSearchError('Search unavailable. Click the map to select the delivery location.');}
   finally{if(!controller.signal.aborted&&version===searchVersion.current)setSearching(false);}
  },150);return()=>{clearTimeout(timer);controller.abort();};
 },[submittedQuery,searchAttempt,locked,step]);
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 const cart=selectedIds.map(id=>catalog.data?(catalog.data.selected_items.find(p=>p.id===id)??{...basket[id],id,name:basket[id]?.name??'Unavailable product',available_qty:0}):basket[id]).filter((p):p is CatalogProduct=>!!p);
 const lines=selectedIds.map(id=>({product_id:id,expected_qty:qty[id]}));
 const itemError=(p:CatalogProduct)=>!Number.isSafeInteger(qty[p.id])||qty[p.id]<1?'Enter a whole quantity of 1 or more.':qty[p.id]>p.available_qty?`Only ${p.available_qty} units available. Reduce the quantity or remove this product.`:'';
 const productsError=!lines.length?'Add at least one product to your order.':cart.length!==lines.length||cart.some(p=>itemError(p))?'Update the highlighted product quantities before continuing.':'';
 const errors={name:!name.trim()?'Enter the delivery contact name.':'',phone:phone.trim().length<3?'Enter a phone number with at least 3 characters.':'',address:!address.trim()?'Enter the street address, floor or landmark.':'',location:!point?'Search for a place or click the map to select a delivery location.':!confirmed?'Check the map pin and confirm the delivery location.':''};
 const deliveryValid=!Object.values(errors).some(Boolean),units=selectedIds.reduce((n,id)=>n+(Number.isSafeInteger(qty[id])?Math.max(0,qty[id]):0),0);
 function setAmount(p:CatalogProduct,n:number){setBasket(v=>({...v,[p.id]:p}));setQty(v=>{const next={...v};if(n===0)delete next[p.id];else next[p.id]=n;return next;});}
 function remove(id:string){setQty(v=>{const next={...v};delete next[id];return next;});}
 function choose(p:MapPoint){searchVersion.current++;setSearching(false);setSearchError('');setPlaces([]);setPoint(p);setConfirmed(false);}
 function error(key:keyof typeof errors){return attempted&&errors[key]?<p id={`order-${key}-error`} role="alert" className="mt-1 text-sm text-red-700">{errors[key]}</p>:null;}
 function advance(){setAttempted(true);if(catalog.loading||catalog.error||productsError)return;if(step===1){setStep(2);setAttempted(false);}else if(deliveryValid){setStep(3);setAttempted(false);}}
 async function submit(){if(command.pending){await command.execute();return;}setAttempted(true);if(catalog.loading||catalog.error)return;if(productsError){setStep(1);return;}if(!deliveryValid||!point){setStep(2);return;}
  await command.execute({warehouse_id:warehouseId,sme_id:smeId,customer_name:name.trim(),customer_phone:phone.trim(),address:address.trim(),notes:notes.trim(),maps_url:'',latitude:point[0],longitude:point[1],lines,order_kind:'sme_self_delivery',save_delivery_profile:remember});
 }
 function cartPanel(editable=true){return <section id="order-basket" className="orderBasket" aria-label="Your order"><h2 className="text-lg font-semibold">Your order · {selectedIds.length} products</h2>{!cart.length&&<p className="my-3">Your order is empty. Add products from the catalogue.</p>}{cart.map(p=><article className="orderBasketItem" key={p.id}><strong data-user-content>{p.name}</strong><p className="text-sm" data-user-content>{p.sku}</p>{editable?<><div className="orderQuantity"><Button type="button" variant="outline" aria-label={`Decrease ${p.name}`} disabled={locked} onClick={()=>setAmount(p,Math.max(0,qty[p.id]-1))}>−</Button><Input aria-label={`Quantity for ${p.name}`} inputMode="numeric" type="number" min={1} max={p.available_qty} step={1} value={qty[p.id]} disabled={locked} aria-invalid={!!itemError(p)} onChange={e=>setAmount(p,Number(e.target.value))}/><Button type="button" variant="outline" aria-label={`Increase ${p.name}`} disabled={locked||qty[p.id]>=p.available_qty} onClick={()=>setAmount(p,qty[p.id]+1)}>+</Button></div><Button type="button" variant="outline" disabled={locked} onClick={()=>remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</Button></>:<p>Quantity: {qty[p.id]}</p>}{itemError(p)&&<p role="alert" className="text-sm text-red-700">{itemError(p)}</p>}</article>)}<p className="mt-4 font-semibold">{units} units total</p><p className="text-sm text-muted">Availability is checked again when you place the order.</p></section>;}
 return <><PageTitle title="Order warehouse stock" my="ပို့ဆောင်ရန် အော်ဒါများ" description="Choose products, confirm delivery details and place your order."/>
 {message&&<Card className="mb-5"><p role="status">{message}</p>{command.result&&<><p>ORD-{command.result.id.slice(0,8)}</p><a className="text-brand underline" href={`#order-${command.result.id}`}>View order status and tracking below →</a></>}</Card>}
 <Card>{demo&&<p className="mb-4 text-sm">Demo orders stay in this browser session. No real delivery is requested.</p>}
 <nav aria-label="Order steps"><ol className="orderSteps">{['Products','Delivery','Confirm'].map((label,i)=><li key={label}><button type="button" aria-current={step===i+1?'step':undefined} disabled={locked||i+1>step} onClick={()=>{setStep(i+1);setAttempted(false);}}>{i+1}. {label}</button></li>)}</ol></nav>
 {uncertain?<section className="my-5 rounded border p-4"><h2 className="font-semibold">Submission awaiting confirmation</h2><p data-user-content>{command.pending!.body.customer_name} · {command.pending!.body.address}</p><ul>{command.pending!.body.lines.map(l=><li key={l.product_id}>{l.name??l.product_id} × {l.expected_qty}</li>)}</ul><p>Retry the saved order to confirm its outcome. Do not create another order.</p><Button disabled={command.busy} onClick={()=>void submit()}>Retry same order</Button></section>:<>
 {step===1&&<div className="orderCatalogLayout"><section aria-label="Product catalogue"><h2 className="text-lg font-semibold">Choose products</h2><div className="orderCatalogFilters"><label>Search products<Input type="search" placeholder="Product name or SKU" value={searchDraft} maxLength={200} onChange={e=>setSearchDraft(e.target.value)}/></label><label>Category<select aria-label="Category" className="field" value={category} onChange={e=>{setCategory(e.target.value);setCursor('');setHistory([]);}}><option value="">All categories</option>{Object.entries(catalogCategories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="flex items-center gap-2"><input type="checkbox" checked={inStock} onChange={e=>{setInStock(e.target.checked);setCursor('');setHistory([]);}}/>In-stock only</label></div>
 {catalog.error?<ErrorPanel error={catalog.error} retry={()=>{if(cursor){setCursor('');setHistory([]);}else catalog.reload();}}/>:!catalog.data?<Loading/>:<><p role="status" className="my-3 text-sm">{catalog.data.total} matching products</p>{!catalog.data.items.length&&<p className="my-4">No products match these filters. Clear search/category or ask the warehouse to add common stock.</p>}<div className="orderProductGrid">{catalog.data.items.map(p=><article className="orderProductCard" key={p.id}><h3 className="font-semibold" data-user-content>{p.name}</h3><p className="text-sm" data-user-content>{p.sku}</p><p className="text-sm">{catalogCategories[p.category]}</p><p className="my-2">Available: {p.available_qty}</p>{qty[p.id]!==undefined&&<p className="text-sm">In your order: {qty[p.id]}</p>}<Button type="button" disabled={locked||p.available_qty<1||(qty[p.id]??0)>=p.available_qty||selectedIds.length>=100&&qty[p.id]===undefined} onClick={()=>setAmount(p,(qty[p.id]??0)+1)}>{qty[p.id]===undefined?'Add':'Add another'}</Button></article>)}</div><div className="orderActions">{history.length>0&&<Button variant="outline" onClick={()=>{setCursor(history.at(-1)!);setHistory(v=>v.slice(0,-1));}}>Previous products</Button>}{catalog.data.next_cursor&&<Button variant="outline" onClick={()=>{setHistory(v=>[...v,cursor]);setCursor(catalog.data!.next_cursor!);}}>Next products</Button>}</div></>}
 <p className="mt-3 text-sm text-muted">Categories come from warehouse verification. Unverified products appear under Uncategorized.</p></section>{cartPanel()}
 </div>}
 {step===2&&<section aria-label="Delivery details"><h2 className="text-lg font-semibold">Delivery details</h2><fieldset disabled={locked} className="my-4 space-y-4"><label className="block">Name<Input required maxLength={120} value={name} aria-invalid={attempted&&!!errors.name} aria-describedby={attempted&&errors.name?'order-name-error':undefined} onChange={e=>setName(e.target.value)}/>{error('name')}</label><label className="block">Phone<Input required type="tel" maxLength={40} value={phone} aria-invalid={attempted&&!!errors.phone} aria-describedby={attempted&&errors.phone?'order-phone-error':undefined} onChange={e=>setPhone(e.target.value)}/>{error('phone')}</label><label className="block">Address, floor and landmark<Input required maxLength={500} value={address} aria-invalid={attempted&&!!errors.address} aria-describedby={attempted&&errors.address?'order-address-error':undefined} onChange={e=>{setAddress(e.target.value);setConfirmed(false);}}/>{error('address')}</label>
 <label className="block">Search place or township<Input value={query} maxLength={200} placeholder="Type a place, township or landmark" onChange={e=>{searchVersion.current++;setSearching(false);setPlaces([]);setQuery(e.target.value);setPoint(null);setConfirmed(false);}} onBlur={()=>setSubmittedQuery(query.trim())} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSubmittedQuery(query.trim());setSearchAttempt(n=>n+1);}}}/></label><p className="text-sm text-muted">Type at least 3 characters, then press Enter or leave the field. Check the result on the map.</p>{searching&&<p role="status">Finding locations…</p>}{searchError&&<p role="alert" className="text-red-700">{searchError}</p>}{places.map((p,i)=><button key={i} type="button" className="block w-full rounded border p-3 text-left" onClick={()=>{selectedQuery.current=p.label;choose([p.latitude,p.longitude]);setQuery(p.label);}}>{p.label}</button>)}</fieldset>
 <DeliveryMap destination={point} onDestination={locked?undefined:choose}/>{point&&<label className="my-4 flex gap-3"><input aria-label="Confirm SME delivery pin" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>This map pin matches my delivery address.</label>}{error('location')}
 <label className="my-4 block">Delivery instructions (optional)<Input maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><label className="my-4 flex gap-3"><input aria-label="Save address for future orders" type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Save this address when I place the order</label></section>}
 {step===3&&<section aria-label="Confirm order"><h2 className="text-lg font-semibold">Confirm your order</h2>{cartPanel(false)}<h3 className="mt-5 font-semibold">Deliver to</h3><p data-user-content>{name} · {phone}</p><p data-user-content>{address}</p><p data-user-content>{notes}</p>{point&&<a className="text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${point[0]},${point[1]}`}>Check delivery pin ↗</a>}<p className="my-4">Stock will be reserved. Your order requires warehouse approval. Track progress in Your orders below.</p></section>}
 {attempted&&productsError&&<p role="alert" className="my-3 text-red-700">{productsError}</p>}{catalog.error&&step!==1&&<p role="alert" className="my-3 text-red-700">Stock availability could not be checked. Return to Products and retry.</p>}
 <div className="orderActions">{step>1&&<Button type="button" variant="outline" disabled={command.busy} onClick={()=>{setStep(v=>v-1);setAttempted(false);}}>Back</Button>}{step<3?<Button type="button" disabled={command.busy||catalog.loading||!!catalog.error} onClick={advance}>{step===1?'Continue to delivery':'Continue to confirmation'}</Button>:<Button type="button" disabled={command.busy||catalog.loading||!!catalog.error||!command.ready} onClick={()=>void submit()}>{command.busy?'Placing order…':'Place order'}</Button>}</div>
 {step===1&&selectedIds.length>0&&<a className="orderMobileCart" href="#order-basket">View order · {selectedIds.length} products · {units} units</a>}
 </>}{command.error&&<p role="alert" className="mt-3 text-red-700">{command.error}</p>}</Card><OrderList key={refresh} sme/>
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
 {resource.data.map(o=><article id={`order-${o.id}`} key={o.id} className="my-4 space-y-3 rounded border p-4"><h3 className="font-semibold">ORD-{o.id.slice(0,8)} · {human(o.status)}{o.shipment_status?` · ${human(o.shipment_status)}`:''}</h3><p>{dateTime(o.created_at)}</p><p data-user-content>{o.payload.customer_name} · {o.payload.customer_phone}</p><p data-user-content>{o.payload.address}</p><p data-user-content>{o.payload.notes}</p><ul>{o.payload.lines.map(l=><li data-user-content key={l.product_id}>{l.name??'Product'}{l.sku?` · ${l.sku}`:''} × {l.expected_qty}</li>)}</ul>
 <a className="inline-block min-h-11 text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${o.payload.latitude},${o.payload.longitude}`} target="_blank" rel="noreferrer">Open SME delivery pin ↗</a>
 {o.payload.maps_url&&googleMapsUrl(o.payload.maps_url)&&<a className="ml-4 inline-block min-h-11 text-brand underline" href={o.payload.maps_url} target="_blank" rel="noreferrer">SME Maps link ↗</a>}
 {o.note&&<p>Reason: <span data-user-content>{o.note}</span></p>}
 {sme&&<p role="status">{o.status==='pending'?'Awaiting warehouse approval. Tracking will appear after approval.':o.status==='rejected'?'Order rejected; no delivery is scheduled.':o.status==='cancelled'?'Order cancelled; no delivery is scheduled.':o.shipment_status?`Delivery status: ${human(o.shipment_status)}`:'Approved; preparing your delivery.'}</p>}
 {o.shipment_id&&<Link className="block text-brand underline" href={demo?(sme?'/demo/sme/tracking':`/demo/warehouse/shipments/${o.shipment_id}`):`${sme?'/sme':'/warehouse'}/shipments/${o.shipment_id}`}>View shipment / tracking →</Link>}
 {o.status==='pending'&&<fieldset disabled={command.busy||!!command.pending||!command.ready} className="flex flex-wrap items-end gap-3">{sme?<Button variant="outline" onClick={()=>void act(o.id,'cancel')}>Cancel order</Button>:<><label>Delivery mode<select className="block rounded border p-3" value={modes[o.id]??'in_house'} onChange={e=>setModes(v=>({...v,[o.id]:e.target.value as 'in_house'|'third_party'}))}><option value="in_house">In-house rider</option><option value="third_party">Third-party courier</option></select></label><Button onClick={()=>void act(o.id,'accept')}>Accept & create shipment</Button><label>Rejection reason<Input value={reason[o.id]??''} maxLength={2000} onChange={e=>setReason(v=>({...v,[o.id]:e.target.value}))}/></label><Button variant="outline" disabled={!reason[o.id]?.trim()} onClick={()=>void act(o.id,'reject')}>Reject</Button></>}</fieldset>}
 </article>)}
 </Card>;
}
