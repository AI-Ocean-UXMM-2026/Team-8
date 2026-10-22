import unittest
from fastapi.testclient import TestClient
from test_foundation import uid, staff, sme
from app.core.application import create_app
from app.core.settings import Settings
from app.features.exceptions.models import CaseRiskCommand
from pydantic import ValidationError
from app.features.ai.service import bounded_snapshot


class RiskQueueTests(unittest.TestCase):
    def test_maker_and_checker_source_contains_recorded_risk_without_actor_data(self):
        source = dict(facts={}, shipment={}, inventory=[], allowed_actions=[], policy_version=1, source_version='1:1:1',
            case=dict(id=str(uid(1)), type='courier_delay', priority='high', summary='Report', evidence=[],
                risk_context={'perishability': 'perishable'}, priority_classification={'policy_version': 1},
                priority_override=False, escalated=True, escalated_by='private-actor'))
        bounded = bounded_snapshot(source)
        self.assertEqual(bounded['case']['risk_context']['perishability'], 'perishable')
        self.assertTrue(bounded['case']['escalated'])
        self.assertNotIn('escalated_by', bounded['case'])
        bounded['case']['risk_context']['perishability'] = 'unknown'
        self.assertEqual(source['case']['risk_context']['perishability'], 'perishable')

    def setUp(self):
        owner = self
        self.identity = staff
        self.calls = []
        class Verifier:
            def verify(self, token): return owner.identity
        class Database:
            def for_user(self, identity):
                owner.assertEqual(identity.access_token, owner.identity.access_token)
                return self
            def rpc(self, name, params):
                owner.calls.append((name, params))
                return {'items': [], 'next_cursor': None}
        self.client = TestClient(create_app(Settings(_env_file=None), Verifier(), Database()))
        self.headers = {'Authorization': 'Bearer verified'}

    def test_rank_and_filters_reach_authorized_database_before_pagination(self):
        result = self.client.get('/api/exceptions?sort=risk&sla_risk=overdue&escalated=true&stage=outbound&limit=1', headers=self.headers)
        self.assertEqual(result.status_code, 200, result.text)
        name, params = self.calls[0]
        self.assertEqual(name, 'case_queue_read')
        self.assertEqual(params['p_warehouse'], str(uid(2)))
        for key, value in dict(sort='risk', sla_risk='overdue', escalated=True, stage='outbound', limit=1).items():
            self.assertEqual(params['p_filters'][key], value)

    def test_auth_scope_and_invalid_filters(self):
        self.assertEqual(self.client.get('/api/exceptions').status_code, 401)
        self.assertEqual(self.client.get('/api/exceptions?sort=invalid', headers=self.headers).status_code, 422)
        self.assertEqual(self.client.get('/api/exceptions?warehouse_id='+str(uid(99)), headers=self.headers).status_code, 403)
        self.identity = sme
        self.assertEqual(self.client.get('/api/exceptions', headers=self.headers).status_code, 403)
        self.assertEqual(self.calls, [])

    def test_risk_context_does_not_accept_negative_fractional_or_invented_attributes(self):
        base = dict(expected_version=1, source_version='1:1:1', note='Verified facts', kind='context')
        for context in [dict(order_value_mmk=-1), dict(order_value_mmk=1.5), dict(perishability='guess'), dict(order_value_mmk=True), dict(untrusted=True)]:
            with self.assertRaises(ValidationError):
                CaseRiskCommand(**base, context=context)
