import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '../../src/shared/api/client';
import { createLiveTransport, ApiError } from '../../src/shared/api/transport';
import { createMockTransport } from '../../src/shared/api/mock';
import receipt from '../../contracts/fixtures/operations/receipt-100-90.json';
import { GET as proxyGet } from '../../src/app/api/[...path]/route';
import { GET as workspaceHealth } from '../../src/app/api/workspace-health/route';

test('workspace prewarm uses fixed health URL without credentials and rejects unhealthy replies', async () => {
  const previousUrl = process.env.PARCELCARE_API_URL, previousFetch = globalThis.fetch;
  try {
    process.env.PARCELCARE_API_URL = 'https://backend.example.test';
    for (const [upstream, expected] of [[Response.json({status:'ok',service:'parcelcare-api'}),200], [new Response('starting',{status:503}),503], [new Response('<html>wrong service</html>'),503]] as const) {
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url),'https://backend.example.test/health');
        assert.equal(new Headers(options?.headers).has('authorization'),false);
        assert.equal(options?.redirect,'error');
        return upstream;
      };
      const response=await workspaceHealth(new Request('https://frontend.example.test/api/workspace-health'));
      assert.equal(response.status,expected);
      assert.deepEqual(await response.json(),{ready:expected===200});
    }
    for (const url of ['https://frontend.example.test','https://user:secret@backend.example.test','https://backend.example.test/path']) {
      process.env.PARCELCARE_API_URL=url;
      globalThis.fetch=async()=>{throw new Error('Must not fetch unsafe configuration');};
      assert.equal((await workspaceHealth(new Request('https://frontend.example.test/api/workspace-health'))).status,503);
    }
  } finally {
    globalThis.fetch=previousFetch;
    if(previousUrl===undefined)delete process.env.PARCELCARE_API_URL;else process.env.PARCELCARE_API_URL=previousUrl;
  }
});

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
  await assert.rejects(live(async () => new Response('<html>error</html>', { status: 502 }))({ method: 'GET', path: '/api/shipments' }), (e: ApiError) => e.code === 'SERVICE_UNAVAILABLE');
  await assert.rejects(live(async () => new Response('<html>wrong service</html>', { status: 200 }))({ method: 'GET', path: '/api/me' }), (e: ApiError) => e.code === 'INVALID_RESPONSE');
});

test('sign-in proxy rejects upstream HTML and invalid JSON, and preserves identity and auth errors', async () => {
  const previousUrl = process.env.PARCELCARE_API_URL;
  const previousFetch = globalThis.fetch;
  process.env.PARCELCARE_API_URL = 'https://backend.example.test';
  try {
    const identity = { actor_id: 'fixture', memberships: [] };
    for (const [upstream, status, expected] of [
      [new Response('<html>hosting error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }), 502, 'UPSTREAM_ERROR'],
      [new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } }), 502, 'UPSTREAM_ERROR'],
      [new Response('broken', { headers: { 'Content-Type': 'application/json' } }), 502, 'UPSTREAM_ERROR'],
      [Response.json(identity), 200, null],
      [Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Expired.' } }, { status: 401 }), 401, 'UNAUTHENTICATED'],
    ] as const) {
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), 'https://backend.example.test/api/me');
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer fixture-token');
        return upstream;
      };
      const response = await proxyGet(new Request('https://frontend.example.test/api/me', { headers: { Authorization: 'Bearer fixture-token' } }));
      assert.equal(response.status, status);
      const data = await response.json();
      if (expected) assert.equal(data.error.code, expected);
      else assert.deepEqual(data, identity);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.PARCELCARE_API_URL;
    else process.env.PARCELCARE_API_URL = previousUrl;
  }
});
test('HTML auth and gateway failures retain useful status and correlation without a JSON parse message', async () => {
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [502, 'SERVICE_UNAVAILABLE'], [503, 'SERVICE_UNAVAILABLE']] as const) {
    const transport = createLiveTransport({ baseUrl: 'https://frontend.example.test', getAccessToken: async () => 'fixture-token',
      fetcher: async () => new Response('<html>Render error page</html>', { status, headers: { 'Content-Type': 'text/html', 'X-Correlation-ID': key } }) });
    await assert.rejects(transport({ method: 'GET', path: '/api/me' }), (error: ApiError) =>
      error.status === status && error.code === code && error.correlationId === key && !error.message.includes('unreadable'));
  }
});

test('sign-in transport recovers through proxy after a gateway outage without inventing an identity', async () => {
  const previousUrl = process.env.PARCELCARE_API_URL;
  const previousFetch = globalThis.fetch;
  process.env.PARCELCARE_API_URL = 'https://backend.example.test';
  const identity = { actor_id: '10000000-0000-4000-8000-000000000099', memberships: [{ warehouse_id: '10000000-0000-4000-8000-000000000001', role: 'staff', sme_id: null }] };
  let available = false, calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return available ? Response.json(identity) : new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }); };
    const client = createApiClient(createLiveTransport({ baseUrl: 'https://frontend.example.test', getAccessToken: async () => 'fixture-token',
      fetcher: async (url, init) => proxyGet(new Request(url, init)) }));
    await assert.rejects(client.getMe(), (error: ApiError) => error.status === 502 && error.code === 'UPSTREAM_ERROR');
    assert.equal(calls, 1, 'An outage must not trigger automatic retries or a demo fallback');
    available = true;
    assert.deepEqual(await client.getMe(), identity);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.PARCELCARE_API_URL;
    else process.env.PARCELCARE_API_URL = previousUrl;
  }
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

// A read-only startup retry must never repeat password exchange or stock commands.
test('workspace identity tolerates temporary gateway errors, preserves permission failures and stays bounded',async()=>{
 const {loadWorkspaceIdentity}=await import('../../src/shared/api/identity');
 let clock=0,calls=0,waiting=0;
 const result=await loadWorkspaceIdentity(async()=>{calls++;if(calls<3)throw new ApiError(502,'UPSTREAM_ERROR','Starting');return {actor_id:'verified'};},{now:()=>clock,wait:async ms=>{clock+=ms},onWaiting:()=>waiting++});
 assert.equal(result.actor_id,'verified');assert.equal(calls,3);assert.equal(waiting,2);
 for(const status of [401,403,422]){calls=0;await assert.rejects(loadWorkspaceIdentity(async()=>{calls++;throw new ApiError(status,'FORBIDDEN','Denied')},{wait:async()=>{throw Error('Must not wait')}}),(e:ApiError)=>e.status===status);assert.equal(calls,1);}
 clock=0;await assert.rejects(loadWorkspaceIdentity(async()=>{throw new ApiError(503,'SERVICE_UNAVAILABLE','Starting')},{budgetMs:4000,now:()=>clock,wait:async ms=>{clock+=ms}}),(e:ApiError)=>e.code==='WORKSPACE_STARTUP_TIMEOUT');
 const controller=new AbortController();await assert.rejects(loadWorkspaceIdentity(async()=>{controller.abort(new Error('Cancelled'));throw new ApiError(503,'SERVICE_UNAVAILABLE','Starting')},{signal:controller.signal}),/Cancelled/);
 await assert.rejects(loadWorkspaceIdentity(async()=>{throw new ApiError(503,'SERVICE_UNAVAILABLE','Workspace service is not configured.')},{wait:async()=>{throw Error('Must not wait')}}),/not configured/);
});
