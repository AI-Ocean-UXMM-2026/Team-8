import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.REPORT_TEST_URL||'http://localhost:3218';
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
 for(const width of [1440,820,390]){
  const p=await browser.newPage({viewport:{width,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/demo/warehouse/inventory');await p.getByRole('heading',{name:'Inventory',exact:true}).waitFor();
  assert.equal(await p.locator('.warehouseLogo img').evaluate(e=>e.complete&&e.naturalWidth>0),true);
  assert.equal(await p.getByText('Demo · fictitious data in this tab',{exact:true}).count(),0);
  if(width<768)await p.locator('.sidebarToggle').click();
  await p.locator('.warehouseCaseCount').getByText('1',{exact:true}).waitFor();
  if(width<768)await p.locator('.sidebarToggle').click();
  await p.getByLabel('Search inventory',{exact:true}).fill('000000000011');await p.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,1);
  await p.getByLabel('Search inventory',{exact:true}).fill('Golden Bloom');await p.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,2);
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.inventoryTable tbody tr').length===3);
  await p.getByLabel('Stock status',{exact:true}).selectOption('out');await p.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,1);
  await p.getByLabel('Stock status',{exact:true}).selectOption('quarantined');await p.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,2);
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.inventoryTable tbody tr').length===3);
  await p.locator('#inventory-sme').selectOption(fixture.directory.smes[1].id);await p.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,1);
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.inventoryTable tbody tr').length===3);
  await p.getByRole('link',{name:'Canvas tote',exact:true}).click();
  await p.getByRole('heading',{name:'Stock on hold details',exact:true}).waitFor();
  await p.getByRole('link',{name:'Back to list'}).click();
  await p.locator('.inventoryTable tbody tr').first().getByRole('link',{name:'View details'}).click();
  await p.locator('.inventoryDetail').getByRole('link',{name:/courier delay/}).waitFor();
  assert.equal(await p.locator('.inventoryDetail a[href*="/shipments/"]').count(),2);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`test-results/inventory-improved-${width}.png`,fullPage:true});
  await p.getByRole('link',{name:'Back to list'}).click();
  await p.locator('.profileTrigger').waitFor();await p.locator('.languageTrigger').click();await p.getByRole('menuitem',{name:'မြန်မာ',exact:true}).click();await p.getByLabel('ပစ္စည်းစာရင်းရှာရန်',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await p.close();
 }
 // Seed isolated browser-only fixture to check zero badge and dynamic warning removal.
 const p=await browser.newPage();await p.addInitScript(data=>{data.cases=[];for(const i of data.inventory){i.available_qty=10;i.quarantined_qty=0}sessionStorage.setItem('parcelcare.warehouse.demo.v1',JSON.stringify({data,replay:{}}));},structuredClone(fixture));
 await p.goto(base+'/demo/warehouse/inventory');await p.getByLabel('Search inventory',{exact:true}).waitFor();
 assert.equal(await p.locator('.inventoryWarning').count(),0);assert.equal(await p.locator('.warehouseCaseCount').count(),0);await p.close();
 console.log('PASS: product ID/SME search, stock filters, on-hold quantities, shipment/case links, real-count/zero badge, dynamic warning, logo/profile, responsive layouts and Myanmar.');
}finally{await browser.close()}
