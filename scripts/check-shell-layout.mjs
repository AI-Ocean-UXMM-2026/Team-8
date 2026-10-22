import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),base=process.env.REPORT_TEST_URL||'http://localhost:3218';
try{
 for(const [width,height] of [[1440,900],[1024,420],[390,844],[320,480]]){
  const p=await browser.newPage({viewport:{width,height}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  for(const language of ['en','my']){
   for(const path of ['', '/inventory','/shipments','/exceptions']){
    await p.goto(base+'/demo/warehouse'+path);await p.locator('.warehouseLogo img').waitFor({state:'attached'});
    await p.locator('.languageTrigger').click();await p.getByRole('menuitem',{name:language==='my'?'မြန်မာ':'English',exact:true}).click();
    await p.waitForFunction(l=>document.documentElement.lang===l,language);
    assert.equal(await p.locator('.globalHeader').evaluate(e=>e.getBoundingClientRect().height),width<768?144:64);
    assert.equal(await p.evaluate(()=>getComputedStyle(document.body).paddingTop),width<768?'144px':'64px');
    assert.equal(await p.locator('.warehouseNavigation a').count(),6);
    assert.equal(await p.locator('.warehousePage>header').count(),0);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(width<768){await p.locator('.sidebarToggle').click();await p.locator('.warehouseNavigation').waitFor({state:'visible'});await p.locator('.warehouseNavigation a').first().focus();await p.keyboard.press('Escape');assert.equal(await p.locator('.warehouseMenuToggle').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('.sidebarToggle').evaluate(e=>e===document.activeElement),true);}
    else{await p.locator('.warehouseNavigation a').last().focus();assert.equal(await p.locator('.warehouseNavigation a').last().evaluate(e=>e===document.activeElement),true);}
   }
  }
  assert.deepEqual(errors,[]);await p.screenshot({path:`test-results/phase1-shell-${width}-${height}.png`,fullPage:true});await p.close();
 }
 console.log('PASS: shared sidebar/footer anchoring on short screens, mobile menu/Escape, stable EN/MM header, keyboard focus and no page overflow across four warehouse pages.');
}finally{await browser.close()}
