export type MapPoint=[number,number];
export interface MapHandle{setView(p:MapPoint,z:number):MapHandle;fitBounds(points:MapPoint[],options:object):void;invalidateSize():void;remove():void;on(event:string,fn:(e:{latlng:{lat:number;lng:number}})=>void):void}
export interface Layer{addTo(m:MapHandle):Layer;remove():void;setLatLng(p:MapPoint):void;on?(event:string,fn:()=>void):void}
export interface Leaflet{map(node:HTMLElement,options:object):MapHandle;tileLayer(url:string,options:object):Layer;circleMarker(p:MapPoint,options:object):Layer;polyline(points:MapPoint[],options:object):Layer}
const valid=(p:MapPoint|null|undefined):p is MapPoint=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
export function createMapController(l:Leaflet,node:HTMLElement,callbacks:{destination?:(p:MapPoint)=>void;tileError?:(failed:boolean)=>void}={}){
 const map=l.map(node,{scrollWheelZoom:false}).setView([16.8409,96.1735],11);
 let alive=true,position:Layer|null=null,destination:Layer|null=null,line:Layer|null=null,key='';
 const tiles=l.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
 tiles.on?.('tileerror',()=>{if(alive)callbacks.tileError?.(true)});
 tiles.on?.('tileload',()=>{if(alive)callbacks.tileError?.(false)});
 map.on('click',e=>{const p:MapPoint=[e.latlng.lat,e.latlng.lng];if(alive&&valid(p))callbacks.destination?.(p)});
 return {
  update(p?:MapPoint|null,d?:MapPoint|null,route?:MapPoint[]){
   if(!alive)return;
   const points=route&&route.length>=2&&route.length<=10000&&route.every(valid)?route:[];
   if(valid(p)){if(position)position.setLatLng(p);else{position=l.circleMarker(p,{radius:8,color:'#0e7490',fillColor:'#25cbd1',fillOpacity:1}).addTo(map);if(!points.length)map.setView(p,14)}}else{position?.remove();position=null}
   if(valid(d)){if(destination)destination.setLatLng(d);else{destination=l.circleMarker(d,{radius:9,color:'#92400e',fillColor:'#ffc738',fillOpacity:1}).addTo(map);if(!points.length)map.setView(d,14)}}else{destination?.remove();destination=null}
   const next=JSON.stringify(points);
   if(next!==key){line?.remove();line=null;key=next;if(points.length){line=l.polyline(points,{color:'#0e7490',weight:5}).addTo(map);map.fitBounds(points,{padding:[24,24],maxZoom:15})}}
  },
  resize(){if(alive)map.invalidateSize()},
  destroy(){if(!alive)return;alive=false;map.remove();position=null;destination=null;line=null},
 };
}
