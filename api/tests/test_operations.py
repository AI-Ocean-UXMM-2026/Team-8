import copy
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID
from fastapi.testclient import TestClient
from test_foundation import uid, staff, sme
from app.core.application import create_app
from app.core.auth import AuthContext, Membership
from app.core.settings import Settings


class DatabaseError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


class TestOperations(unittest.TestCase):
    def setUp(self):
        self.identity = staff
        self.calls = []
        self.error = None
        self.fixture = json.loads((Path(__file__).resolve().parents[2] / 'contracts/fixtures/operations/receipt-100-90.json').read_text())
        self.result = self.fixture['body']
        owner = self
        class Verifier:
            def verify(self, token): return owner.identity
        class Factory:
            def for_user(self, identity):
                owner.assertEqual(identity.access_token, owner.identity.access_token)
                return self
            def rpc(self, function, parameters):
                owner.calls.append((function, parameters))
                if owner.error: raise owner.error
                return owner.result
        self.client = TestClient(create_app(Settings(_env_file=None, supabase_url='', supabase_public_key=''), Verifier(), Factory()))
        self.headers = {'Authorization': 'Bearer verified', 'Idempotency-Key': str(uid(7)), 'X-Correlation-ID': str(uid(8))}

    def post(self, body=None, headers=None):
        return self.client.post(self.fixture['path'], json=body or self.fixture['request'], headers=headers or self.headers)

    def test_receipt_roundtrip_user_token_scope_version_key_and_correlation(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        function, params = self.calls[0]
        self.assertEqual(function, 'ops_command')
        self.assertEqual(params['p_body'], self.fixture['request'])
        self.assertEqual(params['p_key'], str(uid(7)))
        self.assertEqual(params['p_correlation'], str(uid(8)))
        self.assertEqual(params['p_warehouse'], str(uid(2)))
        self.assertEqual(response.json()['shortage_qty'], 10)

    def test_invalid_quantities_types_and_damage_are_rejected_before_database(self):
        for field, value in [('received_qty', -1), ('damaged_qty', 91), ('received_qty', True), ('received_qty', 1.5)]:
            body = copy.deepcopy(self.fixture['request']); body['lines'][0][field] = value
            self.assertEqual(self.post(body).status_code, 422)
        self.assertEqual(self.calls, [])

    def test_key_and_expected_version_are_required(self):
        headers = {k:v for k,v in self.headers.items() if k != 'Idempotency-Key'}
        self.assertEqual(self.post(headers=headers).status_code, 422)
        body = copy.deepcopy(self.fixture['request']); del body['expected_version']
        self.assertEqual(self.post(body).status_code, 422)
        self.assertEqual(self.calls, [])

    def test_staff_scope_cannot_be_forged_and_sme_is_blocked(self):
        self.identity = sme
        self.assertEqual(self.post().status_code, 403)
        self.identity = staff
        self.assertEqual(self.client.get('/api/inventory?warehouse_id='+str(uid(99)), headers=self.headers).status_code, 403)
        self.assertEqual(self.calls, [])

    def test_multiple_warehouses_require_explicit_selection(self):
        self.identity = AuthContext(uid(1), (Membership(uid(2),'staff'), Membership(uid(3),'staff')), 'token')
        self.assertEqual(self.post().status_code, 403)
        self.result = {'items': [], 'next_cursor': None}
        self.assertEqual(self.client.get('/api/inventory?warehouse_id='+str(uid(3)), headers=self.headers).status_code, 200)
        self.assertEqual(self.calls[0][1]['p_warehouse'], str(uid(3)))

    def test_sql_errors_are_typed_and_private_details_are_redacted(self):
        for code,message,status,error in [('22023','stale_version',409,'STALE_VERSION'),('22023','idempotency_conflict',409,'IDEMPOTENCY_CONFLICT'),('22023','stock_unavailable',409,'STOCK_UNAVAILABLE'),('42501','secret SQL',403,'FORBIDDEN'),('23503','secret SQL',422,'VALIDATION_ERROR'),('08006','secret SQL',503,'SERVICE_UNAVAILABLE')]:
            self.error = DatabaseError(code,message)
            response = self.post()
            self.assertEqual(response.status_code,status)
            self.assertEqual(response.json()['error']['code'],error)
            self.assertNotIn('secret',response.text)

    def test_pagination_filters_validation_and_missing_detail(self):
        self.result = {'items': [], 'next_cursor': None}
        self.assertEqual(self.client.get('/api/shipments?limit=2&direction=inbound&cursor='+str(uid(9)), headers=self.headers).status_code,200)
        self.assertEqual(self.calls[0][1]['p_filters'],{'limit':2,'direction':'inbound','cursor':str(uid(9))})
        for query in ['limit=101','limit=0','cursor=invalid','direction=unknown','status=unknown']:
            self.assertEqual(self.client.get('/api/shipments?'+query,headers=self.headers).status_code,422)
        self.result = None
        self.assertEqual(self.client.get('/api/shipments/'+str(uid(1)),headers=self.headers).status_code,404)

    def test_create_and_correction_requests_require_reviewed_fields(self):
        self.assertEqual(self.client.post('/api/shipments',json={'sme_id':str(uid(3))},headers=self.headers).status_code,422)
        self.assertEqual(self.client.post('/api/inventory/'+str(uid(4))+'/corrections',json={'available_delta':1},headers=self.headers).status_code,422)
        self.assertEqual(self.calls,[])
