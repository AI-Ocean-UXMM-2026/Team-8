import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3127',auth='https://categorization-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3127','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:auth,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
let browser,lastPage;
try{
 for(let i=0;i<180;i++){try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)})).ok)break}catch{}if(server.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,300));}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
 const product=fixture.inventory[0],w=product.warehouse_id;
 const user={id:'10000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'category@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp,iat:exp-3600,role:'authenticated'})).toString('base64url')+'.fixture';
 const categories={food_beverages:'Food & beverages',clothing_accessories:'Clothing & accessories',home_kitchen:'Home & kitchen',electronics:'Electronics',beauty_personal_care:'Beauty & personal care',health_medical:'Health & medical',office_stationery:'Office & stationery',other:'Other'};
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];lastPage=page;
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(({token,exp,user})=>sessionStorage.setItem('sb-categorization-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{token,exp,user});
  await page.route(auth+'/**',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:user}));
  let state={product_id:product.id,warehouse_id:w,sme_id:product.sme_id,name:product.name,sku:product.sku,revision:0,metadata:{description:'',material:'',intended_use:'',storage_notes:''},suggestion:null,category:null,status:'pending',review_note:null,reviewed_by:null,reviewed_at:null,updated_at:null};
  let unavailable=false,stale=false,available=true,requestKeys=[];
  await page.route(base+'/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname;
   const reply=(json,status=200)=>route.fulfill({status,json});
   if(path==='/api/me')return reply({actor_id:user.id,memberships:[{warehouse_id:w,sme_id:null,role:'staff'}]});
   if(path==='/api/warehouse/directory')return reply(fixture.directory);
   if(path==='/api/warehouse/overview')return reply({warehouse_id:w,unique_skus:3,inbound_shipments:2,outbound_shipments:2,open_cases:0,as_of:new Date().toISOString()});
   if(path==='/api/inventory')return reply({items:[product],next_cursor:null});
   if(path==='/api/exceptions')return reply({items:[],next_cursor:null});
   if(path==='/api/inventory-categories')return reply({categories,ai_available:available,provider:'groq',model:'fixture-model'});
   if(path.endsWith('/categorization'))return reply(state);
   if(path.includes('/categorization/')){
    requestKeys.push(request.headers()['idempotency-key']);const body=request.postDataJSON();
    if(stale)return reply({error:{code:'STALE_VERSION',message:'Stale'}},409);
    if(path.endsWith('/analyze')&&unavailable)return reply({error:{code:'AI_RATE_LIMIT',message:'The AI free quota is temporarily exhausted. Wait and retry or verify manually.'}},503);
    if(path.endsWith('/metadata'))state={...state,metadata:{description:body.description,material:body.material,intended_use:body.intended_use,storage_notes:body.storage_notes},suggestion:null,category:null,status:'pending',review_note:null,reviewed_by:null,reviewed_at:null};
    if(path.endsWith('/analyze'))state={...state,suggestion:{category:'clothing_accessories',confidence:0.91,rationale:'Canvas bag is a reusable accessory.',uncertain_attributes:['material'],missing_attributes:['storage_notes'],model:'fixture-only',requires_review:true},status:'pending',category:null};
    if(path.endsWith('/review'))state={...state,category:body.category,review_note:body.note,reviewed_by:user.id,reviewed_at:new Date().toISOString(),status:'verified'};
    state={...state,revision:state.revision+1};return reply(state);
   }
   return reply({error:{message:'Unexpected test request '+path}},404);
  });
  await page.goto(base+'/warehouse/inventory');await page.getByRole('button',{name:'View details',exact:true}).click();
  await page.getByRole('heading',{name:'AI-assisted stock categorization'}).waitFor();
  await page.getByLabel('Product description',{exact:true}).fill('Reusable canvas tote bag for shopping');
  await page.getByLabel('Material / ingredients',{exact:true}).fill('Canvas');await page.getByLabel('Intended use',{exact:true}).fill('Shopping bag');
  assert.equal(await page.getByRole('button',{name:'Suggest category with AI'}).isEnabled(),false);
  await page.getByRole('button',{name:'Save product facts'}).click();await page.getByText('Metadata saved. Request a new suggestion or verify manually.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Suggest category with AI'}).click();await page.getByText('AI suggestion saved. Human verification is required.',{exact:true}).waitFor();
  await page.getByLabel('Verification note',{exact:true}).fill('Checked bag label; storage instructions unknown.');
  assert.equal(await page.getByRole('button',{name:'Verify category',exact:true}).isEnabled(),false);
  await page.getByRole('checkbox',{name:'I reviewed the flags'}).check();await page.getByLabel('Verified category',{exact:true}).selectOption('home_kitchen');await page.getByRole('button',{name:'Verify category',exact:true}).click();
  await page.getByText('Category verified and saved.',{exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'View details',exact:true}).click();await page.getByText('Category verified',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Verified category',{exact:true}).inputValue(),'home_kitchen');
  await page.getByLabel('Storage / handling notes',{exact:true}).fill('Store dry');await page.getByRole('button',{name:'Save product facts'}).click();await page.getByText('No AI suggestion yet.',{exact:true}).waitFor();
  unavailable=true;await page.getByRole('button',{name:'Suggest category with AI'}).click();await page.getByRole('alert').getByText(/free quota/).waitFor();await page.getByRole('button',{name:'Suggest category with AI'}).click();assert.equal(requestKeys.at(-1),requestKeys.at(-2));
  unavailable=false;stale=true;await page.getByRole('button',{name:'Suggest category with AI'}).click();await page.getByRole('alert').getByText(/This product changed/).waitFor();
  stale=false;available=false;await page.getByRole('button',{name:'Reload saved record'}).click();await page.getByText('AI is not configured on this server.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Suggest category with AI'}).isEnabled(),false);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/categorization-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: desktop/mobile metadata saving, dirty guards, AI flags, human override, persisted verification, invalidation, quota recovery with stable key, stale edits and unconfigured provider. UI provider responses simulated; no live AI calls.');
}catch(e){if(lastPage&&!lastPage.isClosed()){await mkdir('test-results',{recursive:true});await lastPage.screenshot({path:'test-results/categorization-failure.png',fullPage:true});console.error(await lastPage.locator('.categoryPanel').innerText());}throw e;}finally{await browser?.close();server.kill();}
