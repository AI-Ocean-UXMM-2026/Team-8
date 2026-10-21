import { ApiError, isUUID } from './transport';

// Projection of the existing FastAPI CaseDetail/CaseAction contracts.
export type CaseEvent = { id: string; type: string; actor_type: string; created_at: string; payload: Record<string, unknown> };
export type WarehouseCase = {
  id: string; shipment_id: string; warehouse_id: string; sme_id: string;
  type: string; priority: string; status: string; handling_mode: string; responsible_party: string;
  summary: string; version: number; source_version: string; required_facts: string[];
  events: CaseEvent[]; evidence: { id: string; uploaded: boolean }[];
};
export type WarehouseCaseAction = {
  expected_version: number; source_version: string; policy_version: number; note: string; evidence_ids: string[];
  action: 'save_summary' | 'request_information' | 'escalate' | 'update_workflow';
  status?: 'investigating';
};
export function checkedWarehouseCase(value: unknown, id: string, warehouseId: string, previousVersion = 0): WarehouseCase {
  const c = value as WarehouseCase;
  if (!c || c.id !== id || c.warehouse_id !== warehouseId || !isUUID(c.shipment_id) || !isUUID(c.sme_id) ||
      !Number.isSafeInteger(c.version) || c.version <= previousVersion ||
      typeof c.source_version !== 'string' || !/^\d+:\d+:\d+$/.test(c.source_version) || Number(c.source_version.split(':')[0]) !== c.version ||
      !['summary','type','priority','status','handling_mode','responsible_party'].every(key => typeof c[key as keyof WarehouseCase] === 'string') ||
      !Array.isArray(c.required_facts) || !c.required_facts.every(f => typeof f === 'string') ||
      !Array.isArray(c.events) || !c.events.every(e => e && isUUID(e.id) && typeof e.type === 'string' && typeof e.actor_type === 'string' && Number.isFinite(Date.parse(e.created_at)) && e.payload && typeof e.payload === 'object') ||
      !Array.isArray(c.evidence) || !c.evidence.every(e => e && isUUID(e.id) && typeof e.uploaded === 'boolean')) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'Case result could not be verified. Retry the same request before entering another.');
  }
  return c;
}
