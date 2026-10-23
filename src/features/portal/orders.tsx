'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {Button,Card,Input} from '../../shared/ui';
import {PageTitle,Loading,ErrorPanel,dateTime,human} from '../warehouse/shared';
import {usePolling} from './polling';
import {DeliveryMap,type MapPoint} from '../tracking/delivery-map';
import {releaseTiming,catalogCategories,googleMapsUrl,type DeliveryProfile,type CatalogProduct,type OrderInput,type SmeOrder} from '../../shared/api/orders';
import {useCommand} from '../warehouse/command';
import {
  CheckIcon,
  ReceiptIcon,
  PhoneIcon,
  CalendarBlankIcon,
  MapPinIcon,
  TruckIcon,
  ArrowUpRightIcon,
  PackageIcon,
  ClockIcon,
  StorefrontIcon,
  UserCircleIcon,
  CaretRightIcon,
  XIcon,
} from '@phosphor-icons/react';
import {Dialog} from '@base-ui/react/dialog';
import {ShipmentStatus} from '../warehouse/shipment-status';
import {useMyanmar} from '../../shared/layout/account-menu';
import '../tracking/tracking.css';
import './orders.css';

const orderStepConfig = [
  { num: '01', title: 'Products', subtitle: 'Choose items', mySubtitle: 'ပစ္စည်းများ ရွေးချယ်ရန်' },
  { num: '02', title: 'Review & submit', subtitle: 'Review & submit', mySubtitle: 'စစ်ဆေးပြီး အတည်ပြုရန်' },
];

