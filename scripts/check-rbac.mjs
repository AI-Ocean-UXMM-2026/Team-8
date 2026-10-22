import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
const origin='http://127.0.0.1:3124',authOrigin='https://rbac-fixture.supabase.test';
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3124','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',NEXT_PUBLIC_PARCELCARE_API_URL:origin}});
let output='',browser,lastPage;const errors=[];
server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}assert.ok(ready,output);
 for(const path of ['/demo','/demo/courier','/demo/warehouse','/demo/warehouse/tracking','/demo/sme','/demo/sme/tracking','/demo/manager/account','/demo/manager','/demo/workspace?workspace=manager','/demo/delivery-preview?role=warehouse','/login','/rider','/sme','/sme/reports','/courier','/warehouse','/warehouse/tracking','/api/demo/tracking'])await (await fetch(origin+path)).arrayBuffer();
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();lastPage=page;
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/demo/courier');await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
 assert.equal(await page.locator('.courierDeliveryCard').count(),0);
 await page.getByRole('link',{name:/Choose demo role/}).click();
 await page.getByRole('button',{name:'Enter Rider demo',exact:true}).click();
 await page.getByRole('heading',{name:'Courier overview',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Warehouse GPS',exact:true}).count(),0);
 assert.equal(await page.getByRole('link',{name:'SME GPS',exact:true}).count(),0);
 assert.deepEqual(await page.locator('#workspace-choice option').evaluateAll(nodes=>nodes.map(n=>n.value)),['courier']);
 await page.reload();await page.getByRole('heading',{name:'Courier overview',exact:true}).waitFor();
 for(const path of ['/demo/warehouse/tracking','/demo/sme/tracking','/demo/manager/account','/demo/workspace?workspace=manager','/demo/delivery-preview?role=warehouse']){
  await page.goto(origin+path);await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
  assert.equal(await page.locator('.warehouseNavigation,.courierDeliveryCard,#parcelcare-workspace').count(),0,path);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('parcelcare.demo.role.v1')),'rider');
 }
 await page.goto(origin+'/demo/delivery-preview?role=courier');await page.locator('.dp-roles').waitFor({state:'attached'});
 assert.equal(await page.locator('.dp-roles a[href^="/demo/delivery-preview"]').count(),0);
 await page.goto(origin+'/demo');await page.getByRole('button',{name:'Enter SME demo',exact:true}).click();
 await page.getByRole('heading',{name:'SME dashboard',exact:true}).waitFor();
 await page.goto(origin+'/demo/sme/tracking');await page.locator('#portal-main').waitFor();
 assert.deepEqual(await page.locator('#workspace-choice option').evaluateAll(nodes=>nodes.map(n=>n.value)),['sme']);
 await page.goto(origin+'/demo/courier');await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
 await page.goto(origin+'/demo');await page.getByRole('button',{name:'Enter Warehouse demo',exact:true}).click();
 await page.getByRole('heading',{name:'Warehouse overview',exact:true}).waitFor();
 await page.goto(origin+'/demo/sme');await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
 await page.goto(origin+'/demo');await page.getByRole('button',{name:'Enter Manager demo',exact:true}).click();
 await page.locator('#parcelcare-workspace.managerWorkspace').waitFor();
 assert.equal(await page.locator('#role').count(),0);
 await page.goto(origin+'/demo/warehouse');await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
 await page.goto(origin+'/demo');await page.getByRole('button',{name:'Enter Rider demo',exact:true}).click();
 await page.locator('.profileTrigger').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true}).click();
 await page.waitForURL(origin+'/demo');assert.equal(await page.evaluate(()=>sessionStorage.getItem('parcelcare.demo.role.v1')),null);
 await page.goto(origin+'/demo/courier');await page.getByRole('heading',{name:'Demo access required',exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/demo-role-denied-mobile.png',fullPage:true});
 await context.close();
 console.log('PASS demo RBAC: explicit selection, role-only menus, deep links, previews, reload, manager legacy entry, switching through selection, sign-out and mobile layout.');

 // Real login tests use a verified identity response; unrelated domain endpoints
 // are denied so an unauthorized workspace must never attempt to load its data.
 for(const role of ['rider','sme','staff']){
  const ctx=await browser.newContext(),p=await ctx.newPage();lastPage=p;p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
  const actor='10000000-0000-4000-8000-000000000099',warehouse=fixture.directory.warehouse_id,sme=fixture.directory.smes[0].id;
  const exp=Math.floor(Date.now()/1000)+3600,user={id:actor,aud:'authenticated',role:'authenticated',email:'rbac@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
  await p.route(authOrigin+'/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:{access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user}}));
  const calls=[];
  await p.route(origin+'/api/**',r=>{
   const req=r.request(),path=new URL(req.url()).pathname;calls.push(path);
   assert.equal(req.headers().authorization,'Bearer '+token);
   if(path==='/api/me')return r.fulfill({json:{actor_id:actor,memberships:[{warehouse_id:warehouse,role,sme_id:role==='sme'?sme:null}]}});
   if(path==='/api/rider/assignments'&&role==='rider')return r.fulfill({json:[]});
   if(path==='/api/sme/overview'&&role==='sme')return r.fulfill({json:{inventory:[],shipments:[],cases:[],approvals:[]}});
   if(path==='/api/warehouse/directory'&&role==='staff')return r.fulfill({json:fixture.directory});
   if(path==='/api/exceptions'&&role==='staff')return r.fulfill({json:{items:[],next_cursor:null}});
   if(path==='/api/warehouse/overview'&&role==='staff')return r.fulfill({json:{inbound_shipments:0,outbound_shipments:0,open_cases:0,available_qty:0,quarantined_qty:0,as_of:new Date().toISOString()}});
   return r.fulfill({status:403,json:{error:{code:'FORBIDDEN',message:'Forbidden fixture action'}}});
  });
  await p.goto(origin+'/login');await p.getByLabel('Email',{exact:true}).fill('rbac@example.test');await p.getByLabel('Password',{exact:true}).fill('fixture-password');await p.getByRole('button',{name:'Sign in',exact:true}).click();
  const home=role==='rider'?'/rider':role==='sme'?'/sme':'/warehouse';await p.waitForURL(origin+home);
  await p.getByRole('heading',{name:role==='rider'?'Assigned deliveries':role==='sme'?'SME dashboard':'Warehouse overview',exact:true}).waitFor();
  const forbidden=role==='rider'?['/sme/reports','/warehouse/tracking']:role==='sme'?['/courier','/rider','/warehouse/tracking']:['/courier','/rider','/sme/reports'];
  for(const path of forbidden){
   calls.length=0;await p.goto(origin+path);
   if(path.startsWith('/warehouse'))await p.getByRole('heading',{name:'Warehouse access required',exact:true}).waitFor();
   else if(path==='/courier')await p.getByRole('heading',{name:'Courier access required',exact:true}).waitFor();
   else await p.getByRole('status').filter({hasText:'An active membership is required'}).waitFor();
   assert.ok(calls.every(c=>c==='/api/me'),role+' requested foreign workspace data: '+calls);
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS live RBAC: Rider, SME and warehouse staff sign in to their own workspace; foreign routes are denied before domain data requests.');
}catch(e){console.error(output);console.error(await lastPage?.locator('body').innerText().catch(()=>''));throw e;}finally{await browser?.close();server.kill();}
