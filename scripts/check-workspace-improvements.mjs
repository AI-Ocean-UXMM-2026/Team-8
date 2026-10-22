import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json','utf8')).body;
const browser=await chromium.launch({channel:'chrome'});
const base=process.env.REPORT_TEST_URL||'http://localhost:3218';
try{
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/demo/warehouse/inventory');await page.getByRole('heading',{name:'Inventory',exact:true}).waitFor();
 await page.getByRole('link',{name:'Canvas tote',exact:true}).click();await page.getByRole('heading',{name:'Stock on hold details'}).waitFor();assert.match(page.url(),/inventory\/.+\?from=/);
 await page.reload();await page.getByRole('heading',{name:'Stock on hold details'}).waitFor();await page.getByRole('link',{name:'Back to list'}).click();
 await page.getByRole('heading',{name:'Inventory',exact:true}).waitFor();
 if(width===1440){await page.getByRole('button',{name:'Collapse sidebar'}).click();assert.equal(await page.locator('.warehouseSidebar').evaluate(e=>e.getBoundingClientRect().width),76);await page.reload();await page.getByRole('button',{name:'Expand sidebar'}).waitFor();}
 else{await page.locator('.sidebarToggle').click();await page.getByRole('navigation',{name:'Warehouse',exact:true}).waitFor({state:'visible'});await page.locator('.sidebarToggle').click();}
 await page.goto(base+'/demo/warehouse/tracking');await page.locator('.trackingShipments').waitFor();await page.getByRole('button',{name:'Track shipment',exact:true}).first().click();await page.getByRole('heading',{name:'Live Courier Tracking',exact:true}).waitFor();
 for(const path of ['/demo/sme','/demo/courier','/demo/manager']){await page.goto(base+path);await page.locator('#workspace-controls select').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path);}
 assert.deepEqual(errors,[]);await page.close();
}
for(const count of [0,1,8,11,57]){const page=await browser.newPage();await page.addInitScript(({data,count})=>{const original=data.inventory[0];data.inventory=Array.from({length:count},(_,i)=>({...original,id:`product-${i}`,name:`Product ${i}`,sku:`SKU-${i}`}));sessionStorage.setItem('parcelcare.warehouse.demo.v1',JSON.stringify({data,replay:{}}));},{data:structuredClone(fixture),count});await page.goto(base+'/demo/warehouse/inventory');await page.getByRole('heading',{name:'Inventory',exact:true}).waitFor();assert.equal(await page.locator('.inventoryTable tbody tr').count(),Math.min(count,10));if(count>10){await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.inventoryTable tbody tr').length===n,Math.min(count-10,10));await page.getByLabel('Search inventory',{exact:true}).fill('Product 0');await page.waitForFunction(()=>document.querySelectorAll('.inventoryTable tbody tr').length===1);}await page.close();}
const detail=await browser.newPage();await detail.goto(base+'/demo/warehouse/inventory/unknown');await detail.getByRole('heading',{name:'Record unavailable'}).waitFor();await detail.goto(base+'/demo/sme/tracking');await detail.getByRole('button',{name:'Track shipment',exact:true}).first().click();await detail.getByRole('heading',{name:'Live Courier Tracking',exact:true}).waitFor();await detail.reload();await detail.getByRole('heading',{name:'Live Courier Tracking',exact:true}).waitFor();await detail.close();
console.log('PASS workspace chrome, responsive layouts, routed details, refresh, pagination fixtures and search reset');
}finally{await browser.close();}
