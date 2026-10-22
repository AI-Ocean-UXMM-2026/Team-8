import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),base=process.env.REPORT_TEST_URL||'http://localhost:3218';
try{
 for(const width of [1440,390]){
  const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/demo/courier');await p.getByRole('heading',{name:'Courier overview',exact:true}).waitFor();
  assert.equal(await p.locator('.courierDeliveryCard').count(),3);
  await p.getByLabel('Search deliveries',{exact:true}).fill('0001');assert.equal(await p.locator('.courierDeliveryCard').count(),1);
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();
  await p.locator('.courierDeliveryCard').first().getByRole('button',{name:'View delivery →',exact:true}).click();
  await p.getByLabel('Action note',{exact:true}).fill('Assigned parcel and pickup records checked.');await p.getByLabel('I verified the details for this action.',{exact:true}).check();
  await p.locator('.courierForm').getByRole('button',{name:'Accept assignment',exact:true}).click();await p.getByRole('button',{name:'Confirm action',exact:true}).click();
  await p.locator('.courierForm').getByRole('button',{name:'Confirm pickup',exact:true}).waitFor();
  await p.getByLabel('Action note',{exact:true}).fill('Physical pickup completed after verified packing.');await p.getByLabel('I verified the details for this action.',{exact:true}).check();await p.locator('.courierForm').getByRole('button',{name:'Confirm pickup',exact:true}).click();await p.getByRole('button',{name:'Confirm action',exact:true}).click();
  await p.getByText('Warehouse verification or dispatch is required before the next delivery step.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Report delivery issue',exact:true}).click();await p.getByLabel('Action note',{exact:true}).fill('Recipient was unavailable; warehouse follow-up requested.');await p.getByLabel('I verified the details for this action.',{exact:true}).check();await p.getByRole('button',{name:'Review issue report',exact:true}).click();await p.getByRole('button',{name:'Confirm action',exact:true}).click();await p.getByRole('status').filter({hasText:'Issue recorded.'}).waitFor();
  await p.locator('.courierDeliveryCard').nth(2).getByRole('button',{name:'View delivery →',exact:true}).click();await p.getByLabel('Received by',{exact:true}).fill('Demo recipient');await p.getByLabel('Shipment evidence',{exact:true}).selectOption({index:1});await p.getByLabel('Action note',{exact:true}).fill('Attached delivery evidence and recipient details verified.');await p.getByLabel('I verified the details for this action.',{exact:true}).check();await p.locator('.courierForm').getByRole('button',{name:'Submit delivery proof',exact:true}).click();await p.getByRole('button',{name:'Confirm action',exact:true}).click();await p.getByText('Proof awaiting confirmation',{exact:true}).waitFor();
  const saved=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('parcelcare.courier.demo.v1')));assert.equal(saved.deliveries[2].shipment.status,'in_transit');assert.equal(saved.deliveries[2].proofs.length,1);assert.equal(saved.cases.length,1);
  await p.reload();await p.locator('.courierDeliveryCard').nth(2).getByRole('button',{name:'View delivery →',exact:true}).click();await p.getByText('Proof awaiting confirmation',{exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:/mark.*delivered/i}).count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`test-results/courier-${width}-en.png`,fullPage:true});await p.locator('[data-language-choice=my]').first().click();await p.getByRole('heading',{name:'ပို့ဆောင်ရေးအကျဉ်းချုပ်',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`test-results/courier-${width}-my.png`,fullPage:true});assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS: courier assignment accept/pickup, guarded proof, issue report, persistence, no direct delivery completion, English/Myanmar and responsive layout.');
}finally{await b.close()}
