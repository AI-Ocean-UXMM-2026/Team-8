'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
export type MapPoint=[number,number];
interface MapHandle{setView(p:MapPoint,z:number):MapHandle;fitBounds(points:MapPoint[],options:object):void;invalidateSize():void;remove():void;on(event:string,fn:(e:{latlng:{lat:number;lng:number}})=>void):void}
interface Layer{addTo(m:MapHandle):Layer;remove():void;setLatLng(p:MapPoint):void}
interface Leaflet{map(node:HTMLElement,options:object):MapHandle;tileLayer(url:string,options:object):Layer;circleMarker(p:MapPoint,options:object):Layer;polyline(points:MapPoint[],options:object):Layer}
export function DeliveryMap({position,destination,route,onDestination}:{position?:MapPoint|null;destination?:MapPoint|null;route?:MapPoint[];onDestination?:(p:MapPoint)=>void}){
 const node=useRef<HTMLDivElement>(null),mapRef=useRef<MapHandle|null>(null),positionRef=useRef<Layer|null>(null),destinationRef=useRef<Layer|null>(null),lineRef=useRef<Layer|null>(null);
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);const click=useRef(onDestination);click.current=onDestination;
 const routeKey=JSON.stringify(route??[]);
 const library=()=> (window as typeof window&{L?:Leaflet}).L;
 useEffect(()=>{
  const l=library();if(!ready||!l||!node.current)return;
  const map=l.map(node.current,{scrollWheelZoom:false}).setView([16.8409,96.1735],11);mapRef.current=map;
  l.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  map.on('click',e=>click.current?.([e.latlng.lat,e.latlng.lng]));
  const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(node.current);
  return()=>{observer.disconnect();map.remove();mapRef.current=null;positionRef.current=null;destinationRef.current=null;lineRef.current=null;};
 },[ready]);
 useEffect(()=>{
  const map=mapRef.current,l=library();if(!map||!l)return;
  if(!position){positionRef.current?.remove();positionRef.current=null;return;}
  if(positionRef.current)positionRef.current.setLatLng(position);else{positionRef.current=l.circleMarker(position,{radius:8,color:'#0e7490',fillColor:'#25cbd1',fillOpacity:1}).addTo(map);if(!route?.length)map.setView(position,14);}
 },[ready,position?.[0],position?.[1]]);
 useEffect(()=>{
  const map=mapRef.current,l=library();if(!map||!l)return;
  destinationRef.current?.remove();destinationRef.current=null;
  if(destination){destinationRef.current=l.circleMarker(destination,{radius:9,color:'#92400e',fillColor:'#ffc738',fillOpacity:1}).addTo(map);if(!route?.length)map.setView(destination,14);}
 },[ready,destination?.[0],destination?.[1]]);
 useEffect(()=>{
  const map=mapRef.current,l=library();if(!map||!l)return;
  lineRef.current?.remove();lineRef.current=null;
  if(route?.length){lineRef.current=l.polyline(route,{color:'#0e7490',weight:5}).addTo(map);map.fitBounds(route,{padding:[24,24],maxZoom:15});}
 },[ready,routeKey]);
 return <><Script src="/vendor/leaflet.js" onReady={()=>{setReady(true);setFailed(false)}} onError={()=>setFailed(true)}/>{!ready&&<p role="status">{failed?'Map could not load. Check your connection. Location sharing is still available.':'Loading map…'}</p>}<div ref={node} className="deliveryGpsMap" aria-label="OpenStreetMap delivery map"/>{!position&&!destination&&<p className="text-sm text-muted">Map centered on Yangon for reference. No courier location is shown.</p>}</>;
}
