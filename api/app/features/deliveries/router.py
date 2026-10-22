from typing import Annotated, Literal
from uuid import UUID
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, Header, Request
from pydantic import AwareDatetime, Field, field_validator
from ...contracts import DTO
from ...core.auth import AuthContext, current_identity
from ..operations.service import call

router = APIRouter(prefix='/api', tags=['Deliveries and tracking'])
Identity = Annotated[AuthContext, Depends(current_identity)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]


class DeliveryCommand(DTO):
    expected_version: Annotated[int, Field(strict=True, ge=1)]
    note: Annotated[str, Field(min_length=1, max_length=2000)]
    rider_id: UUID | None = None
    evidence_id: UUID | None = None
    proof_id: UUID | None = None
    approval_id: UUID | None = None
    received_by: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    courier_name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    waybill: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    tracking_url: Annotated[str, Field(max_length=2000)] | None = None
    accepted_at: AwareDatetime | None = None
    package_condition: Annotated[str, Field(min_length=1, max_length=1000)] | None = None
    package_count: Annotated[int, Field(strict=True, ge=1)] | None = None
    status: Literal['handed_over', 'delayed', 'failed', 'delivered'] | None = None
    scheduled_at: AwareDatetime | None = None

    @field_validator('tracking_url')
    @classmethod
    def safe_link(cls, value):
        if value is not None:
            url = urlsplit(value)
            if url.scheme != 'https' or not url.hostname or url.username or url.password or any(c.isspace() for c in value):
                raise ValueError('A HTTPS tracking link without credentials is required')
        return value


class StartTracking(DTO):
    assignment_id: UUID
    consent: Literal[True]


class Position(DTO):
    latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
    accuracy_m: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    recorded_at: AwareDatetime


class RegisterEvidence(DTO):
    shipment_id: UUID
    mime_type: Literal['image/jpeg', 'image/png', 'application/pdf']
    size_bytes: Annotated[int, Field(strict=True, ge=1, le=10485760)]
    sme_visible: bool = True


@router.get('/rider/assignments', response_model=list[dict], operation_id='riderAssignments')
def assignments(request: Request, identity: Identity):
    return call(request, identity, 'delivery_read', {'p_shipment': None})


@router.get('/deliveries/{shipment_id}', response_model=dict, operation_id='getDelivery')
def delivery(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'delivery_read', {'p_shipment': str(shipment_id)})


class RouteRequest(DTO):
    origin_latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    origin_longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
    destination_latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    destination_longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
    consent: Literal[True]


@router.post('/deliveries/{shipment_id}/route', response_model=dict, operation_id='calculateDeliveryRoute')
def route(shipment_id: UUID, body: RouteRequest, request: Request, identity: Identity, key: Key):
    from ...core.errors import AppError
    from .routing import calculate_route
    from datetime import datetime, timezone
    requested_at = datetime.now(timezone.utc).isoformat()
    # This RPC lists only the caller's current rider assignments. Client role
    # headers and membership alone never authorize another rider's route.
    assignments = call(request, identity, 'delivery_read', {'p_shipment': None})
    assignment = next((a for a in assignments if a.get('shipment_id') == str(shipment_id) and a.get('accepted_at')), None)
    if not assignment:
        raise AppError(403, 'FORBIDDEN', 'Accept your assigned delivery before requesting a route.')
    data = call(request, identity, 'delivery_read', {'p_shipment': str(shipment_id)})
    shipment = data['shipment']
    if shipment['direction'] != 'outbound' or shipment['delivery_mode'] != 'in_house' or shipment['status'] in ('delivered', 'cancelled'):
        raise AppError(403, 'FORBIDDEN', 'Routing requires an active in-house outbound delivery.')
    settings = call(request, identity, 'tracking_settings', {'p_warehouse': shipment['warehouse_id'], 'p_value': None})
    if not settings.get('live_gps_enabled', False):
        raise AppError(403, 'GPS_DISABLED', 'Live GPS is disabled by warehouse staff.')
    result = calculate_route(request.app.state.settings.openrouteservice_api_key, body)
    result.update({'origin': [body.origin_longitude, body.origin_latitude], 'destination': [body.destination_longitude, body.destination_latitude]})
    try:
        saved = call(request, identity, 'route_plan_write', {'p_shipment': str(shipment_id), 'p_payload': result, 'p_key': str(key), 'p_requested_at': requested_at})
        if not isinstance(saved, dict):
            raise AppError(503, 'ROUTE_NOT_SAVED', 'The shared route was not saved. Try again.')
    except AppError as error:
        if error.status != 503:
            raise
        # Preserve local navigation during database setup/outages, while never
        # claiming that an uncertain write was committed or shared.
        saved = {**result, 'shipment_id': str(shipment_id), 'sharing_status': 'unconfirmed'}
    from fastapi.responses import JSONResponse
    return JSONResponse(saved, headers={'Cache-Control': 'no-store'})


