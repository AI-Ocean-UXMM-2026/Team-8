import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
const origin='http://127.0.0.1:3123';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p','3123','-H','127.0.0.1'],{stdio:'pipe'});
let output='',browser;
server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
try{
 for(let i=0;i<160;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250));}
 for(const path of ['/demo','/demo/sme','/demo/sme/reports','/demo/sme/orders','/demo/sme/exceptions/10000000-0000-4000-8000-000000000001','/demo/courier','/api/demo/tracking'])await (await fetch(origin+path)).arrayBuffer();
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/demo/sme');
 await page.getByRole('link',{name:/Report Cases ·/}).first().waitFor();
 await page.getByRole('button',{name:'Expand sidebar'}).or(page.getByRole('button',{name:'Collapse sidebar'})).click();
 await page.getByRole('navigation',{name:'SME',exact:true}).getByRole('link',{name:'Report Cases',exact:true}).click();
 await page.getByText('No cases yet.').waitFor();
 const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
 const sme=fixture.directory.smes[1].id,shipment=fixture.shipments.find(s=>s.sme_id===sme&&s.direction==='outbound');
 await page.getByLabel('Shipment ·').selectOption(shipment.id);
 await page.getByLabel('Description ·').fill('Customer cannot be contacted at delivery address.');
 await page.getByLabel('Issue ·').selectOption('recipient_unavailable');
 await page.getByRole('button',{name:/Review report ·/}).click();
 await page.getByRole('region',{name:'Report review'}).waitFor();
 // Simulate a lost acknowledgement after the adapter commits to session storage.
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;let fail=true;
  Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(k==='parcelcare.sme.demo.reports.v1'&&fail){fail=false;throw Error('Lost acknowledgement');}};
 });
 await page.getByRole('button',{name:/Submit report ·/}).dblclick();
 await page.getByRole('button',{name:'Retry same report'}).waitFor();
 await page.reload();await page.getByLabel('Shipment ·').selectOption(shipment.id);
 await page.getByRole('button',{name:'Retry same report'}).click();
 await page.waitForURL(/\/demo\/sme\/exceptions\//);
 await page.getByRole('heading',{name:'Recipient unavailable'}).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('parcelcare.sme.demo.reports.v1')));
 assert.equal(saved.cases.length,1);assert.equal(saved.cases[0].shipment_id,shipment.id);
 await page.goto(origin+'/demo/sme/reports');
 await page.locator(`a[href="/demo/sme/exceptions/${saved.cases[0].id}"]`).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'SME mobile overflow');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/sme-report-cases-mobile.png',fullPage:true});
 await page.goto(origin+'/demo/sme/orders');await page.getByRole('heading',{name:'Delivery orders',exact:true}).waitFor();
 await page.getByText('No orders yet').waitFor();
 await page.goto(origin+'/demo/courier');
 const cards=page.locator('.courierDeliveryCard');await cards.first().waitFor();
 await cards.nth(0).getByRole('button',{name:/Report issue/}).click();
 assert.equal(await page.locator('#report-issue').getByRole('button',{name:/Report issue/}).isEnabled(),false);
 await cards.nth(1).getByRole('button',{name:/Report issue/}).click();
 for(const type of ['delivery_failed','recipient_unavailable']){
  if(!await page.getByLabel('Delivery issue').isVisible())await page.locator('#report-issue').getByRole('button',{name:/Report issue/}).click();
  await page.getByLabel('Delivery issue').selectOption(type);
  await page.getByLabel('Action note').fill('Confirmed delivery issue: '+type);
  await page.getByLabel('I verified the details for this action.').check();
  await page.getByRole('button',{name:'Review issue report'}).click();
  await page.getByRole('button',{name:'Confirm action',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Issue recorded. Case reference:'}).waitFor();
 }
 const courier=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('parcelcare.courier.demo.v2')));
 assert.equal(courier.cases.length,2);assert.equal(courier.deliveries[1].shipment.status,'picked_up');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Rider mobile overflow');
 await page.screenshot({path:'test-results/rider-report-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS report portals: mobile navigation, SME review, lost acknowledgement/reload/replay, single case, detail and list, demo order entry, Rider acceptance guard and both issue reasons.');
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
