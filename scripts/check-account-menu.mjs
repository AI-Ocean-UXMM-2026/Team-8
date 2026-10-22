import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const base=process.env.REPORT_TEST_URL||'http://localhost:3218';
let currentCase='';
try{
 for(const width of [1440,390,320]){
  for(const workspace of ['warehouse','sme','courier','manager']){
   currentCase=`${workspace} at ${width}px`;
   const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/demo/${workspace}`);const profile=page.locator('.profileTrigger');await profile.waitFor();
   await profile.click();await page.getByText('My account',{exact:true}).waitFor();
   assert.doesNotMatch(await page.locator('.accountIdentity').innerText(),/[0-9a-f]{8}-[0-9a-f]{4}-/);
   if(workspace==='warehouse')await page.locator('.accountContext').getByText('Yangon hub',{exact:true}).waitFor();
   if(width<768)await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();
   if(width<768){assert.equal(await page.locator('.profileDrawer').count(),1);await page.waitForFunction(()=>!!document.activeElement?.closest('.profileDrawer'));await page.keyboard.press('Shift+Tab');await page.waitForFunction(()=>!!document.activeElement?.closest('.profileDrawer'));}
   await page.getByText('Sign out',{exact:true}).click();const dialog=page.getByRole('dialog',{name:'Are you sure you want to sign out?'});await dialog.waitFor();
   await page.mouse.click(2,2);assert.equal(await dialog.isVisible(),true);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.classList.contains('profileTrigger'));
   await profile.click();await page.getByText('Sign out',{exact:true}).click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await profile.isVisible(),true);
   await profile.click();await page.getByText('My account',{exact:true}).click();await page.getByRole('heading',{name:'My account',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'My account',exact:true}).waitFor();
   await page.locator('.languageTrigger').click();await page.getByRole('menuitem',{name:'မြန်မာ',exact:true}).click();await page.waitForFunction(()=>document.documentElement.lang==='my');await page.getByRole('heading',{name:'ကျွန်ုပ်၏အကောင့်',exact:true}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'ကျွန်ုပ်၏အကောင့်',exact:true}).waitFor();assert.equal(await page.locator('.languageTrigger').textContent(),'မြန်မာ');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${workspace} ${width}`);
   await page.locator('.profileTrigger').click();await page.getByText('ထွက်ရန်',{exact:true}).click();await page.getByRole('dialog',{name:'Sign out လုပ်မှာ သေချာပါသလား?'}).waitFor();await page.keyboard.press('Escape');
   if(workspace==='warehouse'&&width===320)await page.screenshot({path:'test-results/account-mobile.png',fullPage:true});
   assert.deepEqual(errors,[]);await page.close();
  }
 }
 // Both popups coordinate; outside press closes menus and returns focus.
 const p=await browser.newPage();await p.goto(base+'/demo/warehouse');await p.locator('.profileTrigger').click();await p.locator('.languageTrigger').click();await p.locator('.languagePopup').waitFor();assert.equal(await p.locator('.profilePopup').count(),0);await p.mouse.click(500,300);await p.locator('.languagePopup').waitFor({state:'hidden'});
 // Confirm is the only action that signs out.
 await p.locator('.profileTrigger').click();await p.getByText('Sign out',{exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true}).click();await p.getByRole('heading',{name:'Please sign in',exact:true}).waitFor();await p.close();
 console.log('PASS profile dropdown/drawer, account routes, EN/MM persistence, cancellation, confirmation, focus and responsive layouts');
}catch(error){throw new Error(`${currentCase}: ${error.message}`,{cause:error})}finally{await browser.close()}