@router.get('/deliveries/{shipment_id}/route', response_model=dict | None, operation_id='getSharedDeliveryRoute')
def shared_route(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'route_plan_read', {'p_shipment': str(shipment_id)})


class RiderReport(DTO):
    type: Literal['recipient_unavailable', 'delivery_failed', 'transit_damage', 'courier_delay']
    note: Annotated[str, Field(min_length=1, max_length=2000)]
    evidence_ids: Annotated[list[UUID], Field(max_length=100)] = []


class RiderReportResult(DTO):
    id: UUID
    shipment_id: UUID
    stage: Literal['outbound']
    type: Literal['recipient_unavailable', 'delivery_failed', 'transit_damage', 'courier_delay']


@router.post('/deliveries/{shipment_id}/report', response_model=RiderReportResult, status_code=201, operation_id='reportRiderException')
def report_issue(shipment_id: UUID, body: RiderReport, request: Request, identity: Identity, key: Key):
    return call(request, identity, 'rider_report', {'p_shipment': str(shipment_id), 'p_key': str(key),
        'p_body': body.model_dump(mode='json'), 'p_correlation': str(request.state.correlation_id)})


class TrackingSettings(DTO):
    live_gps_enabled: bool
    demo_simulation_enabled: bool


@router.get('/warehouses/{warehouse_id}/tracking-settings', response_model=dict, operation_id='getTrackingSettings')
def get_tracking_settings(warehouse_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'tracking_settings', {'p_warehouse': str(warehouse_id), 'p_value': None})


@router.put('/warehouses/{warehouse_id}/tracking-settings', response_model=dict, operation_id='setTrackingSettings')
def set_tracking_settings(warehouse_id: UUID, body: TrackingSettings, request: Request, identity: Identity):
    identity.require_staff(warehouse_id)
    return call(request, identity, 'tracking_settings', {'p_warehouse': str(warehouse_id), 'p_value': body.model_dump()})


@router.get('/deliveries/{shipment_id}/arrival', response_model=dict | None, operation_id='getShipmentArrival')
def get_arrival(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'shipment_arrival', {'p_shipment': str(shipment_id), 'p_confirm': False})


@router.post('/deliveries/{shipment_id}/arrival', response_model=dict, operation_id='confirmShipmentArrival')
def confirm_arrival(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'shipment_arrival', {'p_shipment': str(shipment_id), 'p_confirm': True})


@router.post('/deliveries/{shipment_id}/{command}', response_model=dict, operation_id='deliveryCommand')
def command(shipment_id: UUID, command: Literal['assign','cancel','accept','pickup','proof','confirm','handover','courier','capacity'],
            body: DeliveryCommand, request: Request, identity: Identity, key: Key):
    return call(request, identity, 'delivery_command', {'p_kind': command, 'p_shipment': str(shipment_id),
        'p_key': str(key), 'p_body': body.model_dump(mode='json', exclude_none=True),
        'p_correlation': str(request.state.correlation_id)})


@router.post('/tracking/start', response_model=UUID, operation_id='startTracking')
def start(body: StartTracking, request: Request, identity: Identity):
    return call(request, identity, 'start_tracking', {'p_assignment': str(body.assignment_id), 'p_consent': body.consent})


@router.post('/tracking/{session_id}/locations', response_model=UUID, operation_id='recordLocation')
def position(session_id: UUID, body: Position, request: Request, identity: Identity):
    return call(request, identity, 'record_location', {'p_session': str(session_id), 'p_lat': body.latitude,
        'p_lon': body.longitude, 'p_accuracy': body.accuracy_m, 'p_recorded': body.recorded_at.isoformat()})


@router.get('/tracking/{session_id}/live', response_model=dict, operation_id='getLiveLocation')
def live(session_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'get_live_location', {'p_session': str(session_id)})


@router.post('/tracking/{session_id}/stop', status_code=204, operation_id='stopTracking')
def stop(session_id: UUID, request: Request, identity: Identity):
    call(request, identity, 'stop_tracking', {'p_session': str(session_id)})


@router.post('/evidence', response_model=dict, status_code=201, operation_id='registerEvidence')
def register(body: RegisterEvidence, request: Request, identity: Identity):
    return call(request, identity, 'register_evidence', {'p_shipment': str(body.shipment_id),
        'p_mime': body.mime_type, 'p_size': body.size_bytes, 'p_sme_visible': body.sme_visible})


@router.get('/evidence/{evidence_id}/download', response_model=dict, operation_id='downloadEvidence')
def download(evidence_id: UUID, request: Request, identity: Identity):
    from ...core.providers import create_user_client
    from ...core.errors import AppError
    metadata = call(request, identity, 'evidence_access', {'p_evidence': str(evidence_id)})
    try:
        client = create_user_client(identity.access_token, request.app.state.settings)
        result = client.storage.from_('parcelcare-evidence').create_signed_url(metadata['path'], 60)
        return {'url': result['signedURL'], 'expires_in_seconds': 60}
    except Exception as exc:
        raise AppError(503, 'SERVICE_UNAVAILABLE', 'Evidence download is unavailable.') from exc