type Place={latitude:number;longitude:number;label:string};
export function SmeOrders(){
 const session=useSession();return <Checkout key={`${session.identity!.actor_id}:${session.warehouseId}:${session.smeId}`}/>;
}
function Checkout(){
 const my=useMyanmar();
 const {api,warehouseId,smeId,identity,demo}=useSession();
 const [deadline,setDeadline]=useState('');
 const [step,setStep]=useState(1),[qty,setQty]=useState<Record<string,number>>({}),[basket,setBasket]=useState<Record<string,CatalogProduct>>({});
 const [searchDraft,setSearchDraft]=useState(''),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[cursor,setCursor]=useState(''),[history,setHistory]=useState<string[]>([]);
 const [addQty,setAddQty]=useState<Record<string,string>>({});
 const selectedIds=Object.keys(qty).sort(),selectedKey=selectedIds.join(',');
 const catalog=usePolling(`${warehouseId}:${search}:${category}:${cursor}:${selectedKey}`,signal=>api!.getCatalogPage(warehouseId,{smeId,search,category,inStockOnly:true,cursor:cursor||undefined,selectedIds,signal}));
 const resource=usePolling(`${warehouseId}:${smeId}`,async signal=>({profile:await api!.getSMEDeliveryProfile(warehouseId,smeId,signal)}));
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[notes,setNotes]=useState('');
 const [point,setPoint]=useState<MapPoint|null>(null),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[attempted,setAttempted]=useState(false);
 const [query,setQuery]=useState(''),[submittedQuery,setSubmittedQuery]=useState(''),[searchAttempt,setSearchAttempt]=useState(0),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const [savedLocation,setSavedLocation]=useState<DeliveryProfile|null>(null),[editingLocation,setEditingLocation]=useState(false),[locationSaving,setLocationSaving]=useState(false),[locationError,setLocationError]=useState('');
 const prefilled=useRef(false),searchVersion=useRef(0),selectedQuery=useRef(''),completedSearch=useRef('');
 const command=useCommand<OrderInput,SmeOrder>(`${demo?'demo-order-submit':'order-submit'}:${identity!.actor_id}:${warehouseId}:${smeId}`,(body,key)=>api!.submitOrder(body,key),()=>{prefilled.current=false;setEditingLocation(false);setQty({});setBasket({});setAttempted(false);setStep(1);setMessage('Release request saved. Check Request history for reservation and dispatch status.');resource.reload();catalog.reload();});
 const uncertain=!!command.pending,locked=command.busy||uncertain||locationSaving;
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(searchDraft.trim());setCursor('');setHistory([]);},350);return()=>clearTimeout(timer);},[searchDraft]);
 useEffect(()=>{
  if(!resource.data||!command.ready||prefilled.current)return;
  prefilled.current=true;
  const p=command.pending?.body;
  if(p){setDeadline(p.delivery_due_at?new Date(Date.parse(p.delivery_due_at)-new Date(p.delivery_due_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'');setName(p.customer_name);setPhone(p.customer_phone);setAddress(p.address);setNotes(p.notes);setPoint([p.latitude,p.longitude]);return;}
  const profile=resource.data.profile;if(profile){setName(profile.recipient_name);setPhone(profile.recipient_phone);setAddress(profile.address);setNotes(profile.notes);setPoint([profile.latitude,profile.longitude]);setConfirmed(true);setSavedLocation(profile);}else setEditingLocation(true);
 },[resource.data,command.ready,command.pending]);
 useEffect(()=>{
  const version=++searchVersion.current,controller=new AbortController();setPlaces([]);setSearchError('');setSearching(false);
  const searchToken=JSON.stringify([submittedQuery,searchAttempt]);
  if(locked||!editingLocation||step!==2||submittedQuery.length<3||submittedQuery===selectedQuery.current||completedSearch.current===searchToken)return()=>controller.abort();
  setSearching(true);const timer=setTimeout(async()=>{
   try{const r=await fetch(`/api/places?q=${encodeURIComponent(submittedQuery)}`,{signal:controller.signal});if(!r.ok)throw new Error();const values:Place[]=await r.json();if(controller.signal.aborted||version!==searchVersion.current)return;
    const results=values.filter(p=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&typeof p.label==='string');completedSearch.current=searchToken;setPlaces(results);if(results.length){setPoint([results[0].latitude,results[0].longitude]);setConfirmed(false);}else setSearchError('No places found. Try another township or landmark, or click the map.');
   }catch{if(!controller.signal.aborted&&version===searchVersion.current)setSearchError('Search unavailable. Click the map to select the delivery location.');}
   finally{if(!controller.signal.aborted&&version===searchVersion.current)setSearching(false);}
  },150);return()=>{clearTimeout(timer);controller.abort();};
 },[submittedQuery,searchAttempt,locked,step,editingLocation]);
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 const cart=selectedIds.map(id=>catalog.data?(catalog.data.selected_items.find(p=>p.id===id)??{...basket[id],id,name:basket[id]?.name??'Unavailable product',available_qty:0}):basket[id]).filter((p):p is CatalogProduct=>!!p);
 const lines=selectedIds.map(id=>({product_id:id,expected_qty:qty[id]}));
 const itemError=(p:CatalogProduct)=>!Number.isSafeInteger(qty[p.id])||qty[p.id]<1?'Enter a whole quantity of 1 or more.':qty[p.id]>p.available_qty?`Only ${p.available_qty} units available. Reduce the quantity or remove this product.`:'';
 const productsError=!lines.length?'Add at least one product to your release request.':cart.length!==lines.length||cart.some(p=>itemError(p))?'Update the highlighted product quantities before continuing.':'';
 const deadlineError=!deadline?'Choose when delivery must reach your SME.':!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=Date.now()||Date.parse(deadline)>Date.now()+30*86400000?'Choose a future delivery deadline within 30 days.':'';
 const errors={name:!name.trim()?'Enter the SME location contact name.':'',phone:phone.trim().length<3?'Enter a phone number with at least 3 characters.':'',address:!address.trim()?'Enter the SME location address, floor or landmark.':'',location:!point?'Search for a place or click the map to select a delivery location.':!confirmed?'Check the map pin and confirm the delivery location.':''};
 const deliveryValid=!Object.values(errors).some(Boolean),units=selectedIds.reduce((n,id)=>n+(Number.isSafeInteger(qty[id])?Math.max(0,qty[id]):0),0);
 function setAmount(p:CatalogProduct,n:number){setBasket(v=>({...v,[p.id]:p}));setQty(v=>{const next={...v};if(n===0)delete next[p.id];else next[p.id]=n;return next;});}
 function remove(id:string){setQty(v=>{const next={...v};delete next[id];return next;});}
 function choose(p:MapPoint){searchVersion.current++;setSearching(false);setSearchError('');setPlaces([]);setPoint(p);setConfirmed(false);}
 function error(key:keyof typeof errors){return attempted&&errors[key]?<p id={`order-${key}-error`} role="alert" className="mt-1 text-sm text-red-700">{errors[key]}</p>:null;}
 function advance(){setAttempted(true);if(catalog.loading||catalog.error||productsError)return;setStep(2);setAttempted(false);}
 async function submit(){if(command.pending){await command.execute();return;}setAttempted(true);if(catalog.loading||catalog.error)return;if(productsError){setStep(1);return;}if(deadlineError)return;if(!deliveryValid||!point||!savedLocation||editingLocation){setStep(2);setEditingLocation(true);return;}
  await command.execute({delivery_due_at:new Date(deadline).toISOString(),warehouse_id:warehouseId,sme_id:smeId,customer_name:name.trim(),customer_phone:phone.trim(),address:address.trim(),notes:notes.trim(),maps_url:'',latitude:point[0],longitude:point[1],lines,order_kind:'sme_self_delivery',save_delivery_profile:false});
 }
 async function saveLocation(){
  setAttempted(true);if(!deliveryValid||!point)return;setLocationSaving(true);setLocationError('');
  try{const profile=await api!.saveSMEDeliveryProfile(warehouseId,smeId,{recipient_name:name.trim(),recipient_phone:phone.trim(),address:address.trim(),latitude:point[0],longitude:point[1],notes:notes.trim(),maps_url:''});setSavedLocation(profile);setName(profile.recipient_name);setPhone(profile.recipient_phone);setAddress(profile.address);setNotes(profile.notes);setPoint([profile.latitude,profile.longitude]);setConfirmed(true);setEditingLocation(false);setAttempted(false);resource.reload();}
  catch{setLocationError('Unable to save the SME location. Please try again.');}finally{setLocationSaving(false);}
 }
 function cancelLocationEdit(){if(!savedLocation)return;setName(savedLocation.recipient_name);setPhone(savedLocation.recipient_phone);setAddress(savedLocation.address);setNotes(savedLocation.notes);setPoint([savedLocation.latitude,savedLocation.longitude]);setConfirmed(true);setEditingLocation(false);setAttempted(false);setLocationError('');}
 function cartPanel(editable=true){return <section id="order-basket" className="orderBasket" aria-label="Your release request"><h2 className="orderBasketTitle">Your release request</h2><p className="orderBasketCount">{selectedIds.length} {selectedIds.length===1?'product':'products'} · {units} units total</p>{!cart.length&&<p className="my-3">Your release request is empty. Add products from the catalogue.</p>}{cart.map(p=><article className="orderBasketItem" key={p.id}><div className="orderBasketItemMain"><strong className="orderBasketItemName" data-user-content>{p.name}</strong>{editable&&<button type="button" className="orderBasketRemove" disabled={locked} aria-label={`Remove ${p.name}`} onClick={()=>remove(p.id)}>Remove</button>}</div><p className="orderBasketItemSku" data-user-content>{p.sku}</p>{editable?<label className="orderQuantity"><span>Requested qty</span><Input aria-label={`Quantity for ${p.name}`} className="orderQtyInput" inputMode="numeric" type="number" min={1} max={p.available_qty} step={1} value={qty[p.id]} disabled={locked} aria-invalid={!!itemError(p)} onChange={e=>setAmount(p,Number(e.target.value))}/><small className="orderStockHint" data-user-content>of {p.available_qty} available</small></label>:<p className="orderQuantity"><span>Requested qty</span><strong data-user-content>{qty[p.id]}</strong></p>}{itemError(p)&&<p role="alert" className="orderBasketError">{itemError(p)}</p>}</article>)}{cart.length>0&&<p className="orderBasketNote">Availability is checked again when you submit the release request.</p>}</section>;}
 return <><PageTitle title="Request stock release" my="ကုန်ထုတ်ပေးရန် တောင်းဆိုမှုများ" description="Select your SME-owned stock and request delivery to your SME location."/>
 {message&&<Card className="mb-5"><p role="status">{message}</p>{command.result&&<><p>ORD-{command.result.id.slice(0,8)}</p><a className="text-brand underline" href={`${demo?'/demo/sme':'/sme'}/orders/history#order-${command.result.id}`}>View request status and tracking in request history →</a></>}</Card>}
 <Card>{demo&&<p className="mb-4 text-sm">Demo release requests stay in this browser session. No real stock is released.</p>}
 <nav aria-label="Order steps" className="orderStepperNav">
  <ol className="orderStepper">
   {orderStepConfig.map((s,i)=>{
    const stepNum=i+1,isCompleted=step>stepNum,isActive=step===stepNum,canClick=!locked&&stepNum<=step;
    const status=isCompleted?'completed':isActive?'active':'pending';
    return (
     <li key={s.num} className="orderStepperItem" data-status={status}>
      {i>0&&<span className="orderStepperLine" data-filled={step>=stepNum?'true':'false'} aria-hidden="true"/>}
      <button type="button" className="orderStepperBtn" disabled={!canClick} aria-current={isActive?'step':undefined} onClick={()=>{if(canClick){setStep(stepNum);setAttempted(false);}}}>
       <span className="orderStepperCircle" aria-hidden="true">{isCompleted?<CheckIcon size={18} weight="bold"/>:<span>{s.num}</span>}</span>
       <span className="orderStepperInfo"><strong className="orderStepperTitle">{s.title}</strong><small className="orderStepperSubtitle">{my?s.mySubtitle:s.subtitle}</small></span>
      </button>
     </li>
    );
   })}
  </ol>
 </nav>
 {uncertain?<section className="my-5 rounded border p-4"><h2 className="font-semibold">Submission awaiting confirmation</h2><p data-user-content>{command.pending!.body.customer_name} · {command.pending!.body.address}</p><ul>{command.pending!.body.lines.map(l=><li key={l.product_id}>{l.name??l.product_id} × {l.expected_qty}</li>)}</ul><p>Retry the saved request to confirm its outcome. Do not submit another request.</p><Button disabled={command.busy} onClick={()=>void submit()}>Retry same request</Button></section>:<>
 {step===1&&<div className="orderCatalogLayout"><section aria-label="Product catalogue"><h2 className="text-lg font-semibold">Choose products</h2><div className="orderCatalogFilters"><label>Search products<Input type="search" placeholder="Product name or SKU" value={searchDraft} maxLength={200} onChange={e=>setSearchDraft(e.target.value)}/></label>{(catalog.data?.categories.length??0)>1&&<label>Category<select aria-label="Category" className="field" value={category} onChange={e=>{setCategory(e.target.value);setCursor('');setHistory([]);}}><option value="">All categories</option>{catalog.data!.categories.map(id=><option key={id} value={id}>{catalogCategories[id]}</option>)}</select></label>}</div>
 {catalog.error?<ErrorPanel error={catalog.error} retry={()=>{if(cursor){setCursor('');setHistory([]);}else catalog.reload();}}/>:!catalog.data?<Loading/>:<><p role="status" className="my-3 text-sm">{catalog.data.total} matching products</p>{!catalog.data.items.length&&<p className="my-4">No products match these filters. Clear search/category or ask the warehouse to receive your supplier stock under your SME.</p>}<div className="releaseCatalogScroll" tabIndex={0} aria-label="Available products table"><table className="releaseCatalogTable"><caption className="sr-only">Your SME-owned stock available for release</caption><thead><tr><th scope="col">Product / SKU</th><th scope="col">Available to release</th><th scope="col">Quantity to add</th><th scope="col"><span className="sr-only">Add to request</span></th></tr></thead><tbody>{catalog.data.items.map(p=>{
 const remaining=Math.max(0,p.available_qty-(qty[p.id]??0)),value=addQty[p.id]??'1',amount=Number(value),invalid=!value.trim()||!Number.isSafeInteger(amount)||amount<1||amount>remaining;
 return <tr key={p.id}><td><strong data-user-content>{p.name}</strong><span className="releaseCatalogSku" data-user-content>{p.sku}</span></td><td>{p.available_qty}</td><td><Input type="number" inputMode="numeric" min={1} max={remaining} step={1} value={value} disabled={locked||remaining===0} aria-label={`Quantity to add for ${p.name}`} aria-invalid={remaining>0&&invalid} aria-describedby={`add-quantity-${p.id}`} onChange={e=>setAddQty(v=>({...v,[p.id]:e.target.value}))}/><small id={`add-quantity-${p.id}`}>{remaining===0?'All available units selected':invalid?`Enter a whole quantity from 1 to ${remaining}.`:qty[p.id]?`${qty[p.id]} units in request`:''}</small></td><td><Button disabled={locked||invalid||remaining===0||(selectedIds.length>=100&&qty[p.id]===undefined)} aria-label={`Add ${p.name}`} onClick={()=>{setAmount(p,(qty[p.id]??0)+amount);setAddQty(v=>({...v,[p.id]:'1'}));}}>Add</Button></td></tr>;
 })}</tbody></table></div><div className="orderActions">{history.length>0&&<Button variant="outline" onClick={()=>{setCursor(history.at(-1)!);setHistory(v=>v.slice(0,-1));}}>Previous products</Button>}{catalog.data.next_cursor&&<Button variant="outline" onClick={()=>{setHistory(v=>[...v,cursor]);setCursor(catalog.data!.next_cursor!);}}>Next products</Button>}</div></>}
 </section>{cartPanel()}
 </div>}
 {step===2&&editingLocation&&<section aria-label="SME location setup"><h2 className="text-lg font-semibold">{savedLocation?'Edit SME location':'Set up your SME location'}</h2><p className="my-3 text-sm">Save once. Future release requests use this SME location and contact automatically.</p><fieldset disabled={locked} className="my-4 space-y-4"><label className="block">SME contact name<Input required maxLength={120} value={name} aria-invalid={attempted&&!!errors.name} aria-describedby={attempted&&errors.name?'order-name-error':undefined} onChange={e=>setName(e.target.value)}/>{error('name')}</label><label className="block">SME contact phone<Input required type="tel" maxLength={40} value={phone} aria-invalid={attempted&&!!errors.phone} aria-describedby={attempted&&errors.phone?'order-phone-error':undefined} onChange={e=>setPhone(e.target.value)}/>{error('phone')}</label><label className="block">SME location address, floor and landmark<Input required maxLength={500} value={address} aria-invalid={attempted&&!!errors.address} aria-describedby={attempted&&errors.address?'order-address-error':undefined} onChange={e=>{setAddress(e.target.value);setConfirmed(false);}}/>{error('address')}</label>
 <label className="block">Search place or township<Input value={query} maxLength={200} placeholder="Type a place, township or landmark" onChange={e=>{searchVersion.current++;setSearching(false);setPlaces([]);setQuery(e.target.value);setPoint(null);setConfirmed(false);}} onBlur={()=>setSubmittedQuery(query.trim())} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSubmittedQuery(query.trim());setSearchAttempt(n=>n+1);}}}/></label><p className="text-sm text-muted">Type at least 3 characters, then press Enter or leave the field. Check the result on the map.</p>{searching&&<p role="status">Finding locations…</p>}{searchError&&<p role="alert" className="text-red-700">{searchError}</p>}{places.map((p,i)=><button key={i} type="button" className="block w-full rounded border p-3 text-left" onClick={()=>{selectedQuery.current=p.label;choose([p.latitude,p.longitude]);setQuery(p.label);}}>{p.label}</button>)}</fieldset>
 <DeliveryMap destination={point} onDestination={locked?undefined:choose}/>{point&&<label className="my-4 flex gap-3"><input aria-label="Confirm SME delivery pin" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>This map pin matches my delivery address.</label>}{error('location')}
 <label className="my-4 block">Delivery instructions (optional)<Input maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="orderActions"><Button disabled={locked} onClick={()=>void saveLocation()}>{locationSaving?'Saving location…':'Save SME location'}</Button>{savedLocation&&<Button variant="outline" disabled={locked} onClick={cancelLocationEdit}>Cancel location edit</Button>}</div>{locationError&&<p role="alert" className="text-red-700">{locationError}</p>}</section>}
 {step===2&&!editingLocation&&<section aria-label="Confirm release request"><h2 className="text-lg font-semibold">Confirm your release request</h2><label className="my-4 block">Deliver to SME by<Input type="datetime-local" value={deadline} disabled={locked} aria-invalid={attempted&&!!deadlineError} aria-describedby="release-deadline-help" onChange={e=>setDeadline(e.target.value)}/></label><p id="release-deadline-help" className="text-sm">Your local time. Within 72 hours: Urgent. More than 72 hours: Can wait. Maximum 30 days.</p>{attempted&&deadlineError&&<p role="alert" className="text-red-700">{deadlineError}</p>}{cartPanel(false)}<h3 className="mt-5 font-semibold">Saved SME location</h3><Button variant="outline" disabled={locked} onClick={()=>{setEditingLocation(true);setAttempted(false);}}>Edit SME location</Button><p data-user-content>{name} · {phone}</p><p data-user-content>{address}</p><p data-user-content>{notes}</p>{point&&<a className="text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${point[0]},${point[1]}`}>Check delivery pin ↗</a>}<p className="my-4">Stock will be reserved and the request accepted automatically. Staff will prepare and dispatch it. Track progress in Request history.</p></section>}
 {attempted&&productsError&&<p role="alert" className="my-3 text-red-700">{productsError}</p>}{catalog.error&&step!==1&&<p role="alert" className="my-3 text-red-700">Stock availability could not be checked. Return to Products and retry.</p>}
 <div className="orderActions">{step>1&&<Button type="button" variant="outline" disabled={command.busy} onClick={()=>{setStep(v=>v-1);setAttempted(false);}}>Back</Button>}{step===1?<Button type="button" disabled={command.busy||catalog.loading||!!catalog.error} onClick={advance}>Review release request</Button>:<Button type="button" disabled={locked||editingLocation||!savedLocation||catalog.loading||!!catalog.error||!command.ready} onClick={()=>void submit()}>{command.busy?'Submitting request…':'Submit release request'}</Button>}</div>
 {step===1&&selectedIds.length>0&&<a className="orderMobileCart" href="#order-basket">View request · {selectedIds.length} products · {units} units</a>}
 </>}{command.error&&<p role="alert" className="mt-3 text-red-700">{command.error}</p>}</Card>
 </>;
}

