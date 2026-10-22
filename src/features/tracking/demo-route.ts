'use client';
import {useEffect,useState} from 'react';
import {demoRouteSnapshot,setDemoRouteSharing} from '../../shared/api/demo-route';
export function useDemoRoute(enabled:boolean){
 const [snapshot,setSnapshot]=useState(()=>demoRouteSnapshot()),[error,setError]=useState('');
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>{try{setSnapshot(demoRouteSnapshot(window.localStorage))}catch{setError('Demo storage is unavailable.')}};
  refresh();const timer=setInterval(refresh,1000);window.addEventListener('storage',refresh);window.addEventListener('parcelcare:demo-route',refresh);
  return()=>{clearInterval(timer);window.removeEventListener('storage',refresh);window.removeEventListener('parcelcare:demo-route',refresh)};
 },[enabled]);
 function setSharing(sharing:boolean){try{setDemoRouteSharing(window.localStorage,sharing);window.dispatchEvent(new Event('parcelcare:demo-route'));setError('')}catch{setError('Demo storage is unavailable.')}}
 return {...snapshot,error,start:()=>setSharing(true),stop:()=>setSharing(false)};
}
