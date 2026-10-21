import sys
import base64
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.application import create_app
from app.core.auth import AuthContext, Membership
from app.core.database import SupabaseUserDatabaseFactory
from app.core.errors import AppError
from app.core.settings import Settings
from app.core.supabase_auth import SupabaseAuthenticator
from app.features.policies.service import POLICY, classify_priority, require_allowed_action, require_verified_closure

uid = lambda n: UUID(f'00000000-0000-4000-8000-{n:012d}')
staff = AuthContext(uid(1), (Membership(uid(2), 'staff'),), 'private-token')
sme = AuthContext(uid(3), (Membership(uid(2), 'sme', uid(4)),), 'sme-token')


class TestFoundation(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, supabase_url='', supabase_public_key='')

    def test_unconfigured_is_fail_closed_and_all_errors_correlated(self):
        client = TestClient(create_app(self.settings))
        self.assertEqual(client.get('/health').status_code, 200)
        for headers, status in [({}, 401), ({'Authorization': 'Bearer unverified', 'X-Role': 'owner'}, 503)]:
            response = client.get('/api/me', headers=headers)
            self.assertEqual(response.status_code, status)
            UUID(response.headers['X-Correlation-ID'])
            self.assertIn('error', response.json())
        self.assertEqual(client.get('/api/missing').json()['error']['code'], 'NOT_FOUND')

    def test_identity_uses_verifier_not_client_scope_and_never_returns_token(self):
        class FakeVerifier:
            def verify(self, token):
                if token != 'valid':
                    raise AppError(401, 'UNAUTHENTICATED', 'Expired session.')
                return sme
        client = TestClient(create_app(self.settings, FakeVerifier()))
        response = client.get('/api/me', headers={'Authorization': 'Bearer valid', 'X-Role': 'owner', 'X-SME-ID': str(uid(99)), 'X-Correlation-ID': str(uid(5))})
        self.assertEqual(response.headers['X-Correlation-ID'], str(uid(5)))
        self.assertEqual(response.json()['memberships'][0]['role'], 'sme')
        self.assertNotIn('token', response.text)
        self.assertNotIn('sme-token', repr(sme))
        self.assertEqual(client.get('/api/me', headers={'Authorization': 'Bearer expired'}).status_code, 401)

    def test_tenant_staff_and_rider_guards(self):
        staff.require_tenant_read(uid(2), uid(99))
        sme.require_tenant_read(uid(2), uid(4))
        for identity, warehouse, tenant in [(sme, uid(2), uid(99)), (staff, uid(99), uid(4)), (AuthContext(uid(6), (Membership(uid(2), 'rider'),), 'rider-token'), uid(2), uid(4))]:
            with self.assertRaises(AppError): identity.require_tenant_read(warehouse, tenant)
        with self.assertRaises(AppError): sme.require_staff(uid(2))
        with self.assertRaises(ValueError): Membership(uid(2), 'sme')

    def test_supabase_verifier_checks_auth_before_memberships_and_uses_verified_subject(self):
        calls = []
        class Query:
            def select(self, _columns): return self
            def eq(self, name, value): calls.append((name, value)); return self
            def execute(self): return SimpleNamespace(data=[{'warehouse_id': str(uid(2)), 'sme_id': str(uid(4)), 'role': 'sme'}])
        fake = SimpleNamespace(auth=SimpleNamespace(get_user=lambda token: SimpleNamespace(user=SimpleNamespace(id=uid(3)))), table=lambda name: Query())
        context = SupabaseAuthenticator(lambda token: fake).verify('token')
        self.assertEqual(context.actor_id, uid(3))
        self.assertIn(('profile_id', str(uid(3))), calls)
        self.assertIn(('active', True), calls)
        fake.auth.get_user = lambda token: SimpleNamespace(user=None)
        calls.clear()
        with self.assertRaises(AppError): SupabaseAuthenticator(lambda token: fake).verify('forged')
        self.assertEqual(calls, [])

    def test_user_database_uses_separate_tokens_and_command_allowlist(self):
        seen = []
        def factory(token):
            seen.append(token)
            return SimpleNamespace(rpc=lambda name, params: SimpleNamespace(execute=lambda: SimpleNamespace(data={'ok': True})))
        db = SupabaseUserDatabaseFactory(factory)
        self.assertEqual(db.for_user(staff).rpc('receive_shipment', {}), {'ok': True})
        with self.assertRaises(ValueError): db.for_user(sme).rpc('purge_expired_locations', {})
        self.assertEqual(seen, ['private-token', 'sme-token'])

    def test_cors_only_explicit_origin(self):
        client = TestClient(create_app(Settings(_env_file=None, cors_origins=['http://localhost:3000'])))
        for origin, expected in [('http://localhost:3000', 200), ('https://other.test', 400)]:
            response = client.options('/api/me', headers={'Origin': origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization'})
            self.assertEqual(response.status_code, expected)

    def test_service_key_cannot_be_configured_as_public_user_client_key(self):
        service_key = 'header.' + base64.urlsafe_b64encode(json.dumps({'role': 'service_role'}).encode()).decode().rstrip('=') + '.signature'
        for value in [service_key, 'sb_secret_do-not-use']:
            with self.assertRaises(ValueError): Settings(_env_file=None, supabase_public_key=value)
        self.assertEqual(Settings(_env_file=None, supabase_public_key='sb_publishable_example').supabase_public_key, 'sb_publishable_example')

    def test_unhandled_error_redacts_private_detail_and_retains_correlation(self):
        class BrokenVerifier:
            def verify(self, token): raise RuntimeError('private-token-and-internal-query')
        client = TestClient(create_app(self.settings, BrokenVerifier()), raise_server_exceptions=False)
        response = client.get('/api/me', headers={'Authorization': 'Bearer secret'})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['error']['code'], 'INTERNAL_ERROR')
        self.assertNotIn('private-token', response.text)
        UUID(response.headers['X-Correlation-ID'])


class TestPolicy(unittest.TestCase):
    def test_priority_boundaries_and_missing_information_are_independent(self):
        for amount, priority in [(0, 'low'), (49999, 'low'), (50000, 'normal'), (199999, 'normal'), (200000, 'high'), (999999, 'high'), (1000000, 'critical')]:
            self.assertEqual(classify_priority(amount).priority, priority)
        self.assertEqual(classify_priority(1, ('safety',)).priority, 'critical')
        self.assertTrue(classify_priority(None).pending)
        self.assertEqual(classify_priority(None, ('temperature_breach',)).priority, 'critical')
        for invalid in [-1, 1.2, True]:
            with self.assertRaises(AppError): classify_priority(invalid)

    def test_action_allowlist_never_permits_physical_or_gps_actions(self):
        for action in POLICY['allowed_actions']: require_allowed_action(action)
        for action in ['execute_sql', 'adjust_stock', 'close_case', 'start_tracking', 'dispatch', 'declare_liability']:
            with self.assertRaises(AppError): require_allowed_action(action)

    def test_all_case_types_require_verified_outcomes_and_staff(self):
        for case_type, facts in POLICY['closure_evidence'].items():
            args = dict(identity=staff, warehouse_id=uid(2), case_type=case_type, verified_facts={name: uid(9) for name in facts}, pending_mandatory_actions=0, source_version=1, expected_version=1, sme_decision='accept_partial')
            require_verified_closure(**args)
            for replacement in [{'verified_facts': {}}, {'pending_mandatory_actions': 1}, {'expected_version': 2}, {'identity': sme}]:
                with self.assertRaises(AppError): require_verified_closure(**{**args, **replacement})
        args.update(case_type='quantity_mismatch', verified_facts={name: uid(9) for name in POLICY['closure_evidence']['quantity_mismatch']}, sme_decision='await_remainder')
        with self.assertRaises(AppError): require_verified_closure(**args)
        args['verified_facts']['remainder_completed'] = uid(10)
        require_verified_closure(**args)


if __name__ == '__main__': unittest.main()
