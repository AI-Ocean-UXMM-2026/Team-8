let nextRequest=0;
const cache=new Map<string,{expires:number;value:unknown}>();
export async function GET(request:Request){
 const q=new URL(request.url).searchParams.get('q')?.trim()??'';
 if(q.length<2||q.length>200)return Response.json({error:'Enter a place name.'},{status:400});
 const saved=cache.get(q);if(saved&&saved.expires>Date.now())return Response.json(saved.value);
 if(Date.now()<nextRequest)return Response.json({error:'Please retry shortly.'},{status:429});
 nextRequest=Date.now()+1100;
 try{
  const url=new URL(process.env.PARCELCARE_GEOCODER_URL||'https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q,format:'jsonv2',countrycodes:'mm',limit:'8','accept-language':'my,en',viewbox:'95.9,17.2,96.5,16.5'}).toString();
  const r=await fetch(url,{headers:{'User-Agent':'ParcelCare/0.2 (delivery location search)'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error();
  const data:unknown=await r.json();if(!Array.isArray(data))throw new Error();
  const value=data.map(p=>({latitude:Number(p.lat),longitude:Number(p.lon),label:String(p.display_name).slice(0,500)})).filter(p=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180).sort((a,b)=>(Math.abs(a.latitude-16.8409)+Math.abs(a.longitude-96.1735))-(Math.abs(b.latitude-16.8409)+Math.abs(b.longitude-96.1735)));
  if(cache.size>=200)cache.clear();cache.set(q,{value,expires:Date.now()+86400000});return Response.json(value);
 }catch{return Response.json({error:'Search unavailable. Choose a map pin or retry.'},{status:503});}
}
