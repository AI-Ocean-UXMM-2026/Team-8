import { ApiError, type Schemas } from '../../shared/api';
import { isUUID } from '../../shared/api/transport';

const invalid = (): never => { throw new ApiError(502, 'INVALID_RESPONSE', 'The saved result could not be verified. Retry the same request before entering another.'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
const uuid = (value: unknown) => typeof value === 'string' && isUUID(value);
const ids = (value: unknown) => Array.isArray(value) && value.every(uuid);
const quantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const statuses = ['expected', 'partially_received', 'received', 'received_with_discrepancies', 'ready', 'assigned', 'picked_up', 'in_transit', 'delayed', 'failed', 'delivered', 'cancelled', 'handed_over'];
function shipment(value: unknown, id: string, version: number) {
  const s = object(value);
  if (s.id !== id || !uuid(s.warehouse_id) || !uuid(s.sme_id) || typeof s.reference !== 'string' ||
      !quantity(s.version) || s.version <= version || !timestamp(s.created_at) || !ids(s.evidence_ids) ||
      typeof s.status !== 'string' || !statuses.includes(s.status)) invalid();
  return s;
}

export function savedReceipt(value: unknown, id: string, expectedVersion: number): Schemas['ReceiptResult'] {
  const result = object(value); const s = shipment(result.shipment, id, expectedVersion);
  if (s.direction !== 'inbound' || s.delivery_mode !== null || !['partially_received', 'received', 'received_with_discrepancies'].includes(s.status as string) || !ids(result.case_ids)) invalid();
  const { expected_qty: expected, received_qty: received, good_qty: good, damaged_qty: damaged, shortage_qty: shortage } = result;
  if (!quantity(expected) || expected === 0 || !quantity(received) || received > expected || !quantity(good) || !quantity(damaged) || !quantity(shortage) || good + damaged !== received || shortage !== expected - received) invalid();
  if (result.stock !== undefined) {
    if (!Array.isArray(result.stock)) invalid();
    for (const value of result.stock as unknown[]) {
      const stock = object(value);
      if (!uuid(stock.id) || stock.warehouse_id !== s.warehouse_id || stock.sme_id !== s.sme_id ||
          typeof stock.sku !== 'string' || typeof stock.name !== 'string' || !quantity(stock.available_qty) || !quantity(stock.quarantined_qty) || !ids(stock.shipment_ids)) invalid();
    }
  }
  return value as Schemas['ReceiptResult'];
}

export function savedEvent(value: unknown, id: string, expectedVersion: number, eventType: Schemas['ShipmentEventRequest']['type']): Schemas['ShipmentDetail'] {
  const s = shipment(value, id, expectedVersion);
  if (s.direction !== 'outbound' || s.delivery_mode !== 'in_house' || !Array.isArray(s.items) || !Array.isArray(s.events) || !Array.isArray(s.evidence) ||
      !Array.isArray(s.allowed_events) || !s.allowed_events.every(type => ['picked', 'packed', 'dispatched'].includes(type))) invalid();
  for (const value of s.items as unknown[]) {
    const item = object(value);
    if (!uuid(item.product_id) || typeof item.sku !== 'string' || typeof item.name !== 'string' || !quantity(item.expected_qty) || !quantity(item.received_qty) || !quantity(item.damaged_qty) || item.damaged_qty > item.received_qty) invalid();
  }
  for (const value of s.events as unknown[]) {
    const event = object(value);
    if (!uuid(event.id) || typeof event.type !== 'string' || typeof event.notes !== 'string' || !timestamp(event.verified_at) || !timestamp(event.recorded_at) || !ids(event.evidence_ids)) invalid();
  }
  if (!(s.events as Record<string, unknown>[]).some(event => event.type === eventType)) invalid();
  for (const value of s.evidence as unknown[]) {
    const evidence = object(value);
    if (!uuid(evidence.id) || typeof evidence.label !== 'string' || typeof evidence.verified !== 'boolean') invalid();
  }
  return value as Schemas['ShipmentDetail'];
}
