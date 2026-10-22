import {advanceDemoRoute,confirmDemoArrival,confirmDemoReceipt,resetDemoRoute,demoRouteSnapshot} from './demo-route';
export type DemoAction='advance'|'arrive'|'receive'|'reset'|'settings';
export function createDemoHub(){
 let raw='',revision=0;let settings={live_gps_enabled:true,demo_simulation_enabled:true};const seen=new Map<string,string>();
 const storage={getItem:()=>raw||null,setItem:(_key:string,value:string)=>{raw=value}};
 const read=(now=Date.now())=>({state:JSON.parse(raw||JSON.stringify({step:0,from:0,startedAt:0,stage:'transit'})),revision,settings,serverNow:now});
 return {read,command(body:{action:DemoAction;revision:number;key:string;settings?:typeof settings},now=Date.now()){
  const signature=JSON.stringify(body);if(seen.has(body.key)){if(seen.get(body.key)!==signature)throw Error('KEY_CONFLICT');return read(now);}
  if(body.revision!==revision)throw Error('STALE_DEMO');
  if(body.action==='settings'){if(!body.settings||typeof body.settings.live_gps_enabled!=='boolean'||typeof body.settings.demo_simulation_enabled!=='boolean')throw Error('INVALID_SETTINGS');settings={...body.settings};}
  else{if(!settings.demo_simulation_enabled)throw Error('DEMO_DISABLED');const before=demoRouteSnapshot(storage,now);if(body.action==='advance'){if(before.moving||before.step>=10||before.stage!=='transit')throw Error('ACTION_NOT_READY');advanceDemoRoute(storage,now);}else if(body.action==='arrive'){if(!before.canArrive||before.stage!=='transit')throw Error('ACTION_NOT_READY');confirmDemoArrival(storage,now);}else if(body.action==='receive'){if(before.stage!=='arrived')throw Error('ACTION_NOT_READY');confirmDemoReceipt(storage);}else if(body.action==='reset')resetDemoRoute(storage);else throw Error('INVALID_ACTION');}
  revision++;seen.set(body.key,signature);if(seen.size>100)seen.delete(seen.keys().next().value!);return read(now);
 }};
}
export type DemoPacket=ReturnType<ReturnType<typeof createDemoHub>['read']>;
export function packetSnapshot(packet:DemoPacket,now=Date.now()){return demoRouteSnapshot({getItem:()=>JSON.stringify(packet.state),setItem:()=>{}},now);}
export function checkedDemoPacket(value:unknown):DemoPacket{const p=value as DemoPacket,s=p?.state;if(!p||!s||!Number.isInteger(p.revision)||p.revision<0||!Number.isFinite(p.serverNow)||!Number.isInteger(s.step)||s.step<0||s.step>10||!Number.isInteger(s.from)||s.from<0||s.from>s.step||!Number.isFinite(s.startedAt)||!['transit','arrived','delivered'].includes(s.stage)||typeof p.settings?.live_gps_enabled!=='boolean'||typeof p.settings.demo_simulation_enabled!=='boolean')throw Error('Shared demo state could not be verified.');return p;}
export async function getDemoPacket(signal?:AbortSignal):Promise<DemoPacket>{const response=await fetch('/api/demo/tracking',{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});if(!response.ok)throw Error('Shared demo unavailable. Check your connection.');return checkedDemoPacket(await response.json());}
export async function sendDemoAction(action:DemoAction,revision:number,settings?:DemoPacket['settings']){const response=await fetch('/api/demo/tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision,key:crypto.randomUUID(),...(settings?{settings}:{})}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(response.status===409?'Demo changed in another dashboard. Refresh and retry.':'Shared demo action could not be confirmed. Check the connection and refresh before retrying.');return checkedDemoPacket(await response.json());}
