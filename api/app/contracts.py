"""Shared V4 wire schemas for implemented and planned domain endpoints."""
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class DTO(BaseModel):
    model_config = ConfigDict(extra='forbid')


class DeliveryMode(StrEnum):
    IN_HOUSE = 'in_house'
    THIRD_PARTY = 'third_party'


class MembershipDTO(DTO):
    warehouse_id: UUID
    role: Literal['owner', 'staff', 'sme', 'rider']
    sme_id: UUID | None


class IdentityResponse(DTO):
    actor_id: UUID
    memberships: list[MembershipDTO]


class ShipmentStatus(StrEnum):
    EXPECTED = 'expected'
    PARTIALLY_RECEIVED = 'partially_received'
    RECEIVED = 'received'
    RECEIVED_WITH_DISCREPANCIES = 'received_with_discrepancies'
    READY = 'ready'
    ASSIGNED = 'assigned'
    PICKED_UP = 'picked_up'
    IN_TRANSIT = 'in_transit'
    DELAYED = 'delayed'
    FAILED = 'failed'
    DELIVERED = 'delivered'
    CANCELLED = 'cancelled'
    HANDED_OVER = 'handed_over'


class ErrorDetail(DTO):
    code: Literal['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR',
                  'STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'PROVIDER_UNAVAILABLE',
                  'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR', 'HTTP_ERROR', 'CLOSURE_PENDING', 'STOCK_UNAVAILABLE']
    message: str


class CaseSummary(DTO):
    id: UUID
    shipment_id: UUID
    stage: Literal['inbound', 'warehouse', 'outbound']
    type: Literal['quantity_mismatch', 'damaged_goods', 'missing_stock', 'wrong_pick',
                  'short_pick', 'courier_delay', 'delivery_failed', 'recipient_unavailable',
                  'transit_damage', 'transit_loss']
    priority: Literal['low', 'normal', 'high', 'critical']
    status: Literal['new', 'investigating', 'processing', 'awaiting_information',
                    'awaiting_sme_decision', 'awaiting_courier_confirmation',
                    'awaiting_verification', 'resolved', 'closed']
    handling_mode: Literal['ai', 'human']
    responsible_party: Literal['WAREHOUSE', 'THIRD_PARTY_COURIER', 'UNDETERMINED']
    evidence_ids: list[UUID]
    summary: str


class ApprovalSummary(DTO):
    id: UUID
    case_id: UUID
    status: Literal['pending', 'decided', 'cancelled']
    decision: Literal['accept_partial', 'await_remainder', 'reject'] | None
    created_at: AwareDatetime


class EventEnvelope(DTO):
    event_id: UUID
    event_type: str
    warehouse_id: UUID
    sme_id: UUID
    entity_id: UUID
    actor_id: UUID | None
    occurred_at: AwareDatetime
    schema_version: Literal[1]
    idempotency_key: UUID
    payload: dict[str, object]


class ErrorResponse(DTO):
    error: ErrorDetail


class Shipment(DTO):
    id: UUID
    warehouse_id: UUID
    sme_id: UUID
    reference: str
    direction: Literal['inbound', 'outbound']
    delivery_mode: DeliveryMode | None
    status: ShipmentStatus
    version: Annotated[int, Field(ge=1, strict=True)]
    created_at: AwareDatetime
    evidence_ids: list[UUID]

    @model_validator(mode='after')
    def validate_mode(self):
        if (self.direction == 'inbound') != (self.delivery_mode is None):
            raise ValueError('Only inbound shipments have null delivery_mode')
        return self


class ShipmentPage(DTO):
    items: list[Shipment]
    next_cursor: str | None


class ReceiptLine(DTO):
    product_id: UUID
    received_qty: Annotated[int, Field(ge=0, strict=True)]
    damaged_qty: Annotated[int, Field(ge=0, strict=True)]

    @model_validator(mode='after')
    def validate_damage(self):
        if self.damaged_qty > self.received_qty:
            raise ValueError('damaged_qty must not exceed received_qty')
        return self


