'use client';
import {useEffect,useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {Card,Button} from '../../shared/ui';
import {DeliveryMap,type MapPoint} from './delivery-map';
import {useDemoRoute} from './demo-route';
import {demoShipmentId} from '../../shared/api/demo-route';
import type {DeliveryRoute} from '../../shared/api/route';
import './tracking.css';
import {useTrackingSettings} from './settings';
import {ArrivalNotice,CourierArrival} from './arrival';
export function CourierRoute({shipmentId,accepted}:{shipmentId:string;accepted:boolean}){
 const {api,demo}=useSession();const [latitude,setLatitude]=useState(''),[longitude,setLongitude]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[origin,setOrigin]=useState<MapPoint|null>(null),[result,setResult]=useState<DeliveryRoute|null>(null),[positionTime,setPositionTime]=useState(''),[shared,setShared]=useState(false);
 const settings=useTrackingSettings();
 const preview=useDemoRoute(demo),edited=useRef(false);
 const request=useRef<AbortController|null>(null);useEffect(()=>()=>request.current?.abort(),[shipmentId]);
 useEffect(()=>{
  if(demo||!api)return;const controller=new AbortController();
  void api.getSharedRoute(shipmentId,controller.signal).then(saved=>{if(saved&&!controller.signal.aborted&&!edited.current){setLatitude(String(saved.destination[1]));setLongitude(String(saved.destination[0]));setOrigin([saved.origin[1],saved.origin[0]]);setResult(saved);setShared(true);}}).catch(()=>{if(!controller.signal.aborted)setError('Saved route unavailable. Calculate and share a route to retry.');});
  return()=>controller.abort();
 },[api,demo,shipmentId]);
 const lat=latitude.trim()?Number(latitude):NaN,lon=longitude.trim()?Number(longitude):NaN;
 const destination:MapPoint|null=Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180?[lat,lon]:null;
 const changed=(value:MapPoint)=>{edited.current=true;setLatitude(value[0].toFixed(6));setLongitude(value[1].toFixed(6));setResult(null);setConsent(false);};
 async function calculate(){
  if(busy||!destination||!consent||!accepted||demo||!settings.value?.live_gps_enabled)return;
  edited.current=true;setBusy(true);setError('');setResult(null);const controller=new AbortController();request.current=controller;
  try{
   if(!navigator.geolocation||!window.isSecureContext)throw new Error('GPS requires a secure connection and location permission.');
   const gps=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
   if(controller.signal.aborted)return;
   const point:MapPoint=[gps.coords.latitude,gps.coords.longitude];setOrigin(point);setPositionTime(new Date(gps.timestamp).toISOString());
   const route=await api!.calculateDeliveryRoute(shipmentId,{origin_latitude:point[0],origin_longitude:point[1],destination_latitude:destination[0],destination_longitude:destination[1],consent:true},controller.signal);
   if(!controller.signal.aborted){setResult(route);setShared('saved_at' in route);}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Route unavailable. Check location permission and try again.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <Card className="routePanel"><h2 className="text-lg font-semibold">Delivery route</h2><p>Check the recipient’s delivery address, then select its pin on the map or enter coordinates. The planned destination and route will be saved for this shipment. Your warehouse and SME can view the route while GPS sharing is active.</p><DeliveryMap position={demo&&shipmentId===demoShipmentId?[preview.position[1],preview.position[0]]:origin} destination={demo&&shipmentId===demoShipmentId?[preview.destination[1],preview.destination[0]]:destination} route={(demo&&shipmentId===demoShipmentId?preview.coordinates:result?.coordinates)?.map(([lng,lat])=>[lat,lng] as MapPoint)} mode={demo?'car':result?.profile} stage={demo?preview.stage:'transit'} onDestination={busy||demo?undefined:changed}/>{demo&&shipmentId===demoShipmentId&&<div className="my-4"><p>Warehouse → SME demo · road geometry from OpenStreetMap / OSRM. No real GPS is sent.</p><div className="mt-3 flex flex-wrap gap-3"><Button onClick={preview.advance} disabled={!settings.value?.demo_simulation_enabled||preview.moving||preview.step>=10||preview.stage!=='transit'}>Move vehicle · {preview.step}/10</Button><Button onClick={preview.arrive} disabled={!settings.value?.demo_simulation_enabled||!preview.canArrive||preview.stage!=='transit'}>Confirm arrival</Button><Button variant="outline" onClick={preview.reset} disabled={preview.moving||!settings.value?.demo_simulation_enabled}>Reset demo</Button></div><ArrivalNotice stage={preview.stage}/><p role="status">{preview.moving?'Vehicle moving along the road…':`${Math.round(preview.distance_m)} m from SME · arrival range 100 m`}</p>{!settings.value?.demo_simulation_enabled&&<p>Demo simulation is disabled in Warehouse Admin settings.</p>}{preview.error&&<p role="alert">{preview.error}</p>}</div>}<fieldset disabled={busy||demo} className="routeControls"><label>Destination latitude<input type="number" min={-90} max={90} step="any" value={latitude} onChange={e=>{edited.current=true;setLatitude(e.target.value);setResult(null);setConsent(false)}}/></label><label>Destination longitude<input type="number" min={-180} max={180} step="any" value={longitude} onChange={e=>{edited.current=true;setLongitude(e.target.value);setResult(null);setConsent(false)}}/></label></fieldset><label className="routeConsent"><input type="checkbox" checked={consent} disabled={busy||demo} onChange={e=>setConsent(e.target.checked)}/><span>I checked the destination and agree to send my current GPS position and this pin to openrouteservice, save the route, and share it with my warehouse and SME while GPS sharing is active.</span></label><Button disabled={busy||demo||!destination||!consent||!accepted||!settings.value?.live_gps_enabled} onClick={()=>void calculate()}>{busy?'Calculating route…':'Calculate route'}</Button>{busy&&<Button variant="outline" className="ml-3" onClick={()=>{request.current?.abort();setBusy(false);setError('Stopped waiting. Refresh to check whether the route was saved.')}}>Stop waiting</Button>}{positionTime&&<p>GPS snapshot: <time dateTime={positionTime} data-user-content>{new Date(positionTime).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} · Yangon</time></p>}{!accepted&&<p>Accept this delivery before requesting a route.</p>}{demo&&<p>Demo only. No real GPS permission or routing request is sent. Choose PC-OUT-0003 for the shared route simulation.</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><p>{shared?'Route saved for this shipment. Start GPS sharing after pickup so your warehouse and SME can view it.':'Route calculated, but sharing could not be confirmed. You can use this route locally; ask your operator to finish route-sharing setup.'}</p><p><strong>Route mode: {result.profile==='car'?'Car':result.profile==='bicycle'?'Bicycle — not a car route':'Walking — not a car route'}</strong></p><p>{(result.distance_m/1000).toFixed(1)} km · about {Math.ceil(result.duration_ms/60000)} min driving</p><p>Route snapshot. No live traffic or guaranteed arrival time. Recalculate when needed.</p><p>Routing © openrouteservice / HeiGIT · Map data © OpenStreetMap contributors</p></div>}<p>Cyan marker: your last requested GPS position. Yellow marker: selected destination. Driving routes may differ from motorcycle routes.</p>{!demo&&<CourierArrival shipmentId={shipmentId}/>}</Card>;
}
