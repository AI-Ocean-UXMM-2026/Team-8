import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '../../src/shared/api/client';
import { createLiveTransport, ApiError } from '../../src/shared/api/transport';
import { createMockTransport } from '../../src/shared/api/mock';
import receipt from '../../contracts/fixtures/operations/receipt-100-90.json';

const key = receipt.headers['Idempotency-Key'];
test('mock receipt retries preserve original result; changed payload or fresh duplicate cannot repost stock', async () => {
  const client = createApiClient(createMockTransport());
  const result = await client.postReceipt(receipt.body.shipment.id, receipt.request, { idempotencyKey: key });
  assert.equal(result.shortage_qty, 10);
  result.good_qty = 999;
  assert.equal((await client.postReceipt(receipt.body.shipment.id, receipt.request, { idempotencyKey: key })).good_qty, 90);
  await assert.rejects(client.postReceipt(receipt.body.shipment.id, { ...receipt.request, notes: 'changed' }, { idempotencyKey: key }), (e: ApiError) => e.code === 'IDEMPOTENCY_CONFLICT');
  await assert.rejects(client.postReceipt(receipt.body.shipment.id, receipt.request, { idempotencyKey: '00000000-0000-4000-8000-000000000008' }), (e: ApiError) => e.code === 'STALE_VERSION');
});
test('shared client paginates both modes and covers empty, forbidden, stale, pending and provider error', async () => {
  const client = createApiClient(createMockTransport());
  const first = await client.listShipments({ limit: 1 });
  assert.equal(first.items[0].delivery_mode, 'in_house');
  const second = await client.listShipments({ cursor: first.next_cursor!, limit: 1 });
  assert.equal(second.items[0].delivery_mode, 'third_party');
  assert.equal(second.next_cursor, null);
  assert.deepEqual((await createApiClient(createMockTransport({ scenario: 'empty' })).listShipments()).items, []);
  for (const [scenario, code] of [['forbidden', 'FORBIDDEN'], ['stale', 'STALE_VERSION'], ['provider-error', 'PROVIDER_UNAVAILABLE']] as const) {
    await assert.rejects(createApiClient(createMockTransport({ scenario })).listShipments(), (e: ApiError) => e.code === code);
  }
  const caseId = receipt.body.case_ids[0];
  assert.equal((await client.getCase(caseId)).status, 'awaiting_sme_decision');
  assert.equal((await client.analyzeCase(caseId, { idempotencyKey: key })).status, 'pending');
});
test('live transport reads fresh token, forwards idempotency and never retries a failed mutation', async () => {
  let calls = 0;
  let token = 'first-token';
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', getAccessToken: async () => token,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(new URL(String(url)).origin, 'https://api.example.test');
      assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
      assert.equal((options!.headers as Record<string, string>)['Idempotency-Key'], key);
      assert.equal(options!.redirect, 'error');
      return Response.json({ error: { code: 'STALE_VERSION', message: 'Refresh.' } }, { status: 409, headers: { 'X-Correlation-ID': key } });
    } });
  for (const current of ['first-token', 'refreshed-token']) {
    token = current;
    await assert.rejects(transport({ method: 'POST', path: receipt.path, body: receipt.request, idempotencyKey: key }), (e: ApiError) => e.code === 'STALE_VERSION' && e.correlationId === key);
  }
  assert.equal(calls, 2);
});
test('no live token, unsafe URL/path, missing idempotency or cancellation prevents network access', async () => {
  let calls = 0;
  const transport = createLiveTransport({ baseUrl: 'http://localhost:8000', getAccessToken: async () => null, fetcher: async () => { calls++; return Response.json({}); } });
  await assert.rejects(transport({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.status === 401);
  for (const path of ['https://other.test/api/shipments', '//other.test/api/shipments', '/api/../secret']) {
    await assert.rejects(transport({ method: 'GET', path }), (e: ApiError) => e.code === 'INVALID_PATH');
  }
  await assert.rejects(transport({ method: 'POST', path: receipt.path }), (e: ApiError) => e.code === 'IDEMPOTENCY_REQUIRED');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(transport({ method: 'GET', path: '/api/shipments', signal: controller.signal }));
  assert.throws(() => createLiveTransport({ baseUrl: 'http://untrusted.test', getAccessToken: async () => 'token' }));
  assert.equal(calls, 0);
});
test('network failures and non-JSON replies do not return fictitious success', async () => {
  const live = (fetcher: typeof fetch) => createLiveTransport({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetcher });
  await assert.rejects(live(async () => { throw new TypeError('offline'); })({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'NETWORK_ERROR');
  await assert.rejects(live(async () => new Response('<html>error</html>', { status: 502 }))({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'INVALID_RESPONSE');
});
test('timeout and mid-flight cancellation stop requests without a mock fallback', async () => {
  const waiting: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
  });
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetcher: waiting, timeoutMs: 15 });
  // Keep a handle while the injected fetch waits on AbortSignal.timeout's unref timer.
  const keeper = setInterval(() => {}, 100);
  try {
    await assert.rejects(transport({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'REQUEST_TIMEOUT');
    const controller = new AbortController();
    const pending = transport({ method: 'GET', path: '/api/shipments', signal: controller.signal });
    setTimeout(() => controller.abort(new Error('Navigation cancelled')), 1);
    await assert.rejects(pending, /Navigation cancelled/);
  } finally { clearInterval(keeper); }
});

test('token lookup times out and a late token cannot start a fetch', async () => {
  let finishToken!: (token: string) => void;
  let calls = 0;
  const token = new Promise<string>(resolve => { finishToken = resolve; });
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', timeoutMs: 15,
    getAccessToken: () => token, fetcher: async () => { calls++; return Response.json({}); } });
  await assert.rejects(transport({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'REQUEST_TIMEOUT');
  finishToken('late-token');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 0);
});

test('cancellation while waiting for a token preserves the cancellation reason', async () => {
  const controller = new AbortController();
  const reason = new Error('Session navigation cancelled');
  let calls = 0;
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', timeoutMs: 1000,
    getAccessToken: () => new Promise(() => {}), fetcher: async () => { calls++; return Response.json({}); } });
  const pending = transport({ method: 'GET', path: '/api/shipments', signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(calls, 0);
});

test('cancellation during response parsing is not reported as invalid JSON', async () => {
  const controller = new AbortController();
  const reason = new Error('Body read cancelled');
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token',
    fetcher: async () => {
      const response = Response.json({});
      response.json = async () => { controller.abort(reason); throw new DOMException('Aborted body read', 'AbortError'); };
      return response;
    } });
  await assert.rejects(transport({ method: 'GET', path: '/api/shipments', signal: controller.signal }), error => error === reason);
});

test('deadline covers a body reader that never settles and retains correlation ID', async () => {
  const transport = createLiveTransport({ baseUrl: 'https://api.example.test', timeoutMs: 15, getAccessToken: async () => 'token',
    fetcher: async () => {
      const response = Response.json({}, { headers: { 'X-Correlation-ID': key } });
      response.json = () => new Promise(() => {});
      return response;
    } });
  await assert.rejects(transport({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'REQUEST_TIMEOUT' && e.correlationId === key);
});
