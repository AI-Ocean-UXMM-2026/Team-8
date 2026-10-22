import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Run against a local dev or production server, with fresh demo sessions.
const base=process.env.LOCALIZATION_TEST_URL||'http://localhost:3218';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const routes={
 SME:['/demo/sme','/demo/sme/orders','/demo/sme/reports','/demo/sme/tracking','/demo/sme/account'],
 Warehouse:['/demo/warehouse','/demo/warehouse/inventory','/demo/warehouse/shipments','/demo/warehouse/exceptions','/demo/warehouse/settings','/demo/warehouse/sla','/demo/warehouse/account'],
 Rider:['/demo/courier','/demo/courier/account'],
 Manager:['/demo/workspace?workspace=manager','/demo/manager/account'],
};
try{
 for(const width of [1440,390].filter(value=>!process.env.LOCALIZATION_TEST_WIDTH||value===Number(process.env.LOCALIZATION_TEST_WIDTH)))for(const [role,paths] of Object.entries(routes).filter(([value])=>!process.env.LOCALIZATION_TEST_ROLE||value===process.env.LOCALIZATION_TEST_ROLE)){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/demo');
  await page.getByRole('button',{name:`Enter ${role} demo`,exact:true}).click();
  await page.waitForURL(/\/demo\/(sme|warehouse|courier|manager|workspace)/);
  for(const path of paths){
   await page.goto(base+path);
   await page.locator('h1').waitFor();
   if(path.endsWith('/orders'))await page.locator('input[maxlength="120"]').fill('Warehouse Name · စမ်းသပ်');
   if(path.endsWith('/reports')){
    await page.locator('main select').selectOption({index:1});
    await page.locator('textarea').fill('Warehouse damage · မူရင်းတင်ပြချက်');
    await page.locator('fieldset select').first().selectOption('quantity_mismatch');
   }
   for(const language of ['my','en','my']){
    await page.locator('.languageTrigger').click();
    await page.getByRole('menuitem',{name:language==='my'?'မြန်မာ':'English',exact:true}).click();
    await page.waitForFunction(value=>document.documentElement.lang===value,language);
    const title=page.locator('h1');
    if(language==='my')await page.waitForFunction(()=>/[\u1000-\u109f]/.test(document.querySelector('h1')?.textContent||''));
    else assert.match(await title.innerText(),/[A-Za-z]/);
    if(path.endsWith('/orders')){
     assert.equal(await page.locator('input[maxlength="120"]').inputValue(),'Warehouse Name · စမ်းသပ်');
     assert.equal(await page.locator('h2').first().innerText(),language==='my'?'၂။ SME လက်ခံသူ အချက်အလက်':'2. SME delivery contact');
    }
    if(path.endsWith('/sla')){
     assert.equal(await page.locator('h2').first().innerText(),language==='my'?'အချိန်သတ်မှတ်ချက်များ အလုပ်လုပ်ပုံ':'How deadlines work');
     await page.locator('summary').first().click();
     await page.locator('details[open]').getByText(language==='my'?'ဆက်လက်လုပ်ဆောင်ရန်':'Next action',{exact:true}).waitFor();
     await page.locator('summary').first().click();
    }
    if(path.endsWith('/reports')){
     assert.equal(await page.locator('textarea').inputValue(),'Warehouse damage · မူရင်းတင်ပြချက်');
     assert.equal(await page.locator('fieldset select').first().inputValue(),'quantity_mismatch');
     assert.equal(await page.getByRole('option',{name:language==='my'?'အရေအတွက် မကိုက်ညီခြင်း':'Quantity mismatch',exact:true}).count(),1);
    }
   }
   await page.reload();
   await page.waitForFunction(()=>document.documentElement.lang==='my');
   await page.getByRole('button',{name:'ဘာသာစကား ရွေးရန်',exact:true}).waitFor();
  }
  assert.deepEqual(errors,[],`${role} ${width}px`);
  console.log(`PASS: ${role} ${width}px, ${paths.length} pages, language reversal and reload persistence`);
  await context.close();
 }
}finally{await browser.close()}
