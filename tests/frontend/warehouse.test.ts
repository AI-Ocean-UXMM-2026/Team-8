import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient, ApiError } from '../../src/shared/api';
import { createMockTransport } from '../../src/shared/api/mock';
import { receiptRequest } from '../../src/features/warehouse/validation';
import fixture from '../../contracts/fixtures/warehouse/initial.json';
import { canReleaseCommand } from '../../src/features/warehouse/command-policy';
import { savedReceipt, savedEvent } from '../../src/features/warehouse/saved-results';

const inbound = fixture.body.shipments[0].id;
const warehouseId = fixture.body.directory.warehouse_id;
const key = () => crypto.randomUUID();
function storage() { const saved = new Map<string, string>(); return { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, value: string) => { saved.set(k, value); } }; }
const api = (store = storage()) => createApiClient(createMockTransport({ dataset: 'warehouse', storage: store }));

test('warehouse overview counts linkable collections; SME/stock/direction filters and paging agree', async () => {
  const client = api();
  const summary = await client.getWarehouseOverview(warehouseId);
  assert.equal(summary.unique_skus, 3);
  assert.equal(summary.inbound_shipments, (await client.listShipments({ direction: 'inbound' })).items.length);
  assert.equal(summary.open_cases, (await client.listCases({ status: 'open' })).items.length);
  const filtered = await client.listInventory({ smeId: fixture.body.directory.smes[0].id, stockStatus: 'quarantined' });
  assert.equal(filtered.items.length, 1); assert.equal(filtered.items[0].sku, 'TEA-03');
  const first = await client.listShipments({ limit: 2 });
  const second = await client.listShipments({ limit: 2, cursor: first.next_cursor! });
  assert.equal(new Set([...first.items, ...second.items].map(s => s.id)).size, 4);
  await assert.rejects(client.getWarehouseOverview('10000000-0000-4000-8000-000000000999'), (e: ApiError) => e.status === 403);
});
test('90/100 with damage posts separated stock/cases once and survives adapter reload and replay', async () => {
  const store = storage(); const client = api(store); const detail = await client.getShipment(inbound);
  const body = receiptRequest(detail, { [detail.items[0].product_id]: { received: '90', damaged: '2' } }, true, detail.evidence_ids, 'Final verified count and condition.');
  const idempotencyKey = key();
  const result = await client.postReceipt(inbound, body, { idempotencyKey });
  assert.equal(result.shortage_qty, 10); assert.equal(result.good_qty, 88); assert.equal(result.damaged_qty, 2);
  assert.equal(result.stock![0].available_qty, 108); assert.equal(result.stock![0].quarantined_qty, 2); assert.equal(result.case_ids.length, 2);
  const reloaded = api(store);
  const { notes, ...rest } = body;
  assert.deepEqual(await reloaded.postReceipt(inbound, { notes, ...rest }, { idempotencyKey }), result);
  assert.equal((await reloaded.getShipment(inbound)).items[0].received_qty, 90);
  await assert.rejects(reloaded.postReceipt(inbound, body, { idempotencyKey: key() }), (e: ApiError) => e.code === 'STALE_VERSION');
});
test('partial receipts defer shortage; invalid/foreign quantities roll back demo state', async () => {
  const client = api(); let detail = await client.getShipment(inbound);
  const product = detail.items[0].product_id;
  const body = receiptRequest(detail, { [product]: { received: '40', damaged: '0' } }, false, [], 'Partial count');
  const first = await client.postReceipt(inbound, body, { idempotencyKey: key() });
  assert.equal(first.shipment.status, 'partially_received'); assert.equal(first.case_ids.length, 0);
  detail = await client.getShipment(inbound);
  const invalid = { ...body, expected_version: detail.version, lines: [{ product_id: fixture.body.inventory[1].id, received_qty: 1, damaged_qty: 0 }] };
  await assert.rejects(client.postReceipt(inbound, invalid, { idempotencyKey: key() }));
  assert.deepEqual(await client.getShipment(inbound), detail);
  const final = receiptRequest(detail, { [product]: { received: '50', damaged: '0' } }, true, detail.evidence_ids, 'Final shortage confirmed');
  assert.equal((await client.postReceipt(inbound, final, { idempotencyKey: key() })).shortage_qty, 10);
});
test('form rejects blank/fractional/negative/overreceived/damage counts and unowned evidence', async () => {
  const detail = await api().getShipment(inbound); const product = detail.items[0].product_id;
  for (const [received, damaged] of [['', '0'], ['1.5', '0'], ['-1', '0'], ['101', '0'], ['5', '6']]) assert.throws(() => receiptRequest(detail, { [product]: { received, damaged } }, false, [], ''));
  assert.throws(() => receiptRequest(detail, { [product]: { received: '90', damaged: '0' } }, true, [], ''));
  assert.throws(() => receiptRequest(detail, { [product]: { received: '100', damaged: '0' } }, true, [key()], ''));
});
test('outbound requires ordered allowed physical events, changes stock once, and blocks third-party dispatch', async () => {
  const client = api(); const outgoing = fixture.body.shipments[2].id;
  let detail = await client.getShipment(outgoing);
  const command = (type: 'picked' | 'packed' | 'dispatched') => ({ expected_version: detail.version, type, notes: 'Physical step verified', verified_at: new Date().toISOString(), evidence_ids: detail.evidence_ids });
  await assert.rejects(client.recordShipmentEvent(outgoing, command('dispatched'), { idempotencyKey: key() }));
  for (const type of ['picked', 'packed', 'dispatched'] as const) detail = await client.recordShipmentEvent(outgoing, command(type), { idempotencyKey: key() });
  assert.equal(detail.status, 'in_transit'); assert.equal(detail.events.length, 3); assert.deepEqual(detail.allowed_events, []);
  assert.equal((await client.listInventory()).items.find(i => i.id === detail.items[0].product_id)!.available_qty, 20);
  await assert.rejects(client.recordShipmentEvent(fixture.body.shipments[3].id, { ...command('dispatched'), expected_version: 1 }, { idempotencyKey: key() }));
});

