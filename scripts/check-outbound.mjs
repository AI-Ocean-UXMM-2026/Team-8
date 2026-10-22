import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const f=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const origin='http://127.0.0.1:3120',auth='https://outbound-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3120','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,PARCELCARE_TEST_BUILD:'1',NEXT_PUBLIC_SUPABASE_URL:auth,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',NEXT_PUBLIC_PARCELCARE_API_URL:origin}});
let output='',browser,page;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try {
 let ready=false;
 for(let i=0;i<180;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,output);
 const shipment=structuredClone(f.shipments.find(s=>s.direction==='outbound'&&s.delivery_mode==='third_party'));
 shipment.status='ready';shipment.reference='OUTBOUND-TEST';
 const id=shipment.id,w=shipment.warehouse_id,s=shipment.sme_id,p=shipment.items[0].product_id;
 for(const path of ['/login','/warehouse/shipments',`/warehouse/shipments/${id}`,`/warehouse/deliveries/${id}`])assert.ok((await fetch(origin+path)).ok,path);
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const user={id:'10000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'outbound@test.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 await page.route(auth+'/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:{access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user}}));
 let created=false,createLost=true,returnLost=true;const createKeys=[],returnKeys=[];
 const delivery={shipment,courier_name:'Carrier',waybill:'TEST',tracking_url:null,assignments:[],riders:[],proofs:[],handovers:[],capacity:[],session_id:null,returns:[]};
 await page.route(origin+'/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/me')return route.fulfill({json:{actor_id:user.id,memberships:[{warehouse_id:w,role:'staff',sme_id:null}]}});
  if(path==='/api/warehouse/directory')return route.fulfill({json:f.directory});
  if(path==='/api/inventory')return route.fulfill({json:{items:f.inventory.filter(item=>item.sme_id===s),next_cursor:null}});
  if(path==='/api/orders')return route.fulfill({json:[]});
  if(path==='/api/shipments'&&req.method()==='GET')return route.fulfill({json:{items:created?[shipment]:[],next_cursor:null}});
  if(path==='/api/shipments'&&req.method()==='POST'){
   const body=req.postDataJSON();assert.equal(body.direction,'outbound');assert.equal(body.delivery_mode,'third_party');assert.equal(body.lines[0].expected_qty,5);assert.equal(body.sme_id,s);
   createKeys.push(req.headers()['idempotency-key']);created=true;
   if(createLost){createLost=false;return route.abort('failed');}return route.fulfill({status:201,json:shipment});
  }
  if(path===`/api/shipments/${id}`)return route.fulfill({json:shipment});
  if(path==='/api/exceptions')return route.fulfill({json:{items:[],next_cursor:null}});
  if(path===`/api/orders/shipment/${id}/customer`)return route.fulfill({json:null});
  if(path===`/api/deliveries/${id}`)return route.fulfill({json:delivery});
  if(path===`/api/deliveries/${id}/destination`)return route.fulfill({json:{latitude:16.84,longitude:96.17,label:'Warehouse delivery'}});
  if(path===`/api/deliveries/${id}/cancel`){shipment.status='cancelled';shipment.version++;return route.fulfill({json:delivery});}
  if(path===`/api/deliveries/${id}/return`){
   const body=req.postDataJSON();assert.deepEqual(body.lines,[{product_id:p,received_qty:3,damaged_qty:1}]);assert.equal(body.evidence_id,shipment.evidence[0].id);
   returnKeys.push(req.headers()['idempotency-key']);
   if(returnLost){returnLost=false;shipment.version++;delivery.returns=[{product_id:p,received_qty:3,damaged_qty:1}];return route.abort('failed');}
   return route.fulfill({json:delivery});
  }
  return route.fulfill({status:404,json:{error:{code:'NOT_FOUND',message:'Fixture missing '+path}}});
 });
 await page.goto(origin+'/login');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/warehouse');
 await page.goto(origin+'/warehouse/shipments');await page.getByText('Create outbound shipment · အထွက်ပို့ဆောင်မှု အသစ်ဖန်တီးရန်',{exact:true}).click();
 await page.getByLabel('Shipment SME',{exact:true}).selectOption(s);await page.getByLabel('Shipment reference',{exact:true}).fill('OUTBOUND-TEST');await page.getByLabel('Shipment delivery mode',{exact:true}).selectOption('third_party');
 await page.getByLabel(`Shipment quantity for ${shipment.items[0].name}`,{exact:true}).fill('5');await page.getByRole('button',{name:'Review outbound shipment',exact:true}).click();await page.getByRole('region',{name:'Outbound shipment review'}).waitFor();await page.getByRole('button',{name:'Confirm create shipment',exact:true}).click();
 await page.getByRole('button',{name:'Retry shipment creation',exact:true}).waitFor();await page.reload();await page.getByText('Create outbound shipment · အထွက်ပို့ဆောင်မှု အသစ်ဖန်တီးရန်',{exact:true}).click();await page.getByRole('button',{name:'Retry shipment creation',exact:true}).click();await page.getByRole('link',{name:'Open OUTBOUND-TEST →',exact:true}).click();
 assert.equal(createKeys.length,2);assert.equal(createKeys[0],createKeys[1]);
 await page.getByRole('link',{name:'Manage assignment, handover and proof',exact:true}).click();await page.getByRole('heading',{name:/Outbound workflow/}).waitFor();
 // A physical carrier handover is established by database tests; fixture it here
 // to exercise the cancel-to-return UI, including an uncertain committed return.
 shipment.status='handed_over';delivery.handovers=[{id:crypto.randomUUID(),courier_name:'Carrier',accepted_at:shipment.created_at,package_condition:'Intact',package_count:1}];await page.reload();
 await page.getByLabel('Delivery operation',{exact:true}).selectOption('cancel');await page.getByLabel('Delivery note',{exact:true}).fill('Return to warehouse');await page.getByRole('button',{name:'Review and submit delivery action',exact:true}).click();
 await page.getByRole('heading',{name:/Receive returned goods/}).waitFor();await page.getByLabel('Delivery evidence',{exact:true}).selectOption(shipment.evidence[0].id);await page.getByLabel(`Returned quantity for ${shipment.items[0].name}`,{exact:true}).fill('3');await page.getByLabel(`Returned damaged quantity for ${shipment.items[0].name}`,{exact:true}).fill('1');await page.getByLabel('Delivery note',{exact:true}).fill('Physical return counted');await page.getByRole('button',{name:'Review and submit delivery action',exact:true}).click();
 await page.getByRole('button',{name:'Retry original delivery request',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Retry original delivery request',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved: cancelled'}).waitFor();
 assert.equal(returnKeys.length,2);assert.equal(returnKeys[0],returnKeys[1]);await page.getByText(`${shipment.items[0].name} · Remaining 2`,{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');assert.deepEqual(errors,[]);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/outbound-return-mobile.png',fullPage:true});
 console.log('PASS outbound browser: direct creation review and lost-response reload/replay, workflow navigation, third-party cancellation, evidenced partial damaged return, uncertain return replay, remaining counts and mobile layout');
} catch(error) {console.error(output);if(page){await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/outbound-failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally {await browser?.close();server.kill();}
