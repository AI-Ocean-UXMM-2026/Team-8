import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),base=process.env.REPORT_TEST_URL||'http://localhost:3218';
try{for(const width of [1440,390]){
 const p=await b.newPage({viewport:{width,height:900}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/demo/warehouse/shipments/10000000-0000-4000-8000-000000000020');
 await p.getByLabel('Received now',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();assert.equal(await p.locator('.receiptDialog').evaluate(e=>e.open),false);
 await p.getByLabel('Received now',{exact:true}).fill('101');await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();await p.locator('.receiptError').getByText('Received quantity exceeds the remaining expectation. Request a staff review for overreceipt.',{exact:true}).waitFor();
 await p.getByLabel('Received now',{exact:true}).fill('5');await p.getByLabel('Damaged now',{exact:true}).fill('6');await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();await p.locator('.receiptError').getByText('Damaged quantity cannot exceed received quantity.',{exact:true}).waitFor();
 await p.getByLabel('Received now',{exact:true}).fill('40');await p.getByLabel('Damaged now',{exact:true}).fill('5');assert.deepEqual(await p.locator('.receiptCalculated dd').allTextContents(),['35','60']);
 await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();assert.equal(await p.locator('.receiptDialog').evaluate(e=>e.open),false);
 await p.locator('.receiptEvidenceRow input:not([disabled])').first().check();await p.getByLabel('Receiving note',{exact:true}).fill('Physical counts and damage verified for this receipt.');
 assert.equal(await p.locator('.receiptVerified').first().innerText(),'Verified State: Verified');
 await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();await p.getByRole('button',{name:'Back to edit',exact:true}).click();assert.equal(await p.getByLabel('Received now',{exact:true}).inputValue(),'40');
 await p.getByRole('button',{name:'Review partial receipt',exact:true}).click();await p.getByRole('button',{name:'Confirm partial receipt',exact:true}).click();await p.getByRole('heading',{name:'Receipt saved',exact:true}).waitFor();
 await p.waitForFunction(()=>{const s=JSON.parse(sessionStorage.getItem('parcelcare.warehouse.demo.v1'));return s.data.shipments.find(i=>i.reference==='PC-IN-0001').items[0].received_qty===40});
 await p.getByLabel('Received now',{exact:true}).fill('50');await p.getByLabel('Damaged now',{exact:true}).fill('0');assert.deepEqual(await p.locator('.receiptCalculated dd').allTextContents(),['50','10']);
 await p.getByRole('button',{name:'Finalize receiving',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Confirm final receipt',exact:true}).isDisabled(),true);
 await p.getByLabel('I understand that final receiving cannot be reopened.',{exact:true}).check();await p.getByRole('button',{name:'Confirm final receipt',exact:true}).click();
 await p.getByText('Receiving is finalized for this shipment.',{exact:true}).waitFor();
 const saved=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('parcelcare.warehouse.demo.v1')).data);
 const shipment=saved.shipments.find(s=>s.reference==='PC-IN-0001');assert.equal(shipment.items[0].received_qty,90);assert.equal(shipment.items[0].damaged_qty,5);assert.equal(shipment.events.length,2);
 await p.waitForFunction(()=>document.querySelectorAll('a[href*="/exceptions/"]').length>=2);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.locator('[data-language-choice=my]').first().click();await p.getByText('ဂိုဒေါင်ပို့ဆောင်မှုစာရင်း',{exact:false}).count();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await p.screenshot({path:`test-results/phase2-receiving-${width}.png`,fullPage:true});await p.close();
}console.log('PASS: invalid counts/evidence blocked, incremental auto-calculation, partial save, final acknowledgment, recorded timeline and related shortage/damage cases on desktop/mobile.');}finally{await b.close()}
