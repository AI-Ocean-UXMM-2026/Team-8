import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.REPORT_TEST_URL||'http://localhost:3218';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const contexts=[];
const errors=[];
try{
 const courierContext=await browser.newContext({viewport:{width:1440,height:1000}});
 const smeContext=await browser.newContext({viewport:{width:390,height:844}});
 contexts.push(courierContext,smeContext);
 const courier=await courierContext.newPage(),warehouse=await courierContext.newPage(),sme=await smeContext.newPage();
 for(const p of [courier,warehouse,sme]){p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));}
 const request=courierContext.request;
 const packet=async()=>{const response=await request.get(base+'/api/demo/tracking');assert.equal(response.status(),200);return response.json()};
 const action=async(action,settings)=>{const current=await packet();const response=await request.post(base+'/api/demo/tracking',{data:{action,settings,revision:current.revision,key:randomUUID()}});assert.equal(response.status(),200);return response.json()};
 await action('settings',{live_gps_enabled:true,demo_simulation_enabled:true});await action('reset');
 await courier.goto(base+'/demo/delivery-preview?role=courier');
 await warehouse.goto(base+'/demo/warehouse/tracking');
 await sme.goto(base+'/demo/delivery-preview?role=sme');
 const move=courier.getByRole('button',{name:'Move vehicle',exact:true}).filter({visible:true});
 await move.waitFor();await courier.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Move vehicle')?.disabled);
 await warehouse.getByText('Demo movement · 0/10',{exact:true}).first().waitFor();
 const before=await packet();await move.click();
 await warehouse.getByText('Demo movement · 1/10',{exact:true}).first().waitFor();
 const stale=await request.post(base+'/api/demo/tracking',{data:{action:'advance',revision:before.revision,key:randomUUID()}});
 assert.equal(stale.status(),409);assert.equal((await stale.json()).error,'STALE_DEMO');
 await sme.getByText('Demo movement · 1/10',{exact:true}).waitFor();
 await courier.reload();await move.waitFor();
 await courier.getByText('Demo movement · 1/10',{exact:true}).waitFor();
 for(let step=2;step<=10;step++){
  await courier.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Move vehicle')?.disabled);
  await move.click();await sme.getByText(`Demo movement · ${step}/10`,{exact:true}).waitFor();
 }
 const arrive=courier.getByRole('button',{name:'Confirm arrival',exact:true}).filter({visible:true});
 await courier.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirm arrival')?.disabled);
 await arrive.click();await sme.getByRole('heading',{name:'Your delivery has arrived',exact:true}).waitFor();
 await warehouse.locator('.trackingBadge').getByText('Arrived · Demo',{exact:true}).waitFor();
 const receive=sme.getByRole('button',{name:'Confirm received',exact:true}).filter({visible:true});
 await receive.click();const dialog=sme.getByRole('dialog');await dialog.waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Confirm receipt',exact:true}).isEnabled(),false);
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirm receipt',exact:true}).click();
 await sme.getByRole('heading',{name:'Delivery complete',exact:true}).waitFor();
 await courier.getByRole('heading',{name:'Delivery complete',exact:true}).waitFor();
 await warehouse.locator('.trackingBadge').getByText('SME confirmed · Demo',{exact:true}).waitFor();
 for(const p of [courier,warehouse,sme])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir('test-results',{recursive:true});
 await courier.screenshot({path:'test-results/map-sync-courier.png',fullPage:true});
 await sme.screenshot({path:'test-results/map-sync-sme.png',fullPage:true});
 await courier.getByRole('button',{name:'Reset demo',exact:true}).click();
 await sme.getByText('Demo movement · 0/10',{exact:true}).waitFor();
 const settings=await courierContext.newPage();await settings.goto(base+'/demo/warehouse/settings');
 const simulation=settings.getByRole('checkbox',{name:'Demo simulation enabled'});await simulation.click();
 await sme.getByText('Demo simulation is disabled in Warehouse Admin settings.',{exact:true}).waitFor();
 await courier.getByText('Demo simulation is disabled in Warehouse Admin settings.',{exact:true}).waitFor();
 assert.equal(await move.isEnabled(),false);
 const denied=await request.post(base+'/api/demo/tracking',{data:{action:'advance',revision:(await packet()).revision,key:randomUUID()}});assert.equal(denied.status(),409);
 await simulation.click();await sme.getByText('Demo simulation is disabled in Warehouse Admin settings.',{exact:true}).waitFor({state:'hidden'});
 await sme.route('**/api/demo/tracking',route=>route.abort());
 await sme.getByText('Reconnecting…',{exact:true}).waitFor();
 assert.equal(await receive.isEnabled(),false);
 await sme.unroute('**/api/demo/tracking');await sme.getByText('Connected',{exact:true}).waitFor();
 await sme.reload();await sme.getByText('Connected',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS shared demo across browser contexts, road movement, reload, stale conflict, arrival/SME receipt, replay, disabled simulation, connection recovery and desktop/mobile maps');
}finally{for(const context of contexts)await context.close();await browser.close()}
