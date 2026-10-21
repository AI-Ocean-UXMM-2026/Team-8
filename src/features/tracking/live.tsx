'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { dateTime } from '../warehouse/shared';
import { usePolling } from '../portal/polling';
import { browserAuth } from '../auth/browser-client';
type MapInstance = { setView(point: [number,number], zoom: number): MapInstance; remove(): void };
type Leaflet = { map(node: HTMLElement, options: object): MapInstance; tileLayer(url: string, options: object): { addTo(map: MapInstance): void }; circleMarker(point: [number,number], options: object): { addTo(map: MapInstance): void } };
export function LiveTracking({ sessionId }: { sessionId: string }) {
  const { api } = useSession(); const node = useRef<HTMLDivElement>(null); const [ready,setReady] = useState(false);
  const resource = usePolling(sessionId,signal=>api!.getLiveLocation(sessionId,signal),10000);
  const [online,setOnline]=useState(true); const [connected,setConnected]=useState(false);
  useEffect(()=>{const changed=()=>{setOnline(navigator.onLine);resource.reload();};window.addEventListener('online',changed);window.addEventListener('offline',changed);return()=>{window.removeEventListener('online',changed);window.removeEventListener('offline',changed);};},[sessionId]);
  useEffect(()=>{
    const auth=browserAuth();if(!auth || resource.error)return;
    let active=true;let cleanup=()=>{};
    void auth.auth.getSession().then(async({data})=>{
      if(!active || !data.session)return;
      await auth.realtime.setAuth(data.session.access_token);if(!active)return;
      const channel=auth.channel(`tracking:${sessionId}`,{config:{private:true}}).on('broadcast',{event:'location'},()=>resource.reload()).subscribe(status=>{if(active)setConnected(status==='SUBSCRIBED');});
      const listener=auth.auth.onAuthStateChange((_event,session)=>{if(session)void auth.realtime.setAuth(session.access_token);});
      cleanup=()=>{listener.data.subscription.unsubscribe();void auth.removeChannel(channel);};
    }).catch(()=>{if(active)setConnected(false);});
    return()=>{active=false;setConnected(false);cleanup();};
  },[sessionId,!!resource.error]);
  const location = online && !resource.error && !resource.loading ? resource.data : null;
  const point = location && typeof location.latitude === 'number' && typeof location.longitude === 'number' && Number.isFinite(location.latitude) && Number.isFinite(location.longitude) ? [location.latitude,location.longitude] as [number,number] : null;
  useEffect(()=>{
    const library=(window as typeof window & { L?: Leaflet }).L;
    if (!ready || !library || !node.current || !point) return;
    const map=library.map(node.current,{scrollWheelZoom:false}).setView(point,14);
    library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
    library.circleMarker(point,{radius:9,color:'#047857',fillOpacity:0.85}).addTo(map);
    return ()=>map.remove();
  },[ready,point?.[0],point?.[1]]);
  return <Card className="my-5"><h2 className="text-lg font-semibold">Delivery location / ပို့ဆောင်မှုတည်နေရာ</h2><Script src="/vendor/leaflet.js" onReady={()=>setReady(true)} />
    {resource.error ? <p role="status" className="mt-3">Location unavailable or access ended. / တည်နေရာ မရရှိနိုင်တော့ပါ။</p> : <><Badge className="mt-3">{location?.status ?? 'Checking location'}</Badge>{location?.recorded_at && <p className="my-3 text-sm">Last updated: {dateTime(location.recorded_at)} · Yangon · accuracy {location.accuracy_m ?? 'unknown'} m</p>}{location?.status === 'stale' && <p role="status" className="my-3">This is an old position; current location is unknown.</p>}{point && <div ref={node} aria-label="Authorized delivery location map" className="relative z-0 mt-4 h-72 rounded-lg" />}</>}
    <p className="mt-3 text-sm text-muted">{online ? connected ? 'Live updates connected.' : 'Checking every 10 seconds.' : 'Offline. Current location unavailable.'} Foreground updates only. No guaranteed arrival time. / နောက်ခံလုပ်ဆောင်ချိန်တွင် တည်နေရာ ဆက်ပို့နိုင်မည်ဟု အာမခံမထားပါ။</p></Card>;
}
