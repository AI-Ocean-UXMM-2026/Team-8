import { type WarehouseCase, type WarehouseCaseAction } from './case-workflow';
import policy from '../../../contracts/policies/v1.json';
import fixture from '../../../contracts/fixtures/warehouse/initial.json';
import { ApiError, type ApiRequest, type Schemas, type Transport, validateRequest } from './transport';

type Data = Schemas['WarehouseFixture'];
type Store = Pick<Storage, 'getItem' | 'setItem'>;
type State = { data: Data; replay: Record<string, { fingerprint: string; result: unknown }>; caseDetails?: Record<string, WarehouseCase> };
const storageKey = 'parcelcare.warehouse.demo.v1';
const fingerprint = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fail = (status: number, code: string, text: string): never => { throw new ApiError(status, code, text); };

// Isolated, fictitious demo persistence. This never runs in the live transport.
export function createWarehouseMockTransport(storage?: Store): Transport {
  let state: State = { data: structuredClone(fixture.body) as Data, replay: {} };
  if (storage) {
    try { const saved = storage.getItem(storageKey); if (saved) state = JSON.parse(saved); }
    catch { fail(0, 'DEMO_STORAGE_UNAVAILABLE', 'Demo storage is unavailable. Enable storage for this tab.'); }
  }
  return async <T>(request: ApiRequest): Promise<T> => {
    validateRequest(request);
    request.signal?.throwIfAborted();
    const url = new URL(request.path, 'https://demo.invalid');
    if (url.searchParams.has('warehouse_id') && url.searchParams.get('warehouse_id') !== state.data.directory.warehouse_id) fail(403, 'FORBIDDEN', 'Access denied.');
    const replayKey = `${request.path.split('?')[0]}:${request.idempotencyKey}`;
    const old = state.replay[replayKey];
    if (request.method === 'POST' && old) {
      if (old.fingerprint !== fingerprint(request.body)) fail(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another request.');
      return structuredClone(old.result) as T;
    }
    const next = structuredClone(state);
    const { data } = next;
    const page = <I,>(items: I[]) => {
      const cursor = url.searchParams.get('cursor');
      if (cursor && !/^page-\d+$/.test(cursor)) fail(422, 'VALIDATION_ERROR', 'Invalid cursor.');
      const offset = cursor ? Number(cursor.slice(5)) : 0;
      const limit = Number(url.searchParams.get('limit') || 25);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(422, 'VALIDATION_ERROR', 'Invalid page size.');
      return { items: items.slice(offset, offset + limit), next_cursor: offset + limit < items.length ? `page-${offset + limit}` : null };
    };
    const scoped = <I extends { sme_id: string }>(items: I[]) => items.filter(item => !url.searchParams.get('sme_id') || item.sme_id === url.searchParams.get('sme_id'));
    const toShipment = (detail: Schemas['ShipmentDetail']): Schemas['Shipment'] => {
      const { items: _items, events: _events, evidence: _evidence, allowed_events: _allowed, ...shipment } = detail; return shipment;
    };
    let result: unknown;
    if (request.method === 'GET' && url.pathname === '/api/me') result = { actor_id: '10000000-0000-4000-8000-000000000099', memberships: [{ warehouse_id: data.directory.warehouse_id, role: 'staff', sme_id: null }] };
    else if (request.method === 'GET' && url.pathname === '/api/warehouse/directory') result = data.directory;
    else if (request.method === 'GET' && url.pathname === '/api/warehouse/overview') result = { warehouse_id: data.directory.warehouse_id, unique_skus: data.inventory.length, inbound_shipments: data.shipments.filter(s => s.direction === 'inbound').length, outbound_shipments: data.shipments.filter(s => s.direction === 'outbound').length, open_cases: data.cases.filter(c => !['resolved', 'closed'].includes(c.status)).length, as_of: new Date().toISOString() };
    else if (request.method === 'GET' && url.pathname === '/api/inventory') result = page(scoped(data.inventory).filter(i => url.searchParams.get('stock_status') === 'available' ? i.available_qty > 0 : url.searchParams.get('stock_status') === 'quarantined' ? i.quarantined_qty > 0 : true));
    else if (request.method === 'GET' && url.pathname === '/api/shipments') result = page(scoped(data.shipments).filter(s => (!url.searchParams.get('direction') || s.direction === url.searchParams.get('direction')) && (!url.searchParams.get('status') || s.status === url.searchParams.get('status'))).map(toShipment));
    else if (request.method === 'GET' && url.pathname === '/api/exceptions') result = page(data.cases.filter(c => (url.searchParams.get('status') !== 'open' || !['resolved', 'closed'].includes(c.status)) &&
      (!url.searchParams.get('issue_type') || c.type === url.searchParams.get('issue_type')) && (!url.searchParams.get('priority') || c.priority === url.searchParams.get('priority')) &&
      (!url.searchParams.get('handling_mode') || c.handling_mode === url.searchParams.get('handling_mode')) && (!url.searchParams.get('state') || c.status === url.searchParams.get('state')) &&
      (!url.searchParams.get('owner_id') || (url.searchParams.get('owner_id') === 'unassigned' ? !c.owner_id : c.owner_id === url.searchParams.get('owner_id')))));
    else if (/^\/api\/exceptions\/[0-9a-f-]+(?:\/actions)?$/i.test(url.pathname)) {
      const caseId = url.pathname.split('/')[3];
      const summary = data.cases.find(c => c.id === caseId);
      if (!summary) fail(404, 'NOT_FOUND', 'Case not found.');
      const shipment = data.shipments.find(s => s.id === summary!.shipment_id);
      if (!shipment) fail(404, 'NOT_FOUND', 'Shipment not found.');
      next.caseDetails ??= {};
      const detail: WarehouseCase = next.caseDetails[caseId] ?? {
        ...summary!, warehouse_id: shipment!.warehouse_id, sme_id: shipment!.sme_id,
        version: 1, source_version: `1:${shipment!.version}:${policy.version}`,
        required_facts: (policy.closure_evidence as Record<string,string[]>)[summary!.type] ?? [],
        events: [], evidence: shipment!.evidence.map(e => ({id:e.id,uploaded:e.verified})),
      };
      detail.source_version = `${detail.version}:${shipment!.version}:${policy.version}`;
      if (request.method === 'POST' && url.pathname.endsWith('/actions')) {
        const body = request.body as WarehouseCaseAction;
        if (body.expected_version !== detail.version || body.source_version !== detail.source_version) fail(409,'STALE_VERSION','Case changed. Refresh before submitting.');
        if (['resolved','closed'].includes(detail.status)) fail(409,'STALE_VERSION','This case is already finalized.');
        if (body.policy_version !== policy.version || !['save_summary','request_information','escalate','update_workflow'].includes(body.action) || typeof body.note !== 'string' || !body.note.trim() || body.note.trim().length>2000 || !Array.isArray(body.evidence_ids) || body.evidence_ids.some(id=>!detail.evidence.some(e=>e.id===id&&e.uploaded))) fail(422,'VALIDATION_ERROR','Choose a permitted action, note and registered evidence.');
        if (body.action==='update_workflow' && body.status!=='investigating') fail(422,'VALIDATION_ERROR','Choose a permitted investigation status.');
        if (body.action==='save_summary') detail.summary=body.note.trim();
        if (body.action==='request_information') detail.status='awaiting_information';
        if (body.action==='escalate') {detail.status='processing';detail.handling_mode='human';}
        if (body.action==='update_workflow') detail.status='investigating';
        detail.version++;
        detail.source_version=`${detail.version}:${shipment!.version}:${policy.version}`;
        detail.events.push({id:crypto.randomUUID(),type:body.action,actor_type:'staff',created_at:new Date().toISOString(),payload:{note:body.note.trim()}});
        summary!.summary=detail.summary;summary!.status=detail.status as typeof data.cases[number]['status'];summary!.handling_mode=detail.handling_mode as typeof data.cases[number]['handling_mode'];
        next.caseDetails[caseId]=detail;
      } else if (request.method!=='GET'||url.pathname.endsWith('/actions')) fail(404,'NOT_FOUND','Operation not found.');
      result=detail;
    }
    else {
      const match = url.pathname.match(/^\/api\/(shipments|receipts)\/([0-9a-f-]+)(\/events)?$/i);
      const shipment = data.shipments.find(s => s.id === match?.[2]);
      if (!match || !shipment) fail(404, 'NOT_FOUND', 'Shipment not found.');
      const detail = shipment!;
      if (request.method === 'GET' && match![1] === 'shipments' && !match![3]) result = detail;
      else if (request.method === 'POST') {
        const body = request.body as Schemas['ReceiptRequest'] & Schemas['ShipmentEventRequest'];
        if (body.expected_version !== detail.version) fail(409, 'STALE_VERSION', 'Shipment changed. Refresh before submitting.');
        if (!Array.isArray(body.evidence_ids) || body.evidence_ids.some(id => !detail.evidence.some(e => e.id === id && e.verified))) fail(422, 'VALIDATION_ERROR', 'Evidence must belong to this shipment.');
        const stamp = new Date().toISOString();
        if (match![1] === 'receipts' && !match![3]) {
          if (detail.direction !== 'inbound' || !['expected', 'partially_received', 'delayed'].includes(detail.status)) fail(409, 'STALE_VERSION', 'Receiving is already finalized.');
          if (typeof body.final !== 'boolean' || !Array.isArray(body.lines) || body.lines.length !== detail.items.length || new Set(body.lines.map(l => l.product_id)).size !== body.lines.length) fail(422, 'VALIDATION_ERROR', 'Provide each product exactly once.');
          for (const line of body.lines) {
            const item = detail.items.find(i => i.product_id === line.product_id);
            if (!item || !Number.isSafeInteger(line.received_qty) || !Number.isSafeInteger(line.damaged_qty) || line.received_qty < 0 || line.damaged_qty < 0 || line.damaged_qty > line.received_qty || item.received_qty + line.received_qty > item.expected_qty) fail(422, 'VALIDATION_ERROR', 'Invalid receiving quantities.');
            const stock = data.inventory.find(i => i.id === line.product_id)!;
            item!.received_qty += line.received_qty; item!.damaged_qty += line.damaged_qty;
            stock.available_qty += line.received_qty - line.damaged_qty; stock.quarantined_qty += line.damaged_qty;
          }
          const expected = detail.items.reduce((n, i) => n + i.expected_qty, 0);
          const received = detail.items.reduce((n, i) => n + i.received_qty, 0);
          const damaged = detail.items.reduce((n, i) => n + i.damaged_qty, 0);
          const shortage = expected - received;
          if ((damaged || (body.final && shortage)) && (!body.notes.trim() || body.evidence_ids.length === 0)) fail(422, 'VALIDATION_ERROR', 'Discrepancies require notes and verified evidence.');
          detail.status = body.final ? (shortage || damaged ? 'received_with_discrepancies' : 'received') : 'partially_received';
          for (const type of ['quantity_mismatch', 'damaged_goods'] as const) {
            if ((type === 'quantity_mismatch' ? body.final && shortage > 0 : damaged > 0) && !data.cases.some(c => c.shipment_id === detail.id && c.type === type)) data.cases.push({ id: crypto.randomUUID(), shipment_id: detail.id, stage: 'inbound', type, priority: 'normal', status: 'new', handling_mode: 'human', responsible_party: 'UNDETERMINED', evidence_ids: body.evidence_ids, summary: type === 'quantity_mismatch' ? `${shortage} units short after final count.` : `${damaged} damaged units quarantined.` });
          }
          detail.version++;
          detail.events.push({ id: crypto.randomUUID(), type: body.final ? 'receipt_finalized' : 'partial_receipt', notes: body.notes, verified_at: stamp, recorded_at: stamp, evidence_ids: body.evidence_ids });
          result = { shipment: toShipment(detail), expected_qty: expected, received_qty: received, good_qty: received - damaged, damaged_qty: damaged, shortage_qty: shortage, case_ids: data.cases.filter(c => c.shipment_id === detail.id).map(c => c.id), stock: data.inventory.filter(i => detail.items.some(l => l.product_id === i.id)) } satisfies Schemas['ReceiptResult'];
        } else if (match![3] === '/events') {
          if (detail.direction !== 'outbound' || detail.delivery_mode !== 'in_house' || detail.status !== 'ready') fail(409, 'STALE_VERSION', 'This shipment cannot accept that event.');
          const nextType = !detail.events.some(e => e.type === 'picked') ? 'picked' : !detail.events.some(e => e.type === 'packed') ? 'packed' : 'dispatched';
          if (!detail.allowed_events.includes(body.type) || body.type !== nextType || !body.notes.trim() || !Number.isFinite(Date.parse(body.verified_at)) || Date.parse(body.verified_at) > Date.now() + 30000) fail(422, 'VALIDATION_ERROR', 'Verify events in pick, pack, dispatch order with a valid time and note.');
          if (body.type === 'dispatched') {
            for (const item of detail.items) {
              const stock = data.inventory.find(i => i.id === item.product_id)!;
              if (stock.available_qty < item.expected_qty) fail(409, 'STOCK_UNAVAILABLE', 'Available stock is insufficient.');
              stock.available_qty -= item.expected_qty;
            }
            detail.status = 'in_transit';
          }
          detail.version++;
          detail.allowed_events = body.type === 'picked' ? ['packed'] : body.type === 'packed' ? ['dispatched'] : [];
          detail.events.push({ id: crypto.randomUUID(), type: body.type, notes: body.notes, verified_at: body.verified_at, recorded_at: stamp, evidence_ids: body.evidence_ids });
          result = detail;
        } else fail(404, 'NOT_FOUND', 'Operation not found.');
      } else fail(404, 'NOT_FOUND', 'Operation not found.');
    }
    if (request.method === 'POST') {
      next.replay[replayKey] = { fingerprint: fingerprint(request.body), result: structuredClone(result) };
      if (storage) { try { storage.setItem(storageKey, JSON.stringify(next)); } catch { fail(0, 'DEMO_STORAGE_UNAVAILABLE', 'Unable to save demo changes.'); } }
      state = next;
    }
    return structuredClone(result) as T;
  };
}
