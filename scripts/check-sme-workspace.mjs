import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.REPORT_TEST_URL||'http://localhost:3218';
const b=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
await mkdir('test-results',{recursive:true});
try{
 const errors=[];
 for(const width of [1440,390]){
  const context=await b.newContext({viewport:{width,height:1000}}),p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  const navigate=async destination=>{const button=p.locator(`#nav [data-page=${destination}]`);if(!await button.isVisible())await p.locator('#workspaceMenu').click();await button.click();};
  await p.goto(base);await p.waitForSelector('#role option[value=manager]',{state:'attached'});
  await p.waitForSelector('.smeWorkspace');
  assert.deepEqual(await p.locator('#nav [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page)),['Orders','Deliveries','Exceptions']);
  assert.equal(await p.locator('#title').innerText(),'Orders / Requests');
  await p.locator('#smeStock summary').click();assert.equal(await p.locator('#smeStock').getByText('Ceramic mug',{exact:true}).count(),0);
  await p.locator('#newOrder').click();
  await p.locator('#orderForm [name=customer]').fill('Test SME branch');await p.locator('#orderForm [name=town]').fill('Sanchaung');
  await p.locator('#orderForm [name=product]').selectOption('Linen shirt');await p.locator('#orderForm [name=qty]').fill('2');
  assert.equal(await p.locator('#orderForm [name=product] option[value="Ceramic mug"]').count(),0);
  await p.locator('#orderForm button').click();
  const id=await p.evaluate(()=>JSON.parse(localStorage.getItem('pc-orders-v1'))[0].id);
  await p.locator(`.smeTrackOrder[data-id="${id}"]`).click();assert.equal(await p.locator('#title').innerText(),'Delivery Tracking');
  assert.equal(await p.locator('#newOrder').isVisible(),false);
  assert.equal(await p.locator('#smeTrackingOrder').inputValue(),id);
  await p.getByText('The warehouse has not assigned a delivery provider yet. Follow the recorded progress below.',{exact:true}).waitFor();
  await p.locator('.smeReportOrder').click();assert.equal(await p.locator('#reportForm [name=ref]').inputValue(),id);await p.locator('#close').click();
  await navigate('Exceptions');await p.locator('#reportNew').waitFor();assert.equal(await p.locator('#nav [data-page]').count(),3);
  // External courier links use recorded data only; unsafe URLs never become links.
  await p.evaluate(()=>{const orders=JSON.parse(localStorage.getItem('pc-orders-v1'));const o=orders.find(x=>x.id==='PC-1048');Object.assign(o,{deliveryMode:'third_party',courierName:'Test courier',trackingReference:'TRACK-TEST',trackingUrl:'https://courier.example.test/track/TRACK-TEST'});localStorage.setItem('pc-orders-v1',JSON.stringify(orders));});
  await p.reload();await p.waitForSelector('.smeWorkspace');await navigate('Deliveries');await p.selectOption('#smeTrackingOrder','PC-1048');
  assert.equal(await p.getByRole('link',{name:'Open courier tracking'}).getAttribute('href'),'https://courier.example.test/track/TRACK-TEST');
  assert.equal(await p.locator('#riderMap').count(),0);
  await p.evaluate(()=>{const orders=JSON.parse(localStorage.getItem('pc-orders-v1'));orders.find(x=>x.id==='PC-1048').trackingUrl='javascript:alert(1)';localStorage.setItem('pc-orders-v1',JSON.stringify(orders));});
  await p.reload();await p.waitForSelector('.smeWorkspace');await navigate('Deliveries');
  assert.equal(await p.getByRole('link',{name:'Open courier tracking'}).count(),0);
  assert.equal(await p.locator('#smeTrackingOrder option').filter({hasText:'Ceramic mug'}).count(),0);
  await navigate('Orders');await p.locator('[data-sme-tab=arrivals]').click();await p.locator('#stockBtn').click();await p.locator('#close').click();
  assert.equal(await p.locator('#nav [data-page]').count(),3);
  await p.locator('#language-switch [data-language-choice=my]').click();await p.waitForFunction(()=>document.documentElement.lang==='my');
  for(const page of ['Orders','Deliveries','Exceptions']){await navigate(page);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${page} overflows ${width}px`);await p.screenshot({path:`test-results/sme-${page}-${width}-my.png`});}
  await p.locator('#language-switch [data-language-choice=en]').click();await p.selectOption('#role','warehouse');await p.locator('#nav [data-page=Inventory]').waitFor();await p.locator('#nav [data-page=Arrivals]').waitFor();assert.equal(await p.locator('#newOrder').isVisible(),false);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: exactly three SME pages, delivery request creation, scoped stock, stock-arrival tab, tracking/report handoff, safe external courier links, no fabricated live map, English/Myanmar/mobile and unchanged warehouse navigation.');
}finally{await b.close();}