class ReceiptRequest(DTO):
    expected_version: Annotated[int, Field(ge=1, strict=True)]
    final: Annotated[bool, Field(strict=True)]
    lines: Annotated[list[ReceiptLine], Field(min_length=1, max_length=100)]
    evidence_ids: Annotated[list[UUID], Field(max_length=100)]
    notes: Annotated[str, Field(max_length=2000)]


class ReceiptResult(DTO):
    shipment: Shipment
    expected_qty: Annotated[int, Field(ge=1, strict=True)]
    received_qty: Annotated[int, Field(ge=0, strict=True)]
    good_qty: Annotated[int, Field(ge=0, strict=True)]
    damaged_qty: Annotated[int, Field(ge=0, strict=True)]
    shortage_qty: Annotated[int, Field(ge=0, strict=True)]
    case_ids: list[UUID]
    stock: list['InventoryItem'] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_totals(self):
        if self.good_qty + self.damaged_qty != self.received_qty:
            raise ValueError('Good and damaged quantities must total received')
        if self.shortage_qty != max(0, self.expected_qty - self.received_qty):
            raise ValueError('Shortage must equal expected minus received')
        return self


class PendingAnalysis(DTO):
    job_id: UUID
    case_id: UUID
    status: Literal['pending']


class SMEOption(DTO):
    id: UUID
    name: str


class WarehouseDirectory(DTO):
    warehouse_id: UUID
    name: str
    smes: list[SMEOption]


class WarehouseOverview(DTO):
    warehouse_id: UUID
    unique_skus: Annotated[int, Field(ge=0)]
    inbound_shipments: Annotated[int, Field(ge=0)]
    outbound_shipments: Annotated[int, Field(ge=0)]
    open_cases: Annotated[int, Field(ge=0)]
    as_of: AwareDatetime


class InventoryItem(DTO):
    id: UUID
    warehouse_id: UUID
    sme_id: UUID
    sku: str
    name: str
    available_qty: Annotated[int, Field(ge=0)]
    quarantined_qty: Annotated[int, Field(ge=0)]
    shipment_ids: list[UUID]


class InventoryPage(DTO):
    items: list[InventoryItem]
    next_cursor: str | None


class ShipmentItem(DTO):
    product_id: UUID
    sku: str
    name: str
    expected_qty: Annotated[int, Field(gt=0)]
    received_qty: Annotated[int, Field(ge=0)]
    damaged_qty: Annotated[int, Field(ge=0)]


class ShipmentEvent(DTO):
    id: UUID
    type: str
    notes: str
    verified_at: AwareDatetime
    recorded_at: AwareDatetime
    evidence_ids: list[UUID]


class EvidenceReference(DTO):
    id: UUID
    label: str
    verified: bool


class ShipmentDetail(Shipment):
    items: list[ShipmentItem]
    events: list[ShipmentEvent]
    evidence: list[EvidenceReference]
    allowed_events: list[Literal['picked', 'packed', 'dispatched']]


class ShipmentEventRequest(DTO):
    expected_version: Annotated[int, Field(ge=1, strict=True)]
    type: Literal['picked', 'packed', 'dispatched']
    notes: Annotated[str, Field(min_length=1, max_length=2000)]
    verified_at: AwareDatetime
    evidence_ids: list[UUID]


class CasePage(DTO):
    items: list[CaseSummary]
    next_cursor: str | None


class WarehouseFixture(DTO):
    directory: WarehouseDirectory
    inventory: list[InventoryItem]
    shipments: list[ShipmentDetail]
    cases: list[CaseSummary]


ReceiptResult.model_rebuild()


# These DTOs are published without registering fake business routes on the API.
MODELS = [ErrorResponse, ShipmentPage, ReceiptRequest, ReceiptResult, PendingAnalysis,
          CaseSummary, ApprovalSummary, EventEnvelope, IdentityResponse,
          WarehouseDirectory, WarehouseOverview, InventoryPage, ShipmentDetail,
          ShipmentEventRequest, CasePage, WarehouseFixture]
