import unittest
from fastapi.testclient import TestClient
from test_foundation import uid
from app.core.application import create_app
from app.core.auth import AuthContext, Membership
from app.core.settings import Settings


class DestinationTests(unittest.TestCase):
    def setUp(self):
        owner = self
        self.calls = []
        class Verifier:
            def verify(self, token):
                return AuthContext(uid(3), (Membership(uid(2), 'staff'),), 'token')
        class Database:
            def for_user(self, identity): return self
            def rpc(self, name, params):
                owner.calls.append((name, params))
                return params['p_value']
        self.client = TestClient(create_app(Settings(_env_file=None), Verifier(), Database()))
        self.url = f'/api/deliveries/{uid(5)}/destination'
        self.headers = {'Authorization': 'Bearer token'}

    def test_save_and_read_use_user_scoped_rpc(self):
        pin = {'latitude': 16.8409, 'longitude': 96.1735, 'label': 'Yangon'}
        self.assertEqual(self.client.put(self.url, json=pin, headers=self.headers).json(), pin)
        self.assertEqual(self.calls[-1], ('delivery_destination', {'p_shipment': str(uid(5)), 'p_value': pin}))
        self.assertEqual(self.client.get(self.url, headers=self.headers).status_code, 200)
        self.assertIsNone(self.calls[-1][1]['p_value'])

    def test_invalid_and_unauthenticated_do_not_write(self):
        pin = {'latitude': 91, 'longitude': 96, 'label': 'Yangon'}
        self.assertEqual(self.client.put(self.url, json=pin, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.put(self.url, json=pin).status_code, 401)
        self.assertEqual(self.calls, [])
