"""Shared transaction boundary for future domain repositories.

Never send notifications or call providers before this unit of work commits.
Existing Supabase RPCs already write audit/outbox inside their SQL transaction.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import ContextManager, Protocol
from uuid import UUID


@dataclass(frozen=True)
class AuditRecord:
    warehouse_id: UUID
    sme_id: UUID | None
    entity_id: UUID
    actor_id: UUID
    action: str
    correlation_id: UUID
    occurred_at: datetime
    details: dict


@dataclass(frozen=True)
class OutboxEvent:
    event_id: UUID
    warehouse_id: UUID
    sme_id: UUID
    entity_id: UUID
    actor_id: UUID
    event_type: str
    correlation_id: UUID
    occurred_at: datetime
    idempotency_key: UUID
    payload: dict
    schema_version: int = 1


class AuditWriter(Protocol):
    def append_audit(self, record: AuditRecord) -> None: ...


class OutboxWriter(Protocol):
    def append_event(self, event: OutboxEvent) -> None: ...


class Transaction(AuditWriter, OutboxWriter, Protocol):
    """Domain writes and both append calls use this same transaction connection."""
    def execute(self, statement: str, parameters: tuple) -> object: ...


class UnitOfWork(Protocol):
    """Commit on context success; rollback every write on any exception.

    Direct-connection repositories must supply an implementation before use.
    Do not implement these as three independent PostgREST writes.
    """
    def transaction(self) -> ContextManager[Transaction]: ...
