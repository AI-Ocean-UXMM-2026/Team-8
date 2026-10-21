import { ApiError, type Schemas } from '../../shared/api';

export type CaseView = Schemas['CaseSummary'] & {
  owner_id?: string | null; warehouse_id?: string;
  events: Record<string, unknown>[]; evidence: Record<string, unknown>[];
  analyses: Record<string, unknown>[]; required_facts: string[];
};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];
export const text = (value: unknown) => typeof value === 'string' ? value : '';

// Both the summary feed and the newer detail endpoint exist in this checkout.
// Project only display fields; do not infer permissions or manufacture missing facts.
export function caseView(value: unknown): CaseView {
  if (!value || typeof value !== 'object') throw new ApiError(502, 'INVALID_RESPONSE', 'Case information is unavailable.');
  const data = value as Record<string, unknown>;
  for (const key of ['id', 'shipment_id', 'stage', 'type', 'priority', 'status', 'handling_mode', 'responsible_party', 'summary']) {
    if (typeof data[key] !== 'string') throw new ApiError(502, 'INVALID_RESPONSE', 'Case information is incomplete.');
  }
  const evidence = records(data.evidence);
  return { id: text(data.id), shipment_id: text(data.shipment_id), stage: data.stage as CaseView['stage'],
    type: data.type as CaseView['type'], priority: data.priority as CaseView['priority'], status: data.status as CaseView['status'],
    handling_mode: data.handling_mode as CaseView['handling_mode'], responsible_party: data.responsible_party as CaseView['responsible_party'],
    summary: text(data.summary), evidence_ids: Array.isArray(data.evidence_ids) ? data.evidence_ids.filter((v): v is string => typeof v === 'string') : evidence.map(e => text(e.id)).filter(Boolean),
    warehouse_id: typeof data.warehouse_id === 'string' ? data.warehouse_id : undefined,
    owner_id: data.owner_id === null ? null : typeof data.owner_id === 'string' ? data.owner_id : undefined,
    evidence, events: records(data.events), analyses: records(data.analyses),
    required_facts: Array.isArray(data.required_facts) ? data.required_facts.filter((v): v is string => typeof v === 'string') : [] };
}

export function filterCases(items: Schemas['CaseSummary'][], filters: { type?: string; priority?: string; mode?: string; state?: string }) {
  return items.filter(item => (!filters.type || item.type === filters.type) && (!filters.priority || item.priority === filters.priority)
    && (!filters.mode || item.handling_mode === filters.mode) && (!filters.state || item.status === filters.state));
}
