'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import {startWithFirstPosition,positionPayload} from '../../shared/api/location-start';
import { ApiError } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import {useTrackingSettings} from './settings';
import { registerSessionCleanup } from '../../shared/session/cleanup';
export function LocationSharing({ assignmentId }: { assignmentId: string }) {
  const { api,identity } = useSession();const settings=useTrackingSettings(); const [consent,setConsent] = useState(false); const [sharing,setSharing] = useState(false); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  const watch = useRef<number | null>(null); const session = useRef<string | null>(null); const generation=useRef(0); const sending=useRef(false); const lastSent=useRef(0); const locked=useRef(false); const stopping=useRef<Promise<void>|null>(null);
  const storageKey=`parcelcare.gps.${identity!.actor_id}.${assignmentId}`;
  const clearWatch=()=>{generation.current++;if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null;}setSharing(false);};
  async function stop() {
    clearWatch();
    if(stopping.current)return stopping.current;
    const current=session.current;if(!current)return;
    const task=(async()=>{
      try{await api!.stopTracking(current);if(session.current===current){session.current=null;sessionStorage.removeItem(storageKey)}setMessage('Location sharing ended / တည်နေရာမျှဝေမှု ရပ်ပြီးပါပြီ')}
      catch{setMessage('Local sharing stopped. Server stop is unconfirmed; retry Stop before sharing again.')}
    })();
    stopping.current=task;
    try{await task}finally{if(stopping.current===task)stopping.current=null}
  }
  async function stoppedMessage(text:string){await stop();setMessage(session.current?text+' Server stop is unconfirmed; retry Stop.':text)}
  useEffect(()=>{
    const unregister=registerSessionCleanup(stop);
    try{const pending=sessionStorage.getItem(storageKey);if(pending){session.current=pending;void stop();}}catch{setMessage('Unable to recover GPS session. Browser storage is unavailable.');}
    const pause=()=>{if(document.hidden)void stop();}; const offline=()=>void stop();
    document.addEventListener('visibilitychange',pause);window.addEventListener('offline',offline);window.addEventListener('pagehide',offline);
    return ()=>{unregister();document.removeEventListener('visibilitychange',pause);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',offline);void stop();};
  },[assignmentId]);
  useEffect(()=>{if(settings.value&&!settings.value.live_gps_enabled)void stoppedMessage('Live GPS disabled by warehouse staff.');},[settings.value?.live_gps_enabled]);
  async function start() {
    if(locked.current || !consent||!settings.value?.live_gps_enabled)return;
    if(!navigator.geolocation||!window.isSecureContext||!navigator.onLine){setMessage('GPS requires an online secure connection and location permission.');return;}
    locked.current=true;setBusy(true);setMessage('');
    try {
      if(stopping.current)await stopping.current;
      if(session.current){await stop();if(session.current)throw new Error('Server stop is unconfirmed. Retry Stop before sharing again.');}
      const run=++generation.current;
      const first=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:0}));
      if(run!==generation.current) return;
      const id=await startWithFirstPosition({position:first,active:()=>run===generation.current&&!document.hidden&&navigator.onLine,
        open:()=>api!.startTracking(assignmentId),opened:id=>{session.current=id;sessionStorage.setItem(storageKey,id)},
        send:(id,p)=>api!.sendLocation(id,p),stop:async()=>{await stop()}});
      if(!id)return;
      sending.current=false;lastSent.current=Date.now();setSharing(true);setMessage('Location sent / တည်နေရာ ပို့ပြီးပါပြီ');
      watch.current=navigator.geolocation.watchPosition(position=>{
        if(run!==generation.current || sending.current || document.hidden || !navigator.onLine || Date.now()-lastSent.current<10000) return;
        let payload;try{payload=positionPayload(position)}catch{void stoppedMessage('GPS position could not be verified.');return;}
        sending.current=true;lastSent.current=Date.now();
        void api!.sendLocation(id,payload).then(()=>{if(run===generation.current)setMessage('Location sent / တည်နေရာ ပို့ပြီးပါပြီ')}).catch(error=>{
          if(run!==generation.current)return;setMessage('Location update failed. No old position was queued.');if(error instanceof ApiError && [401,403,409,422].includes(error.status))void stop();
        }).finally(()=>{if(run===generation.current)sending.current=false;});
      },()=>{void stoppedMessage('Location permission or position unavailable.')},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
    } catch(error) { await stoppedMessage(error instanceof Error ? error.message : 'Location permission denied or unavailable.'); }
    finally{locked.current=false;setBusy(false);}
  }
  return <Card className="my-5"><h2 className="font-semibold">Share delivery location / တည်နေရာမျှဝေရန်</h2><p className="my-3 text-sm">Only while this page is visible. Leaving the page or going offline stops local capture. Your warehouse and associated SME can view the active delivery.</p><label className="block text-sm"><input type="checkbox" checked={consent} disabled={sharing || busy} onChange={e=>setConsent(e.target.checked)} /> I consent for this delivery / ဤပို့ဆောင်မှုအတွက် သဘောတူပါသည်</label><div className="my-4 flex gap-3"><Button disabled={!consent || sharing || busy || !settings.value?.live_gps_enabled} onClick={()=>void start()}>Start sharing</Button><Button variant="outline" onClick={()=>void stop()}>Stop sharing</Button></div><p role="status" className="text-sm">{settings.error}{settings.value&&!settings.value.live_gps_enabled?'Live GPS disabled in Warehouse Admin settings. ':''}{sharing ? 'Sharing while visible. ' : ''}{message}</p></Card>;
}
