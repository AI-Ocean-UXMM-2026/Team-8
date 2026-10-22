import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3218/demo/warehouse/shipments');
 const track=page.getByRole('link',{name:/^Track /}).first();await track.waitFor();await track.click();
 await page.getByRole('heading',{name:'Live Courier Tracking',exact:true}).waitFor();
 await page.getByText('Demo preview — no live GPS coordinates.',{exact:true}).waitFor();
 assert.ok(page.url().endsWith('#live-courier-tracking'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('.trackingTimeline li').count(),3);
 await page.locator('.languageTrigger').click();await page.getByRole('menuitem',{name:'မြန်မာ',exact:true}).click();
 await page.getByRole('heading',{name:'ပို့ဆောင်သူ၏ လက်ရှိတည်နေရာ',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);await page.close();
}console.log('PASS: Track deep link, honest demo placeholder, progress timeline, EN/MM, desktop/mobile overflow.');}finally{await browser.close()}
