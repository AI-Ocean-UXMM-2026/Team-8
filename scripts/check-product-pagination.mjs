import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>sessionStorage.setItem('parcelcare.demo.role.v1','sme'));
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${process.env.PAGINATION_TEST_URL??'http://127.0.0.1:3228'}/demo/sme/orders`);
  const rows=page.locator('.releaseCatalogTable tbody tr');
  const waitRows=count=>page.waitForFunction(expected=>document.querySelectorAll('.releaseCatalogTable tbody tr').length===expected,count);
  const pager=page.getByRole('navigation',{name:'Product pagination'});
  await pager.getByText('Showing 1–10 of 15 products',{exact:true}).waitFor();
  await waitRows(10);assert.equal(await rows.count(),10);
  assert(await pager.getByRole('button',{name:'Previous products'}).isDisabled());
  const name=await rows.first().locator('strong').innerText();
  await rows.first().getByRole('button',{name:`Add ${name}`,exact:true}).click();
  const basket=page.getByRole('region',{name:'Your release request',exact:true});
  await basket.getByLabel(`Quantity for ${name}`,{exact:true}).waitFor();
  await pager.getByRole('button',{name:'Next products'}).click();
  await pager.getByText('Showing 11–15 of 15 products',{exact:true}).waitFor();
  await waitRows(5);assert.equal(await rows.count(),5);
  assert(await pager.getByRole('button',{name:'Next products'}).isDisabled());
  assert.equal(await basket.getByLabel(`Quantity for ${name}`,{exact:true}).inputValue(),'1');
  await pager.getByRole('button',{name:'Previous products'}).click();
  await pager.getByText('Page 1 of 2',{exact:true}).waitFor();
  await waitRows(10);assert.equal(await rows.count(),10);
  await pager.getByRole('button',{name:'Next products'}).click();
  await pager.getByText('Page 2 of 2',{exact:true}).waitFor();
  await page.getByLabel('Search products',{exact:true}).fill(name);
  await pager.getByText('Showing 1–1 of 1 products',{exact:true}).waitFor();
  await waitRows(1);assert.equal(await rows.count(),1);
  await page.getByLabel('Search products',{exact:true}).fill('no-such-product-xyz');
  await pager.getByText('Showing 0–0 of 0 products',{exact:true}).waitFor();
  assert.equal(await rows.count(),0);
  assert(await pager.getByRole('button',{name:'Next products'}).isDisabled());
  await page.getByLabel('Search products',{exact:true}).fill('');
  await pager.getByText('Showing 1–10 of 15 products',{exact:true}).waitFor();
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:`test-results/product-pagination-${width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: 10/5 product paging, boundaries, cart persistence, search reset, empty results, desktop and mobile.');
}finally{await browser.close();}
