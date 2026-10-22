'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
import {createMapController,type Leaflet,type MapPoint} from '../../shared/api/map-controller';
export type {MapPoint} from '../../shared/api/map-controller';
export function DeliveryMap({position,destination,route,onDestination,stage='transit',mode='car'}:{position?:MapPoint|null;destination?:MapPoint|null;route?:MapPoint[];stage?:'transit'|'arrived'|'delivered';mode?:'car'|'bicycle'|'walking';onDestination?:(p:MapPoint)=>void}){
 const node=useRef<HTMLDivElement>(null),controller=useRef<ReturnType<typeof createMapController>|null>(null);
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[tileFailed,setTileFailed]=useState(false);
 const click=useRef(onDestination);click.current=onDestination;
 useEffect(()=>{
  const l=(window as typeof window&{L?:Leaflet}).L;if(!ready||!l||!node.current)return;
  let observer:ResizeObserver|undefined;
  try{
   const current=createMapController(l,node.current,{destination:p=>click.current?.(p),tileError:setTileFailed});controller.current=current;
   if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(()=>current.resize());observer.observe(node.current)}
   return()=>{observer?.disconnect();current.destroy();controller.current=null};
  }catch{setFailed(true);controller.current?.destroy();controller.current=null;}
 },[ready]);
 const routeKey=JSON.stringify(route??[]);
 useEffect(()=>{controller.current?.update(position,destination,route,stage,mode)},[ready,position?.[0],position?.[1],destination?.[0],destination?.[1],routeKey,stage,mode]);
 return <><Script src="/vendor/leaflet.js" onReady={()=>{setReady(true);setFailed(false)}} onError={()=>setFailed(true)}/>{failed?<p role="alert">Map could not load. Check your connection. Location sharing is still available.</p>:!ready&&<p role="status">Loading map…</p>}{tileFailed&&<p role="status">Map tiles are unavailable. Route and GPS data may still update. Check your connection.</p>}<div ref={node} className="deliveryGpsMap" aria-label="OpenStreetMap delivery map"/>{!position&&!destination&&<p className="text-sm text-muted">Map centered on Yangon for reference. No courier location is shown.</p>}</>;
}
