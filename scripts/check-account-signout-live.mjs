import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin='http://127.0.0.1:3219',authOrigin='https://profile-fixture.supabase.test';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3219','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}});
let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}assert.ok(ready,output);
 browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();page.setDefaultTimeout(20000);
 const actor='10000000-0000-4000-8000-000000000099',warehouse='10000000-0000-4000-8000-000000000001';
 const exp=Math.floor(Date.now()/1000)+3600,user={id:actor,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,aud:'authenticated',role:'authenticated',exp,iat:exp-3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user};
 await page.addInitScript(session=>sessionStorage.setItem('sb-profile-fixture-auth-token',JSON.stringify(session)),session);
 let release,logoutCalls=0;
 const waitForLogout=async()=>{for(let i=0;i<500&&!release;i++)await new Promise(r=>setTimeout(r,20));assert.ok(release,'Sign-out request was not sent');};
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 await page.route(authOrigin+'/**',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});if(new URL(route.request().url()).pathname.includes('logout')){logoutCalls++;if(logoutCalls>2)return route.fulfill({status:204,headers:cors});await new Promise(resolve=>release=resolve);return route.fulfill(logoutCalls===1?{status:400,headers:cors,json:{message:'Fixture sign-out failure',code:'fixture_failure'}}:{status:204,headers:cors})}return route.fulfill({headers:cors,json:session})});
 await page.route(origin+'/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/me'?{actor_id:actor,memberships:[{warehouse_id:warehouse,role:'staff',sme_id:null}]}:{open_cases:0}}));
 await page.goto(origin+'/warehouse/account');await page.getByRole('heading',{name:'My account',exact:true}).waitFor();
 await page.locator('.profileTrigger').click();await page.getByText('Sign out',{exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(logoutCalls,0);
 await page.locator('.profileTrigger').click();await page.getByText('Sign out',{exact:true}).click();await dialog.getByRole('button',{name:'Sign out',exact:true}).click();await dialog.getByRole('status').waitFor();assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
 await waitForLogout();release();await dialog.getByRole('alert').waitFor();assert.equal(await page.locator('.profileTrigger').count(),1);assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).isEnabled(),true);
 release=null;await dialog.getByRole('button',{name:'Retry sign out'}).click();await waitForLogout();release();await page.getByRole('heading',{name:'Please sign in',exact:true}).waitFor();assert.equal(logoutCalls,3);
 console.log('PASS live sign-out confirmation, cancel without request, pending lock, server failure and retry');
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));}
