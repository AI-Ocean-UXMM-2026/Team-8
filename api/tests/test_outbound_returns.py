import copy
import unittest
from fastapi.testclient import TestClient
from test_foundation import uid, staff
from app.core.application import create_app
from app.core.settings import Settings


class OutboundReturnTests(unittest.TestCase):
    def setUp(self):
        owner = self
        self.calls = []
        class Verifier:
            def verify(self, token): return staff
        class Database:
            def for_user(self, identity):
                owner.assertEqual(identity.access_token, staff.access_token)
                return self
            def rpc(self, name, params):
                owner.calls.append((name, params))
                return {'shipment': {'id': params['p_shipment']}}
        self.client = TestClient(create_app(Settings(_env_file=None), Verifier(), Database()))
        self.url = f'/api/deliveries/{uid(5)}/return'
        self.headers = {'Authorization': 'Bearer verified', 'Idempotency-Key': str(uid(7))}
        self.body = {'expected_version': 3, 'note': 'Physical count verified', 'evidence_id': str(uid(8)),
                     'lines': [{'product_id': str(uid(9)), 'received_qty': 3, 'damaged_qty': 1}]}

    def test_return_passes_evidenced_increments_with_original_key_and_user_identity(self):
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 200)
        name, params = self.calls[0]
        self.assertEqual(name, 'delivery_command')
        self.assertEqual(params['p_kind'], 'return')
        self.assertEqual(params['p_key'], str(uid(7)))
        self.assertEqual(params['p_body'], self.body)

    def test_invalid_return_never_reaches_database(self):
        bad = []
        for field, value in [('received_qty', 0), ('received_qty', True), ('received_qty', 1.5),
                             ('damaged_qty', -1), ('damaged_qty', 4)]:
            body = copy.deepcopy(self.body); body['lines'][0][field] = value; bad.append(body)
        for field, value in [('lines', []), ('lines', None), ('evidence_id', None),
                             ('expected_version', 0), ('lines', self.body['lines'] * 2)]:
            body = copy.deepcopy(self.body); body[field] = value; bad.append(body)
        for body in bad:
            self.assertEqual(self.client.post(self.url, json=body, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post(self.url, json=self.body, headers={'Authorization': 'Bearer token'}).status_code, 422)
        self.assertEqual(self.client.post(self.url, json=self.body).status_code, 401)
        self.assertEqual(self.calls, [])
