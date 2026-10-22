'use client';
import {useEffect,useState} from 'react';
import {useSession} from '../auth/session';
import {Card} from '../../shared/ui';
import {trackingAccess,type Position} from '../../shared/api/tracking';
import {ApiError,type Schemas} from '../../shared/api';
import './tracking.css';
import {demoShipmentId} from '../../shared/api/demo-route';
import {useDemoRoute} from './demo-route';
import type {SharedDeliveryRoute} from '../../shared/api/route';
import {DeliveryMap} from './delivery-map';
import {useArrival,ArrivalNotice,DemoReceipt,SmeReceipt} from './arrival';
export function LiveCourierTracking({shipment}:{shipment:Schemas['ShipmentDetail']}){
 const {api,identity,demo,status}=useSession();
 const preview=useDemoRoute(demo);
 const arrival=useArrival(shipment.id);
 const stage=demo?preview.stage:arrival.value?.delivered?'delivered':arrival.value?'arrived':'transit';
 const allowed=status==='ready'&&!!identity&&trackingAccess(identity.memberships,shipment);
 const eligible=shipment.direction==='outbound'&&shipment.delivery_mode==='in_house'&&!['delivered','cancelled'].includes(shipment.status);
 const simulated=demo&&shipment.direction==='outbound'&&shipment.delivery_mode==='in_house'&&shipment.id===demoShipmentId;
 const [state,setState]=useState<{id:string;position:Position|null;route:SharedDeliveryRoute|null;message:string}>({id:shipment.id,position:null,route:null,message:'Checking location sharing…'});
 const [attempt,retry]=useState(0);
 // Age the label independently of responses, including while a read is pending.
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(!allowed||!eligible||demo||!api)return;
  let active=true,busy=false;let controller:AbortController|undefined;
  const refresh=async()=>{
   if(busy)return;
   busy=true;controller=new AbortController();const request=controller;
   try{
    const session=await api.getTrackingSession(shipment.id,request.signal);
    const [position,route]=await Promise.all([session?api.getLivePosition(session,request.signal):Promise.resolve(null),api.getSharedRoute(shipment.id,request.signal).catch(error=>{if(error instanceof ApiError&&[401,403].includes(error.status))throw error;return null;})]);
    if(active&&!request.signal.aborted)setState({id:shipment.id,position,route,message:session?'No GPS position received yet.':'Location sharing is not active.'});
   }catch{if(active&&!request.signal.aborted)setState({id:shipment.id,position:null,route:null,message:'Tracking unavailable. Check your connection or access and retry.'});}
   finally{busy=false;}
  };
  setState({id:shipment.id,position:null,route:null,message:'Checking location sharing…'});void refresh();
  const timer=setInterval(()=>void refresh(),15000);
  return()=>{active=false;controller?.abort();clearInterval(timer);};
 },[api,allowed,eligible,demo,shipment.id,attempt]);
 if(!allowed)return null;
 const position=state.id===shipment.id?state.position:null;
 const stale=position?.status==='stale'||!!(position?.recorded_at&&now-Date.parse(position.recorded_at)>60000);
 const hasPosition=eligible&&!demo&&!!position&&position.status!=='unavailable';
 const message=demo?'Demo preview — no live GPS coordinates.':!eligible?shipment.delivery_mode==='third_party'?'Use the external courier tracking reference. ParcelCare GPS is unavailable.':shipment.direction==='inbound'?'GPS tracking is available for active in-house outbound deliveries.':'Location sharing has ended for this shipment.':state.id===shipment.id?state.message:'Checking location sharing…';
 const sharedRoute=state.id===shipment.id&&state.route&&Date.parse(state.route.expires_at)>Date.now()?state.route:null;
 const displayedRoute=simulated?preview.coordinates:sharedRoute?.coordinates;
 const displayedDestination=simulated?preview.destination:sharedRoute?.destination;
 const displayedPosition=simulated?preview.position:arrival.value?[arrival.value.longitude,arrival.value.latitude]:hasPosition?[position!.longitude!,position!.latitude!]:null;
 const dispatched=shipment.events.some(e=>e.type==='dispatched');
 const transit=['in_transit','delivered'].includes(shipment.status);
 return <Card className="courierTracking" ><section id="live-courier-tracking" aria-labelledby="tracking-title"><div className="trackingHeading"><h2 id="tracking-title">Live Courier Tracking</h2><span className={stale?'trackingBadge trackingStale':'trackingBadge'}>{simulated?stage==='delivered'?'SME confirmed · Demo':stage==='arrived'?'Arrived · Demo':'Simulated GPS · Demo':stage==='delivered'?'Delivery successful':stage==='arrived'?'Arrived — awaiting SME':hasPosition?stale?'Last known location':'Live location':'GPS unavailable'}</span></div><div className="mt-4"><DeliveryMap position={displayedPosition?[displayedPosition[1],displayedPosition[0]]:null} destination={displayedDestination?[displayedDestination[1],displayedDestination[0]]:null} mode={simulated?'car':sharedRoute?.profile} stage={stage} route={displayedRoute?.map(([lng,lat])=>[lat,lng])}/>{simulated?<p className="mt-3 text-sm">Warehouse → SME demo road route. Use Move vehicle in the courier demo. No real GPS is sent.</p>:sharedRoute?<p className="mt-3 text-sm">Route mode: {sharedRoute.profile} · Shared route plan · saved <time data-user-content>{new Date(sharedRoute.saved_at).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})}</time> · not live traffic or a guaranteed ETA. Routing © openrouteservice / HeiGIT.</p>:<p className="mt-3 text-sm">No shared route available. The courier must calculate a route and start location sharing.</p>}</div>{(simulated||arrival.value)&&<ArrivalNotice stage={stage}/>} {simulated&&identity?.memberships.some(m=>m.role==='sme'&&m.sme_id===shipment.sme_id)&&<DemoReceipt/>}{!demo&&arrival.value&&!arrival.value.delivered&&identity?.memberships.some(m=>m.role==='sme'&&m.sme_id===shipment.sme_id)&&<SmeReceipt shipmentId={shipment.id}/>}<div className="trackingGrid"><div className="trackingMap" aria-label="GPS location status"><span aria-hidden="true" className="trackingPin">⌖</span><strong>{hasPosition?'Last reported GPS position':'Location sharing'}</strong>{hasPosition?<><p data-user-content>{position.latitude?.toFixed(5)}, {position.longitude?.toFixed(5)}</p><p>Accuracy: {Math.round(position.accuracy_m!)} m</p><p>Last updated: <time dateTime={position.recorded_at!}>{new Date(position.recorded_at!).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} · Yangon</time></p><p>{stale?'Location is stale. It does not represent the courier’s current position.':'Updates every 15 seconds while location sharing is active.'}</p></>:<p role="status">{message}</p>}</div><ol className="trackingTimeline" aria-label="Delivery progress"><li data-complete={simulated||dispatched}><strong>Dispatched</strong><span>{simulated?'Demo dispatch':dispatched?'Verified dispatch recorded':'No verified dispatch recorded'}</span></li><li data-complete={simulated?preview.step>0:transit}><strong>In transit</strong><span>{simulated?`Demo movement · ${preview.step}/10`:transit?'Recorded delivery status':'Not recorded yet'}</span></li><li data-complete={stage!=='transit'}><strong>Arrived at SME</strong><span>{stage!=='transit'?simulated?'Courier confirmed · Demo':'Courier arrival recorded':'Awaiting courier arrival confirmation'}</span></li><li data-complete={stage==='delivered'}><strong>SME receipt</strong><span>{stage==='delivered'?'SME confirmed receipt':stage==='arrived'?'Awaiting SME confirmation':'Pending arrival'}</span></li></ol></div>{eligible&&!demo&&<button type="button" className="trackingRefresh" onClick={()=>retry(n=>n+1)}>Refresh tracking</button>}</section></Card>;
}