export function SmeOrderHistory(){
  return <><PageTitle title="Stock Release Request History" my="စတော့ ထုတ်ပေးရေး တောင်းဆိုမှု မှတ်တမ်း" description="Follow the preparation and delivery progress of your stock release requests."/><OrderList sme/></>;
}

function OrderTimeline({order}:{order:SmeOrder}){
 const stopped=order.status==='rejected'||order.status==='cancelled';
 const approved=order.status==='accepted';
 const delivered=approved&&order.shipment_status==='delivered';
 const transit=approved&&(['in_transit','out_for_delivery','delivered'].includes(order.shipment_status??''));
 const stages=[{label:'Request submitted',done:true},{label:'Stock reserved',done:approved},{label:'In transit',done:transit},{label:'Delivered',done:delivered}];
 const next=stopped?-1:stages.findIndex(stage=>!stage.done);
 return <ol className="orderTimeline" aria-label="Release request progress">{stages.map((stage,i)=><li key={stage.label} data-complete={stage.done} aria-current={i===next?'step':undefined}><span className="orderTimelineMarker" aria-hidden="true">{stage.done?'✓':''}</span><span>{stage.label}<span className="sr-only">{stage.done?' — completed':stopped?' — not completed':i===next?' — awaiting completion':' — upcoming'}</span></span></li>)}{stopped&&<li className="orderTimelineStopped"><span className="orderTimelineMarker" aria-hidden="true">×</span><span>{order.status==='rejected'?'Release request rejected':'Release request cancelled'}</span></li>}</ol>;
}

