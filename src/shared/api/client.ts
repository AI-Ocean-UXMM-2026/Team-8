import { type Transport, type Schemas, ApiError, isUUID } from './transport';

const entity = (id: string) => {
  if (!isUUID(id)) throw new ApiError(400, 'INVALID_ID', 'Expected a UUID.');
  return id;
};
type Mutation = { idempotencyKey: string; signal?: AbortSignal };

// FE1 and FE2 share this client. All actual mutations belong to FastAPI.
export function createApiClient(transport: Transport) {
  return {
    getMe(signal?: AbortSignal) { return transport<Schemas['IdentityResponse']>({ method: 'GET', path: '/api/me', signal }); },
    listShipments(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}) {
      const params = new URLSearchParams();
      if (options.cursor) params.set('cursor', options.cursor);
      if (options.limit !== undefined) {
        if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new ApiError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100.');
        params.set('limit', String(options.limit));
      }
      return transport<Schemas['ShipmentPage']>({ method: 'GET', path: `/api/shipments${params.size ? `?${params}` : ''}`, signal: options.signal });
    },
    getCase(id: string, signal?: AbortSignal) { return transport<Schemas['CaseSummary']>({ method: 'GET', path: `/api/exceptions/${entity(id)}`, signal }); },
    getApproval(id: string, signal?: AbortSignal) { return transport<Schemas['ApprovalSummary']>({ method: 'GET', path: `/api/approvals/${entity(id)}`, signal }); },
    postReceipt(id: string, body: Schemas['ReceiptRequest'], options: Mutation) {
      return transport<Schemas['ReceiptResult']>({ method: 'POST', path: `/api/receipts/${entity(id)}`, body, ...options });
    },
    analyzeCase(id: string, options: Mutation) { return transport<Schemas['PendingAnalysis']>({ method: 'POST', path: `/api/exceptions/${entity(id)}/analyze`, ...options }); },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
