import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
const data=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const sample=data.cases[0],states=['new','processing','awaiting_information','resolved'];
data.cases=Array.from({length:120},(_,i)=>({...sample,id:`60000000-0000-4000-8000-${String(i).padStart(12,'0')}`,status:states[i%4],priority:['low','normal','high','critical'][i%4],risk_score:i,summary:`Board test ${i}`}));
const origin='http://127.0.0.1:3120';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3120','-H','127.0.0.1'],{stdio:'pipe',env:{...process.env,PARCELCARE_TEST_BUILD:'1'}});
let output='',browser;server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}assert(ready);
 await fetch(origin+'/demo/warehouse/exceptions',{signal:AbortSignal.timeout(60000)});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(data=>{sessionStorage.setItem('parcelcare.demo.role.v1','warehouse');sessionStorage.setItem('parcelcare.warehouse.demo.v1',JSON.stringify({data,replay:{}}));},data);
 await page.goto(origin+'/demo/warehouse/exceptions?view=board&scope=all',{waitUntil:'domcontentloaded'});
 const board=page.getByLabel('Case workflow board',{exact:true});await board.waitFor();assert.equal(await board.locator('.caseBoardCard').count(),120);
 for(const label of ['New','Investigating','Waiting','Resolved'])assert.equal(await page.getByRole('region',{name:label+' cases',exact:true}).locator('.caseBoardCard').count(),30);
 await page.getByLabel('Priority',{exact:true}).selectOption('critical');await page.waitForFunction(()=>document.querySelectorAll('.caseBoardCard').length===30);
 await page.getByRole('button',{name:'Table',exact:true}).click();await page.getByRole('table').waitFor();assert.equal(await page.getByLabel('Priority',{exact:true}).inputValue(),'critical');
 await page.getByRole('button',{name:'Board',exact:true}).click();await board.waitFor();assert.equal(await board.locator('.caseBoardCard').count(),30);
 await page.getByLabel('Search cases',{exact:true}).fill('no-matches');await page.waitForFunction(()=>document.querySelectorAll('.caseBoardCard').length===0);
 await page.getByLabel('Search cases',{exact:true}).fill('');await page.waitForFunction(()=>document.querySelectorAll('.caseBoardCard').length===30);
 assert((await board.locator('.caseBoardCard').first().getAttribute('href')).includes('/demo/warehouse/exceptions/'));
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/case-board-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS case board: 120 cases across pages, workflow columns, filters preserved across views, search, case links and mobile overflow. Demo data.');
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
