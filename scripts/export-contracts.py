"""Publish implemented routes and planned domain contracts with explicit status."""
import json
import sys
from pathlib import Path
from pydantic.json_schema import models_json_schema

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api'))
from app.contracts import MODELS

_, bundle = models_json_schema([(model, 'validation') for model in MODELS], ref_template='#/components/schemas/{model}')
schemas = bundle['$defs']
ref = lambda name: {'$ref': f'#/components/schemas/{name}'}
response = lambda name, description: {'description': description, 'content': {'application/json': {'schema': ref(name)}}}
errors = {str(code): response('ErrorResponse', text) for code, text in [(401, 'Unauthenticated'), (403, 'Forbidden'), (404, 'Not found'), (409, 'Stale version or idempotency conflict'), (422, 'Invalid input'), (503, 'Provider unavailable')]}
def operation(name, success, code='200', mutation=False):
    result = {'operationId': name, 'x-implementation-status': 'planned', 'security': [{'BearerAuth': []}], 'responses': {code: response(success, 'Success'), **errors}}
    if mutation:
        result['parameters'] = [{'in': 'header', 'name': 'Idempotency-Key', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}}]
    return result

listing = operation('listShipments', 'ShipmentPage')
listing['parameters'] = [{'in': 'query', 'name': 'cursor', 'schema': {'type': ['string', 'null']}}, {'in': 'query', 'name': 'limit', 'schema': {'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 25}}]
receipt = operation('postReceipt', 'ReceiptResult', mutation=True)
receipt['parameters'].append({'in': 'path', 'name': 'shipment_id', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}})
receipt['requestBody'] = {'required': True, 'content': {'application/json': {'schema': ref('ReceiptRequest')}}}
analysis = operation('analyzeException', 'PendingAnalysis', '202', True)
analysis['parameters'].append({'in': 'path', 'name': 'case_id', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}})
spec = {'openapi': '3.1.0', 'info': {'title': 'ParcelCare V4 foundation contract (planned)', 'version': '1.0.0'}, 'paths': {'/api/shipments': {'get': listing}, '/api/receipts/{shipment_id}': {'post': receipt}, '/api/exceptions/{case_id}/analyze': {'post': analysis}}, 'components': {'schemas': schemas, 'securitySchemes': {'BearerAuth': {'type': 'http', 'scheme': 'bearer'}}}}
for path, operation_id, model, parameter in [
    ('/api/exceptions/{case_id}', 'getException', 'CaseSummary', 'case_id'),
    ('/api/approvals/{approval_id}', 'getApproval', 'ApprovalSummary', 'approval_id'),
]:
    endpoint = operation(operation_id, model)
    endpoint['parameters'] = [{'in': 'path', 'name': parameter, 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}}]
    spec['paths'][path] = {'get': endpoint}
from app.core.application import create_app
for endpoint, name, model in [
    ('/api/warehouse/overview', 'warehouseOverview', 'WarehouseOverview'),
    ('/api/warehouse/directory', 'warehouseDirectory', 'WarehouseDirectory'),
    ('/api/inventory', 'listInventory', 'InventoryPage'),
    ('/api/exceptions', 'listExceptions', 'CasePage'),
]:
    spec['paths'][endpoint] = {'get': operation(name, model)}
spec['paths']['/api/shipments/{shipment_id}'] = {'get': operation('getShipment', 'ShipmentDetail')}
event = operation('recordShipmentEvent', 'ShipmentDetail', mutation=True)
event['requestBody'] = {'required': True, 'content': {'application/json': {'schema': ref('ShipmentEventRequest')}}}
spec['paths']['/api/shipments/{shipment_id}/events'] = {'post': event}
for endpoint, methods in spec['paths'].items():
    for verb, config in methods.items():
        params = config.setdefault('parameters', [])
        if '{shipment_id}' in endpoint and not any(p['name'] == 'shipment_id' for p in params):
            params.append({'in': 'path', 'name': 'shipment_id', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}})
        params.append({'in': 'query', 'name': 'warehouse_id', 'schema': {'type': 'string', 'format': 'uuid'}})
        if verb == 'get' and endpoint in ('/api/inventory', '/api/shipments', '/api/exceptions'):
            for field, schema in [('sme_id', {'type': 'string', 'format': 'uuid'}), ('cursor', {'type': 'string'}), ('limit', {'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 25})]:
                if not any(p['name'] == field for p in params):
                    params.append({'in': 'query', 'name': field, 'schema': schema})
            if endpoint == '/api/shipments':
                for field in ('direction', 'status'):
                    params.append({'in': 'query', 'name': field, 'schema': {'type': 'string'}})
            if endpoint == '/api/inventory':
                params.append({'in': 'query', 'name': 'stock_status', 'schema': {'type': 'string', 'enum': ['available', 'quarantined']}})
            if endpoint == '/api/exceptions':
                params.append({'in': 'query', 'name': 'status', 'schema': {'type': 'string', 'enum': ['open', 'all']}})
from app.core.settings import Settings
runtime = create_app(Settings(_env_file=None, supabase_url='', supabase_public_key='', cors_origins=[])).openapi()
for path, methods in runtime['paths'].items():
    for method in methods.values():
        method['x-implementation-status'] = 'implemented'
    spec['paths'][path] = methods
spec['components']['schemas'].update(runtime.get('components', {}).get('schemas', {}))
spec['components']['securitySchemes'].update(runtime.get('components', {}).get('securitySchemes', {}))
destination = ROOT / 'contracts/openapi.json'
destination.parent.mkdir(exist_ok=True)
content = json.dumps(spec, indent=2) + '\n'
if '--check' in sys.argv:
    if destination.read_text(encoding='utf-8') != content:
        raise SystemExit('OpenAPI drift: run npm run contracts:generate')
else:
    destination.write_text(content, encoding='utf-8')
print('Checked V4 contract.' if '--check' in sys.argv else 'Exported V4 contract; implemented routes are labeled separately from planned routes.')
