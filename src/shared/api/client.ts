import {checkedRoute,checkedSharedRoute,checkedCalculatedRoute,type RouteRequest} from './route';
import {checkedPosition} from './tracking';
import {checkedAssignments,checkedDelivery,type CourierAction} from './courier';
import { checkedWarehouseCase, type WarehouseCaseAction } from './case-workflow';
import { type Transport, type Schemas, ApiError, isUUID } from './transport';
import type { SMEOverview, Notification, Delivery, Assignment, LiveLocation } from './domain';

const entity = (id: string) => {
  if (!isUUID(id)) throw new ApiError(400, 'INVALID_ID', 'Expected a UUID.');
  return id;
};
type Mutation = { idempotencyKey: string; warehouseId?: string; signal?: AbortSignal };
type ListOptions = { warehouseId?: string; smeId?: string; cursor?: string; limit?: number; signal?: AbortSignal };
function query(options: ListOptions & { direction?: string; status?: string; stockStatus?: string; issueType?: string; priority?: string; mode?: string; state?: string; owner?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ warehouse_id: options.warehouseId, sme_id: options.smeId })) {
    if (value) params.set(key, entity(value));
  }
  for (const [key, value] of Object.entries({ cursor: options.cursor, direction: options.direction, status: options.status, stock_status: options.stockStatus, issue_type: options.issueType, priority: options.priority, handling_mode: options.mode, state: options.state, owner_id: options.owner })) {
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
    async getSharedRoute(id:string,signal?:AbortSignal){return checkedSharedRoute(await transport<unknown>({method:'GET',path:`/api/deliveries/${entity(id)}/route`,signal}),id);},
    async calculateDeliveryRoute(id:string,body:RouteRequest,signal?:AbortSignal){return checkedCalculatedRoute(await transport<unknown>({method:'POST',path:`/api/deliveries/${entity(id)}/route`,body,idempotencyKey:crypto.randomUUID(),signal}),id);},
    async getTrackingShipment(id:string,signal?:AbortSignal){
      // delivery_read authorizes staff OR the owning SME using the caller's JWT.
      // Warehouse operations endpoints deliberately remain staff-only.
      const value=await transport<{shipment:Schemas['ShipmentDetail']}>({method:'GET',path:`/api/deliveries/${entity(id)}`,signal});
      const shipment=value?.shipment;
      if(!shipment||shipment.id!==id||!isUUID(shipment.warehouse_id)||!isUUID(shipment.sme_id)||typeof shipment.reference!=='string'||!Array.isArray(shipment.events)||!['inbound','outbound'].includes(shipment.direction))throw new ApiError(502,'INVALID_RESPONSE','Shipment tracking details could not be verified.');
      return shipment;
    },
    async getTrackingSession(id:string,signal?:AbortSignal){
      const value=await transport<{shipment:{id:string};session_id:string|null}>({method:'GET',path:`/api/deliveries/${entity(id)}`,signal});
      if(!value||value.shipment?.id!==id||(value.session_id!==null&&!isUUID(value.session_id)))throw new ApiError(502,'INVALID_RESPONSE','Tracking session could not be verified.');
      return value.session_id;
    },
    async getLivePosition(session:string,signal?:AbortSignal){return checkedPosition(await transport<unknown>({method:'GET',path:`/api/tracking/${entity(session)}/live`,signal}),session);},
    getMe(signal?: AbortSignal) { return transport<Schemas['IdentityResponse']>({ method: 'GET', path: '/api/me', signal }); },
    async listRiderAssignments(signal?:AbortSignal){return checkedAssignments(await transport<unknown>({method:'GET',path:'/api/rider/assignments',signal}));},
    async getCourierDelivery(id:string,signal?:AbortSignal){return checkedDelivery(await transport<unknown>({method:'GET',path:`/api/deliveries/${entity(id)}`,signal}),id);},
    async recordCourierAction(id:string,body:CourierAction,options:Mutation){
      const {kind,...payload}=body;
      if(kind==='report'){
        const value=await transport<unknown>({method:'POST',path:'/api/exceptions',body:{...payload,shipment_id:entity(id),stage:'outbound'},...options});
        const c=value as {id:string;shipment_id:string};if(!c||!isUUID(c.id)||c.shipment_id!==id)throw new ApiError(502,'INVALID_RESPONSE','Case result could not be verified. Retry the same saved request.');
        return {kind:'report' as const,id:c.id};
      }
      const result=await transport<unknown>({method:'POST',path:`/api/deliveries/${entity(id)}/${kind}`,body:payload,...options});
      return {kind:'delivery' as const,detail:checkedDelivery(result,id,'expected_version' in body?body.expected_version:0)};
    },
    listShipments(options: ListOptions & { direction?: 'inbound' | 'outbound'; status?: string } = {}) {
      return transport<Schemas['ShipmentPage']>({ method: 'GET', path: `/api/shipments${query(options)}`, signal: options.signal });
    },
    getWarehouseOverview(warehouseId: string, signal?: AbortSignal) { return transport<Schemas['WarehouseOverview']>({ method: 'GET', path: `/api/warehouse/overview${query({ warehouseId })}`, signal }); },
    getWarehouseDirectory(warehouseId: string, signal?: AbortSignal) { return transport<Schemas['WarehouseDirectory']>({ method: 'GET', path: `/api/warehouse/directory${query({ warehouseId })}`, signal }); },
    listInventory(options: ListOptions & { stockStatus?: 'available' | 'quarantined' } = {}) { return transport<Schemas['InventoryPage']>({ method: 'GET', path: `/api/inventory${query(options)}`, signal: options.signal }); },
    listCases(options: ListOptions & { status?: 'open' | 'all'; issueType?: string; priority?: string; mode?: string; state?: string; owner?: string } = {}) { return transport<Schemas['CasePage']>({ method: 'GET', path: `/api/exceptions${query(options)}`, signal: options.signal }); },
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
    getCase(id: string, signal?: AbortSignal) { return transport<Schemas['CaseSummary'] | Schemas['CaseDetail']>({ method: 'GET', path: `/api/exceptions/${entity(id)}`, signal }); },
    getApproval(id: string, signal?: AbortSignal) { return transport<Schemas['ApprovalSummary']>({ method: 'GET', path: `/api/approvals/${entity(id)}`, signal }); },
    postReceipt(id: string, body: Schemas['ReceiptRequest'], options: Mutation) {
      return transport<Schemas['ReceiptResult']>({ method: 'POST', path: `/api/receipts/${entity(id)}${query({ warehouseId: options.warehouseId })}`, body, ...options });
    },
    analyzeCase(id: string, options: Mutation) { return transport<Schemas['PendingAnalysis']>({ method: 'POST', path: `/api/exceptions/${entity(id)}/analyze`, ...options }); },
    getSMEOverview(smeId: string, signal?: AbortSignal) { return transport<SMEOverview>({ method: 'GET', path: `/api/sme/overview${query({ smeId })}`, signal }); },
    listNotifications(smeId: string, signal?: AbortSignal) { return transport<Notification[]>({ method: 'GET', path: `/api/notifications${query({ smeId })}`, signal }); },
    setNotificationRead(id: string, read: boolean) { return transport<void>({ method: 'POST', path: `/api/notifications/${entity(id)}/${read ? 'read' : 'unread'}`, idempotencyKey: crypto.randomUUID() }); },
    caseCommand(id: string, kind: 'actions' | 'verifications' | 'close' | 'information' | 'analyze', body: Schemas['CaseCommand'] | Schemas['CaseAction'] | Schemas['Verification'], key: string) { return transport<Schemas['CaseDetail']>({ method: 'POST', path: `/api/exceptions/${entity(id)}/${kind}`, body, idempotencyKey: key }); },
    decideApproval(id: string, body: Schemas['Decision'], key: string) { return transport<Schemas['CaseDetail']>({ method: 'POST', path: `/api/approvals/${entity(id)}/decision`, body, idempotencyKey: key }); },
    reviewCase(id: string, body: Schemas['CaseReview'], key: string) { return transport<Schemas['CaseDetail']>({ method: 'POST', path: `/api/exceptions/${entity(id)}/review`, body, idempotencyKey: key }); },
    getDelivery(id: string, signal?: AbortSignal) { return transport<Delivery>({ method: 'GET', path: `/api/deliveries/${entity(id)}`, signal }); },
    listAssignments(signal?: AbortSignal) { return transport<Assignment[]>({ method: 'GET', path: '/api/rider/assignments', signal }); },
    deliveryCommand(id: string, command: 'assign' | 'cancel' | 'accept' | 'pickup' | 'proof' | 'confirm' | 'handover' | 'courier' | 'capacity', body: Schemas['DeliveryCommand'], key: string) { return transport<Delivery>({ method: 'POST', path: `/api/deliveries/${entity(id)}/${command}`, body, idempotencyKey: key }); },
    startTracking(assignmentId: string) { return transport<string>({ method: 'POST', path: '/api/tracking/start', body: { assignment_id: entity(assignmentId), consent: true }, idempotencyKey: crypto.randomUUID() }); },
    stopTracking(id: string) { return transport<void>({ method: 'POST', path: `/api/tracking/${entity(id)}/stop`, idempotencyKey: crypto.randomUUID() }); },
    sendLocation(id: string, body: Schemas['Position']) { return transport<string>({ method: 'POST', path: `/api/tracking/${entity(id)}/locations`, body, idempotencyKey: crypto.randomUUID() }); },
    getLiveLocation(id: string, signal?: AbortSignal) { return transport<LiveLocation>({ method: 'GET', path: `/api/tracking/${entity(id)}/live`, signal }); },
    reserveEvidence(body: { shipment_id: string; mime_type: string; size_bytes: number; sme_visible: boolean }) { return transport<{ id: string }>({ method: 'POST', path: '/api/evidence/reservations', body, idempotencyKey: crypto.randomUUID() }); },
    uploadEvidence(id: string, file: Blob) { return transport<void>({ method: 'PUT', path: `/api/evidence/${entity(id)}/content`, rawBody: file }); },
    downloadEvidence(id: string) { return transport<{ url: string; expires_in: number }>({ method: 'POST', path: `/api/evidence/${entity(id)}/download`, idempotencyKey: crypto.randomUUID() }); },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
