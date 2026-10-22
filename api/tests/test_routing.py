import unittest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient
from test_foundation import uid
from app.core.application import create_app
from app.core.auth import AuthContext, Membership
from app.core.settings import Settings


class RoutingTests(unittest.TestCase):
    def setUp(self):
        owner = self
        self.assigned = True
        self.terminal = False
        self.calls = []
        rider = AuthContext(uid(3), (Membership(uid(2), 'rider'),), 'token')
        class Verifier:
            def verify(self, token): return rider
        class Database:
            def for_user(self, identity):
                owner.assertEqual(identity, rider)
                return self
            def rpc(self, name, params):
                owner.calls.append((name, params))
                if params['p_shipment'] is None:
                    return [{'shipment_id': str(uid(5)), 'accepted_at': '2026-10-22T00:00:00Z'}] if owner.assigned else []
                return {'shipment': {'direction': 'outbound', 'delivery_mode': 'in_house', 'status': 'delivered' if owner.terminal else 'in_transit'}}
        self.app = create_app(Settings(_env_file=None, openrouteservice_api_key='server-secret'), Verifier(), Database())
        self.client = TestClient(self.app)
        self.url = '/api/deliveries/' + str(uid(5)) + '/route'
        self.headers = {'Authorization': 'Bearer token'}
        self.body = {'origin_latitude': 16.8, 'origin_longitude': 96.1, 'destination_latitude': 16.9, 'destination_longitude': 96.2, 'consent': True}

    @patch('app.features.deliveries.routing.httpx.post')
    def test_ors_lon_lat_order_and_normalized_geometry(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'features': [{'geometry': {'type': 'LineString', 'coordinates': [[96.1, 16.8], [96.2, 16.9]]}, 'properties': {'summary': {'distance': 2400, 'duration': 180}}}]}
        response = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        data = response.json()
        self.assertEqual(data['duration_ms'], 180000)
        self.assertFalse(data['traffic_aware'])
        self.assertEqual(post.call_args.args[0], 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson')
        self.assertNotIn('params', post.call_args.kwargs)
        self.assertEqual(post.call_args.kwargs['headers'], {'Authorization': 'server-secret'})
        self.assertEqual(post.call_args.kwargs['json']['coordinates'], [[96.1, 16.8], [96.2, 16.9]])
        self.assertNotIn('server-secret', response.text)

    @patch('app.features.deliveries.routing.httpx.post')
    def test_unauthorized_invalid_unassigned_terminal_never_call_provider(self, post):
        self.assertEqual(self.client.post(self.url, json=self.body).status_code, 401)
        for patch_body in [{'consent': False}, {'destination_latitude': 91}]:
            self.assertEqual(self.client.post(self.url, json={**self.body, **patch_body}, headers=self.headers).status_code, 422)
        self.assigned = False
        self.assertEqual(self.client.post(self.url, json=self.body, headers={**self.headers, 'X-Role': 'owner'}).status_code, 403)
        self.assigned = True
        self.terminal = True
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 403)
        post.assert_not_called()

    @patch('app.features.deliveries.routing.httpx.post')
    def test_configuration_quota_timeout_and_malformed_response(self, post):
        self.app.state.settings.openrouteservice_api_key = ''
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 503)
        post.assert_not_called()
        self.app.state.settings.openrouteservice_api_key = 'server-secret'
        post.return_value = Mock(status_code=429)
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 429)
        post.side_effect = RuntimeError('secret-coordinates-server-secret')
        response = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('server-secret', response.text)
        post.side_effect = None
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'features': []}
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 503)

    @patch('app.features.deliveries.routing.httpx.post')
    def test_provider_permission_and_geometry_fail_without_secret_details(self, post):
        for status in [401, 403, 500, 302]:
            post.return_value = Mock(status_code=status)
            response = self.client.post(self.url, json=self.body, headers=self.headers)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('server-secret', response.text)
        for geometry in [{'type': 'Point', 'coordinates': [96.1, 16.8]}, {'type': 'LineString', 'coordinates': [[96.1, 16.8], [181, 16.9]]}]:
            post.return_value = Mock(status_code=200)
            post.return_value.json.return_value = {'features': [{'geometry': geometry, 'properties': {'summary': {'distance': 2400, 'duration': 180}}}]}
            self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 503)
