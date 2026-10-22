"""Explicit, rider-requested routing. Never infer a shipment destination or ETA."""
import math
import httpx
from ...core.errors import AppError


def calculate_route(key, body):
    if not key:
        raise AppError(503, 'ROUTING_NOT_CONFIGURED', 'Route planning is not available yet. Ask your operator to finish setup. GPS tracking remains available.')
    try:
        response = httpx.post('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson', headers={'Authorization': key},
            json={'coordinates': [[body.origin_longitude, body.origin_latitude],
                  [body.destination_longitude, body.destination_latitude]], 'instructions': False}, timeout=15, follow_redirects=False)
        if response.status_code in (401, 403):
            raise AppError(503, 'ROUTING_CONFIGURATION', 'Route planning could not connect. Ask your operator to check the routing service connection.')
        if response.status_code == 429:
            raise AppError(429, 'ROUTING_QUOTA', 'Routing quota reached. Try again later; GPS tracking remains available.')
        if response.status_code in (400, 404):
            raise AppError(422, 'NO_ROUTE', 'No driving route found. Check the destination pin and road access.')
        if response.status_code != 200:
            raise AppError(503, 'ROUTING_UNAVAILABLE', 'Routing is temporarily unavailable. Try again later.')
        feature = response.json()['features'][0]
        if feature['geometry']['type'] != 'LineString':
            raise ValueError()
        points = feature['geometry']['coordinates']
        if not isinstance(points, list) or not 2 <= len(points) <= 100000:
            raise ValueError()
        for point in points:
            if not isinstance(point, list) or len(point) != 2 or not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in point) or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
                raise ValueError()
        distance, duration = feature['properties']['summary']['distance'], feature['properties']['summary']['duration']
        if not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and n >= 0 for n in [distance, duration]):
            raise ValueError()
        return {'provider': 'openrouteservice', 'profile': 'car', 'coordinates': points,
                'distance_m': distance, 'duration_ms': duration * 1000, 'traffic_aware': False,
                'destination_source': 'courier_selected'}
    except AppError:
        raise
    except Exception:
        # Do not expose provider URLs (API keys), request coordinates or raw errors.
        raise AppError(503, 'ROUTING_UNAVAILABLE', 'Routing is temporarily unavailable. Try again later.') from None
