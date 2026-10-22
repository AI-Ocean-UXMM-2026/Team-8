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
        self.write_failure = False
        self.terminal = False
        self.gps_enabled = True
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
                if name == 'shipment_arrival':
                    return {'arrived_at': '2026-10-22T00:00:00Z', 'latitude': 16.9, 'longitude': 96.2, 'delivered': False}
                if name == 'tracking_settings':
                    return {'live_gps_enabled': owner.gps_enabled, 'demo_simulation_enabled': True}
                if name == 'route_plan_write':
                    if owner.write_failure:
                        from app.core.errors import AppError
                        raise AppError(503, 'SERVICE_UNAVAILABLE', 'Unavailable')
                    return {**params['p_payload'], 'shipment_id': str(uid(5)), 'assignment_id': str(uid(6)), 'saved_at': '2026-10-22T00:00:00Z', 'expires_at': '2026-10-23T00:00:00Z'}
                if name == 'route_plan_read':
                    return None
                if params['p_shipment'] is None:
                    return [{'shipment_id': str(uid(5)), 'accepted_at': '2026-10-22T00:00:00Z'}] if owner.assigned else []
                return {'shipment': {'warehouse_id': str(uid(2)), 'direction': 'outbound', 'delivery_mode': 'in_house', 'status': 'delivered' if owner.terminal else 'in_transit'}}
        self.app = create_app(Settings(_env_file=None, openrouteservice_api_key='server-secret'), Verifier(), Database())
        self.client = TestClient(self.app)
        self.url = '/api/deliveries/' + str(uid(5)) + '/route'
        self.headers = {'Authorization': 'Bearer token', 'Idempotency-Key': str(uid(9))}
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

    @patch('app.features.deliveries.routing.httpx.post')
    def test_calculated_route_remains_available_when_sharing_cannot_be_confirmed(self, post):
        self.write_failure = True
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'features': [{'geometry': {'type': 'LineString', 'coordinates': [[96.1,16.8],[96.2,16.9]]}, 'properties': {'summary': {'distance': 2400, 'duration': 180}}}]}
        result = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['sharing_status'], 'unconfirmed')
        self.assertNotIn('saved_at', result.json())

    @patch('app.features.deliveries.routing.httpx.post')
    def test_fallback_car_bicycle_walking_and_no_straight_line(self, post):
        missing = Mock(status_code=404)
        missing.json.return_value = {'error': {'code': 2010}}
        ok = Mock(status_code=200)
        ok.json.return_value = {'features': [{'geometry': {'type': 'LineString', 'coordinates': [[96.1,16.8],[96.2,16.9]]}, 'properties': {'summary': {'distance': 2400, 'duration': 180}}}]}
        post.side_effect = [missing, missing, ok]
        response = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['profile'], 'walking')
        self.assertEqual([c.args[0].split('/')[-2] for c in post.call_args_list], ['driving-car','cycling-regular','foot-walking'])
        post.reset_mock(); post.side_effect = [missing,missing,missing]
        response = self.client.post(self.url, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('coordinates', response.json())
        self.assertEqual(post.call_count, 3)

    @patch('app.features.deliveries.routing.httpx.post')
    def test_admin_gps_disabled_never_calls_route_provider(self, post):
        self.gps_enabled = False
        self.assertEqual(self.client.post(self.url, json=self.body, headers=self.headers).status_code, 403)
        post.assert_not_called()

    def test_arrival_route_not_shadowed_by_generic_delivery_command(self):
        response = self.client.post(self.url.replace('/route','/arrival'), headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.calls[-1][0], 'shipment_arrival')
        self.assertTrue(self.calls[-1][1]['p_confirm'])
        self.assertFalse(response.json()['delivered'])
