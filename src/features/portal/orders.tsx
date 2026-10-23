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
} from '@phosphor-icons/react';
import {ShipmentStatus} from '../warehouse/shipment-status';
import {useMyanmar} from '../../shared/layout/account-menu';
import '../tracking/tracking.css';
import './orders.css';

const orderStepConfig = [
  { num: '01', title: 'Products', subtitle: 'Choose items', mySubtitle: 'ပစ္စည်းများ ရွေးချယ်ရန်' },
  { num: '02', title: 'Delivery', subtitle: 'Address & contact', mySubtitle: 'လိပ်စာနှင့် ဖုန်း' },
  { num: '03', title: 'Confirm', subtitle: 'Review & submit', mySubtitle: 'စစ်ဆေးပြီး အတည်ပြုရန်' },
];

type Place={latitude:number;longitude:number;label:string};
export function SmeOrders(){
 const session=useSession();return <Checkout key={`${session.identity!.actor_id}:${session.warehouseId}:${session.smeId}`}/>;
}
function Checkout(){
 const my=useMyanmar();
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
 function cartPanel(editable=true){return <section id="order-basket" className="orderBasket" aria-label="Your order"><h2 className="orderBasketTitle">Your order</h2><p className="orderBasketCount">{selectedIds.length} {selectedIds.length===1?'product':'products'} · {units} units total</p>{!cart.length&&<p className="my-3">Your order is empty. Add products from the catalogue.</p>}{cart.map(p=><article className="orderBasketItem" key={p.id}><div className="orderBasketItemMain"><strong className="orderBasketItemName" data-user-content>{p.name}</strong>{editable&&<button type="button" className="orderBasketRemove" disabled={locked} aria-label={`Remove ${p.name}`} onClick={()=>remove(p.id)}>Remove</button>}</div><p className="orderBasketItemSku" data-user-content>{p.sku}</p>{editable?<label className="orderQuantity"><span>Qty</span><Input aria-label={`Quantity for ${p.name}`} className="orderQtyInput" inputMode="numeric" type="number" min={1} max={p.available_qty} step={1} value={qty[p.id]} disabled={locked} aria-invalid={!!itemError(p)} onChange={e=>setAmount(p,Number(e.target.value))}/><small className="orderStockHint" data-user-content>of {p.available_qty} available</small></label>:<p className="orderQuantity"><span>Qty</span><strong data-user-content>{qty[p.id]}</strong></p>}{itemError(p)&&<p role="alert" className="orderBasketError">{itemError(p)}</p>}</article>)}{cart.length>0&&<p className="orderBasketNote">Availability is checked again when you place the order.</p>}</section>;}
 return <><PageTitle title="Order warehouse stock" my="ပို့ဆောင်ရန် အော်ဒါများ" description="Choose products, confirm delivery details and place your order."/>
 {message&&<Card className="mb-5"><p role="status">{message}</p>{command.result&&<><p>ORD-{command.result.id.slice(0,8)}</p><a className="text-brand underline" href={`#order-${command.result.id}`}>View order status and tracking below →</a></>}</Card>}
 <Card>{demo&&<p className="mb-4 text-sm">Demo orders stay in this browser session. No real delivery is requested.</p>}
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

function OrderTimeline({order}:{order:SmeOrder}){
 const stopped=order.status==='rejected'||order.status==='cancelled';
 const approved=order.status==='accepted';
 const delivered=approved&&order.shipment_status==='delivered';
 const transit=approved&&(['in_transit','out_for_delivery','delivered'].includes(order.shipment_status??''));
 const stages=[{label:'Order placed',done:true},{label:'Warehouse approved',done:approved},{label:'In transit',done:transit},{label:'Delivered',done:delivered}];
 const next=stopped?-1:stages.findIndex(stage=>!stage.done);
 return <ol className="orderTimeline" aria-label="Order progress">{stages.map((stage,i)=><li key={stage.label} data-complete={stage.done} aria-current={i===next?'step':undefined}><span className="orderTimelineMarker" aria-hidden="true">{stage.done?'✓':''}</span><span>{stage.label}<span className="sr-only">{stage.done?' — completed':stopped?' — not completed':i===next?' — awaiting completion':' — upcoming'}</span></span></li>)}{stopped&&<li className="orderTimelineStopped"><span className="orderTimelineMarker" aria-hidden="true">×</span><span>{order.status==='rejected'?'Order rejected':'Order cancelled'}</span></li>}</ol>;
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
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <Card className="my-5"><h2 className="text-lg font-semibold">{sme?'Your orders':'SME delivery requests'}</h2>{command.error&&<p role="alert">{command.error}</p>}{command.pending&&<Button type="button" disabled={command.busy} onClick={()=>void command.execute()}>Retry same action</Button>}
 {!resource.data.length&&<p className="my-4">No orders yet</p>}
  {resource.data.map(o => {
    const totalQty = o.payload.lines.reduce((sum, line) => sum + (line.expected_qty || 0), 0);
    const totalItems = o.payload.lines.length;
    const smeName = directorySmes[o.sme_id] || SME_OWNERS[o.sme_id]?.name || 'Golden Bloom';
    const smeOwner = SME_OWNERS[o.sme_id]?.owner || (smeName === 'Lotus Trading' ? 'U Min Din' : 'Thiri Hnin');

    return (
      <article id={`order-${o.id}`} key={o.id} className="invoiceCard">
        {/* Header with identity and status */}
        <div className="invoiceCardHeader">
          <div className="invoiceCardIdentity">
            <div className="invoiceIconBadge" aria-hidden="true">
              <ReceiptIcon size={22} weight="duotone" />
            </div>
            <div>
              <div className="invoiceTitleRow">
                <span className="invoiceCardLabel">Order ID</span>
                <span className="invoiceDot">·</span>
                <span className="invoiceId" data-user-content>ORD-{o.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="invoiceMetaRow">
                <CalendarBlankIcon size={14} className="invoiceMetaIcon" />
                <span>Order Date:</span>
                <time dateTime={o.created_at}>{dateTime(o.created_at)}</time>
              </div>
            </div>
          </div>

          <div className="invoiceStatusCluster">
            <span className={`invoiceStatusBadge status-${o.status}`}>
              {human(o.status)}
            </span>
            {o.shipment_status && (
              <ShipmentStatus status={o.shipment_status} />
            )}
          </div>
        </div>

        {/* 4-Column Invoice Details Grid */}
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

          {/* Col 2: Customer / Recipient */}
          <div className="invoiceDetailBlock">
            <span className="invoiceFieldLabel">Customer / Recipient</span>
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

          {/* Col 3: Delivery Address */}
          <div className="invoiceDetailBlock">
            <span className="invoiceFieldLabel">Delivery Address</span>
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

        {/* Order Items Table */}
        <div className="invoiceItemsSection">
          <div className="invoiceItemsHeader">
            <span className="invoiceItemsTitle">
              <PackageIcon size={16} />
              Order Items
            </span>
            <span className="invoiceItemsCount">
              {totalItems} item{totalItems === 1 ? '' : 's'} · {totalQty} total unit{totalQty === 1 ? '' : 's'}
            </span>
          </div>

          <div className="invoiceItemsTableWrap">
            <table className="invoiceItemsTable">
              <thead>
                <tr>
                  <th scope="col" className="colNum">#</th>
                  <th scope="col" className="colDesc">Product Description</th>
                  <th scope="col" className="colSku">SKU</th>
                  <th scope="col" className="colQty">Quantity</th>
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
            <p role="status" className="invoiceTimelineStatus">
              {o.status === 'pending'
                ? 'Awaiting warehouse approval. Tracking will appear after approval.'
                : o.status === 'rejected'
                ? 'Order rejected; no delivery is scheduled.'
                : o.status === 'cancelled'
                ? 'Order cancelled; no delivery is scheduled.'
                : o.shipment_status
                ? `Delivery status: ${human(o.shipment_status)}`
                : 'Approved; preparing your delivery.'}
            </p>
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
                  Cancel order
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
      </article>
    );
  })}
 </Card>;
}