const SME_OWNERS: Record<string, { name: string; owner: string }> = {
  '10000000-0000-4000-8000-000000000002': { name: 'Golden Bloom', owner: 'Thiri Hnin' },
  '10000000-0000-4000-8000-000000000003': { name: 'Lotus Trading', owner: 'U Min Din' },
  '20000000-0000-4000-8000-000000000001': { name: 'Golden Bloom', owner: 'Thiri Hnin' },
};

export function OrderList({sme=false,onChanged}:{sme?:boolean;onChanged?:()=>void}){
  const {api,warehouseId,smeId,demo,identity}=useSession();
  const resource=usePolling(`${warehouseId}:${sme?smeId:'staff'}`,signal=>api!.listOrders(warehouseId,sme?smeId:undefined,signal));
  const [reason,setReason]=useState<Record<string,string>>({}),[modes,setModes]=useState<Record<string,'in_house'|'third_party'>>({});
  const [directorySmes, setDirectorySmes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (sme || !api || !warehouseId) return;
    const ctrl = new AbortController();
    api.getWarehouseDirectory(warehouseId, ctrl.signal).then(dir => {
      const map: Record<string, string> = {};
      dir.smes?.forEach(s => { map[s.id] = s.name; });
      setDirectorySmes(map);
    }).catch(() => {});
    return () => ctrl.abort();
  }, [api, warehouseId, sme]);

  type Action={id:string;action:'accept'|'reject'|'cancel';delivery_mode:'in_house'|'third_party';note:string};
  const command=useCommand<Action,unknown>(`order-action:${identity!.actor_id}:${warehouseId}:${sme?smeId:'staff'}`,(task,key)=>{const {id,...body}=task;return api!.actOnOrder(id,warehouseId,body,key);},()=>{resource.reload();onChanged?.();});
  async function act(id:string,action:Action['action']){await command.execute({id,action,delivery_mode:modes[id]??'in_house',note:reason[id]??''});}
  const [openId,setOpenId]=useState<string|null>(null);
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),15000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const fromHash=()=>{const id=window.location.hash.replace(/^#order-/,'');if(id)setOpenId(id);};
    fromHash();window.addEventListener('hashchange',fromHash);
    return()=>window.removeEventListener('hashchange',fromHash);
  },[]);

  if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return <Loading/>;
  const orders=resource.data;
  const open=openId?resource.data.find(o=>o.id===openId):null;

  if(!sme) {
    return (
      <Card className="my-5">
        <h2 className="text-lg font-semibold">Stock release requests</h2>
        {command.error&&<p role="alert">{command.error}</p>}
        {command.pending&&<Button type="button" disabled={command.busy} onClick={()=>void command.execute()}>Retry same action</Button>}
        {!resource.data.length&&<p className="my-4">No release requests yet</p>}
        {['Urgent','Can wait','Other requests'].map(pool=><section key={pool} className="my-5"><h3 className="font-semibold">{pool} ({orders.filter(o=>{const t=releaseTiming(o,clock);return (t.active?t.pool:'Other requests')===pool;}).length})</h3><div className="orderList">
          {orders.filter(o=>{const t=releaseTiming(o,clock);return (t.active?t.pool:'Other requests')===pool;}).sort((a,b)=>Date.parse(a.payload.delivery_due_at??'9999-01-01')-Date.parse(b.payload.delivery_due_at??'9999-01-01')).map(o => (
            <article id={`order-${o.id}`} key={o.id} className="invoiceCard">
              <p className={releaseTiming(o,clock).pool==='Urgent'?'p-4 font-semibold text-red-700':'p-4'}>{releaseTiming(o,clock).label}{o.payload.delivery_due_at&&<> · Due {dateTime(o.payload.delivery_due_at)}</>}</p><InvoiceCardContent
                order={o}
                sme={false}
                modes={modes}
                setModes={setModes}
                reason={reason}
                setReason={setReason}
                act={act}
                command={command}
                directorySmes={directorySmes}
                demo={demo}
              />
            </article>
          ))}
        </div></section>)}
      </Card>
    );
  }

  return (
    <Card className="my-5">
      <h2 className="text-lg font-semibold">{sme?'Stock Release Request History':'Stock release requests'}</h2>
      {command.error&&<p role="alert">{command.error}</p>}
      {command.pending&&<Button type="button" disabled={command.busy} onClick={()=>void command.execute()}>Retry same action</Button>}
      {!resource.data.length&&<p className="my-4">No release requests yet</p>}
      <div className="orderRows">
        {resource.data.map(o => {
          const totalQty = o.payload.lines.reduce((sum, line) => sum + (line.expected_qty || 0), 0);
          const totalItems = o.payload.lines.length;
          const smeName = directorySmes[o.sme_id] || SME_OWNERS[o.sme_id]?.name || 'Golden Bloom';
          const smeOwner = SME_OWNERS[o.sme_id]?.owner || (smeName === 'Lotus Trading' ? 'U Min Din' : 'Thiri Hnin');

          return (
            <article id={`order-${o.id}`} key={o.id} className="orderRowCard">
              <div
                role="button"
                tabIndex={0}
                className={`orderRow${openId === o.id ? ' orderRowOpen' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={openId === o.id}
                onClick={() => setOpenId(o.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(o.id); } }}
              >
                <span className="invoiceIconBadge" aria-hidden="true">
                  <ReceiptIcon size={20} weight="duotone" />
                </span>
                <span className="orderRowBody">
                  <span className="orderRowTitle">
                    <span className="orderRowId">ORD-{o.id.slice(0, 8).toUpperCase()}</span>
                    <span className="orderRowSme" data-user-content>{smeName}</span>
                  </span>
                  <span className="orderRowMeta">
                    <time dateTime={o.created_at}>{dateTime(o.created_at)}</time>
                    <span aria-hidden="true">·</span>
                    <span data-user-content>{o.payload.customer_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{totalItems} item{totalItems === 1 ? '' : 's'} · {totalQty} unit{totalQty === 1 ? '' : 's'}</span>
                  </span>
                </span>
                <span className="orderRowStatus"><span>{releaseTiming(o,clock).active?releaseTiming(o,clock).pool:''} · {releaseTiming(o,clock).label}</span>
                  <span className={`invoiceStatusBadge status-${o.status}`}>{human(o.status)}</span>
                  {o.shipment_status && <ShipmentStatus status={o.shipment_status} />}
                  {o.status === 'pending' && (
                    <Button
                      variant="outline"
                      className="invoiceCancelBtn text-xs px-2.5 py-1"
                      disabled={command.busy || !!command.pending || !command.ready}
                      onClick={e => {
                        e.stopPropagation();
                        void act(o.id, 'cancel');
                      }}
                    >
                      Cancel request
                    </Button>
                  )}
                  <CaretRightIcon size={16} className="orderRowChevron" aria-hidden="true" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog.Root open={open!==null} onOpenChange={next=>{if(!next)setOpenId(null);}}>
        <Dialog.Portal>
          <Dialog.Backdrop className="orderDrawerBackdrop"/>
          <Dialog.Popup className="orderDrawer">
            {open && (
              <>
                <Dialog.Title className="sr-only">Request ORD-{open.id.slice(0, 8).toUpperCase()}</Dialog.Title>
                <InvoiceCardContent
                  order={open}
                  sme={true}
                  modes={modes}
                  setModes={setModes}
                  reason={reason}
                  setReason={setReason}
                  act={act}
                  command={command}
                  directorySmes={directorySmes}
                  demo={demo}
                  onClose={() => setOpenId(null)}
                />
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  );
}

function InvoiceCardContent({
  order,
  sme,
  modes,
  setModes,
  reason,
  setReason,
  act,
  command,
  directorySmes,
  demo,
  onClose,
}: {
  order: SmeOrder;
  sme: boolean;
  modes: Record<string, 'in_house' | 'third_party'>;
  setModes: React.Dispatch<React.SetStateAction<Record<string, 'in_house' | 'third_party'>>>;
  reason: Record<string, string>;
  setReason: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  act: (id: string, action: 'accept' | 'reject' | 'cancel') => Promise<void>;
  command: any;
  directorySmes: Record<string, string>;
  demo?: boolean;
  onClose?: () => void;
}) {
  const o = order;
  const smeName = directorySmes[o.sme_id] || SME_OWNERS[o.sme_id]?.name || 'Golden Bloom';
  const smeOwner = SME_OWNERS[o.sme_id]?.owner || (smeName === 'Lotus Trading' ? 'U Min Din' : 'Thiri Hnin');
  const statusLine = (ord: SmeOrder) =>
    ord.status === 'pending'
      ? 'Awaiting warehouse approval. Tracking will appear after approval.'
      : ord.status === 'rejected'
      ? 'Release request rejected; no delivery is scheduled.'
      : ord.status === 'cancelled'
      ? 'Release request cancelled; no delivery is scheduled.'
      : ord.shipment_status
      ? `Delivery status: ${human(ord.shipment_status)}`
      : 'Stock reserved; preparing your delivery.';

  return (
    <>
      <div className={onClose ? 'orderDrawerHeading' : 'invoiceCardHeader'}>
        <div className="invoiceCardIdentity">
          <span className="invoiceIconBadge" aria-hidden="true">
            <ReceiptIcon size={22} weight="duotone" />
          </span>
          <div>
            <div className="invoiceTitleRow">
              <span className="invoiceCardLabel">Request ID</span>
              <span className="invoiceDot">·</span>
              <span className="invoiceId" data-user-content>ORD-{o.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="invoiceMetaRow">
              <CalendarBlankIcon size={14} className="invoiceMetaIcon" />
              <time dateTime={o.created_at}>{dateTime(o.created_at)}</time>
            </div>
          </div>
        </div>
        {onClose ? (
          <Dialog.Close className="iconButton" aria-label="Close request details">
            <XIcon size={16} />
          </Dialog.Close>
        ) : (
          <div className="invoiceStatusCluster">
            <span className={`invoiceStatusBadge status-${o.status}`}>{human(o.status)}</span>
            {o.shipment_status && <ShipmentStatus status={o.shipment_status} />}
          </div>
        )}
      </div>

      {onClose ? (
        <div className="orderDrawerStatus">
          <span className={`invoiceStatusBadge status-${o.status}`}>{human(o.status)}</span>
          {o.shipment_status && <ShipmentStatus status={o.shipment_status} />}
          <p role="status" className="orderDrawerStatusLine">{statusLine(o)}</p>
        </div>
      ) : (
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200">
          <p role="status" className="text-xs text-muted-foreground">{statusLine(o)}</p>
        </div>
      )}

      {o.payload.delivery_due_at&&<p className="px-5 py-3 text-sm"><strong>Deliver to SME by:</strong> <time dateTime={o.payload.delivery_due_at}>{dateTime(o.payload.delivery_due_at)}</time></p>}
      <div className="invoiceDetailsGrid">
        {/* Col 1: SME Name & Owner */}
        <div className="invoiceDetailBlock">
          <span className="invoiceFieldLabel">SME Name</span>
          <div className="invoiceSmeName" data-user-content>
            <StorefrontIcon size={16} className="text-primary flex-shrink-0" />
            <span>{smeName}</span>
          </div>
          <div className="invoiceSmeOwner" data-user-content>
            <span>Owner: </span>
            <strong>{smeOwner}</strong>
          </div>
        </div>

        {/* Col 2: SME location contact */}
        <div className="invoiceDetailBlock">
          <span className="invoiceFieldLabel">SME location contact</span>
          <div className="invoiceCustomerName" data-user-content>
            <UserCircleIcon size={16} className="text-muted-foreground flex-shrink-0" />
            <span>{o.payload.customer_name}</span>
          </div>
          {o.payload.customer_phone && (
            <a className="invoicePhoneLink" href={`tel:${o.payload.customer_phone}`}>
              <PhoneIcon size={14} />
              <span data-user-content>{o.payload.customer_phone}</span>
            </a>
          )}
        </div>

        {/* Col 3: SME location / shop */}
        <div className="invoiceDetailBlock">
          <span className="invoiceFieldLabel">SME location / shop</span>
          <div className="invoiceAddress" data-user-content>{o.payload.address}</div>
        </div>

        {/* Col 4: Description & Notes */}
        <div className="invoiceDetailBlock">
          <span className="invoiceFieldLabel">Description & Instructions</span>
          {o.payload.notes ? (
            <div className="invoiceNotes" data-user-content>{o.payload.notes}</div>
          ) : (
            <span className="text-xs text-muted-foreground italic">No special instructions</span>
          )}
          {o.note && (
            <div className="invoiceRejectionReason">
              <strong>Note: </strong><span data-user-content>{o.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Requested items Table */}
      <div className="invoiceItemsSection">
        <div className="invoiceItemsHeader">
          <span className="invoiceItemsTitle">
            <PackageIcon size={16} />
            Requested items
          </span>
          <span className="invoiceItemsCount">
            {o.payload.lines.length} item{o.payload.lines.length === 1 ? '' : 's'} · {o.payload.lines.reduce((sum, line) => sum + (line.expected_qty || 0), 0)} total unit{o.payload.lines.reduce((sum, line) => sum + (line.expected_qty || 0), 0) === 1 ? '' : 's'}
          </span>
        </div>

        <div className="invoiceItemsTableWrap">
          <table className="invoiceItemsTable">
            <thead>
              <tr>
                <th scope="col" className="colNum">#</th>
                <th scope="col" className="colDesc">Product Description</th>
                <th scope="col" className="colSku">SKU</th>
                <th scope="col" className="colQty">Requested quantity</th>
              </tr>
            </thead>
            <tbody>
              {o.payload.lines.map((l, index) => (
                <tr key={l.product_id || index}>
                  <td className="colNum">{String(index + 1).padStart(2, '0')}</td>
                  <td className="colDesc">
                    <span className="invoiceItemName" data-user-content>{l.name ?? 'Product'}</span>
                  </td>
                  <td className="colSku">
                    <span className="invoiceSkuBadge" data-user-content>{l.sku || 'SKU-GENERAL'}</span>
                  </td>
                  <td className="colQty">
                    <span className="invoiceQtyBadge">{l.expected_qty} pcs</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SME Order Timeline if SME mode */}
      {sme && (
        <div className="invoiceTimelineSection">
          <OrderTimeline order={o} />
        </div>
      )}

      {/* Footer with action buttons */}
      <div className="invoiceCardFooter">
        <div className="invoiceActionButtons">
          {o.shipment_id && (
            <Link
              className="invoiceBtnPrimary"
              href={demo ? (sme ? '/demo/sme/tracking' : `/demo/warehouse/shipments/${o.shipment_id}`) : `${sme ? '/sme' : '/warehouse'}/shipments/${o.shipment_id}`}
            >
              <TruckIcon size={16} />
              View shipment / tracking →
            </Link>
          )}

          <a
            className="invoiceBtnSecondary"
            href={`https://www.google.com/maps/search/?api=1&query=${o.payload.latitude},${o.payload.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPinIcon size={16} />
            View SME delivery pin ↗
          </a>

          {o.payload.maps_url && googleMapsUrl(o.payload.maps_url) && (
            <a
              className="invoiceBtnSecondary"
              href={o.payload.maps_url}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpRightIcon size={16} />
              SME Maps link ↗
            </a>
          )}
        </div>

        {/* Pending controls: Accept / Reject for warehouse staff, Cancel for SME */}
        {o.status === 'pending' && (
          <fieldset disabled={command.busy || !!command.pending || !command.ready} className="invoicePendingControls">
            {sme ? (
              <Button variant="outline" className="invoiceCancelBtn" onClick={() => void act(o.id, 'cancel')}>
                Cancel request
              </Button>
            ) : (
              <div className="invoiceWarehouseActions">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span>Delivery mode:</span>
                  <select
                    className="invoiceSelect"
                    value={modes[o.id] ?? 'in_house'}
                    onChange={e => setModes(v => ({ ...v, [o.id]: e.target.value as 'in_house' | 'third_party' }))}
                  >
                    <option value="in_house">In-house rider</option>
                    <option value="third_party">Third-party courier</option>
                  </select>
                </label>
                <Button className="invoiceAcceptBtn" onClick={() => void act(o.id, 'accept')}>
                  Accept & create shipment
                </Button>
                <div className="invoiceRejectGroup">
                  <Input
                    placeholder="Reason for rejection…"
                    className="invoiceRejectInput"
                    value={reason[o.id] ?? ''}
                    maxLength={2000}
                    onChange={e => setReason(v => ({ ...v, [o.id]: e.target.value }))}
                  />
                  <Button
                    variant="outline"
                    className="invoiceRejectBtn"
                    disabled={!reason[o.id]?.trim()}
                    onClick={() => void act(o.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </>
  );
}
