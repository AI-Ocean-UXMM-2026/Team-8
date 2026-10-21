import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
 for(const width of [1440,390]){
  const p=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto((process.env.REPORT_TEST_URL||'http://localhost:3218')+'/demo/warehouse/exceptions');
  await p.getByLabel('Search cases',{exact:true}).fill('no-case-matches-this');
  await p.getByText('No cases match these filters.',{exact:false}).waitFor();
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.ok(await p.locator('.exceptionOpen').count()>0);
  await p.getByLabel('Priority',{exact:true}).selectOption('critical');
  for(const text of await p.locator('.casePriority').allTextContents())assert.equal(text,'critical');
  await p.getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`test-results/exception-queue-${width}.png`,fullPage:true});
  await p.locator('.exceptionOpen').first().click();
  await p.getByRole('heading',{name:'Case context',exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:/close case/i}).count(),0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`test-results/exception-detail-${width}.png`,fullPage:true});
  await p.locator('[data-language-choice=my]').first().click();
  await p.getByRole('heading',{name:'အမှုအချက်အလက်',exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS: queue filtering/reset, case context, evidence/history layout, guarded actions and Myanmar mobile/desktop without overflow.');
}finally{await browser.close()}
