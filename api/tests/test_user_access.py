"""API contracts with a fake Supabase HTTP boundary; SQL/RLS has a separate suite."""
import base64
import json
import unittest
from unittest.mock import patch
from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from app.core.user_access import public_key
from app.core.settings import Settings, get_settings
from app.main import app

USER = '00000000-0000-4000-8000-000000000001'
EVIDENCE = '80000000-0000-4000-8000-000000000001'
SHIPMENT = '40000000-0000-4000-8000-000000000001'
CORRELATION = '90000000-0000-4000-8000-000000000001'
PNG = b'\x89PNG\r\n\x1a\nfixture'
HttpClient = httpx.Client


class FoundationTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.auth_status = 200
        self.memberships = [{'id': USER, 'warehouse_id': USER, 'sme_id': USER, 'role': 'sme'}]
        self.record = {'id': EVIDENCE, 'uploaded_by': USER, 'object_path': f'{USER}/{SHIPMENT}/{EVIDENCE}',
                       'mime_type': 'image/png', 'size_bytes': len(PNG)}
        self.hidden = False
        self.storage_status = 200
        self.settings = Settings(_env_file=None, supabase_url='https://project.supabase.co',
                                 supabase_publishable_key='sb_publishable_test')
        app.dependency_overrides[get_settings] = lambda: self.settings
        self.client = TestClient(app)
        self.patch = patch('app.core.user_access.httpx.Client',
                           side_effect=lambda **kw: HttpClient(transport=httpx.MockTransport(self.upstream), **kw))
        self.patch.start()
        self.headers = {'Authorization': 'Bearer verified-user-token'}

    def tearDown(self):
        self.patch.stop()
        self.client.close()
        app.dependency_overrides.clear()

    def upstream(self, request):
        self.requests.append(request)
        self.assertEqual(request.headers['authorization'], 'Bearer verified-user-token')
        self.assertEqual(request.headers['apikey'], 'sb_publishable_test')
        UUID(request.headers['x-correlation-id'])
        path = request.url.path
        if path == '/auth/v1/user':
            return httpx.Response(self.auth_status, json={'id': USER, 'user_metadata': {'role': 'owner'}})
        if path == '/rest/v1/memberships':
            self.assertEqual(request.url.params['profile_id'], f'eq.{USER}')
            self.assertEqual(request.url.params['active'], 'eq.true')
            return httpx.Response(200, json=self.memberships)
        if path == '/rest/v1/profiles':
            return httpx.Response(200, json=[{'id': USER, 'display_name': 'Test SME'}])
        if path == '/rest/v1/evidence':
            return httpx.Response(200, json=[] if self.hidden else [self.record])
        if path == '/rest/v1/rpc/register_evidence':
            return httpx.Response(200, json={'id': EVIDENCE, 'bucket': 'parcelcare-evidence', 'path': self.record['object_path']})
        if path.startswith('/storage/v1/object/sign/'):
            self.assertEqual(json.loads(request.content), {'expiresIn': 60})
            return httpx.Response(self.storage_status, json={'signedURL': '/object/sign/parcelcare-evidence/file?token=test'})
        if path.startswith('/storage/v1/object/'):
            self.assertEqual(request.headers['x-upsert'], 'false')
            self.assertEqual(request.headers['content-type'], 'image/png')
            self.assertEqual(request.content, PNG)
            return httpx.Response(self.storage_status, json={'Key': 'private-object'})
        self.fail(f'Unexpected upstream request {path}')

    def test_unauthenticated_requests_never_contact_supabase(self):
        for path in ['/api/profile', f'/api/evidence/{EVIDENCE}/download']:
            r = self.client.request('GET' if path == '/api/profile' else 'POST', path)
            self.assertEqual(r.status_code, 401)
        self.assertEqual(self.requests, [])

    def test_me_verifies_auth_and_returns_database_roles_ignoring_forged_scope(self):
        r = self.client.get('/api/profile?role=owner&sme_id=other',
                            headers={**self.headers, 'X-Role': 'owner', 'X-SME-ID': 'other', 'X-Correlation-ID': CORRELATION})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['memberships'][0]['role'], 'sme')
        self.assertEqual(r.headers['x-correlation-id'], CORRELATION)
        self.assertEqual(r.headers['cache-control'], 'no-store')
        self.assertEqual(self.requests[0].url.path, '/auth/v1/user')
        self.assertTrue(all(req.headers['x-correlation-id'] == CORRELATION for req in self.requests))

    def test_invalid_expired_or_forged_token_is_rejected_before_database(self):
        for status in [400, 401, 403]:
            self.auth_status = status
            self.assertEqual(self.client.get('/api/profile', headers=self.headers).status_code, 401)
        self.assertEqual(len(self.requests), 3)

    def test_inactive_or_missing_membership_denies_access(self):
        self.memberships = []
        self.assertEqual(self.client.get('/api/profile', headers=self.headers).status_code, 403)

    def test_auth_outage_fails_closed(self):
        self.auth_status = 500
        r = self.client.get('/api/profile', headers=self.headers)
        self.assertEqual(r.status_code, 503)
        self.assertNotIn('user_metadata', r.text)
        self.assertEqual(len(self.requests), 1)

    def test_only_dedicated_public_key_is_accepted(self):
        self.settings.supabase_public_key = ""
        for key in ['', 'sb_secret_test', 'not-a-key']:
            self.settings.supabase_publishable_key = key
            self.assertEqual(self.client.get('/api/profile', headers=self.headers).status_code, 503)
        self.assertEqual(self.requests, [])
        for role in ['anon', 'service_role']:
            claims = base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=')
            self.settings.supabase_publishable_key = f'header.{claims}.signature'
            if role == 'anon':
                self.assertEqual(public_key(self.settings), self.settings.supabase_publishable_key)
            else:
                with self.assertRaises(Exception) as caught:
                    public_key(self.settings)
                self.assertEqual(caught.exception.status_code, 503)

    def test_evidence_reservation_never_forwards_client_actor_or_scope(self):
        body = {'shipment_id': SHIPMENT, 'mime_type': 'image/png', 'size_bytes': len(PNG)}
        r = self.client.post('/api/evidence/reservations', headers=self.headers, json=body)
        self.assertEqual(r.status_code, 201)
        args = json.loads(self.requests[-1].content)
        self.assertEqual(args, {'p_shipment': SHIPMENT, 'p_mime': 'image/png', 'p_size': len(PNG), 'p_sme_visible': True})
        r = self.client.post('/api/evidence/reservations', headers=self.headers, json={**body, 'uploaded_by': 'forged'})
        self.assertEqual(r.status_code, 422)

    def test_invalid_evidence_type_and_size(self):
        for mime, size in [('text/html', 5), ('image/png', 0), ('image/png', 10485761)]:
            r = self.client.post('/api/evidence/reservations', headers=self.headers,
                                 json={'shipment_id': SHIPMENT, 'mime_type': mime, 'size_bytes': size})
            self.assertEqual(r.status_code, 422)
        self.assertFalse(any('/rpc/' in str(req.url) for req in self.requests))

    def test_upload_requires_reserving_user(self):
        self.record['uploaded_by'] = 'other'
        r = self.client.put(f'/api/evidence/{EVIDENCE}/content', headers={**self.headers, 'Content-Type': 'image/png'}, content=PNG)
        self.assertEqual(r.status_code, 403)
        self.assertFalse(any('/storage/' in str(req.url) for req in self.requests))

    def test_upload_checks_bytes_size_and_mime(self):
        for mime, content, status in [('text/html', PNG, 422), ('image/png', b'bad', 422),
                                       ('image/png', PNG + b'extra', 413)]:
            r = self.client.put(f'/api/evidence/{EVIDENCE}/content',
                                headers={**self.headers, 'Content-Type': mime}, content=content)
            self.assertEqual(r.status_code, status)
        self.assertFalse(any('/storage/' in str(req.url) for req in self.requests))

    def test_successful_upload_is_user_scoped_and_cannot_overwrite(self):
        r = self.client.put(f'/api/evidence/{EVIDENCE}/content',
                            headers={**self.headers, 'Content-Type': 'image/png'}, content=PNG)
        self.assertEqual(r.status_code, 204)
        self.storage_status = 409
        r = self.client.put(f'/api/evidence/{EVIDENCE}/content',
                            headers={**self.headers, 'Content-Type': 'image/png'}, content=PNG)
        self.assertEqual(r.status_code, 409)

    def test_hidden_evidence_returns_404_without_storage_request(self):
        self.hidden = True
        r = self.client.post(f'/api/evidence/{EVIDENCE}/download', headers=self.headers)
        self.assertEqual(r.status_code, 404)
        self.assertFalse(any('/storage/' in str(req.url) for req in self.requests))

    def test_signed_download_expires_in_60_seconds(self):
        r = self.client.post(f'/api/evidence/{EVIDENCE}/download', headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['expires_in'], 60)
        self.assertTrue(r.json()['url'].startswith('https://project.supabase.co/storage/v1/object/sign/'))
        self.storage_status = 404
        self.assertEqual(self.client.post(f'/api/evidence/{EVIDENCE}/download', headers=self.headers).status_code, 404)


if __name__ == '__main__':
    unittest.main()