test('only known first-attempt rejections release a command; uncertain retries retain their key', () => {
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [409, 'STALE_VERSION'], [422, 'VALIDATION_ERROR']] as const) {
    assert.equal(canReleaseCommand(new ApiError(status, code, 'Rejected'), false), true);
    assert.equal(canReleaseCommand(new ApiError(status, code, 'Rejected retry'), true), false);
  }
  for (const [status, code] of [[408, 'HTTP_ERROR'], [429, 'HTTP_ERROR'], [409, 'INVALID_RESPONSE'], [409, 'IDEMPOTENCY_CONFLICT'], [500, 'INTERNAL_ERROR'], [0, 'NETWORK_ERROR']] as const) {
    assert.equal(canReleaseCommand(new ApiError(status, code, 'Unknown outcome'), false), false);
  }
});

test('saved receipt validates response identity, versions, totals and stock before declaring success', async () => {
  const client = api(); const detail = await client.getShipment(inbound);
  const request = receiptRequest(detail, { [detail.items[0].product_id]: { received: '100', damaged: '0' } }, true, [], '');
  const result = await client.postReceipt(inbound, request, { idempotencyKey: key() });
  assert.equal(savedReceipt(result, inbound, 1).received_qty, 100);
  for (const invalid of [null, {}, { ...result, good_qty: 999 }, { ...result, stock: null }, { ...result, shipment: { ...result.shipment, id: key() } }, { ...result, shipment: { ...result.shipment, version: 1 } }, { ...result, stock: [{ ...result.stock![0], sme_id: key() }] }]) {
    assert.throws(() => savedReceipt(invalid, inbound, 1), (e: ApiError) => e.code === 'INVALID_RESPONSE');
  }
});

test('event response must include the saved operation and complete renderable detail', async () => {
  const client = api(); const id = fixture.body.shipments[2].id;
  const result = await client.recordShipmentEvent(id, { expected_version: 1, type: 'picked', notes: 'Verified', verified_at: new Date().toISOString(), evidence_ids: [] }, { idempotencyKey: key() });
  assert.equal(savedEvent(result, id, 1, 'picked').version, 2);
  for (const invalid of [{ ...result, events: [] }, { ...result, items: null }, { ...result, allowed_events: ['invented'] }, { ...result, events: [{ ...result.events[0], verified_at: 'not-a-date' }] }]) {
    assert.throws(() => savedEvent(invalid, id, 1, 'picked'), (e: ApiError) => e.code === 'INVALID_RESPONSE');
  }
});
