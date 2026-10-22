// Fictitious Yangon illustration. Never used as road directions or real GPS.
export const demoShipmentId='10000000-0000-4000-8000-000000000022';
export const demoRoutePoints:[number,number][]=[[96.1565,16.7902],[96.1580,16.7902],[96.1598,16.7903],[96.1598,16.7920],[96.1599,16.7940],[96.1620,16.7940],[96.1640,16.7941],[96.1642,16.7960]];
export const demoRouteStorageKey='parcelcare.shared-gps.preview.v1';
type Store=Pick<Storage,'getItem'|'setItem'>;
export function demoRouteSnapshot(storage?:Store,now=Date.now()){
 let sharing=false,startedAt=0,index=0;
 try{const value=JSON.parse(storage?.getItem(demoRouteStorageKey)||'null');if(value&&typeof value.sharing==='boolean'&&Number.isFinite(value.startedAt)&&Number.isInteger(value.index)&&value.index>=0&&value.index<demoRoutePoints.length){sharing=value.sharing;startedAt=value.startedAt;index=value.index;}}catch{}
 if(sharing)index=Math.min(demoRoutePoints.length-1,Math.max(0,Math.floor((now-startedAt)/4000)));
 const completed=sharing&&index===demoRoutePoints.length-1;
 return {sharing:sharing&&!completed,completed,index,position:demoRoutePoints[index],destination:demoRoutePoints[demoRoutePoints.length-1],coordinates:demoRoutePoints};
}
export function setDemoRouteSharing(storage:Store,sharing:boolean,now=Date.now()){
 const previous=demoRouteSnapshot(storage,now);
 storage.setItem(demoRouteStorageKey,JSON.stringify({sharing,startedAt:now,index:sharing?0:previous.index}));
}
