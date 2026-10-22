'use client';
import {useEffect,useState} from 'react';
import {demoRouteSnapshot,advanceDemoRoute,confirmDemoArrival,confirmDemoReceipt,resetDemoRoute} from '../../shared/api/demo-route';
export function useDemoRoute(enabled:boolean){
 const [snapshot,setSnapshot]=useState(()=>demoRouteSnapshot()),[error,setError]=useState('');
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>{try{setSnapshot(previous=>{const next=demoRouteSnapshot(window.localStorage);return previous.step===next.step&&previous.stage===next.stage&&previous.moving===next.moving&&previous.position[0]===next.position[0]&&previous.position[1]===next.position[1]?previous:next})}catch{setError('Demo storage is unavailable.')}};
  refresh();const timer=setInterval(refresh,50);window.addEventListener('storage',refresh);window.addEventListener('parcelcare:demo-route',refresh);
  return()=>{clearInterval(timer);window.removeEventListener('storage',refresh);window.removeEventListener('parcelcare:demo-route',refresh)};
 },[enabled]);
 function command(action:(storage:Storage)=>void){try{action(window.localStorage);window.dispatchEvent(new Event('parcelcare:demo-route'));setError('')}catch{setError('Demo storage is unavailable.')}}
 return {...snapshot,error,advance:()=>command(advanceDemoRoute),arrive:()=>command(confirmDemoArrival),receive:()=>command(confirmDemoReceipt),reset:()=>command(resetDemoRoute)};
}
