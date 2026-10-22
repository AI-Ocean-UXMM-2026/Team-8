import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {createMockTransport}=require('../.test-build/src/shared/api/mock.js');
const origin='http://127.0.0.1:3117',authOrigin='https://tracking-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3117','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='',browser,page,finishPending=()=>{};server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}assert.ok(ready,output);
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const p=page=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const user={id:'10000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 await p.route(authOrigin+'/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:{access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user}}));
 const mock=createMockTransport({dataset:'warehouse'}),session='10000000-0000-4000-8000-000000000073';
 let releasePosition,positionCalls=0,holdPosition=true,releaseList,listCalls=0,holdList=true;
 finishPending=()=>{holdPosition=false;holdList=false;releasePosition?.();releaseList?.()};
 await p.route(origin+'/api/**',async r=>{
  const url=new URL(r.request().url()),path=url.pathname;
  if(path==='/api/tracking/'+session+'/live'){
   positionCalls++;if(holdPosition)await new Promise(resolve=>releasePosition=resolve);
   return r.fulfill({json:{session_id:session,status:'live',latitude:16.8,longitude:96.1,accuracy_m:5,recorded_at:new Date(await p.evaluate(()=>Date.now())).toISOString()}});
  }
  if(path.startsWith('/api/deliveries/'))return r.fulfill({json:{shipment:{id:path.split('/').pop()},session_id:session}});
  if(path==='/api/shipments'&&holdList){listCalls++;await new Promise(resolve=>releaseList=resolve)}
  try{return r.fulfill({json:await mock({method:'GET',path:path+url.search})})}catch(e){return r.fulfill({status:e.status||500,json:{error:{code:e.code,message:e.message}}})}
 });
 await p.goto(origin+'/login');await p.getByLabel('Email',{exact:true}).fill('fixture@example.test');await p.getByLabel('Password',{exact:true}).fill('fixture-password');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.getByRole('heading',{name:'Warehouse overview',exact:true}).waitFor();
 console.log('Signed in with fixture session');
 await p.clock.install();await p.goto(origin+'/warehouse/tracking',{waitUntil:'domcontentloaded'});await p.getByText('Loading workspace…',{exact:false}).waitFor();
 await p.clock.runFor(31000);
 assert.equal(listCalls,1,'Slow shipment reads must survive multiple polling intervals');
 console.log('Slow shipment read survives polling');
 holdList=false;releaseList();await p.getByRole('heading',{name:'Live Courier Tracking',exact:true}).waitFor();await p.waitForFunction(()=>document.body.textContent.includes('Checking location sharing'));
 await p.clock.runFor(31000);assert.equal(positionCalls,1,'Slow GPS reads must not be cancelled/restarted every 15 seconds');
 holdPosition=false;releasePosition();await p.getByText('Live location',{exact:true}).waitFor();
 holdPosition=true;await p.clock.runFor(62000);await p.getByText('Last known location',{exact:true}).waitFor();
 await p.getByText('Location is stale. It does not represent the courier’s current position.',{exact:true}).waitFor();
 assert.equal(positionCalls,2,'Only one background GPS request may be active');
 await mkdir('test-results',{recursive:true});await p.screenshot({path:'test-results/tracking-stale-regression.png',fullPage:true});
 await p.getByRole('button',{name:'Refresh tracking',exact:true}).click();await p.getByText('Checking location sharing…',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: slow shipment/GPS reads survive polling, one in-flight request, stale positions age without a response, explicit refresh clears old location.');
}catch(error){console.error(output.slice(-2500));console.error(error);throw error}finally{await page?.unrouteAll({behavior:'ignoreErrors'});finishPending();await browser?.close();server.kill()}
