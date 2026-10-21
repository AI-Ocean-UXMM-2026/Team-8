import type { Schemas } from '../../shared/api';

export type CountDraft = Record<string, { received: string; damaged: string }>;
export function receiptRequest(detail: Schemas['ShipmentDetail'], counts: CountDraft, final: boolean, evidenceIds: string[], notes: string): Schemas['ReceiptRequest'] {
  const quantity = (raw: string) => {
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Enter whole, nonnegative quantities for every product.');
    return Number(raw);
  };
  const lines = detail.items.map(item => {
    const draft = counts[item.product_id];
    const received = quantity(draft?.received ?? ''); const damaged = quantity(draft?.damaged ?? '');
    if (damaged > received) throw new Error('Damaged quantity cannot exceed received quantity.');
    if (received + item.received_qty > item.expected_qty) throw new Error('Received quantity exceeds the remaining expectation. Request a staff review for overreceipt.');
    return { product_id: item.product_id, received_qty: received, damaged_qty: damaged };
  });
  if (evidenceIds.some(id => !detail.evidence.some(e => e.id === id && e.verified))) throw new Error('Select verified evidence attached to this shipment.');
  const missing = detail.items.reduce((n, i) => n + i.expected_qty - i.received_qty, 0) - lines.reduce((n, i) => n + i.received_qty, 0);
  const damage = detail.items.reduce((n, i) => n + i.damaged_qty, 0) + lines.reduce((n, i) => n + i.damaged_qty, 0);
  if ((damage > 0 || (final && missing > 0)) && (!notes.trim() || !evidenceIds.length)) throw new Error('Add a note and verified evidence for a shortage or damaged goods.');
  return { expected_version: detail.version, final, lines, evidence_ids: [...new Set(evidenceIds)], notes: notes.trim() };
}
