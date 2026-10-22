'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
export type MapPoint=[number,number]; // latitude, longitude
interface MapHandle{setView(p:MapPoint,z:number):MapHandle;fitBounds(points:MapPoint[],options:object):void;remove():void;on(event:string,fn:(e:{latlng:{lat:number;lng:number}})=>void):void}
interface Leaflet{map(node:HTMLElement,options:object):MapHandle;tileLayer(url:string,options:object):{addTo(m:MapHandle):void};circleMarker(p:MapPoint,options:object):{addTo(m:MapHandle):void};polyline(points:MapPoint[],options:object):{addTo(m:MapHandle):void}}
export function DeliveryMap({position,destination,route,onDestination}:{position?:MapPoint|null;destination?:MapPoint|null;route?:MapPoint[];onDestination?:(p:MapPoint)=>void}){
 const node=useRef<HTMLDivElement>(null),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);const click=useRef(onDestination);click.current=onDestination;
 useEffect(()=>{
  const library=(window as typeof window&{L?:Leaflet}).L;if(!ready||!library||!node.current)return;
  const map=library.map(node.current,{scrollWheelZoom:false}).setView(position??destination??[16.8409,96.1735],position||destination?14:11);
  library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  if(position)library.circleMarker(position,{radius:8,color:'#0e7490',fillColor:'#25cbd1',fillOpacity:1}).addTo(map);
  if(destination)library.circleMarker(destination,{radius:9,color:'#92400e',fillColor:'#ffc738',fillOpacity:1}).addTo(map);
  if(route?.length){library.polyline(route,{color:'#0e7490',weight:5}).addTo(map);map.fitBounds(route,{padding:[24,24],maxZoom:15});}
  map.on('click',e=>click.current?.([e.latlng.lat,e.latlng.lng]));
  return()=>map.remove();
 },[ready,position?.[0],position?.[1],destination?.[0],destination?.[1],route]);
 return <><Script src="/vendor/leaflet.js" onReady={()=>{setReady(true);setFailed(false)}} onError={()=>setFailed(true)}/>{!ready&&<p role="status">{failed?'Map could not load. Check your connection. Location sharing is still available.':'Loading map…'}</p>}<div ref={node} className="deliveryGpsMap" aria-label="OpenStreetMap delivery map"/>{!position&&!destination&&<p className="text-sm text-muted">Map centered on Yangon for reference. No courier location is shown.</p>}</>;
}
