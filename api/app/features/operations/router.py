"""Warehouse operations use only authenticated, atomic database RPCs."""
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Query, Request
from ...contracts import (Shipment, ShipmentPage, ShipmentDetail, ShipmentStatus,
    ReceiptRequest, ReceiptResult, ShipmentEventRequest, InventoryPage,
    WarehouseDirectory, WarehouseOverview, CasePage, ErrorResponse)
from ...core.auth import AuthContext, current_identity
from ...core.errors import AppError
from .models import CreateShipment, StockCorrection, StockResult
from .service import read, command


router = APIRouter(prefix='/api', tags=['Warehouse operations'], responses={
    code: {'model': ErrorResponse, 'description': description}
    for code, description in [(401, 'Unauthenticated'), (403, 'Forbidden'), (404, 'Not found'),
        (409, 'Stale version, changed idempotency payload or unavailable stock'),
        (422, 'Invalid input or warehouse transition'), (503, 'Database unavailable; outcome may be unconfirmed')]
})
Identity = Annotated[AuthContext, Depends(current_identity)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]


@router.get('/warehouse/overview', response_model=WarehouseOverview, operation_id='warehouseOverview')
def overview(request: Request, identity: Identity, warehouse_id: UUID | None = None):
    return read(request, identity, warehouse_id, 'overview')


@router.get('/warehouse/directory', response_model=WarehouseDirectory, operation_id='warehouseDirectory')
def directory(request: Request, identity: Identity, warehouse_id: UUID | None = None):
    return read(request, identity, warehouse_id, 'directory')


@router.get('/inventory', response_model=InventoryPage, operation_id='listInventory')
def inventory(request: Request, identity: Identity, warehouse_id: UUID | None = None,
              sme_id: UUID | None = None, cursor: UUID | None = None,
              limit: Annotated[int, Query(ge=1, le=100)] = 25,
              stock_status: Literal['available', 'quarantined'] | None = None):
    return read(request, identity, warehouse_id, 'inventory', sme_id=sme_id, cursor=cursor, limit=limit, stock_status=stock_status)


@router.get('/shipments', response_model=ShipmentPage, operation_id='listShipments')
def shipments(request: Request, identity: Identity, warehouse_id: UUID | None = None,
              sme_id: UUID | None = None, cursor: UUID | None = None,
              limit: Annotated[int, Query(ge=1, le=100)] = 25,
              direction: Literal['inbound', 'outbound'] | None = None, status: ShipmentStatus | None = None):
    return read(request, identity, warehouse_id, 'shipments', sme_id=sme_id, cursor=cursor, limit=limit, direction=direction, status=status)


@router.get('/inventory/{product_id}', response_model=StockResult, operation_id='getStock')
def stock(product_id: UUID, request: Request, identity: Identity, warehouse_id: UUID | None = None):
    result = read(request, identity, warehouse_id, 'stock', product_id=product_id)
    if result is None:
        raise AppError(404, 'NOT_FOUND', 'Product was not found.')
    return result


@router.get('/exceptions', response_model=CasePage, operation_id='listExceptions')
def cases(request: Request, identity: Identity, warehouse_id: UUID | None = None,
          sme_id: UUID | None = None, cursor: UUID | None = None,
          limit: Annotated[int, Query(ge=1, le=100)] = 25, status: Literal['open', 'all'] = 'open',
          issue_type: str | None = None, priority: Literal['low', 'normal', 'high', 'critical'] | None = None,
          handling_mode: Literal['ai', 'human'] | None = None, state: str | None = None,
          owner_id: UUID | Literal['unassigned'] | None = None):
    return read(request, identity, warehouse_id, 'cases', sme_id=sme_id, cursor=cursor, limit=limit, status=status,
                issue_type=issue_type, priority=priority, handling_mode=handling_mode, state=state, owner_id=owner_id)


@router.get('/shipments/{shipment_id}', response_model=ShipmentDetail, operation_id='getShipment')
def detail(shipment_id: UUID, request: Request, identity: Identity, warehouse_id: UUID | None = None):
    result = read(request, identity, warehouse_id, 'detail', shipment_id=shipment_id)
    if result is None:
        raise AppError(404, 'NOT_FOUND', 'Shipment was not found.')
    return result


@router.post('/shipments', response_model=Shipment, status_code=201, operation_id='createShipment')
def create(body: CreateShipment, request: Request, identity: Identity, key: Key, warehouse_id: UUID | None = None):
    return command(request, identity, warehouse_id, 'create', key, body)


@router.post('/receipts/{shipment_id}', response_model=ReceiptResult, operation_id='postReceipt')
def receive(shipment_id: UUID, body: ReceiptRequest, request: Request, identity: Identity, key: Key, warehouse_id: UUID | None = None):
    return command(request, identity, warehouse_id, 'receipt', key, body, shipment_id)


@router.post('/shipments/{shipment_id}/events', response_model=ShipmentDetail, operation_id='recordShipmentEvent')
def event(shipment_id: UUID, body: ShipmentEventRequest, request: Request, identity: Identity, key: Key, warehouse_id: UUID | None = None):
    return command(request, identity, warehouse_id, 'event', key, body, shipment_id)


@router.post('/inventory/{product_id}/corrections', response_model=StockResult, operation_id='correctStock')
def correct(product_id: UUID, body: StockCorrection, request: Request, identity: Identity, key: Key, warehouse_id: UUID | None = None):
    return command(request, identity, warehouse_id, 'correction', key, body, product_id)
