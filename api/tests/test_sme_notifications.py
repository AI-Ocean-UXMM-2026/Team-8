"""HTTP notification contract; SQL integration separately verifies recipient isolation."""
import unittest
from fastapi.testclient import TestClient
from test_foundation import sme, uid
from app.core.application import create_app
from app.core.errors import AppError
from app.core.settings import Settings


class NotificationTests(unittest.TestCase):
    def setUp(self):
        owner = self
        self.calls = []
        self.denied = False

        class Verifier:
            def verify(self, token):
                if token != 'verified':
                    raise AppError(401, 'UNAUTHENTICATED', 'Session expired.')
                return sme

        class Database:
            def for_user(self, identity):
                owner.assertEqual(identity, sme)
                return self

            def rpc(self, name, params):
                owner.calls.append((name, params))
                if owner.denied:
                    raise AppError(403, 'FORBIDDEN', 'Not an authorized recipient.')
                if name == 'tenant_feed':
                    return [{'id': str(uid(10)), 'case_id': str(uid(11)),
                             'message': 'Recorded decision request', 'read': False,
                             'created_at': '2026-10-21T12:00:00Z'}]
                return None

        self.client = TestClient(create_app(Settings(_env_file=None, supabase_url='', supabase_public_key=''), Verifier(), Database()))
        self.headers = {'Authorization': 'Bearer verified'}

    def test_feed_uses_authenticated_user_and_requested_sme_filter(self):
        response = self.client.get('/api/notifications?sme_id=' + str(uid(4)), headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]['case_id'], str(uid(11)))
        self.assertEqual(self.calls, [('tenant_feed', {'p_kind': 'notifications', 'p_sme': str(uid(4))})])

    def test_read_and_unread_have_empty_204_responses(self):
        for action in ['read', 'unread']:
            response = self.client.post('/api/notifications/' + str(uid(10)) + '/' + action, headers=self.headers)
            self.assertEqual(response.status_code, 204)
            self.assertEqual(response.content, b'')
            self.assertEqual(self.calls[-1], ('mark_notification_' + action, {'p_notification': str(uid(10))}))

    def test_unauthenticated_expired_and_foreign_recipient_are_denied(self):
        for headers in [{}, {'Authorization': 'Bearer expired'}]:
            self.assertEqual(self.client.get('/api/notifications', headers=headers).status_code, 401)
            self.assertEqual(self.client.post('/api/notifications/' + str(uid(10)) + '/unread', headers=headers).status_code, 401)
        self.assertEqual(self.calls, [])
        self.denied = True
        for action in ['read', 'unread']:
            response = self.client.post('/api/notifications/' + str(uid(10)) + '/' + action, headers={**self.headers, 'X-Role': 'owner', 'X-SME-ID': str(uid(99))})
            self.assertEqual(response.status_code, 403)
            self.assertIn('X-Correlation-ID', response.headers)

    def test_invalid_ids_are_rejected_before_database_access(self):
        self.assertEqual(self.client.get('/api/notifications?sme_id=invalid', headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post('/api/notifications/invalid/unread', headers=self.headers).status_code, 422)
        self.assertEqual(self.calls, [])
