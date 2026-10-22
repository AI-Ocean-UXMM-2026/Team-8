import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Fictitious auth, GPS and routing responses. No provider or real location is used.
const origin='http://127.0.0.1:3220',authOrigin='https://map-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3220','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}assert.ok(ready,output);
 const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
 const shipment=structuredClone(fixture.shipments.find(s=>s.direction==='outbound'&&s.delivery_mode==='in_house'));shipment.status='in_transit';
 const actor='10000000-0000-4000-8000-000000000099',assignmentId=crypto.randomUUID(),sessionId=crypto.randomUUID(),timestamp=new Date().toISOString();
 const assignment={id:assignmentId,shipment_id:shipment.id,reference:shipment.reference,status:shipment.status,version:shipment.version,assigned_at:timestamp,accepted_at:timestamp,picked_up_at:timestamp,cancelled_at:null,completed_at:null};
 const exp=Math.floor(Date.now()/1000)+3600,user={id:actor,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:timestamp};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user};
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:16.8,longitude:96.1,accuracy:5}});
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(session=>{sessionStorage.setItem('sb-map-fixture-auth-token',JSON.stringify(session));window.__gpsClears=0;const clear=navigator.geolocation.clearWatch.bind(navigator.geolocation);navigator.geolocation.clearWatch=id=>{window.__gpsClears++;clear(id)}},session);
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 await page.route(authOrigin+'/**',route=>route.fulfill({headers:cors,json:session}));
 let planned=null,active=false,locations=0,starts=0,stops=0,routes=0;
 await page.route(origin+'/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,reply=json=>route.fulfill({json});
  if(path==='/api/me')return reply({actor_id:actor,memberships:[{warehouse_id:shipment.warehouse_id,role:'rider',sme_id:null}]});
  if(path.endsWith('/tracking-settings'))return reply({live_gps_enabled:true,demo_simulation_enabled:true});
  if(path==='/api/rider/assignments')return reply([assignment]);
  if(path===`/api/deliveries/${shipment.id}`)return reply({shipment,assignments:[assignment],proofs:[],session_id:active?sessionId:null});
  if(path.endsWith('/arrival'))return reply(null);
  if(path.endsWith('/route')){
   if(request.method()==='GET')return reply(planned);
   const body=request.postDataJSON();assert.equal(body.consent,true);assert.equal(body.origin_latitude,16.8);assert.equal(body.destination_latitude,16.9);routes++;
   planned={provider:'openrouteservice',profile:'car',coordinates:[[96.1,16.8],[96.2,16.9]],distance_m:2400,duration_ms:180000,traffic_aware:false,destination_source:'courier_selected',shipment_id:shipment.id,assignment_id:assignmentId,origin:[96.1,16.8],destination:[96.2,16.9],saved_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()};return reply(planned);
  }
  if(path==='/api/tracking/start'){starts++;assert.equal(request.postDataJSON().consent,true);active=true;return reply(sessionId)}
  if(path.endsWith('/locations')){locations++;assert.equal(request.postDataJSON().latitude,16.8);assert.equal(request.postDataJSON().longitude,96.1);return reply(sessionId)}
  if(path.endsWith('/stop')){stops++;active=false;return route.fulfill({status:204})}
  return route.fulfill({status:403,json:{error:{code:'FORBIDDEN',message:'Unknown fixture request'}}});
 });
 await page.goto(origin+'/courier');await page.getByRole('button',{name:'View route & GPS',exact:true}).click();
 await page.getByRole('heading',{name:'Delivery route',exact:true}).waitFor();assert.equal(starts,0);assert.equal(routes,0);
 await page.getByLabel('Destination latitude',{exact:true}).fill('16.9');await page.getByLabel('Destination longitude',{exact:true}).fill('96.2');
 const calculate=page.getByRole('button',{name:'Calculate route',exact:true});assert.equal(await calculate.isEnabled(),false);
 await page.getByRole('checkbox',{name:'I checked the destination',exact:false}).check();await calculate.click();await page.getByText('Route mode: Car',{exact:true}).waitFor();assert.equal(routes,1);
 const start=page.getByRole('button',{name:'Start sharing',exact:true});assert.equal(await start.isEnabled(),false);
 await page.getByRole('checkbox',{name:'I consent for this delivery',exact:false}).check();await start.click();await page.getByText('Sharing while visible.',{exact:false}).waitFor();assert.equal(starts,1);assert.equal(locations,1);
 await page.getByRole('button',{name:'Stop sharing',exact:true}).click();await page.getByText('Location sharing ended',{exact:false}).waitFor();assert.ok(stops>0);assert.ok(await page.evaluate(()=>window.__gpsClears>0));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await context.close();console.log('PASS authenticated mobile courier: route/GPS consent, mocked route request/result, first GPS publish, watch cleanup and stop');
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve))}
