import { checkedWarehouseCase, type WarehouseCaseAction } from './case-workflow';
import { type Transport, type Schemas, ApiError, isUUID } from './transport';

const entity = (id: string) => {
  if (!isUUID(id)) throw new ApiError(400, 'INVALID_ID', 'Expected a UUID.');
  return id;
};
type Mutation = { idempotencyKey: string; warehouseId?: string; signal?: AbortSignal };
type ListOptions = { warehouseId?: string; smeId?: string; cursor?: string; limit?: number; signal?: AbortSignal };
function query(options: ListOptions & { direction?: string; status?: string; stockStatus?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ warehouse_id: options.warehouseId, sme_id: options.smeId })) {
    if (value) params.set(key, entity(value));
  }
  for (const [key, value] of Object.entries({ cursor: options.cursor, direction: options.direction, status: options.status, stock_status: options.stockStatus })) {
    if (value) params.set(key, value);
  }
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new ApiError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100.');
    params.set('limit', String(options.limit));
  }
  return params.size ? `?${params}` : '';
}

// FE1 and FE2 share this client. All actual mutations belong to FastAPI.
export function createApiClient(transport: Transport) {
  return {
    getMe(signal?: AbortSignal) { return transport<Schemas['IdentityResponse']>({ method: 'GET', path: '/api/me', signal }); },
    listShipments(options: ListOptions & { direction?: 'inbound' | 'outbound'; status?: string } = {}) {
      return transport<Schemas['ShipmentPage']>({ method: 'GET', path: `/api/shipments${query(options)}`, signal: options.signal });
    },
    getWarehouseOverview(warehouseId: string, signal?: AbortSignal) { return transport<Schemas['WarehouseOverview']>({ method: 'GET', path: `/api/warehouse/overview${query({ warehouseId })}`, signal }); },
    getWarehouseDirectory(warehouseId: string, signal?: AbortSignal) { return transport<Schemas['WarehouseDirectory']>({ method: 'GET', path: `/api/warehouse/directory${query({ warehouseId })}`, signal }); },
    listInventory(options: ListOptions & { stockStatus?: 'available' | 'quarantined' } = {}) { return transport<Schemas['InventoryPage']>({ method: 'GET', path: `/api/inventory${query(options)}`, signal: options.signal }); },
    listCases(options: ListOptions & { status?: 'open' | 'all' } = {}) { return transport<Schemas['CasePage']>({ method: 'GET', path: `/api/exceptions${query(options)}`, signal: options.signal }); },
    getShipment(id: string, signal?: AbortSignal, warehouseId?: string) { return transport<Schemas['ShipmentDetail']>({ method: 'GET', path: `/api/shipments/${entity(id)}${query({ warehouseId })}`, signal }); },
    recordShipmentEvent(id: string, body: Schemas['ShipmentEventRequest'], options: Mutation) { return transport<Schemas['ShipmentDetail']>({ method: 'POST', path: `/api/shipments/${entity(id)}/events${query({ warehouseId: options.warehouseId })}`, body, ...options }); },
    async getWarehouseCase(id: string, warehouseId: string, signal?: AbortSignal) {
      const value = await transport<unknown>({ method: 'GET', path: `/api/exceptions/${entity(id)}`, signal });
      return checkedWarehouseCase(value, id, entity(warehouseId));
    },
    async recordCaseAction(id: string, body: WarehouseCaseAction, options: Mutation & { warehouseId: string }) {
      const value = await transport<unknown>({ method: 'POST', path: `/api/exceptions/${entity(id)}/actions`, body, idempotencyKey: options.idempotencyKey, signal: options.signal });
      return checkedWarehouseCase(value, id, entity(options.warehouseId), body.expected_version);
    },
    getCase(id: string, signal?: AbortSignal) { return transport<Schemas['CaseSummary']>({ method: 'GET', path: `/api/exceptions/${entity(id)}`, signal }); },
    getApproval(id: string, signal?: AbortSignal) { return transport<Schemas['ApprovalSummary']>({ method: 'GET', path: `/api/approvals/${entity(id)}`, signal }); },
    postReceipt(id: string, body: Schemas['ReceiptRequest'], options: Mutation) {
      return transport<Schemas['ReceiptResult']>({ method: 'POST', path: `/api/receipts/${entity(id)}${query({ warehouseId: options.warehouseId })}`, body, ...options });
    },
    analyzeCase(id: string, options: Mutation) { return transport<Schemas['PendingAnalysis']>({ method: 'POST', path: `/api/exceptions/${entity(id)}/analyze`, ...options }); },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
