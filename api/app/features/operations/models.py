"""Input and output contracts for warehouse commands."""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field, model_validator
from ...contracts import DTO, InventoryItem


class CreateLine(DTO):
    product_id: UUID
    expected_qty: Annotated[int, Field(gt=0, strict=True)]


class CreateShipment(DTO):
    sme_id: UUID
    reference: Annotated[str, Field(min_length=1, max_length=120)]
    direction: Literal['inbound', 'outbound']
    delivery_mode: Literal['in_house', 'third_party'] | None
    lines: Annotated[list[CreateLine], Field(min_length=1, max_length=100)]

    @model_validator(mode='after')
    def valid_mode(self):
        if (self.direction == 'inbound') != (self.delivery_mode is None):
            raise ValueError('Invalid direction/mode')
        return self


class StockCorrection(DTO):
    expected_version: Annotated[int, Field(ge=1, strict=True)]
    available_delta: Annotated[int, Field(strict=True)]
    quarantined_delta: Annotated[int, Field(strict=True)]
    notes: Annotated[str, Field(min_length=1, max_length=2000)]
    evidence_ids: Annotated[list[UUID], Field(min_length=1, max_length=100)]


class StockResult(DTO):
    product: InventoryItem
    version: int
