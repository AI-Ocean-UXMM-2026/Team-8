import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.REPORT_TEST_URL || 'http://localhost:3218', {waitUntil:'networkidle'});
  await page.waitForSelector('#role option[value="rider"]', {state:'attached'});
  for (let i=0;i<8;i++) {
    await page.selectOption('#role','rider');
    await page.waitForSelector('#riderMap .leaflet-marker-icon');
    await page.locator('#startSimulation').click();
    await page.locator('#centerRider').click();
    await page.selectOption('#demoRoute',String(i%5));
    await page.locator('.leaflet-control-zoom-in').click();
    await page.selectOption('#role','sme');
    assert.equal(await page.locator('#riderMap').count(),0);
  }
  await page.waitForTimeout(500);
  assert.deepEqual(errors,[]);
  console.log('PASS: repeated rider map creation, simulation, route/zoom changes and role teardown without stale Leaflet callbacks.');
} finally { await browser.close(); }
