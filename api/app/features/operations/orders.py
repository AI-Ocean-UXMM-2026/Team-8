"""SME outbound requests; authorization and stock reservations are atomic in SQL."""
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import AliasChoices, Field, model_validator
from ...contracts import DTO
from ...core.auth import AuthContext, current_identity
from ..operations.models import CreateLine
from ..operations.service import call

router = APIRouter(prefix='/api/orders', tags=['SME orders'])
Identity = Annotated[AuthContext, Depends(current_identity)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]

class DeliveryProfile(DTO):
    recipient_name: Annotated[str, Field(min_length=1, max_length=120, validation_alias=AliasChoices('recipient_name', 'customer_name'))]
    recipient_phone: Annotated[str, Field(min_length=3, max_length=40, validation_alias=AliasChoices('recipient_phone', 'customer_phone'))]
    address: Annotated[str, Field(min_length=1, max_length=500)]
    notes: Annotated[str, Field(max_length=2000)] = ''
    maps_url: Annotated[str, Field(max_length=2048)] = ''
    latitude: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    longitude: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]

    @model_validator(mode='after')
    def valid(self):
        from urllib.parse import urlparse
        if not all(x.strip() for x in [self.recipient_name, self.recipient_phone, self.address]):
            raise ValueError('SME delivery contact and address are required')
        if self.maps_url:
            u = urlparse(self.maps_url)
            if u.scheme != 'https' or u.hostname not in ('maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com') or u.username or u.password or u.port:
                raise ValueError('Use a Google Maps HTTPS link')
            if u.hostname == 'goo.gl' and not u.path.startswith('/maps/'):
                raise ValueError('Use a Google Maps link')
            if u.hostname in ('google.com', 'www.google.com') and not (u.path == '/maps' or u.path.startswith('/maps/')):
                raise ValueError('Use a Google Maps link')
        return self

class OrderInput(DeliveryProfile):
    warehouse_id: UUID
    sme_id: UUID
    order_kind: Literal['sme_self_delivery'] | None = None
    save_delivery_profile: bool = False
    lines: Annotated[list[CreateLine], Field(min_length=1, max_length=100)]

    @model_validator(mode='after')
    def unique_lines(self):
        if len({x.product_id for x in self.lines}) != len(self.lines):
            raise ValueError('Duplicate products')
        return self

class WarehouseCatalogItem(DTO):
    id: UUID
    warehouse_id: UUID
    sku: str
    name: str
    available_qty: Annotated[int, Field(ge=0, strict=True)]

@router.get('/catalog', response_model=list[WarehouseCatalogItem], operation_id='warehouseCatalog')
def catalog(request: Request, identity: Identity, warehouse_id: UUID):
    identity.require_staff(warehouse_id)
    return call(request, identity, 'warehouse_catalog', {'p_warehouse': str(warehouse_id)})

class CatalogProduct(WarehouseCatalogItem):
    category: str
class CatalogPage(DTO):
    items: list[CatalogProduct]
    selected_items: list[CatalogProduct]
    next_cursor: str | None
    total: int
    categories: list[str]
@router.get('/catalog-page', response_model=CatalogPage, operation_id='warehouseCatalogPage')
def catalog_page(request: Request, identity: Identity, warehouse_id: UUID, sme_id: UUID | None = None,
                 search: Annotated[str, Query(max_length=200)] = '', category: Literal['','uncategorized','food_beverages','clothing_accessories','home_kitchen','electronics','beauty_personal_care','health_medical','office_stationery','other'] = '',
                 in_stock_only: bool = True, limit: Annotated[int, Query(ge=1,le=48)] = 12,
                 cursor: Annotated[str, Query(max_length=3000)] | None = None,
                 selected_ids: Annotated[list[UUID] | None, Query(max_length=100)] = None):
    from ...core.errors import AppError
    if not any(m.warehouse_id == warehouse_id and m.role in ('sme','staff','owner') for m in identity.memberships):
        raise AppError(403,'FORBIDDEN','Access denied.')
    filters={'search':search.strip(),'category':category,'in_stock_only':in_stock_only,'limit':limit,'cursor':cursor,'selected_ids':[str(id) for id in selected_ids or []]}
    if sme_id is not None:
        identity.require_tenant_read(warehouse_id,sme_id)
        return call(request,identity,'sme_stock_catalog',{'p_warehouse':str(warehouse_id),'p_sme':str(sme_id),'p_filters':filters})
    identity.require_staff(warehouse_id)
    return call(request,identity,'warehouse_catalog_page',{'p_warehouse':str(warehouse_id),'p_filters':filters})

@router.get('/delivery-profile', response_model=DeliveryProfile | None, operation_id='getSMEDeliveryProfile')
def profile(request: Request, identity: Identity, warehouse_id: UUID, sme_id: UUID):
    identity.require_tenant_read(warehouse_id, sme_id)
    return call(request, identity, 'sme_delivery_profile', {'p_warehouse': str(warehouse_id), 'p_sme': str(sme_id), 'p_value': None})

@router.put('/delivery-profile', response_model=DeliveryProfile, operation_id='saveSMEDeliveryProfile')
def save_profile(body: DeliveryProfile, request: Request, identity: Identity, warehouse_id: UUID, sme_id: UUID):
    from ...core.errors import AppError
    if not any(m.warehouse_id == warehouse_id and m.sme_id == sme_id and m.role == 'sme' for m in identity.memberships):
        raise AppError(403, 'FORBIDDEN', 'Only this SME can change its delivery profile.')
    return call(request, identity, 'sme_delivery_profile', {'p_warehouse': str(warehouse_id), 'p_sme': str(sme_id), 'p_value': body.model_dump(mode='json')})

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
    payload = body.model_dump(mode='json', exclude_none=True)
    if body.order_kind is None:
        # Existing clients and saved uncertain submissions retain their wire shape.
        payload['customer_name'] = payload.pop('recipient_name')
        payload['customer_phone'] = payload.pop('recipient_phone')
        payload.pop('save_delivery_profile', None)
    return call(request, identity, 'sme_order_command', {'p_warehouse': str(body.warehouse_id), 'p_key': str(key), 'p_order': None, 'p_body': payload})

@router.post('/{order_id}/actions', response_model=dict, operation_id='actOnOrder')
def act(order_id: UUID, body: OrderAction, request: Request, identity: Identity, key: Key, warehouse_id: UUID):
    return call(request, identity, 'sme_order_command', {'p_warehouse': str(warehouse_id), 'p_key': str(key), 'p_order': str(order_id), 'p_body': body.model_dump(mode='json')})

@router.get('/shipment/{shipment_id}/customer', response_model=dict | None, operation_id='getOrderCustomer')
def customer(shipment_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'order_customer', {'p_shipment': str(shipment_id)})
