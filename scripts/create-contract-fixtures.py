"""Fictitious examples for frontend work before live domain APIs exist."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'contracts/fixtures'
uid = lambda n: f'00000000-0000-4000-8000-{n:012d}'
shipment = {'id': uid(1), 'warehouse_id': uid(2), 'sme_id': uid(3), 'reference': 'PC-IN-0100', 'direction': 'inbound', 'delivery_mode': None, 'status': 'received_with_discrepancies', 'version': 2, 'created_at': '2026-10-21T09:00:00Z', 'evidence_ids': [uid(4)]}
request = {'expected_version': 1, 'final': True, 'lines': [{'product_id': uid(5), 'received_qty': 90, 'damaged_qty': 0}], 'evidence_ids': [uid(4)], 'notes': 'Final count: 90 of 100 expected.'}
def save(owner, name, schema, status, body, method='GET', path='/api/shipments', **extra):
    folder = ROOT / owner
    folder.mkdir(parents=True, exist_ok=True)
    data = {'name': name, 'method': method, 'path': path, 'status': status, 'schema': schema, 'body': body, **extra}
    (folder / f'{name}.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')

save('operations', 'receipt-100-90', 'ReceiptResult', 200, {'shipment': shipment, 'expected_qty': 100, 'received_qty': 90, 'good_qty': 90, 'damaged_qty': 0, 'shortage_qty': 10, 'case_ids': [uid(6)]}, 'POST', f'/api/receipts/{uid(1)}', request=request, headers={'Idempotency-Key': uid(7)})
for mode in ('in_house', 'third_party'):
    outgoing = {**shipment, 'id': uid(8 if mode == 'in_house' else 9), 'reference': f'PC-OUT-{mode}', 'direction': 'outbound', 'delivery_mode': mode, 'status': 'in_transit' if mode == 'in_house' else 'handed_over', 'evidence_ids': []}
    save('operations', f'delivery-{mode}', 'ShipmentPage', 200, {'items': [outgoing], 'next_cursor': None})
save('operations', 'empty', 'ShipmentPage', 200, {'items': [], 'next_cursor': None})
for name, code, status, text in [('forbidden', 'FORBIDDEN', 403, 'Access denied.'), ('stale', 'STALE_VERSION', 409, 'Refresh before submitting.'), ('invalid', 'VALIDATION_ERROR', 422, 'Damaged quantity exceeds received quantity.')]:
    save('operations', name, 'ErrorResponse', status, {'error': {'code': code, 'message': text}}, 'POST', f'/api/receipts/{uid(1)}')
save('cases', 'analysis-pending', 'PendingAnalysis', 202, {'job_id': uid(10), 'case_id': uid(6), 'status': 'pending'}, 'POST', f'/api/exceptions/{uid(6)}/analyze')
save('cases', 'provider-error', 'ErrorResponse', 503, {'error': {'code': 'PROVIDER_UNAVAILABLE', 'message': 'Analysis unavailable. Retry later.'}}, 'POST', f'/api/exceptions/{uid(6)}/analyze')
save('cases', 'shortage-case', 'CaseSummary', 200, {'id': uid(6), 'shipment_id': uid(1), 'stage': 'inbound', 'type': 'quantity_mismatch', 'priority': 'normal', 'status': 'awaiting_sme_decision', 'handling_mode': 'human', 'responsible_party': 'UNDETERMINED', 'evidence_ids': [uid(4)], 'summary': '100 expected, 90 received. Shortage: 10.'}, path=f'/api/exceptions/{uid(6)}')
save('cases', 'approval-pending', 'ApprovalSummary', 200, {'id': uid(11), 'case_id': uid(6), 'status': 'pending', 'decision': None, 'created_at': '2026-10-21T09:00:00Z'}, path=f'/api/approvals/{uid(11)}')
print('Wrote eleven fictitious fixtures.')
