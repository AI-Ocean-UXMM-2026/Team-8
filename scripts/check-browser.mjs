import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const baseline = createServer(async (req, res) => {
  try {
    const file = path.resolve(root, 'dist', '.' + (req.url === '/' ? '/index.html' : req.url));
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) throw Error('Invalid path');
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => baseline.listen(3101, '127.0.0.1', resolve));
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3100', '-H', '127.0.0.1'], { stdio: 'pipe' });
let output = '';
next.stdout.on('data', chunk => { output += chunk; });
next.stderr.on('data', chunk => { output += chunk; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch('http://127.0.0.1:3100/api/health')).ok) { ready = true; break; } } catch {}
    if (next.exitCode !== null) throw Error(output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Next.js did not start: ' + output);
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const pages = [];
  for (const port of [3101, 3100]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'Asia/Yangon' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${port}: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForSelector('#nav button');
    await page.waitForFunction(() => document.querySelector('#role option[value="manager"]'));
    await page.waitForTimeout(700);
    pages.push(page);
  }
  await mkdir('test-results', { recursive: true });
  for (const role of ['sme', 'warehouse', 'manager', 'rider']) {
    for (const page of pages) {
      await page.selectOption('#role', role);
      await page.waitForTimeout(300);
    }
    assert.equal(await pages[1].locator('#title').innerText(), await pages[0].locator('#title').innerText(), `${role}: title differs`);
    assert.equal(await pages[1].locator('#nav').innerText(), await pages[0].locator('#nav').innerText(), `${role}: navigation differs`);
    if (role === 'rider') assert.equal(await pages[1].locator('#riderMap').getAttribute('aria-label'), await pages[0].locator('#riderMap').getAttribute('aria-label'));
    // Preserve the upstream branding change; remote Leaflet tiles are nondeterministic.

    if (role !== 'rider') {
      await pages[0].screenshot({ path: `test-results/${role}-original.png`, fullPage: true, animations: 'disabled' });
      await pages[1].screenshot({ path: `test-results/${role}-next.png`, fullPage: true, animations: 'disabled' });
      assert.ok(await pages[1].evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase() === '#25cbd1'), 'shadcn tokens are active');
    }
  }
  for (const page of pages) {
    await page.selectOption('#role', 'sme');
    await page.locator('#reportNew').click();
    await page.locator('#autofillReport').click();
    await page.locator('#reportForm button[type="submit"], #reportForm button.primary').last().click();
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('pc-reports-v2')).length > 1));
    await page.reload();
    await page.waitForSelector('#nav button');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('pc-reports-v2')).length > 1));
  }
  const design = await pages[1].context().newPage();
  design.on('pageerror', error => errors.push(`design-system: ${error.message}`));
  await design.goto('http://127.0.0.1:3100/design-system');
  await design.getByRole('button', { name: 'Save threshold' }).click();
  await design.getByRole('dialog').waitFor({ state: 'visible' });
  await design.keyboard.press('Escape');
  await design.getByRole('dialog').waitFor({ state: 'hidden' });
  await design.getByRole('button', { name: 'Save threshold' }).click();
  await design.getByRole('button', { name: 'Confirm preview' }).click();
  await design.getByRole('status').filter({ hasText: 'Preview updated' }).waitFor();
  assert.ok(await design.getByRole('status').filter({ hasText: 'Preview updated' }).isVisible());
  await design.screenshot({ path: 'test-results/design-system-desktop.png', fullPage: true });
  await design.setViewportSize({ width: 390, height: 844 });
  assert.ok(await design.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile design reference must not overflow');
  await design.screenshot({ path: 'test-results/design-system-mobile.png', fullPage: true });
  await pages[1].setViewportSize({ width: 390, height: 844 });
  await pages[1].screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  const foundation = await browser.newPage();
  foundation.on('pageerror', error => errors.push(`foundation: ${error.message}`));
  for (const width of [1440, 390]) {
    await foundation.setViewportSize({ width, height: 900 });
    await foundation.goto('http://127.0.0.1:3100/foundation');
    await foundation.getByRole('heading', { name: 'Shared workspace foundation' }).waitFor();
    await foundation.getByText('In-house rider', { exact: true }).waitFor();
    await foundation.getByText('Third-party courier', { exact: true }).waitFor();
    assert.equal(await foundation.locator('#parcelcare-workspace').count(), 0);
    assert.ok(await foundation.getByRole('button', { name: 'Submit receipt' }).isDisabled());
    assert.equal(await foundation.getByLabel('Reference example').inputValue(), 'PC-IN-0100');
    assert.ok(await foundation.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Foundation overflows viewport');
    await foundation.screenshot({ path: `test-results/foundation-${width}.png`, fullPage: true });
  }
  await foundation.close();
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS: four workspace navigations, report persistence, shadcn theme, dialog interactions and responsive reference; screenshots saved.');
} finally {
  await browser?.close();
  next.kill();
  baseline.closeAllConnections();
  await new Promise(resolve => baseline.close(resolve));
}
