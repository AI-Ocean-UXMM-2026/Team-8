import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const origin=process.env.REPORT_TEST_URL||'http://127.0.0.1:3218';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
await mkdir('test-results',{recursive:true});
try{
 for(const width of [1440,390,320])for(const language of ['en','my']){
  const context=await browser.newContext({viewport:{width,height:1000}});await context.addInitScript(lang=>localStorage.setItem('pc-language-v1',lang),language);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/design-preview/illustrated');await page.locator('.ipHeroArt').evaluate(img=>img.decode());
  await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
  for(const state of ['normal','empty']){
   await page.getByLabel(language==='my'?'နမူနာအခြေအနေ':'Preview state',{exact:true}).selectOption(state);
   if(state==='empty')await page.locator('.ipEmpty img').evaluate(img=>img.decode());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${language}/${state} overflows`);
   for(const art of await page.locator('.ipHeroArt,.ipEmpty img').all()){assert.equal(await art.getAttribute('alt'),'');assert.equal(await art.getAttribute('aria-hidden'),'true');}
   assert.equal(await page.locator('.ipHeroArt').count(),1);assert.equal(await page.locator('table img').count(),0);
   await page.screenshot({path:`test-results/illustrated-${state}-${width}-${language}.png`,fullPage:true});
  }
  if(language==='en'){
   await page.getByLabel('Preview state',{exact:true}).selectOption('normal');await page.getByRole('searchbox').fill('unmatched');await page.getByRole('button',{name:'Clear search'}).click();assert.equal(await page.locator('tbody tr').count(),3);
   await page.getByLabel('Preview state',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.ipWelcomeLink').evaluate(el=>el===document.activeElement),true);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS original illustration assets; normal/empty/search, decorative semantics, keyboard, EN/MM and 1440/390/320px containment.');
}finally{await browser.close()}
