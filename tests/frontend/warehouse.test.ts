import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient, ApiError } from '../../src/shared/api';
import { createMockTransport } from '../../src/shared/api/mock';
import { receiptRequest, receiptLinePreview } from '../../src/features/warehouse/validation';
import fixture from '../../contracts/fixtures/warehouse/initial.json';
import { canReleaseCommand } from '../../src/features/warehouse/command-policy';
import { savedReceipt, savedEvent } from '../../src/features/warehouse/saved-results';
import { caseView, filterCases } from '../../src/features/exceptions/case-view';
import {caseColumn,loadCaseBoard,sortBoardCases} from '../../src/features/exceptions/case-board';

const inbound = fixture.body.shipments[0].id;
const warehouseId = fixture.body.directory.warehouse_id;
const key = () => crypto.randomUUID();
function storage() { const saved = new Map<string, string>(); return { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, value: string) => { saved.set(k, value); } }; }
const api = (store = storage()) => createApiClient(createMockTransport({ dataset: 'warehouse', storage: store }));

test('case board groups every workflow state and ranks priority before risk without mutating data',()=>{
  assert.deepEqual(['new','investigating','processing','awaiting_information','awaiting_sme_decision','awaiting_courier_confirmation','awaiting_verification','resolved','closed'].map(caseColumn),['new','investigating','investigating','waiting','waiting','waiting','waiting','resolved','resolved']);
  const sample=caseView(fixture.body.cases[0]);
  const rows=[{...sample,id:key(),priority:'low' as const,risk_score:99},{...sample,id:key(),priority:'critical' as const,risk_score:1},{...sample,id:key(),priority:'critical' as const,risk_score:80}];
  assert.deepEqual(sortBoardCases(rows).map(c=>c.risk_score),[80,1,99]);assert.equal(rows[0].priority,'low');
});
test('case board loads beyond the first page and rejects repeated or changing pages',async()=>{
  const sample=caseView(fixture.body.cases[0]),second={...sample,id:key()};const cursors:Array<string|undefined>=[];
  const page=await loadCaseBoard(async cursor=>{cursors.push(cursor);return cursor?{items:[second],next_cursor:null}:{items:[sample],next_cursor:'next'};});
  assert.deepEqual(cursors,[undefined,'next']);assert.equal(page.items.length,2);assert.equal(page.next_cursor,null);
  await assert.rejects(()=>loadCaseBoard(async()=>({items:[],next_cursor:'repeat'})),/repeated page/);
  await assert.rejects(()=>loadCaseBoard(async()=>({items:[sample],next_cursor:'next'})),/queue changed/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>loadCaseBoard(async()=>({items:[],next_cursor:null}),controller.signal),{name:'AbortError'});
});

test('merged case filters run before pagination and remain consistent after investigation actions', async () => {
  const store = storage();
  const data = structuredClone(fixture.body);
  const target = data.cases[0];
  data.cases.unshift({ ...target, id: key(), type: 'damaged_goods', priority: 'low', status: 'new' });
  store.setItem('parcelcare.warehouse.demo.v1', JSON.stringify({ data, replay: {} }));
  const client = api(store);
  const filter = { warehouseId, limit: 1, issueType: 'courier_delay', priority: 'normal', mode: 'human', owner: 'unassigned' };
  assert.deepEqual((await client.listCases({ ...filter, state: 'awaiting_courier_confirmation' })).items.map(c => c.id), [target.id]);
  assert.equal((await client.listCases({ ...filter, owner: (await client.getMe()).actor_id })).items.length, 0);
  const detail = await client.getWarehouseCase(target.id, warehouseId);
  const changed = await client.recordCaseAction(target.id, { expected_version: detail.version, source_version: detail.source_version,
    policy_version: Number(detail.source_version.split(':')[2]), action: 'escalate', note: 'Reviewed case requires human investigation.', evidence_ids: [] },
    { warehouseId, idempotencyKey: key() });
  assert.equal(changed.status, 'processing');
  assert.equal((await client.listCases({ ...filter, state: 'awaiting_courier_confirmation' })).items.length, 0);
  assert.deepEqual((await api(store).listCases({ ...filter, state: 'processing' })).items.map(c => c.id), [target.id]);
  assert.equal(caseView(await api(store).getCase(target.id)).status, 'processing');
});

test('case details are isolated to the demo dataset; unknown IDs fail without a fabricated record', async () => {
  const client = api();
  const summary = (await client.listCases()).items[0];
  const view = caseView(await client.getCase(summary.id));
  assert.equal(view.id, summary.id);
  assert.deepEqual(view.evidence_ids, summary.evidence_ids);
  assert.equal(view.owner_id, undefined);
  assert.deepEqual(view.analyses, []);
  await assert.rejects(client.getCase('00000000-0000-4000-8000-999999999999'), (e: unknown) => e instanceof ApiError && e.status === 404);
});

