import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Run against npm run dev (or a production server) with REPORT_TEST_URL.
const base = process.env.REPORT_TEST_URL || 'http://localhost:3218';
const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
await mkdir('test-results', {recursive:true});
try {
  const errors=[];
  for (const width of [1440,768,390]) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    const page=await context.newPage();page.on('pageerror', e=>errors.push(e.message));
    await page.goto(base);await page.waitForSelector('#role option[value="manager"]',{state:'attached'});
    await page.selectOption('#role','manager');
    await page.locator('.reportManagerTools summary').click();await page.locator('#generateReviews').click();
    assert.equal(await page.locator('.reportTable .reportView').count(),11);
    // All table rows remain intact, including AI action cells after priority grouping.
    assert.equal(await page.locator('.reportTable tbody > td').count(),0);
    for (const language of ['en','my']) {
      await page.locator(`#language-switch [data-language-choice=${language}]`).click();
      await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
      await page.selectOption('#reportQueue','AI');
      assert.equal(await page.locator('.reportTable .reportView').count(),5);
      assert.equal(await page.locator('#reportQueue').inputValue(),'AI');
      await page.locator('#reportSearch').fill('no-match-unique');
      assert.equal(await page.locator('.reportTable .reportView').count(),0);
      await page.locator('#clearReportFilters').click();
      assert.equal(await page.locator('.reportTable .reportView').count(),11);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width} ${language}: page overflow`);
      await page.screenshot({path:`test-results/reports-${width}-${language}.png`,fullPage:true});
      const snapshot=await page.evaluate(()=>localStorage.getItem('pc-reports-v2'));
      await page.locator('.reportView').first().click();
      assert.equal(await page.locator('.reportSummary h3').count(),3);
      await page.screenshot({path:`test-results/report-detail-${width}-${language}.png`});
      await page.locator('#close').click();
      await page.locator('#openPrioritySettings').click();
      await page.locator('#prioritySettings [name=normal]').fill('60000');
      await page.locator('#prioritySettings [name=reason]').fill('Language switch must preserve this draft');
      const opposite=language==='en'?'my':'en';
      await page.locator(`#modal [data-language-choice=${opposite}]`).click();
      assert.equal(await page.locator('#prioritySettings [name=normal]').inputValue(),'60000');
      assert.equal(await page.locator('#prioritySettings [name=reason]').inputValue(),'Language switch must preserve this draft');
      // Option submission values must remain canonical English rule values.
      await page.locator('#addCategoryProfile').click();
      assert.equal(await page.locator('[name=safetyPriority]').inputValue(),'Critical');
      await page.locator(`#modal [data-language-choice=${language}]`).click();
      await page.screenshot({path:`test-results/priority-settings-${width}-${language}.png`});
      const overflow=await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth);
      assert.equal(overflow,false,`${width} ${language}: dialog overflow`);
      await page.locator('#close').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('pc-reports-v2')),snapshot,'Language switching changed report records');
    }
    await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='my');
    await page.goto(base+'/login');await page.waitForFunction(()=>document.documentElement.lang==='my');
    await page.getByRole('heading',{name:'ဂိုဒေါင်အကောင့် ဝင်ရန်'}).waitFor();
    await page.locator('#language-switch [data-language-choice=en]').click();
    await page.getByRole('heading',{name:'Warehouse sign in'}).waitFor();
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: English/Myanmar switch, persistence, shared login, search, queue filters, canonical form values, untouched data and desktop/tablet/mobile layouts.');
} finally {await browser.close();}
