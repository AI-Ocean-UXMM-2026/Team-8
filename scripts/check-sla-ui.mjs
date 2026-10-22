import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3131',auth='https://sla-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3131','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:auth,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
let browser,lastPage;
try{
 for(let i=0;i<180;i++){try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)})).ok)break}catch{}if(server.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,300));}
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});

 const w='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000099';
 const user={id,aud:'authenticated',role:'authenticated',email:'sla@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp,iat:exp-3600,role:'authenticated'})).toString('base64url')+'.fixture';
 for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();lastPage=page;page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({token,exp,user})=>sessionStorage.setItem('sb-sla-fixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{token,exp,user});
 await page.route(auth+'/**',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:user}));
 let canEdit=true,stale=false,policy={case_type:'courier_delay',priority:'normal',first_response_minutes:120,resolution_minutes:1440,at_risk_percent:80,revision:0},lastBody,filterSeen=false;
 await page.route(base+'/api/**',async route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname;const reply=(json,status=200)=>route.fulfill({status,json});
 if(path==='/api/me')return reply({actor_id:id,memberships:[{warehouse_id:w,sme_id:null,role:canEdit?'owner':'staff'}]});
 if(path==='/api/warehouse/overview')return reply({warehouse_id:w,unique_skus:2,inbound_shipments:2,outbound_shipments:2,open_cases:0,as_of:new Date().toISOString()});
 if(path==='/api/sla/policies')return reply({policies:['low','normal','high','critical'].map(p=>({...policy,priority:p})),can_edit:canEdit,manager_count:canEdit?1:0,scheduler_last_run:new Date().toISOString(),server_now:new Date().toISOString()});
 if(path.startsWith('/api/sla/policies/')){lastBody=request.postDataJSON();if(stale)return reply({error:{code:'STALE_VERSION',message:'Refresh the policy before trying again.'}},409);policy={...policy,...lastBody,revision:policy.revision+1};return reply(policy);}
 if(path==='/api/sla/cases'){filterSeen=url.searchParams.get('flag')==='escalated';return reply({items:[],next_cursor:null,server_now:new Date().toISOString()});}
 return reply({error:{message:'Unexpected fixture request'}},404);
 });
 await page.goto(base+'/warehouse/sla');await page.getByRole('heading',{name:'SLA policies and deadlines'}).waitFor();
 await page.getByLabel('First-response target (minutes)',{exact:true}).fill('1');await page.getByLabel('Resolution target (minutes)',{exact:true}).fill('0');assert.equal(await page.getByRole('button',{name:'Save SLA policy',exact:true}).isEnabled(),false);
 await page.getByLabel('Resolution target (minutes)',{exact:true}).fill('2');await page.getByRole('button',{name:'Save SLA policy',exact:true}).click();await page.getByText('SLA policy saved. Existing case deadlines were retained.',{exact:true}).waitFor();assert.equal(lastBody.first_response_minutes,1);assert.equal(lastBody.resolution_minutes,2);
 await page.getByLabel('Deadline filter',{exact:true}).selectOption('escalated');await page.getByText('No cases match this SLA filter.',{exact:true}).waitFor();assert(filterSeen);
 stale=true;await page.getByLabel('First-response target (minutes)',{exact:true}).fill('2');await page.getByRole('button',{name:'Save SLA policy',exact:true}).click();await page.getByRole('alert').getByText('Refresh the policy before trying again.',{exact:true}).waitFor();stale=false;await page.getByRole('button',{name:'Reload saved policies'}).click();await page.getByText('Saved policy loaded. Unsaved edits were discarded.',{exact:true}).waitFor();assert.equal(await page.getByLabel('First-response target (minutes)',{exact:true}).inputValue(),'1');
 canEdit=false;await page.reload();await page.getByText('Only warehouse managers (owners) can edit policies.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Save SLA policy',exact:true}).isEnabled(),false);
 await page.getByText('Escalations enter the shared management review queue. No individual manager account is required.',{exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/sla-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS SLA desktop/mobile: validation, saving policy, stale edits and reload, queue filters, staff read-only configuration and no overflow. API simulated.');
}catch(e){if(lastPage&&!lastPage.isClosed()){await mkdir('test-results',{recursive:true});await lastPage.screenshot({path:'test-results/sla-failure.png',fullPage:true});console.error(await lastPage.locator('main').innerText());}throw e;}finally{await browser?.close();server.kill();}
