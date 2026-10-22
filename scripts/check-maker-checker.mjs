import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {createMockTransport}=require('../.test-build/src/shared/api/mock.js');
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const origin='http://127.0.0.1:3119',authOrigin='https://maker-checker-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3119','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='',browser,page;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}assert.ok(ready,output);
 // Warm routes before browser navigation to avoid compilation/HMR races.
 const id=fixture.cases[0].id;for(const path of ['/login','/warehouse','/warehouse/exceptions/'+id])await fetch(origin+path);
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const p=page=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const user={id:'10000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 await p.route(authOrigin+'/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:{access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user}}));
 const mock=createMockTransport({dataset:'warehouse'}),raw=await mock({method:'GET',path:'/api/exceptions/'+id}),job='10000000-0000-4000-8000-000000000073';
 let scenario='queued',submitted=0;
 function detail(){
  const legacy=scenario==='legacy_unchecked',approved=scenario==='approved',error=scenario==='error';
  const analysis={id:job,model:'fixture-maker',created_at:new Date().toISOString(),output:{summary:'Recorded shortage is 10.',missing_information:[]},
   ...(!legacy?{review_status:scenario,execution_status:approved?'executed':'blocked',review_reason:approved?null:error?'checker_timeout':'checker_rejected',checker_model:error?null:'fixture-checker',
    checker_output:error?null:{evidence_supported:true,classification_correct:true,priority_correct:approved,action_authorized:true,findings:approved?[]:['The proposed priority is unsupported by the recorded facts.']}}:{})};
  return {...raw,owner_id:null,responsibility_basis:null,policy_version:1,allowed_actions:['save_summary','escalate'],analyses:scenario==='queued'?[]:[analysis],
   jobs:[{id:job,pipeline_stage:scenario==='queued'?'queued':approved?'completed':'blocked',status:scenario==='queued'?'queued':error?'failed':'completed',review_reason:error?'checker_timeout':scenario==='rejected'?'checker_rejected':null}],actions:[],approvals:[],verifications:[],job_id:scenario==='queued'?job:null};
 }
 await p.route(origin+'/api/**',async r=>{
  const request=r.request(),url=new URL(request.url());
  if(url.pathname==='/api/exceptions/'+id+'/analyze'){
   assert.equal(request.method(),'POST');assert.ok(request.headers()['idempotency-key']);assert.equal(request.postDataJSON().expected_version,raw.version);submitted++;return r.fulfill({status:202,json:detail()});
  }
  if(url.pathname==='/api/exceptions/'+id)return r.fulfill({json:detail()});
  try{return r.fulfill({json:await mock({method:request.method(),path:url.pathname+url.search})})}catch(e){return r.fulfill({status:e.status||500,json:{error:{code:e.code,message:e.message}}})}
 });
 await p.goto(origin+'/login');await p.getByLabel('Email',{exact:true}).fill('fixture@example.test');await p.getByLabel('Password',{exact:true}).fill('fixture-password');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.getByRole('heading',{name:'Warehouse overview',exact:true}).waitFor();
 await p.goto(origin+'/warehouse/exceptions/'+id);await p.getByText('Evidence, analysis and verification',{exact:true}).click();
 await p.getByLabel('Case operation',{exact:true}).selectOption('analyze');await p.getByLabel('Case note',{exact:true}).fill('Please investigate and independently check these recorded facts.');await p.getByRole('button',{name:'Submit case request',exact:true}).click();await p.getByText('Analysis queued; awaiting worker result.',{exact:false}).waitFor();assert.equal(submitted,1);
 await mkdir('test-results',{recursive:true});
 for(const width of [1440,390]){
  await p.setViewportSize({width,height:1000});
  for(scenario of ['approved','rejected','error','legacy_unchecked']){
   await p.reload();await p.getByText('Evidence, analysis and verification',{exact:true}).click();
   const review=p.getByRole('region',{name:'Independent AI checker',exact:true});await review.waitFor();
   if(scenario==='approved'){await review.getByText('Execution: executed',{exact:true}).waitFor();assert.equal(await review.getByText('Passed',{exact:true}).count(),4)}
   if(scenario==='rejected'){await review.getByText('Checker: rejected',{exact:true}).waitFor();await review.getByText('Failed',{exact:true}).waitFor()}
   if(scenario==='error'){await p.getByText('Human review required: checker timeout',{exact:true}).waitFor();await review.getByText('Execution: blocked',{exact:true}).waitFor()}
   if(scenario==='legacy_unchecked')await review.getByText('This older analysis has no independent checker approval. Automatic execution is blocked.',{exact:true}).waitFor();
   const overflow=await p.evaluate(()=>({width:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-15).map(e=>({tag:e.tagName,classes:e.className,text:e.textContent.slice(0,100)}))}));
   assert.ok(overflow.width<=width,scenario+' overflows '+width+': '+JSON.stringify(overflow));
   await p.screenshot({path:`test-results/maker-checker-${scenario}-${width}.png`,fullPage:true});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: queue submission and independent checker approved/rejected/error/legacy states, execution visibility, desktop/mobile containment, no runtime errors.');
}catch(error){console.error(output.slice(-3000));throw error}finally{await page?.unrouteAll({behavior:'ignoreErrors'});await browser?.close();server.kill()}
