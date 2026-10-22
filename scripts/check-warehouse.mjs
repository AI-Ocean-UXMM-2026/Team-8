import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { createMockTransport } = require('../.test-build/src/shared/api/mock.js');
const fixture = JSON.parse(await readFile('contracts/fixtures/warehouse/initial.json', 'utf8')).body;
const origin = 'http://127.0.0.1:3112';
const apiOrigin = 'http://127.0.0.1:8008';
const authOrigin = 'https://parcelcare-fixture.supabase.test';
// Test process only: all Auth/API calls are intercepted; these are fictitious public config values.
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '3112', '-H', '127.0.0.1'], {
  stdio: 'pipe', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: authOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', NEXT_PUBLIC_PARCELCARE_API_URL: apiOrigin },
});
let output = ''; server.stdout.on('data', c => { output += c; }); server.stderr.on('data', c => { output += c; });
let browser;let lastPage;
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(ready, output);
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();lastPage=page; const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`${origin}/demo/warehouse`);
  await page.getByRole('heading', { name: 'Warehouse overview' }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/warehouse-overview.png', fullPage: true });
  await page.getByRole('link', { name: /Inbound shipments/ }).click();
  await page.getByRole('link', { name: 'PC-IN-0001' }).click();
  await page.getByLabel('Received now').fill('90');
  await page.getByLabel('Damaged now').fill('2');
  await page.getByLabel('Verified shipment count / condition record').check();
  await page.getByLabel('Receiving note').fill('90 counted; two damaged, shortage verified.');
  await page.getByRole('button', { name: 'Finalize receiving' }).click();
  await page.getByRole('dialog').waitFor();
  // Escape closes the native dialog and restores the editable form.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 1);
  assert.equal(await page.getByRole('dialog').isVisible(), false);
  assert.ok(await page.getByRole('button', { name: 'Finalize receiving' }).evaluate(el => el === document.activeElement), 'Escape must restore focus to the review button');
  await page.getByRole('button', { name: 'Finalize receiving' }).click();
  await page.getByLabel('I understand that final receiving cannot be reopened.',{exact:true}).check();
  await page.getByRole('button', { name: 'Confirm final receipt', exact: true }).click();
  await page.getByRole('heading', { name: 'Receipt saved' }).waitFor();
  await page.getByText('TOTE-01: available 108, on hold 2', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Receiving is finalized for this shipment.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Inventory', exact: true }).click();
  await page.getByLabel('Stock status').waitFor();
  await page.evaluate(sme => {
    const stock = document.getElementById('stock-status');
    const company = document.getElementById('inventory-sme');
    stock.value = 'quarantined'; stock.dispatchEvent(new Event('change', { bubbles: true }));
    company.value = sme; company.dispatchEvent(new Event('change', { bubbles: true }));
  }, fixture.directory.smes[0].id);
  assert.equal(new URL(page.url()).searchParams.get('stock_status'), 'quarantined', 'Rapid SME changes must retain the stock filter');
  assert.equal(new URL(page.url()).searchParams.get('sme_id'), fixture.directory.smes[0].id);
  await page.getByRole('cell', { name: 'Canvas tote', exact: false }).waitFor();
  assert.ok((await page.locator('tbody').innerText()).includes('TOTE-01'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Warehouse overflows mobile viewport');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/warehouse-mobile.png', fullPage: true });
  console.log('PASS demo receipt persistence, stock filters, keyboard dialog and mobile layout');

  await page.goto(`${origin}/demo/warehouse/exceptions`);
  await page.getByLabel('Issue type', { exact: true }).selectOption('courier_delay');
  await page.getByLabel('Handling mode', { exact: true }).selectOption('human');
  await page.getByRole('link', { name: 'courier delay', exact: true }).waitFor();
  await page.getByLabel('Priority', { exact: true }).selectOption('critical');
  await page.getByText('No cases match these filters.', { exact: false }).waitFor();
  await page.getByLabel('Priority', { exact: true }).selectOption('normal');
  await page.getByRole('link', { name: 'courier delay', exact: true }).click();
  await page.getByText('Evidence, analysis and verification', { exact: true }).click();
  await page.getByRole('heading', { name: 'Case facts', exact: false }).waitFor();
  await page.getByText('No AI analysis supplied.', { exact: false }).waitFor();
  assert.ok(await page.getByText('Uploaded; verification is separate', { exact: true }).count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Case panels overflow mobile viewport');
  await page.screenshot({ path: 'test-results/warehouse-case-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/warehouse-case-desktop.png', fullPage: true });
  await page.goto(`${origin}/demo/warehouse/exceptions/00000000-0000-4000-8000-999999999999`);
  await page.getByRole('heading', { name: 'Record unavailable', exact: true }).waitFor();
  console.log('PASS case queue filters, shared read-only panels, unavailable details and mobile layout');

  // Live route: verify password exchange -> server membership -> operational API,
  // including pending-submit recovery, 401/403/error/empty states. No real provider calls.
  const live = await context.newPage(); live.on('pageerror', err => errors.push(err.message));
  let identityStatus = 200; let readError = 0; let empty = false; let receiptReply = ''; let denyNextReceipt = false; let receiptCalls = 0;
  let workspaceRole = 'staff';
  const receiptKeys = [];
  const mock = createMockTransport({ dataset: 'warehouse' });
  const user = { id: '10000000-0000-4000-8000-000000000099', aud: 'authenticated', role: 'authenticated', email: 'staff@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp, iat: exp - 3600 })).toString('base64url')}.fixture-signature`;
  await live.route(`${authOrigin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/rest/v1/')) return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: path.endsWith('/smes') ? [{ name: 'Golden Bloom' }] : [] });
    return route.fulfill({ status: path.includes('logout') ? 204 : 200, headers: { 'Access-Control-Allow-Origin': '*' }, ...(path.includes('logout') ? {} : { json: path.endsWith('/user') ? user : { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user } }) });
  });
  await live.route(`${apiOrigin}/api/**`, async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    assert.equal(request.headers().authorization, `Bearer ${token}`);
    if ((path === '/api/me' && identityStatus !== 200) || (readError && request.method() === 'GET' && path !== '/api/me')) return route.fulfill({ status: path === '/api/me' ? identityStatus : readError, headers, json: { error: { code: identityStatus === 403 || readError === 403 ? 'FORBIDDEN' : readError === 401 ? 'UNAUTHENTICATED' : 'SERVICE_UNAVAILABLE', message: 'Fixture access or service error.' } } });
    if (path === '/api/sme/overview') return route.fulfill({ status: 200, headers, json: { inventory: [], shipments: [], cases: [], approvals: [] } });
    if (path === '/api/rider/assignments') return route.fulfill({ status: 200, headers, json: [] });
    if (empty && path === '/api/inventory') return route.fulfill({ status: 200, headers, json: { items: [], next_cursor: null } });
    if (request.method() === 'POST' && path.includes('/receipts/')) {
      receiptKeys.push(request.headers()['idempotency-key']);
      if (denyNextReceipt) {
        denyNextReceipt = false;
        return route.fulfill({ status: 403, headers, json: { error: { code: 'FORBIDDEN', message: 'Temporarily denied during recovery.' } } });
      }
    }
    try {
      const body = request.postDataJSON() ?? undefined;
      const result = await mock({ method: request.method(), path: `${path}${url.search}`, body, idempotencyKey: request.headers()['idempotency-key'] });
      if (path === '/api/me' && workspaceRole !== 'staff') return route.fulfill({ status: 200, headers, json: { ...result, memberships: [{ ...result.memberships[0], role: workspaceRole }] } });
      if (request.method() === 'POST' && path.includes('/receipts/')) {
        receiptCalls++;
        const reply = receiptReply; receiptReply = '';
        if (reply === 'timeout') return route.fulfill({ status: 408, headers, json: { error: { code: 'HTTP_ERROR', message: 'Gateway timed out after the receipt committed.' } } });
        if (reply === 'malformed') return route.fulfill({ status: 200, headers, json: { unexpected: 'Missing saved receipt fields' } });
      }
      return route.fulfill({ status: 200, headers, json: result });
    } catch (error) { return route.fulfill({ status: error.status || 500, headers, json: { error: { code: error.code || 'INTERNAL_ERROR', message: error.message } } }); }
  });
  await live.goto(`${origin}/warehouse`);
  await live.getByRole('heading', { name: 'Please sign in' }).waitFor();
  assert.equal(await live.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href'),'/login');
  await live.goto(`${origin}/login`);
  await live.waitForURL(`${origin}/login`);
  await live.waitForLoadState('networkidle');
  await live.getByLabel('Email', { exact: true }).fill('staff@example.test');
  await live.getByLabel('Password', { exact: true }).fill('fictitious-password');
  await live.getByRole('button', { name: 'Sign in', exact: true }).click();
  await live.getByRole('heading', { name: 'Warehouse overview' }).waitFor();
  await live.waitForURL(`${origin}/warehouse`);
  await live.waitForLoadState('networkidle');
  assert.equal(await live.getByText('Demo · fictitious data in this tab').count(), 0);
  assert.equal(await live.locator('#role').count(), 0);
  await live.getByRole('link', { name: 'Shipments', exact: true }).click();
  await live.getByRole('link', { name: 'PC-IN-0001', exact: true }).click();
  await live.getByLabel('Received now').fill('90'); await live.getByLabel('Damaged now').fill('0');
  await live.getByLabel('Verified shipment count / condition record').check();
  await live.getByLabel('Receiving note').fill('Final verified shortage');
  const refreshCheck = live.waitForResponse(response => response.url() === `${apiOrigin}/api/me` && response.status() === 200);
  await live.evaluate(() => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (!key) throw new Error('Test auth session missing');
    // Exercise the SDK's real auth-event subscription through its broadcast channel.
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'TOKEN_REFRESHED', session: JSON.parse(sessionStorage.getItem(key)) });
    channel.close();
  });
  await refreshCheck;
  assert.equal(await live.getByLabel('Received now').inputValue(), '90', 'Token refresh must preserve receiving counts');
  assert.equal(await live.getByLabel('Receiving note').inputValue(), 'Final verified shortage');
  assert.equal(await live.getByLabel('Verified shipment count / condition record').isChecked(), true);
  await live.getByRole('button', { name: 'Finalize receiving' }).click();
  receiptReply = 'timeout';
  await live.getByLabel('I understand that final receiving cannot be reopened.',{exact:true}).check();
  await live.getByRole('button', { name: 'Confirm final receipt', exact: true }).click();
  await live.getByRole('button', { name: 'Retry submitted receipt' }).waitFor();
  await live.reload();
  denyNextReceipt = true;
  await live.getByRole('button', { name: 'Retry submitted receipt' }).click();
  await live.getByRole('alert').filter({ hasText: 'Temporarily denied during recovery.' }).waitFor();
  await live.getByRole('button', { name: 'Retry submitted receipt' }).click();
  await live.getByRole('heading', { name: 'Receipt saved' }).waitFor();
  assert.equal(receiptCalls, 2);
  assert.equal(receiptKeys.length, 3);
  assert.equal(new Set(receiptKeys).size, 1, 'A denied retry must not rotate the original command key');
  const posted = await mock({ method: 'GET', path: `/api/shipments/${fixture.shipments[0].id}` });
  assert.equal(posted.items[0].received_qty, 90); assert.equal(posted.events.length, 1);
  await live.goto(`${origin}/warehouse/shipments/${fixture.shipments[1].id}`);
  await live.getByLabel('Received now').fill('20'); await live.getByLabel('Damaged now').fill('0');
  await live.getByRole('button', { name: 'Review partial receipt' }).click();
  receiptReply = 'malformed';
  await live.getByRole('button', { name: 'Confirm partial receipt', exact: true }).click();
  await live.getByRole('alert').filter({ hasText: 'The saved result could not be verified.' }).waitFor();
  assert.equal(await live.getByRole('heading', { name: 'Receipt saved' }).count(), 0, 'Malformed success must not be displayed as saved');
  await live.reload();
  await live.getByRole('button', { name: 'Retry submitted receipt' }).click();
  await live.getByRole('heading', { name: 'Receipt saved' }).waitFor();
  assert.equal(new Set(receiptKeys.slice(3)).size, 1);
  const secondReceipt = await mock({ method: 'GET', path: `/api/shipments/${fixture.shipments[1].id}` });
  assert.equal(secondReceipt.items[0].received_qty, 20); assert.equal(secondReceipt.events.length, 1);
  await live.goto(`${origin}/warehouse/shipments/${fixture.shipments[2].id}`);
  for (const type of ['picked', 'packed', 'dispatched']) {
    await live.getByLabel('Verification note').fill('Staff verified physical handling');
    await live.getByText('I have verified this physical step and its prerequisites.').click();
    await live.getByRole('button', { name: `Review ${type}`, exact: true }).click();
    await live.getByRole('button', { name: 'Confirm event', exact: true }).click();
    await live.getByText(type.replaceAll('_', ' '), { exact: true }).first().waitFor();
  }
  await live.getByText('Event saved. Shipment status: in transit.', { exact: true }).waitFor();
  empty = true; await live.goto(`${origin}/warehouse/inventory`); await live.getByText('No products match these filters.', { exact: false }).waitFor(); empty = false;
  for (const [status, heading] of [[403, 'Access denied'], [401, 'Session expired'], [503, 'Unable to load this view']]) {
    readError = status; await live.goto(`${origin}/warehouse/inventory`); await live.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  readError = 0; identityStatus = 403; await live.goto(`${origin}/warehouse`); await live.getByRole('heading', { name: 'Warehouse access required' }).waitFor();
  identityStatus = 401; await live.goto(`${origin}/warehouse`); await live.getByRole('heading', { name: 'Please sign in' }).waitFor();
  identityStatus = 200; await live.goto(`${origin}/warehouse`); await live.getByRole('heading', { name: 'Warehouse overview' }).waitFor();
  await live.getByRole('button', { name: 'Sign out', exact: true }).click();
  await live.getByRole('heading', { name: 'Please sign in' }).waitFor();
  await live.reload(); await live.getByRole('heading', { name: 'Please sign in' }).waitFor();
  const noJavaScript = await browser.newContext({ javaScriptEnabled: false });
  const staticLogin = await noJavaScript.newPage();
  await staticLogin.goto(`${origin}/login`);
  assert.equal(await staticLogin.getByLabel('Email', { exact: true }).isEnabled(), false, 'Credentials must not be accepted before the sign-in handler hydrates');
  assert.equal(await staticLogin.locator('form button[type="submit"]').isDisabled(), true);
  await noJavaScript.close();
  for (const role of ['sme', 'rider']) {
    workspaceRole = role;
    await live.goto(`${origin}/login`);
    await live.getByLabel('Email', { exact: true }).fill(`${role}@example.test`);
    await live.getByLabel('Password', { exact: true }).fill('fictitious-password');
    await live.getByRole('button', { name: 'Sign in', exact: true }).click();
    await live.waitForURL(`${origin}/${role}`);
    await live.getByRole('heading', { name: role === 'sme' ? 'SME dashboard' : 'Rider tasks', exact: true }).waitFor();
    if (role === 'rider') await live.getByText('No active rider assignments.', { exact: true }).waitFor();
    await live.goto(`${origin}/${role === 'sme' ? 'rider' : 'sme'}`);
    await live.getByText('An active membership is required', { exact: false }).waitFor();
    await live.getByRole('link', { name: 'Go to my workspace', exact: true }).click();
    await live.waitForURL(`${origin}/${role}`);
    await live.getByRole('button', { name: 'Sign out', exact: true }).click();
    await live.waitForURL(`${origin}/login`);
  }
  assert.deepEqual(errors, [], 'Warehouse browser runtime errors');
  console.log('PASS warehouse: rapid filters, persistence, mobile/dialog accessibility, live sessions, committed receipt HTTP 408/reload/denied retry replay, malformed success recovery, dispatch and empty/401/403/503 states; no runtime errors.');
} catch (error) {
  await mkdir('test-results', { recursive: true });
  if (browser) for (const [index, page] of browser.contexts().flatMap(c => c.pages()).entries()) await page.screenshot({ path: `test-results/warehouse-failure-${index}.png`, fullPage: true }).catch(() => {});
  console.error(output.slice(-2500));
  throw error;
} finally { await browser?.close(); server.kill(); }
