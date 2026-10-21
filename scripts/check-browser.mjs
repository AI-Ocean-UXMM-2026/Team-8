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
    assert.equal(await pages[1].locator('#content').innerHTML(), await pages[0].locator('#content').innerHTML(), `${role}: content differs`);
    // Rider map tiles may vary due to external requests; compare the other three workspaces pixel-for-pixel.
    if (role !== 'rider') {
      const original = await pages[0].screenshot({ path: `test-results/${role}-original.png`, fullPage: true, animations: 'disabled' });
      const migrated = await pages[1].screenshot({ path: `test-results/${role}-next.png`, fullPage: true, animations: 'disabled' });
      assert.ok(original.equals(migrated), `${role}: screenshots differ; inspect test-results`);
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
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS: all four workspaces render identical content; three screenshots match exactly; report submission and persistence work; no page errors.');
} finally {
  await browser?.close();
  next.kill();
  baseline.closeAllConnections();
  await new Promise(resolve => baseline.close(resolve));
}
