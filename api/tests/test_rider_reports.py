import unittest
from fastapi.testclient import TestClient
from test_foundation import uid
from app.core.application import create_app
from app.core.auth import AuthContext, Membership
from app.core.errors import AppError
from app.core.settings import Settings


class RiderReportTests(unittest.TestCase):
    def setUp(self):
        owner = self
        self.calls = []
        self.forbidden = False
        class Verifier:
            def verify(self, token):
                return AuthContext(uid(3), (Membership(uid(2), 'rider'),), 'token')
        class Database:
            def for_user(self, identity):
                owner.assertEqual(identity.actor_id, uid(3))
                return self
            def rpc(self, name, params):
                owner.calls.append((name, params))
                if owner.forbidden:
                    raise AppError(403, 'FORBIDDEN', 'Forbidden')
                return {'id': str(uid(7)), 'shipment_id': params['p_shipment'], 'stage': 'outbound', 'type': params['p_body']['type']}
        self.client = TestClient(create_app(Settings(_env_file=None), Verifier(), Database()))
        self.url = '/api/deliveries/' + str(uid(5)) + '/report'
        self.headers = {'Authorization': 'Bearer token', 'Idempotency-Key': str(uid(9))}
        self.body = {'type': 'courier_delay', 'note': 'Vehicle delayed', 'evidence_ids': []}

    def test_narrow_rpc_receives_authenticated_request(self):
        r = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()['shipment_id'], str(uid(5)))
        name, params = self.calls[0]
        self.assertEqual(name, 'rider_report')
        self.assertEqual(params['p_body'], self.body)
        self.assertEqual(params['p_key'], str(uid(9)))
        self.assertTrue(params['p_correlation'])

    def test_auth_validation_and_database_denial(self):
        self.assertEqual(self.client.post(self.url, json=self.body).status_code, 401)
        self.assertEqual(self.client.post(self.url, json=self.body, headers={'Authorization': 'Bearer token'}).status_code, 422)
        for patch in [{'type': 'missing_stock'}, {'note': ''}, {'note': 'x'*2001}, {'evidence_ids': ['invalid']}, {'evidence_ids': [str(uid(8))]*101}, {'stage': 'inbound'}]:
            self.assertEqual(self.client.post(self.url, json={**self.body, **patch}, headers=self.headers).status_code, 422)
        self.assertEqual(self.calls, [])
        self.forbidden = True
        self.assertEqual(self.client.post(self.url, json=self.body, headers={**self.headers, 'X-Role': 'staff'}).status_code, 403)
