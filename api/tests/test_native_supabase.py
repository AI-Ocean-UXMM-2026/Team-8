"""Opt-in tests against a disposable native Supabase development stack.

Never run on production. Creates private evidence reservations/objects. Tokens
are provided in process environment, never committed or printed.
"""
import os
import unittest
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.core.settings import Settings, get_settings

SHIPMENT_A = '40000000-0000-4000-8000-000000000001'
SHIPMENT_B = '40000000-0000-4000-8000-000000000002'
SME_A = '20000000-0000-4000-8000-000000000001'
SME_B = '20000000-0000-4000-8000-000000000002'
PNG = b'\x89PNG\r\n\x1a\nfixture'


@unittest.skipUnless(os.getenv('PARCELCARE_NATIVE_TEST') == '1', 'Native Supabase environment not enabled')
class NativeSupabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        names = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_PUBLISHABLE_KEY', 'TEST_STAFF_TOKEN',
                 'TEST_SME_A_TOKEN', 'TEST_SME_B_TOKEN', 'TEST_OTHER_STAFF_TOKEN', 'TEST_INACTIVE_RIDER_TOKEN']
        if any(not os.getenv(name) for name in names):
            raise RuntimeError('Native test environment is incomplete; see api/README.md')
        cls.url = os.environ['SUPABASE_TEST_URL'].rstrip('/')
        cls.key = os.environ['SUPABASE_TEST_PUBLISHABLE_KEY']
        settings = Settings(_env_file=None, supabase_url=cls.url, supabase_publishable_key=cls.key)
        app.dependency_overrides[get_settings] = lambda: settings
        cls.api = TestClient(app)
        cls.http = httpx.Client(base_url=cls.url, timeout=20, headers={'apikey': cls.key})

    @classmethod
    def tearDownClass(cls):
        cls.api.close()
        cls.http.close()
        app.dependency_overrides.clear()

    def auth(self, name):
        return {'Authorization': 'Bearer ' + os.environ[f'TEST_{name}_TOKEN']}

    def test_auth_and_membership_contract(self):
        self.assertEqual(self.api.get('/api/me').status_code, 401)
        self.assertEqual(self.api.get('/api/me', headers={'Authorization': 'Bearer forged.jwt.value'}).status_code, 401)
        self.assertEqual(self.api.get('/api/me', headers=self.auth('INACTIVE_RIDER')).status_code, 403)
        for name, role in [('STAFF', 'staff'), ('SME_A', 'sme'), ('SME_B', 'sme'), ('OTHER_STAFF', 'staff')]:
            r = self.api.get('/api/me', headers=self.auth(name))
            self.assertEqual(r.status_code, 200)
            self.assertIn(role, [m['role'] for m in r.json()['memberships']])

    def test_direct_rest_nested_relations_and_forged_scope(self):
        r = self.http.get('/rest/v1/products', params={'select': 'id'})
        self.assertIn(r.status_code, [401, 403])
        r = self.http.get('/rest/v1/shipments', params={'id': f'eq.{SHIPMENT_A}', 'select': 'id,shipment_items(product_id)'},
                          headers=self.auth('SME_A'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)
        self.assertTrue(r.json()[0]['shipment_items'])
        for name in ['SME_B', 'OTHER_STAFF', 'INACTIVE_RIDER']:
            r = self.http.get('/rest/v1/shipments',
                              params={'id': f'eq.{SHIPMENT_A}', 'select': 'id,shipment_items(product_id)'},
                              headers={**self.auth(name), 'X-Role': 'owner', 'X-SME-ID': SME_A})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json(), [])
        r = self.http.patch('/rest/v1/products', params={'sme_id': f'eq.{SME_A}'},
                            headers=self.auth('SME_A'), json={'available_qty': 999})
        self.assertIn(r.status_code, [401, 403])

    def test_real_storage_upload_download_and_isolation(self):
        r = self.api.post('/api/evidence', headers=self.auth('SME_A'),
                          json={'shipment_id': SHIPMENT_A, 'mime_type': 'image/png', 'size_bytes': len(PNG)})
        self.assertEqual(r.status_code, 201)
        record = r.json()
        r = self.api.put(f'/api/evidence/{record["id"]}/content',
                         headers={**self.auth('SME_A'), 'Content-Type': 'image/png'}, content=PNG)
        self.assertEqual(r.status_code, 204)
        r = self.api.post(f'/api/evidence/{record["id"]}/download', headers=self.auth('SME_A'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.http.get(r.json()['url']).content, PNG)
        for name in ['SME_B', 'OTHER_STAFF', 'INACTIVE_RIDER']:
            self.assertIn(self.api.post(f'/api/evidence/{record["id"]}/download', headers=self.auth(name)).status_code, [403, 404])
            r = self.http.get('/storage/v1/object/authenticated/parcelcare-evidence/' + record['path'], headers=self.auth(name))
            self.assertGreaterEqual(r.status_code, 400)
        r = self.http.get('/storage/v1/object/public/parcelcare-evidence/' + record['path'])
        self.assertGreaterEqual(r.status_code, 400)
        r = self.api.put(f'/api/evidence/{record["id"]}/content',
                         headers={**self.auth('SME_A'), 'Content-Type': 'image/png'}, content=PNG)
        self.assertGreaterEqual(r.status_code, 400)
        r = self.http.post('/storage/v1/object/parcelcare-evidence/guessed/' + str(uuid4()),
                           headers={**self.auth('SME_B'), 'Content-Type': 'image/png'}, content=PNG)
        self.assertGreaterEqual(r.status_code, 400)

    def test_cross_sme_api_reservation_is_denied(self):
        for name in ['SME_A', 'OTHER_STAFF']:
            r = self.api.post('/api/evidence', headers=self.auth(name),
                              json={'shipment_id': SHIPMENT_B, 'mime_type': 'image/png', 'size_bytes': len(PNG)})
            self.assertGreaterEqual(r.status_code, 400)


if __name__ == '__main__':
    unittest.main()
