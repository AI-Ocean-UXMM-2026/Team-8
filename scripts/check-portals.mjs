import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const origin='http://127.0.0.1:3113',apiOrigin=origin,authOrigin='https://portal-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3113','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',NEXT_PUBLIC_PARCELCARE_API_URL:apiOrigin}});
let lastPage;
let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);let browser;
const ids={actor:'10000000-0000-4000-8000-000000000099',case:'10000000-0000-4000-8000-000000000060',approval:'10000000-0000-4000-8000-000000000070',notification:'10000000-0000-4000-8000-000000000071',assignment:'10000000-0000-4000-8000-000000000072',session:'10000000-0000-4000-8000-000000000073'};
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}assert.ok(ready,output);
 const warmShipment=fixture.shipments.find(s=>s.direction==='outbound'&&s.delivery_mode==='in_house').id;
 // Compile every tested route before opening browsers so dev HMR cannot interrupt navigation.
 for(const route of ['/login','/sme','/sme/notifications','/sme/exceptions/'+ids.case,'/rider','/rider/shipments/'+warmShipment])assert.ok((await fetch(origin+route)).ok,route);
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const errors=[];
 async function client(role){
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:16.8,longitude:96.1,accuracy:5}});
  await context.addInitScript(()=>{window.__gpsClears=0;const clear=navigator.geolocation.clearWatch.bind(navigator.geolocation);navigator.geolocation.clearWatch=id=>{window.__gpsClears++;clear(id);};});
  const page=await context.newPage();page.setDefaultTimeout(30000);lastPage=page;page.on('pageerror',error=>errors.push(error.message));
  const user={id:ids.actor,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
  const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:ids.actor,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
  await page.route(authOrigin+'/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({status:path.includes('logout')?204:200,...(path.includes('logout')?{}:{json:path.endsWith('/user')?user:{access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user}})});});
  return {context,page,token,role};
 }
 const sme=await client('sme'),smeId=fixture.directory.smes[0].id,warehouseId=fixture.directory.warehouse_id;
 let approval={id:ids.approval,case_id:ids.case,status:'pending',options:['accept_partial','await_remainder','reject'],requested_case_version:1};
 const detail={id:ids.case,shipment_id:fixture.shipments[0].id,warehouse_id:warehouseId,sme_id:smeId,stage:'inbound',type:'quantity_mismatch',priority:'normal',status:'awaiting_sme_decision',handling_mode:'human',owner_id:null,responsible_party:'UNDETERMINED',responsibility_basis:null,summary:'Recorded count: 90 of 100, shortage 10.',resolution_note:null,verified_by:null,verified_at:null,created_at:new Date().toISOString(),closed_at:null,version:2,source_version:'fixture-source-2',required_facts:['count_verified'],events:[],verifications:[],approvals:[approval],analyses:[],jobs:[],actions:[],evidence:[],policy_version:1,allowed_actions:[],job_id:null};
 let lost=true,read=false,overviewState='normal',notificationFailure=false,notificationsEmpty=false,decisionFailure=false,expectedDecision='await_remainder';let informationCalls=0;const decisionKeys=[];const replies=new Map();
 await sme.page.route(apiOrigin+'/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  assert.equal(request.headers().authorization,'Bearer '+sme.token);
  const reply=json=>route.fulfill({status:200,headers,json});
  if(path==='/api/me')return reply({actor_id:ids.actor,memberships:[{warehouse_id:warehouseId,role:'sme',sme_id:smeId}]});
  if(path==='/api/sme/overview'){
   assert.equal(url.searchParams.get('sme_id'),smeId);
   if(overviewState==='error'||overviewState==='expired')return route.fulfill({status:overviewState==='expired'?401:503,headers,json:{error:{code:'UNAVAILABLE',message:'Fixture service unavailable.'}}});
   if(overviewState==='empty')return reply({inventory:[],shipments:[],cases:[],approvals:[]});
   return reply({inventory:fixture.inventory.filter(i=>i.sme_id===smeId),shipments:fixture.shipments.filter(s=>s.sme_id===smeId),cases:[detail],approvals:[approval]});
  }
  if(path==='/api/exceptions/'+ids.case)return reply(detail);
  if(path==='/api/exceptions/'+ids.case+'/information'){
   const body=request.postDataJSON();assert.equal(body.expected_version,detail.version);assert.equal(body.note,'Additional SME information');assert.ok(request.headers()['idempotency-key']);
   informationCalls++;detail.version++;detail.events.push({id:randomUUID(),type:'information_received',actor_id:ids.actor,created_at:detail.created_at,payload:{note:body.note}});return reply(detail);
  }
  if(path==='/api/approvals/'+approval.id+'/decision'){
   const key=request.headers()['idempotency-key'];assert.match(key,/^[0-9a-f-]{36}$/);decisionKeys.push(key);
   if(replies.has(key))return reply(replies.get(key));
   if(decisionFailure)return route.fulfill({status:409,headers,json:{error:{code:'STALE_VERSION',message:'The decision request changed. Refresh before deciding.'}}});
   const body=request.postDataJSON();assert.equal(body.request_version,1);assert.equal(body.decision,expectedDecision);
   approval={...approval,status:'decided',decision:body.decision,note:body.note,decided_at:new Date().toISOString()};detail.approvals=[approval];detail.status='awaiting_information';detail.version++;
   replies.set(key,structuredClone(detail));if(lost){lost=false;return route.abort('failed');}return reply(detail);
  }
  if(path==='/api/notifications')return reply(notificationsEmpty?[]:[{id:ids.notification,case_id:ids.case,message:'Recorded SME decision request',read,created_at:detail.created_at}]);
  if(path.startsWith('/api/notifications/')){if(notificationFailure)return route.fulfill({status:503,headers,json:{error:{code:'UNAVAILABLE',message:'The service is unavailable. Try again shortly or contact your warehouse operator.'}}});read=path.endsWith('/read');return route.fulfill({status:204,headers});}
  return route.fulfill({status:403,headers,json:{error:{code:'FORBIDDEN',message:'Not authorized for this SME.'}}});
 });
 await sme.page.goto(origin+'/login');await sme.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await sme.page.getByLabel('Password',{exact:true}).fill('fictitious-password');await sme.page.getByRole('button',{name:'Sign in',exact:true}).click();
 await sme.page.getByRole('heading',{name:'SME dashboard',exact:true}).waitFor();assert.ok(await sme.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir('test-results',{recursive:true});await sme.page.screenshot({path:'test-results/sme-dashboard-mobile.png',fullPage:true});await sme.page.setViewportSize({width:1440,height:1000});await sme.page.screenshot({path:'test-results/sme-dashboard-desktop.png',fullPage:true});await sme.page.setViewportSize({width:390,height:844});
 overviewState='empty';await sme.page.reload();await sme.page.getByText('No cases yet.',{exact:false}).first().waitFor();assert.equal(await sme.page.getByRole('link',{name:'quantity mismatch',exact:true}).count(),0);
 overviewState='error';await sme.page.reload();await sme.page.getByRole('heading',{name:'Unable to load this view',exact:true}).waitFor();overviewState='normal';await sme.page.getByRole('button',{name:'Try again',exact:true}).click();await sme.page.getByRole('heading',{name:'SME dashboard',exact:true}).waitFor();
 overviewState='expired';await sme.page.reload();await sme.page.getByRole('heading',{name:'Session expired',exact:true}).waitFor();overviewState='normal';await sme.page.goto(origin+'/sme');await sme.page.getByRole('heading',{name:'SME dashboard',exact:true}).waitFor();
 await sme.page.getByRole('link',{name:'quantity mismatch',exact:true}).click();await sme.page.getByLabel('SME decision',{exact:true}).selectOption('await_remainder');await sme.page.getByLabel('Decision note',{exact:true}).fill('Please deliver the remaining 10.');
 assert.equal(await sme.page.getByLabel('Case operation',{exact:true}).count(),0);
 await sme.page.getByRole('button',{name:'Save decision',exact:true}).click();await sme.page.getByRole('button',{name:'Retry original decision',exact:true}).waitFor();await sme.page.reload();await sme.page.getByRole('button',{name:'Retry original decision',exact:true}).click();await sme.page.getByText('Decision saved',{exact:true}).waitFor();assert.equal(new Set(decisionKeys).size,1);assert.equal(decisionKeys.length,2);
 await sme.page.reload();await sme.page.getByLabel('Recorded decision',{exact:true}).getByText('Recorded decision: Wait for the remaining goods',{exact:true}).waitFor();assert.equal(await sme.page.getByRole('button',{name:'Save decision',exact:true}).isDisabled(),true);
 for(const choice of ['accept_partial','reject']){
  expectedDecision=choice;approval={...approval,id:randomUUID(),status:'pending',decision:undefined,note:undefined,decided_at:undefined};detail.approvals=[approval];await sme.page.reload();
  await sme.page.getByText('Awaiting your decision',{exact:false}).waitFor();await sme.page.getByLabel('SME decision',{exact:true}).selectOption(choice);await sme.page.getByLabel('Decision note',{exact:true}).fill('Recorded '+choice);
  if(choice==='reject'){decisionFailure=true;await sme.page.getByRole('button',{name:'Save decision',exact:true}).click();await sme.page.getByRole('alert').getByText('This record has changed.',{exact:false}).waitFor();decisionFailure=false;}
  await sme.page.getByRole('button',{name:'Save decision',exact:true}).click();await sme.page.getByText('Decision saved',{exact:true}).waitFor();await sme.page.reload();await sme.page.getByLabel('Recorded decision',{exact:true}).getByText('Recorded decision: '+({accept_partial:'Accept the partial receipt',await_remainder:'Wait for the remaining goods',reject:'Reject the proposal',accept:'Accept the proposal'}[choice]),{exact:true}).waitFor();
 }
 const superseded={...approval,id:randomUUID(),status:'cancelled',decision:undefined,note:undefined,decided_at:undefined};approval={...approval,id:randomUUID(),status:'pending',decision:undefined,note:undefined,decided_at:undefined};detail.approvals=[superseded,approval];await sme.page.reload();await sme.page.getByText('This request was superseded or cancelled.',{exact:false}).waitFor();assert.equal(await sme.page.getByLabel('SME decision',{exact:true}).first().isDisabled(),true);assert.equal(await sme.page.getByLabel('SME decision',{exact:true}).last().isDisabled(),false);
 await sme.page.getByLabel('Case note',{exact:true}).fill('Additional SME information');await sme.page.getByRole('button',{name:'Submit case request',exact:true}).click();await sme.page.getByText('information received',{exact:true}).waitFor();assert.equal(informationCalls,1);assert.equal(await sme.page.getByLabel('Allowed action',{exact:true}).count(),0);
 await sme.page.screenshot({path:'test-results/sme-case-mobile.png',fullPage:true});
 await sme.page.getByRole('button',{name:'Menu',exact:true}).click();await sme.page.getByRole('link',{name:'Notifications',exact:true}).click();await sme.page.getByRole('button',{name:'Mark read',exact:true}).click();await sme.page.getByRole('button',{name:'Mark unread',exact:true}).click();await sme.page.getByRole('button',{name:'Mark read',exact:true}).waitFor();
 await sme.page.reload();await sme.page.getByRole('button',{name:'Mark read',exact:true}).waitFor();notificationFailure=true;await sme.page.getByRole('button',{name:'Mark read',exact:true}).click();await sme.page.getByRole('alert').getByText('The service is unavailable. Try again shortly or contact your warehouse operator.',{exact:true}).waitFor();notificationFailure=false;assert.equal(read,false);
 await sme.page.getByRole('button',{name:'Mark read',exact:true}).click();await sme.page.getByRole('button',{name:'Mark unread',exact:true}).waitFor();await sme.page.reload();await sme.page.getByRole('button',{name:'Mark unread',exact:true}).waitFor();await sme.page.getByRole('link',{name:'Open case',exact:true}).click();await sme.page.getByRole('heading',{name:/Case facts/}).waitFor();
 notificationsEmpty=true;await sme.page.goto(origin+'/sme/notifications');await sme.page.getByText('No notifications.',{exact:false}).waitFor();notificationsEmpty=false;await sme.page.reload();await sme.page.getByRole('button',{name:'Mark unread',exact:true}).waitFor();
 await mkdir('test-results',{recursive:true});await sme.page.screenshot({path:'test-results/sme-notifications-mobile.png',fullPage:true});
 await sme.page.goto(origin+'/sme/exceptions/00000000-0000-4000-8000-999999999999');await sme.page.getByRole('heading',{name:'Access denied',exact:true}).waitFor();
 console.log('PASS PORTAL: authenticated SME dashboard, role-specific case panels, lost-decision reload/replay, read/unread notifications and foreign-case denial');
 const rider=await client('rider');const outbound=structuredClone(fixture.shipments.find(s=>s.direction==='outbound'&&s.delivery_mode==='in_house'));outbound.warehouse_id=warehouseId;outbound.version=1;outbound.status='assigned';
 let assignment={id:ids.assignment,shipment_id:outbound.id,reference:outbound.reference,status:'assigned',version:1,accepted_at:null,picked_up_at:null,cancelled_at:null,completed_at:null};
 let locations=0,stops=0;const delivery=()=>({shipment:outbound,courier_name:null,waybill:null,tracking_url:null,assignments:[assignment],riders:[],proofs:[],handovers:[],capacity:[],session_id:null});
 await rider.page.route(apiOrigin+'/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});assert.equal(request.headers().authorization,'Bearer '+rider.token);
  const reply=json=>route.fulfill({status:200,headers,json});
  if(path==='/api/me')return reply({actor_id:ids.actor,memberships:[{warehouse_id:warehouseId,role:'rider',sme_id:null}]});
  if(path==='/api/warehouses/'+warehouseId+'/tracking-settings')return reply({live_gps_enabled:true,demo_simulation_enabled:false});
  if(path==='/api/rider/assignments')return reply([assignment]);
  if(path==='/api/deliveries/'+outbound.id)return reply(delivery());
  if(path.endsWith('/accept')||path.endsWith('/pickup')){const body=request.postDataJSON();assert.equal(body.expected_version,outbound.version);outbound.version++;if(path.endsWith('/accept'))assignment.accepted_at=new Date().toISOString();else{assignment.picked_up_at=new Date().toISOString();outbound.status='picked_up';}return reply(delivery());}
  if(path==='/api/tracking/start'){assert.equal(request.postDataJSON().consent,true);return reply(ids.session);}
  if(path.endsWith('/locations')){locations++;assert.equal(request.postDataJSON().latitude,16.8);return reply(ids.session);}
  if(path.endsWith('/stop')){stops++;return route.fulfill({status:204,headers});}
  return route.fulfill({status:403,headers,json:{error:{code:'FORBIDDEN',message:'Forbidden fixture action'}}});
 });
 rider.page.on('dialog',dialog=>dialog.accept());await rider.page.goto(origin+'/login');await rider.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await rider.page.getByLabel('Password',{exact:true}).fill('fictitious-password');await rider.page.getByRole('button',{name:'Sign in',exact:true}).click();
 await rider.page.getByRole('heading',{name:'Assigned deliveries',exact:true}).waitFor();await rider.page.goto(origin+'/rider/shipments/'+outbound.id);await rider.page.getByLabel('Delivery note',{exact:true}).fill('Accepted physical task');await rider.page.getByRole('button',{name:'Review and submit delivery action',exact:true}).click();await rider.page.getByText('Saved: assigned',{exact:true}).waitFor();
 await rider.page.getByLabel('Delivery operation',{exact:true}).selectOption('pickup');await rider.page.getByRole('button',{name:'Review and submit delivery action',exact:true}).click();await rider.page.getByText('Saved: picked up',{exact:true}).waitFor();
 await rider.page.getByLabel('I consent for this delivery',{exact:false}).check();await rider.page.getByRole('button',{name:'Start sharing',exact:true}).click();await rider.page.getByText('Sharing while visible.',{exact:false}).waitFor();
 await rider.page.waitForFunction(()=>document.body.textContent.includes('Location sent'));assert.equal(locations,1);
 await rider.page.getByRole('button',{name:'Stop sharing',exact:true}).click();await rider.page.getByText('Location sharing ended',{exact:false}).waitFor();assert.ok(stops>0);assert.ok(await rider.page.evaluate(()=>window.__gpsClears>0));
 assert.ok(await rider.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await rider.page.screenshot({path:'test-results/rider-delivery-mobile.png',fullPage:true});
 await rider.page.locator('.profileTrigger').click();await rider.page.getByRole('button',{name:'Sign out',exact:true}).click();await rider.page.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true}).click();await rider.page.waitForURL(origin+'/login');await rider.page.getByRole('heading',{name:'Sign in to ParcelCare',exact:true}).waitFor();
 console.log('PASS PORTAL: authenticated rider accept/pickup, explicit consent, real browser geolocation boundary, bounded location update, stop/watch cleanup, sign-out and mobile layout');
 assert.deepEqual(errors,[],'Portal runtime errors');await sme.context.close();await rider.context.close();
}catch(error){console.error(output);if(lastPage){console.error(await lastPage.locator('body').innerText().catch(()=>''));await lastPage.screenshot({path:'test-results/portal-failure.png',fullPage:true}).catch(()=>{});}throw error;}finally{await browser?.close();server.kill();}
