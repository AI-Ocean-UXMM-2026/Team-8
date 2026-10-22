"""SME outbound requests; authorization and stock reservations are atomic in SQL."""
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Request
from pydantic import Field, model_validator
from ...contracts import DTO
from ...core.auth import AuthContext, current_identity
from ..operations.models import CreateLine
from ..operations.service import call

router = APIRouter(prefix='/api/orders', tags=['SME orders'])
Identity = Annotated[AuthContext, Depends(current_identity)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]

class OrderInput(DTO):
    warehouse_id: UUID
    sme_id: UUID
    customer_name: Annotated[str, Field(min_length=1, max_length=120)]
    customer_phone: Annotated[str, Field(min_length=3, max_length=40)]
    address: Annotated[str, Field(min_length=1, max_length=500)]
    notes: Annotated[str, Field(max_length=2000)] = ''
    maps_url: Annotated[str, Field(max_length=2048)] = ''
    latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
    lines: Annotated[list[CreateLine], Field(min_length=1, max_length=100)]

    @model_validator(mode='after')
    def valid(self):
        from urllib.parse import urlparse
        if not all(x.strip() for x in [self.customer_name, self.customer_phone, self.address]):
            raise ValueError('Customer and address are required')
        if len({x.product_id for x in self.lines}) != len(self.lines):
            raise ValueError('Duplicate products')
        if self.maps_url:
            u = urlparse(self.maps_url)
            if u.scheme != 'https' or u.hostname not in ('maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com') or u.username or u.password or u.port:
                raise ValueError('Use a Google Maps HTTPS link')
            if u.hostname == 'goo.gl' and not u.path.startswith('/maps/'):
                raise ValueError('Use a Google Maps link')
            if u.hostname in ('google.com', 'www.google.com') and not (u.path == '/maps' or u.path.startswith('/maps/')):
                raise ValueError('Use a Google Maps link')
        return self

class OrderAction(DTO):
    action: Literal['accept', 'reject', 'cancel']
    delivery_mode: Literal['in_house', 'third_party'] = 'in_house'
    note: Annotated[str, Field(max_length=2000)] = ''

@router.get('', response_model=list[dict], operation_id='listOrders')
def orders(request: Request, identity: Identity, warehouse_id: UUID, sme_id: UUID | None = None):
    if sme_id: identity.require_tenant_read(warehouse_id, sme_id)
    else: identity.require_staff(warehouse_id)
    return call(request, identity, 'sme_orders_read', {'p_warehouse': str(warehouse_id), 'p_sme': str(sme_id) if sme_id else None})

@router.post('', response_model=dict, status_code=201, operation_id='submitOrder')
def submit(body: OrderInput, request: Request, identity: Identity, key: Key):
    identity.require_tenant_read(body.warehouse_id, body.sme_id)
    return call(request, identity, 'sme_order_command', {'p_warehouse': str(body.warehouse_id), 'p_key': str(key), 'p_order': None, 'p_body': body.model_dump(mode='json')})

@router.post('/{order_id}/actions', response_model=dict, operation_id='actOnOrder')
def act(order_id: UUID, body: OrderAction, request: Request, identity: Identity, key: Key, warehouse_id: UUID):
    return call(request, identity, 'sme_order_command', {'p_warehouse': str(warehouse_id), 'p_key': str(key), 'p_order': str(order_id), 'p_body': body.model_dump(mode='json')})

@router.get('/shipment/{shipment_id}/customer', response_model=dict | None, operation_id='getOrderCustomer')
def customer(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'order_customer', {'p_shipment': str(shipment_id)})