test('case projection preserves supplied facts without inventing evidence verification or owner', () => {
  const summary = fixture.body.cases[0];
  const { evidence_ids: _ids, ...base } = summary;
  const view = caseView({ ...base, owner_id: null, evidence: [{ id: 'evidence-1', uploaded: true }],
    events: [{ type: 'information', payload: { note: 'Recorded note' } }], analyses: [], required_facts: ['outcome_verified', null] });
  assert.equal(view.owner_id, null);
  assert.deepEqual(view.evidence_ids, ['evidence-1']);
  assert.deepEqual(view.required_facts, ['outcome_verified']);
  assert.deepEqual(view.analyses, []);
  assert.throws(() => caseView({ id: summary.id }), /incomplete/);
});

test('case filters combine priority, handling and state independently', async () => {
  const items = (await api().listCases()).items;
  assert.equal(filterCases(items, { priority: 'normal', mode: 'human', state: 'awaiting_courier_confirmation' }).length, 1);
  assert.equal(filterCases(items, { priority: 'critical', mode: 'human' }).length, 0);
  assert.equal(filterCases(items, { mode: 'ai' }).length, 0);
  assert.equal(filterCases(items, { type: 'damaged_goods' }).length, 0);
});

test('warehouse overview counts linkable collections; SME/stock/direction filters and paging agree', async () => {
  const client = api();
  const summary = await client.getWarehouseOverview(warehouseId);
  assert.equal(summary.unique_skus, (await client.listInventory()).items.length);
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

test('warehouse cases support investigation, information requests, escalation and durable action replay', async () => {
  const store=storage(), client=api(store), summary=(await client.listCases({status:'open'})).items[0];
  const before=await client.getWarehouseCase(summary.id,warehouseId);
  const body={action:'update_workflow' as const,status:'investigating' as const,note:'Review courier handover and verified records',expected_version:before.version,source_version:before.source_version,policy_version:1,evidence_ids:[]};
  const idempotencyKey=key();
  const updated=await client.recordCaseAction(summary.id,body,{warehouseId,idempotencyKey});
  assert.equal(updated.status,'investigating');assert.equal(updated.version,before.version+1);assert.equal(updated.events.length,1);
  const reloaded=api(store);
  assert.deepEqual(await reloaded.recordCaseAction(summary.id,body,{warehouseId,idempotencyKey}),updated);
  assert.equal((await reloaded.getWarehouseCase(summary.id,warehouseId)).events.length,1);
  await assert.rejects(reloaded.recordCaseAction(summary.id,body,{warehouseId,idempotencyKey:key()}),(e:ApiError)=>e.code==='STALE_VERSION');
  await assert.rejects(reloaded.getWarehouseCase(summary.id,'10000000-0000-4000-8000-000000000999'),(e:ApiError)=>e.code==='INVALID_RESPONSE');
  const request={...body,action:'request_information' as const,expected_version:updated.version,source_version:updated.source_version,note:'Please supply the courier handover receipt'};
  const waiting=await reloaded.recordCaseAction(summary.id,request,{warehouseId,idempotencyKey:key()});assert.equal(waiting.status,'awaiting_information');
  const escalated=await reloaded.recordCaseAction(summary.id,{...request,action:'escalate',expected_version:waiting.version,source_version:waiting.source_version,note:'Manager review required'},{warehouseId,idempotencyKey:key()});
  assert.equal(escalated.handling_mode,'human');assert.equal(escalated.status,'processing');
  assert.equal((await reloaded.listCases({status:'open'})).items.find(c=>c.id===summary.id)!.status,'processing');
  assert.equal((await reloaded.getShipment(escalated.shipment_id)).status,'handed_over','case action must not mark delivered or alter shipment');
});

test('malformed or wrong-case action responses remain unverified',async()=>{
  const caseId='10000000-0000-4000-8000-000000000060';
  const body={action:'save_summary' as const,note:'Checked',expected_version:1,source_version:'1:1:1',policy_version:1,evidence_ids:[]};
  const bad=createApiClient(async <T,>()=>({id:caseId,warehouse_id:warehouseId,version:2}) as T);
  await assert.rejects(bad.recordCaseAction(caseId,body,{warehouseId,idempotencyKey:key()}),(e:ApiError)=>e.code==='INVALID_RESPONSE');
});

test('incremental receiving preview matches validation and never turns invalid counts into stock', async()=>{
 const detail=await api().getShipment(inbound),item=detail.items[0];
 assert.deepEqual(receiptLinePreview(item,{received:'40',damaged:'5'}),{received:40,damaged:5,good:35,remaining:60});
 assert.deepEqual(receiptLinePreview({...item,received_qty:40},{received:'50',damaged:'0'}),{received:50,damaged:0,good:50,remaining:10});
 for(const received of ['','-1','1.5','1e2','2147483648','9007199254740993'])assert.throws(()=>receiptLinePreview(item,{received,damaged:'0'}));
 assert.throws(()=>receiptLinePreview({...item,received_qty:40},{received:'61',damaged:'0'}));
 assert.throws(()=>receiptLinePreview(item,{received:'5',damaged:'6'}));
 assert.throws(()=>receiptRequest({...detail,status:'received'}, {},false,[],''));
});
