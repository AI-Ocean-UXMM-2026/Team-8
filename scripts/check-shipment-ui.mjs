import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),base=process.env.REPORT_TEST_URL||'http://localhost:3218';
try{for(const width of [1440,390]){
 const p=await browser.newPage({viewport:{width,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/demo/warehouse/shipments');await p.locator('.shipmentTable .shipmentReference').first().waitFor();
 assert.ok(await p.locator('.shipmentStatus-neutral').count()>0);assert.ok(await p.locator('.shipmentStatus-progress').count()>0);
 await p.getByText('Status meanings',{exact:true}).click();await p.getByText('Awaiting an inbound receipt.',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:`test-results/shipments-${width}.png`,fullPage:true});
 await p.getByLabel('Direction',{exact:true}).selectOption('inbound');await p.waitForFunction(()=>[...document.querySelectorAll('.shipmentTable td[data-label="Direction / mode"] strong')].every(e=>e.textContent==='inbound'));
 await p.locator('.shipmentTable .shipmentReference').first().click();await p.getByRole('heading',{name:'Inbound receiving',exact:true}).waitFor();await p.getByRole('heading',{name:'Receiving evidence',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Outbound dispatch',exact:true}).count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.goto(base+'/demo/warehouse/shipments/10000000-0000-4000-8000-000000000023');await p.getByRole('heading',{name:'Outbound dispatch',exact:true}).waitFor();await p.getByText('Third-party handover recorded',{exact:true}).waitFor();await p.getByRole('heading',{name:'Related cases',exact:true}).waitFor();await p.locator('a[href*="/exceptions/"]').last().waitFor();assert.equal(await p.getByRole('heading',{name:'Receiving evidence',exact:true}).count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:`test-results/shipment-outbound-${width}.png`,fullPage:true});await p.locator('[data-language-choice=my]').first().click();await p.getByRole('heading',{name:'အထွက်ပစ္စည်း စေလွှတ်မှု',exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await p.close();
}console.log('PASS: status semantics, shipment reference navigation, inbound/outbound-specific facts, evidence, related cases and Myanmar/mobile layout.');}finally{await browser.close()}
