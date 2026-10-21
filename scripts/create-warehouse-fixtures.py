import json
from pathlib import Path

uid = lambda n: f'10000000-0000-4000-8000-{n:012d}'
warehouse = uid(1)
smes = [{'id': uid(2), 'name': 'Golden Bloom'}, {'id': uid(3), 'name': 'Lotus Trading'}]
inventory = [dict(id=uid(10+i), warehouse_id=warehouse, sme_id=smes[i % 2]['id'], sku=sku, name=name, available_qty=available, quarantined_qty=quarantine, shipment_ids=[]) for i, (sku, name, available, quarantine) in enumerate([('TOTE-01', 'Canvas tote', 20, 0), ('SOAP-02', 'Botanical soap', 30, 2), ('TEA-03', 'Green tea', 0, 4)])]
shipments = []
for i, (direction, mode, status, product, quantity) in enumerate([('inbound', None, 'expected', 0, 100), ('inbound', None, 'expected', 1, 50), ('outbound', 'in_house', 'ready', 1, 10), ('outbound', 'third_party', 'handed_over', 0, 5)]):
    p = inventory[product]
    sid = uid(20+i)
    evidence = uid(40+i)
    p['shipment_ids'].append(sid)
    shipments.append(dict(id=sid, warehouse_id=warehouse, sme_id=p['sme_id'], reference=f'PC-{ "IN" if direction == "inbound" else "OUT"}-{i+1:04}', direction=direction, delivery_mode=mode, status=status, version=1, created_at='2026-10-21T09:00:00Z', evidence_ids=[evidence], items=[dict(product_id=p['id'], sku=p['sku'], name=p['name'], expected_qty=quantity, received_qty=0, damaged_qty=0)], events=[], evidence=[dict(id=evidence, label='Verified shipment count / condition record', verified=True)]))
cases = [dict(id=uid(60), shipment_id=shipments[3]['id'], stage='outbound', type='courier_delay', priority='normal', status='awaiting_courier_confirmation', handling_mode='human', responsible_party='UNDETERMINED', evidence_ids=shipments[3]['evidence_ids'], summary='Awaiting verified courier delivery update.')]
for shipment in shipments:
    shipment['allowed_events'] = ['picked'] if shipment['delivery_mode'] == 'in_house' else []
data = dict(name='warehouse-initial', schema='WarehouseFixture', status=200, method='GET', path='/api/warehouse/directory', body=dict(directory=dict(warehouse_id=warehouse, name='Yangon hub', smes=smes), inventory=inventory, shipments=shipments, cases=cases))
target = Path(__file__).resolve().parents[1] / 'contracts/fixtures/warehouse/initial.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print('Wrote fictitious warehouse fixture.')
