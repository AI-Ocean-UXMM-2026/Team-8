import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const origin='http://127.0.0.1:3118',authOrigin='https://order-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3118','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,PARCELCARE_TEST_BUILD:'1',NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',NEXT_PUBLIC_PARCELCARE_API_URL:origin}});
let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
const actor='10000000-0000-4000-8000-000000000099',w='10000000-0000-4000-8000-000000000001',s='10000000-0000-4000-8000-000000000002',p='10000000-0000-4000-8000-000000000003',id='10000000-0000-4000-8000-000000000004';
try{
 for(let i=0;i<160;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}
 for(const route of ['/login','/sme/orders','/warehouse/shipments','/sme/shipments/10000000-0000-4000-8000-000000000005',...(process.env.ORDER_TEST_LOCALIZATION==='1'?['/demo','/demo/sme','/demo/sme/orders','/demo/sme/reports','/demo/sme/tracking','/demo/sme/account','/api/demo/tracking']:[])])assert.ok((await fetch(origin+route)).ok);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:actor,aud:'authenticated',role:'authenticated',email:'orders@test.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 await page.route(authOrigin+'/**',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/user')?user:{access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user}}));
 let order=null,lost=true,role='sme',profile=null,received=false;const keys=[];
 await page.route(origin+'/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;
  const shipmentId='10000000-0000-4000-8000-000000000005',proofId='10000000-0000-4000-8000-000000000006';
  const shipment=()=>({...fixture.shipments.find(x=>x.direction==='outbound'&&x.delivery_mode==='in_house'),id:shipmentId,warehouse_id:w,sme_id:s,reference:'ORD-'+id,status:received?'delivered':'in_transit',version:received?3:2});
  const delivery=()=>({shipment:shipment(),courier_name:null,waybill:null,tracking_url:null,assignments:[],riders:[],proofs:[{id:proofId,confirmed_at:received?new Date().toISOString():null,received_by:'SME Shop A'}],handovers:[],capacity:[],session_id:null,returns:[]});
  if(path===`/api/orders/shipment/${shipmentId}/customer`)return route.fulfill({json:order?.payload??null});
  if(path===`/api/deliveries/${shipmentId}`)return route.fulfill({json:delivery()});
  if(path===`/api/deliveries/${shipmentId}/route`)return route.fulfill({json:null});
  if(path===`/api/deliveries/${shipmentId}/arrival`)return route.fulfill({json:{shipment_id:shipmentId,arrived_at:new Date().toISOString(),latitude:16.84,longitude:96.17,delivered:received}});
  if(path===`/api/deliveries/${shipmentId}/confirm`){assert.equal(req.postDataJSON().proof_id,proofId);received=true;return route.fulfill({json:delivery()});}
  if(path==='/api/maps/resolve')return route.continue();
  if(path==='/api/orders/catalog-page'){
   const all=[{id:p,warehouse_id:w,name:'Test product',sku:'TEST',category:'food_beverages',available_qty:order?7:10},...Array.from({length:24},(_,i)=>({id:`50000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,warehouse_id:w,name:`Item ${String(i+1).padStart(2,'0')}`,sku:`SKU-${i+1}`,category:'electronics',available_qty:10}))];
   const selected=u.searchParams.getAll('selected_ids'),category=u.searchParams.get('category'),search=(u.searchParams.get('search')??'').toLowerCase(),offset=Number(u.searchParams.get('cursor')??0);
   const filtered=all.filter(p=>(!category||p.category===category)&&(!search||(p.name+' '+p.sku).toLowerCase().includes(search)));
   return route.fulfill({json:{items:filtered.slice(offset,offset+12),selected_items:all.filter(p=>selected.includes(p.id)),categories:['electronics','food_beverages'],total:filtered.length,next_cursor:offset+12<filtered.length?String(offset+12):null}});
  }
  if(path==='/api/orders/catalog')return route.fulfill({json:[{id:p,warehouse_id:w,name:'Test product',sku:'TEST',available_qty:order?7:10}]});
  if(path==='/api/orders/delivery-profile'){if(req.method()==='PUT')profile=req.postDataJSON();return route.fulfill({json:profile});}
  if(path==='/api/me')return route.fulfill({json:{actor_id:actor,memberships:[{warehouse_id:w,role,sme_id:role==='sme'?s:null}]}});
  if(path==='/api/sme/overview')return route.fulfill({json:{inventory:[{id:p,warehouse_id:w,sme_id:s,name:'Test product',sku:'TEST',available_qty:order?7:10,quarantined_qty:0,shipment_ids:[]}],shipments:[],cases:[],approvals:[]}});
  if(path==='/api/shipments')return route.fulfill({json:{items:[],next_cursor:null}});
  if(path==='/api/warehouse/directory')return route.fulfill({json:fixture.directory});
  if(path==='/api/orders'&&req.method()==='GET')return route.fulfill({json:order?[order]:[]});
  if(path==='/api/orders'&&req.method()==='POST'){
   keys.push(req.headers()['idempotency-key']);const body=req.postDataJSON();assert.equal(body.order_kind,'sme_self_delivery');assert.equal(body.recipient_name,'SME Shop A');if(body.save_delivery_profile)profile={recipient_name:body.recipient_name,recipient_phone:body.recipient_phone,address:body.address,latitude:body.latitude,longitude:body.longitude,maps_url:body.maps_url,notes:body.notes};assert.equal(body.lines[0].expected_qty,3);assert.equal(body.latitude,16.84);assert.equal(body.maps_url,'');
   order={id,warehouse_id:w,sme_id:s,created_at:new Date().toISOString(),status:'pending',payload:body,note:'',shipment_id:null,reserved:true};
   if(lost){lost=false;return route.abort('failed');}return route.fulfill({status:201,json:order});
  }
  if(path===`/api/orders/${id}/actions`){const action=req.postDataJSON();order={...order,status:action.action==='accept'?'accepted':action.action==='reject'?'rejected':'cancelled',reserved:action.action==='accept',note:action.note??'',shipment_id:action.action==='accept'?'10000000-0000-4000-8000-000000000005':null};return route.fulfill({json:order});}
  return route.fulfill({status:404,json:{error:{code:'NOT_FOUND',message:'Fixture missing'}}});
 });
 await page.goto(origin+'/login');await page.getByLabel('Email',{exact:true}).fill('orders@test.invalid');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/sme');
 await page.getByRole('link',{name:/Create delivery order/}).click();
 await page.getByRole('button',{name:'Continue to delivery',exact:true}).click();await page.getByText('Add at least one product to your order.',{exact:true}).waitFor();
 const basket=page.getByRole('region',{name:'Your order',exact:true});
 await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Test product',exact:true})}).getByRole('button',{name:'Add',exact:true}).click();
 await basket.getByLabel('Quantity for Test product').fill('3');
 await page.getByRole('button',{name:'Next products',exact:true}).click();await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Item 12',exact:true})}).getByRole('button',{name:'Add',exact:true}).click();await basket.getByLabel('Quantity for Item 12').waitFor();assert.equal(await basket.getByLabel('Quantity for Test product').inputValue(),'3');await basket.getByRole('button',{name:'Remove Item 12',exact:true}).click();
 await page.getByLabel('Category',{exact:true}).selectOption('electronics');await page.getByText('24 matching products',{exact:true}).waitFor();assert.equal(await basket.getByLabel('Quantity for Test product').inputValue(),'3');
 await page.getByLabel('Search products',{exact:true}).fill('SKU-24');await page.getByText('1 matching products',{exact:true}).waitFor();await page.getByRole('heading',{name:'Item 24',exact:true}).waitFor();assert.equal(await basket.getByLabel('Quantity for Test product').inputValue(),'3');
 await page.getByRole('button',{name:'Continue to delivery',exact:true}).click();await page.getByRole('button',{name:'Continue to confirmation',exact:true}).click();await page.getByText('Enter the delivery contact name.',{exact:true}).waitFor();await page.getByText('Enter a phone number with at least 3 characters.',{exact:true}).waitFor();await page.getByText('Enter the street address, floor or landmark.',{exact:true}).waitFor();
 await page.getByLabel('Name').fill('SME Shop A');await page.getByLabel('Phone').fill('091234567');await page.getByLabel('Address, floor').fill('Yangon, Floor 2');
 await page.route(origin+'/api/places**',route=>route.fulfill({json:[{latitude:16.84,longitude:96.17,label:'Yangon test location'}]}));
 assert.equal(await page.getByRole('button',{name:'Save SME delivery address',exact:true}).count(),0);assert.equal(await page.getByLabel('Google Maps link for your SME').count(),0);
 await page.getByLabel('Search place or township',{exact:true}).fill('Yangon');await page.getByLabel('Search place or township',{exact:true}).press('Enter');await page.getByRole('checkbox',{name:'Confirm SME delivery pin'}).waitFor();await page.getByRole('checkbox',{name:'Confirm SME delivery pin'}).check();
 await page.getByRole('button',{name:'Continue to confirmation',exact:true}).click();await page.getByRole('region',{name:'Confirm order',exact:true}).waitFor();assert.equal(keys.length,0);
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('heading',{name:'Delivery details',exact:true}).waitFor();await page.getByRole('checkbox',{name:'Confirm SME delivery pin'}).check();await page.getByRole('button',{name:'Continue to confirmation',exact:true}).click();
 await page.getByRole('button',{name:'Place order',exact:true}).click();await page.getByRole('button',{name:'Retry same order',exact:true}).waitFor();await page.getByRole('button',{name:'Retry same order',exact:true}).click();await page.getByText('Order placed. Awaiting warehouse approval.',{exact:true}).waitFor();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(profile.address,'Yangon, Floor 2');await page.getByText('Awaiting warehouse approval. Tracking will appear after approval.',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'View order status and tracking below →'}).getAttribute('href'),'#order-'+id);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Order warehouse stock',exact:true}).waitFor();await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Test product',exact:true})}).getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Continue to delivery',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[maxlength="120"]')?.value==='SME Shop A');assert.equal(await page.getByRole('checkbox',{name:'Confirm SME delivery pin'}).isChecked(),false);const originalAddress=order.payload.address;await page.getByLabel('Address, floor').fill('New SME shop address');assert.equal(order.payload.address,originalAddress);
 await page.getByRole('button',{name:/Cancel order/}).click();await page.getByRole('heading',{name:/cancelled/i}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/sme-orders-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 if(process.env.ORDER_FORM_ONLY!=='1'){
 role='staff';order={...order,status:'pending',note:'',shipment_id:null};await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/warehouse/shipments');await page.getByRole('button',{name:'Accept & create shipment'}).click();await page.getByRole('heading',{name:/accepted/i}).waitFor();assert.ok(await page.getByRole('link',{name:'View shipment / tracking →'}).getAttribute('href'));await page.screenshot({path:'test-results/warehouse-orders-desktop.png',fullPage:true});
 role='sme';await page.goto(origin+`/sme/shipments/${order.shipment_id}`);await page.getByRole('heading',{name:'SME delivery contact',exact:true}).waitFor();await page.getByText('Yangon, Floor 2',{exact:true}).waitFor();await page.getByRole('checkbox',{name:'I received the goods and verified this delivery.'}).check();await page.getByRole('button',{name:'Review receipt confirmation',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm receipt',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('Delivery successful'));assert.equal(received,true);assert.deepEqual(errors,[]);console.log('PASS browser orders: confirmed SME address, shipment tracking and explicit SME receipt after proof');
 role='staff';order={...order,status:'pending',shipment_id:null};await page.goto(origin+'/warehouse/shipments');await page.getByLabel('Rejection reason').fill('Delivery address unavailable');await page.getByRole('button',{name:'Reject',exact:true}).click();await page.getByRole('heading',{name:/rejected/i}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS browser orders: warehouse acceptance, shipment link and rejection reason');
 if(process.env.ORDER_TEST_LOCALIZATION==='1'){
  process.env.LOCALIZATION_TEST_URL=origin;process.env.LOCALIZATION_TEST_ROLE='SME';process.env.LOCALIZATION_TEST_WIDTH='390';await import('./check-localization.mjs');
 }
 }
 console.log('PASS checkout: catalogue paging/search/categories, cart persistence, three steps, validation, delivery pin, saved address, safe retry, tracking status/link and mobile layout. API simulated.');
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
