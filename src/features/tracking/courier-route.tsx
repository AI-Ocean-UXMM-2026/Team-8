'use client';
import {useEffect,useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {Card,Button} from '../../shared/ui';
import {DeliveryMap,type MapPoint} from './delivery-map';
import type {DeliveryRoute} from '../../shared/api/route';
import './tracking.css';
export function CourierRoute({shipmentId,accepted}:{shipmentId:string;accepted:boolean}){
 const {api,demo}=useSession();const [latitude,setLatitude]=useState(''),[longitude,setLongitude]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[origin,setOrigin]=useState<MapPoint|null>(null),[result,setResult]=useState<DeliveryRoute|null>(null),[positionTime,setPositionTime]=useState('');
 const request=useRef<AbortController|null>(null);useEffect(()=>()=>request.current?.abort(),[shipmentId]);
 const lat=latitude.trim()?Number(latitude):NaN,lon=longitude.trim()?Number(longitude):NaN;
 const destination:MapPoint|null=Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180?[lat,lon]:null;
 const changed=(value:MapPoint)=>{setLatitude(value[0].toFixed(6));setLongitude(value[1].toFixed(6));setResult(null);setConsent(false);};
 async function calculate(){
  if(busy||!destination||!consent||!accepted||demo)return;
  setBusy(true);setError('');setResult(null);const controller=new AbortController();request.current=controller;
  try{
   if(!navigator.geolocation||!window.isSecureContext)throw new Error('GPS requires a secure connection and location permission.');
   const gps=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
   if(controller.signal.aborted)return;
   const point:MapPoint=[gps.coords.latitude,gps.coords.longitude];setOrigin(point);setPositionTime(new Date(gps.timestamp).toISOString());
   const route=await api!.calculateDeliveryRoute(shipmentId,{origin_latitude:point[0],origin_longitude:point[1],destination_latitude:destination[0],destination_longitude:destination[1],consent:true},controller.signal);
   if(!controller.signal.aborted)setResult(route);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Route unavailable. Check location permission and try again.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <Card className="routePanel"><h2 className="text-lg font-semibold">Delivery route</h2><p>Check the recipient’s delivery address, then select its pin on the map or enter coordinates. This pin is for this route only; it does not update the shipment address.</p><DeliveryMap position={origin} destination={destination} route={result?.coordinates.map(([lng,lat])=>[lat,lng] as MapPoint)} onDestination={busy?undefined:changed}/><fieldset disabled={busy} className="routeControls"><label>Destination latitude<input type="number" min={-90} max={90} step="any" value={latitude} onChange={e=>{setLatitude(e.target.value);setResult(null);setConsent(false)}}/></label><label>Destination longitude<input type="number" min={-180} max={180} step="any" value={longitude} onChange={e=>{setLongitude(e.target.value);setResult(null);setConsent(false)}}/></label></fieldset><label className="routeConsent"><input type="checkbox" checked={consent} disabled={busy||demo} onChange={e=>setConsent(e.target.checked)}/><span>I checked the destination and agree to send my current GPS position and this pin to openrouteservice to calculate a driving route.</span></label><Button disabled={busy||demo||!destination||!consent||!accepted} onClick={()=>void calculate()}>{busy?'Calculating route…':'Calculate driving route'}</Button>{busy&&<Button variant="outline" className="ml-3" onClick={()=>{request.current?.abort();setBusy(false);setError('Route calculation cancelled.')}}>Cancel calculation</Button>}{positionTime&&<p>GPS snapshot: <time dateTime={positionTime} data-user-content>{new Date(positionTime).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} · Yangon</time></p>}{!accepted&&<p>Accept this delivery before requesting a route.</p>}{demo&&<p>Demo map only. No GPS permission or routing request is sent.</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><p>{(result.distance_m/1000).toFixed(1)} km · about {Math.ceil(result.duration_ms/60000)} min driving</p><p>Route snapshot. No live traffic or guaranteed arrival time. Recalculate when needed.</p><p>Routing © openrouteservice / HeiGIT · Map data © OpenStreetMap contributors</p></div>}<p>Cyan marker: your last requested GPS position. Yellow marker: selected destination. Driving routes may differ from motorcycle routes.</p></Card>;
}
