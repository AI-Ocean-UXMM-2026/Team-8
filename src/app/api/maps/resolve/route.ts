import {googleMapsUrl,mapsCoordinates} from '../../../../shared/api/orders';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 try{
  const body=await request.json();const original=typeof body.url==='string'&&body.url.length<=2048?googleMapsUrl(body.url):null;
  if(!original)return Response.json({error:'Paste a Google Maps HTTPS link.'},{status:400,headers});
  let url=original;let point=mapsCoordinates(url.href);
  // Follow only Google Maps hosts without sending cookies or credentials.
  for(let i=0;!point&&i<5&&['maps.app.goo.gl','goo.gl'].includes(url.hostname);i++){
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(5000),cache:'no-store'});
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)break;const next=googleMapsUrl(new URL(location,url).href);if(!next)break;
   url=next;point=mapsCoordinates(url.href);
  }
  return Response.json({point,message:point?'Check the customer pin before confirming.':'This link has no readable pin. Choose the customer location on the map.'},{headers});
 }catch{return Response.json({point:null,message:'Link could not be read. Choose a pin on the map, or retry.'},{headers});}
}
