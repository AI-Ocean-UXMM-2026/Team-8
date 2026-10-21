'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import { registerSessionCleanup } from '../../shared/session/cleanup';
export function LocationSharing({ assignmentId }: { assignmentId: string }) {
  const { api,identity } = useSession(); const [consent,setConsent] = useState(false); const [sharing,setSharing] = useState(false); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  const watch = useRef<number | null>(null); const session = useRef<string | null>(null); const generation=useRef(0); const sending=useRef(false); const lastSent=useRef(0); const locked=useRef(false);
  const storageKey=`parcelcare.gps.${identity!.actor_id}.${assignmentId}`;
  const clearWatch=()=>{generation.current++;if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null;}setSharing(false);};
  async function stop() {
    clearWatch(); const current=session.current; session.current=null;
    if (!current) return;
    try { await api!.stopTracking(current); sessionStorage.removeItem(storageKey); setMessage('Location sharing ended / တည်နေရာမျှဝေမှု ရပ်ပြီးပါပြီ'); }
    catch { setMessage('Local sharing stopped. Server stop is unconfirmed; retry Stop before sharing again.'); session.current=current; }
  }
  useEffect(()=>{
    const unregister=registerSessionCleanup(stop);
    const pending=sessionStorage.getItem(storageKey);
    if(pending){session.current=pending;void stop();}
    const pause=()=>{if(document.hidden)void stop();}; const offline=()=>void stop();
    document.addEventListener('visibilitychange',pause);window.addEventListener('offline',offline);window.addEventListener('pagehide',offline);
    return ()=>{unregister();document.removeEventListener('visibilitychange',pause);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',offline);void stop();};
  },[assignmentId]);
  async function start() {
    if(locked.current || !consent || !navigator.geolocation || !window.isSecureContext || !navigator.onLine) return;
    locked.current=true;setBusy(true);setMessage('');
    try {
      if(session.current){await api!.stopTracking(session.current);sessionStorage.removeItem(storageKey);session.current=null;}
      const run=++generation.current;
      await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:0}));
      if(run!==generation.current) return;
      const id=await api!.startTracking(assignmentId);session.current=id;sessionStorage.setItem(storageKey,id);
      if(run!==generation.current){await stop();return;}
      lastSent.current=0;setSharing(true);
      watch.current=navigator.geolocation.watchPosition(position=>{
        if(run!==generation.current || sending.current || document.hidden || !navigator.onLine || Date.now()-lastSent.current<10000) return;
        sending.current=true;lastSent.current=Date.now();
        void api!.sendLocation(id,{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:position.coords.accuracy,recorded_at:new Date(position.timestamp).toISOString()}).then(()=>setMessage('Location sent / တည်နေရာ ပို့ပြီးပါပြီ')).catch(error=>{
          setMessage('Location update failed. No old position was queued.');if(error instanceof ApiError && [401,403,409,422].includes(error.status))void stop();
        }).finally(()=>{sending.current=false;});
      },()=>{setMessage('Location permission or position unavailable.');void stop();},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
    } catch(error) { clearWatch();setMessage(error instanceof Error ? error.message : 'Location permission denied or unavailable.'); }
    finally{locked.current=false;setBusy(false);}
  }
  return <Card className="my-5"><h2 className="font-semibold">Share delivery location / တည်နေရာမျှဝေရန်</h2><p className="my-3 text-sm">Only while this page is visible. Leaving the page or going offline stops local capture. Your warehouse and associated SME can view the active delivery.</p><label className="block text-sm"><input type="checkbox" checked={consent} disabled={sharing || busy} onChange={e=>setConsent(e.target.checked)} /> I consent for this delivery / ဤပို့ဆောင်မှုအတွက် သဘောတူပါသည်</label><div className="my-4 flex gap-3"><Button disabled={!consent || sharing || busy} onClick={()=>void start()}>Start sharing</Button><Button variant="outline" onClick={()=>void stop()}>Stop sharing</Button></div><p role="status" className="text-sm">{sharing ? 'Sharing while visible. ' : ''}{message}</p></Card>;
}
