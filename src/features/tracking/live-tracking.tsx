'use client';
import {useEffect,useState} from 'react';
import {useSession} from '../auth/session';
import {Card} from '../../shared/ui';
import {trackingAccess,type Position} from '../../shared/api/tracking';
import type {Schemas} from '../../shared/api';
import './tracking.css';
export function LiveCourierTracking({shipment}:{shipment:Schemas['ShipmentDetail']}){
 const {api,identity,demo,status}=useSession();
 const allowed=status==='ready'&&!!identity&&trackingAccess(identity.memberships,shipment);
 const eligible=shipment.direction==='outbound'&&shipment.delivery_mode==='in_house'&&!['delivered','cancelled'].includes(shipment.status);
 const [state,setState]=useState<{id:string;position:Position|null;message:string}>({id:shipment.id,position:null,message:'Checking location sharing…'});
 const [attempt,retry]=useState(0);
 useEffect(()=>{
  if(!allowed||!eligible||demo||!api)return;
  let active=true;let controller:AbortController|undefined;
  const refresh=async()=>{
   controller?.abort();controller=new AbortController();const request=controller;
   try{
    const session=await api.getTrackingSession(shipment.id,request.signal);
    const position=session?await api.getLivePosition(session,request.signal):null;
    if(active&&!request.signal.aborted)setState({id:shipment.id,position,message:session?'No GPS position received yet.':'Location sharing is not active.'});
   }catch{if(active&&!request.signal.aborted)setState({id:shipment.id,position:null,message:'Tracking unavailable. Check your connection or access and retry.'});}
  };
  setState({id:shipment.id,position:null,message:'Checking location sharing…'});void refresh();
  const timer=setInterval(()=>void refresh(),15000);
  return()=>{active=false;controller?.abort();clearInterval(timer);};
 },[api,allowed,eligible,demo,shipment.id,attempt]);
 if(!allowed)return null;
 const position=state.id===shipment.id?state.position:null;
 const stale=position?.status==='stale'||!!(position?.recorded_at&&Date.now()-Date.parse(position.recorded_at)>60000);
 const hasPosition=!!position&&position.status!=='unavailable';
 const message=demo?'Demo preview — no live GPS coordinates.':!eligible?shipment.delivery_mode==='third_party'?'Use the external courier tracking reference. ParcelCare GPS is unavailable.':shipment.direction==='inbound'?'GPS tracking is available for active in-house outbound deliveries.':'Location sharing has ended for this shipment.':state.id===shipment.id?state.message:'Checking location sharing…';
 const dispatched=shipment.events.some(e=>e.type==='dispatched');
 const transit=['in_transit','delivered'].includes(shipment.status);
 return <Card className="courierTracking" ><section id="live-courier-tracking" aria-labelledby="tracking-title"><div className="trackingHeading"><h2 id="tracking-title">Live Courier Tracking</h2><span className={stale?'trackingBadge trackingStale':'trackingBadge'}>{hasPosition?stale?'Last known location':'Live location':'GPS unavailable'}</span></div><div className="trackingGrid"><div className="trackingMap" aria-label="GPS map placeholder"><span aria-hidden="true" className="trackingPin">⌖</span><strong>{hasPosition?'Last reported GPS position':'GPS map preview'}</strong>{hasPosition?<><p data-user-content>{position.latitude?.toFixed(5)}, {position.longitude?.toFixed(5)}</p><p>Accuracy: {Math.round(position.accuracy_m!)} m</p><p>Last updated: <time dateTime={position.recorded_at!}>{new Date(position.recorded_at!).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} · Yangon</time></p><p>{stale?'Location is stale. It does not represent the courier’s current position.':'Updates every 15 seconds while location sharing is active.'}</p></>:<p role="status">{message}</p>}</div><ol className="trackingTimeline" aria-label="Delivery progress"><li data-complete={dispatched}><strong>Dispatched</strong><span>{dispatched?'Verified dispatch recorded':'No verified dispatch recorded'}</span></li><li data-complete={transit}><strong>In transit</strong><span>{transit?'Recorded delivery status':'Not recorded yet'}</span></li><li data-complete={false}><strong>Arriving</strong><span>No verified arrival estimate available</span></li></ol></div>{eligible&&!demo&&<button type="button" className="trackingRefresh" onClick={()=>retry(n=>n+1)}>Refresh tracking</button>}</section></Card>;
}
