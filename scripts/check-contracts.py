import json
import subprocess
import sys
from pathlib import Path
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api'))
from app.contracts import MODELS, ReceiptRequest

models = {model.__name__: model for model in MODELS}
for fixture in (ROOT / 'contracts/fixtures').rglob('*.json'):
    data = json.loads(fixture.read_text(encoding='utf-8'))
    parsed = models[data['schema']].model_validate(data['body'])
    assert data['status'] in (200, 202, 403, 409, 422, 503)
    if 'request' in data:
        ReceiptRequest.model_validate(data['request'])
        body = data['body']
        assert body['expected_qty'] == 100 and body['received_qty'] == 90
        assert body['shortage_qty'] == 10
        assert body['good_qty'] + body['damaged_qty'] == body['received_qty']
    if data['schema'] == 'ShipmentPage':
        for shipment in parsed.items:
            assert (shipment.direction == 'inbound') == (shipment.delivery_mode is None)
    print('PASS', data['name'])

valid = {'expected_version': 1, 'final': True, 'lines': [{'product_id': '00000000-0000-4000-8000-000000000005', 'received_qty': 90, 'damaged_qty': 0}], 'evidence_ids': [], 'notes': ''}
for received, damaged in [(-1, 0), (90, 91), (1.5, 0), (True, 0)]:
    invalid = {**valid, 'lines': [{**valid['lines'][0], 'received_qty': received, 'damaged_qty': damaged}]}
    try:
        ReceiptRequest.model_validate(invalid)
    except ValidationError:
        pass
    else:
        raise AssertionError(f'Invalid quantities accepted: {received}/{damaged}')

subprocess.run([sys.executable, str(ROOT / 'scripts/export-contracts.py'), '--check'], check=True)
print('PASS invalid quantity guards and OpenAPI source drift')
