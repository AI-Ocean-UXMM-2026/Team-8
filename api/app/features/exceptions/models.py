"""Case commands keep human decisions, urgency and physical verification separate."""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import AwareDatetime, Field
from ...contracts import DTO, CaseSummary

Note = Annotated[str, Field(min_length=1, max_length=2000)]
Version = Annotated[int, Field(ge=1, strict=True)]
Action = Literal['save_summary', 'notify_sme', 'request_information', 'request_sme_decision',
                 'propose_correction', 'escalate', 'update_workflow']


class CaseReport(DTO):
    shipment_id: UUID
    stage: Literal['inbound', 'warehouse', 'outbound']
    type: CaseSummary.model_fields['type'].annotation
    note: Note
    evidence_ids: Annotated[list[UUID], Field(max_length=100)] = []


class CaseCommand(DTO):
    expected_version: Version
    source_version: Annotated[str, Field(min_length=1, max_length=100)]
    note: Note
    evidence_ids: Annotated[list[UUID], Field(max_length=100)] = []


class CaseAction(CaseCommand):
    action: Action
    policy_version: Version
    status: Literal['investigating', 'processing', 'awaiting_information',
                    'awaiting_courier_confirmation', 'awaiting_verification'] | None = None


class Verification(CaseCommand):
    fact: Annotated[str, Field(min_length=1, max_length=100)]
    evidence_ids: Annotated[list[UUID], Field(min_length=1, max_length=100)]


class Decision(DTO):
    decision: Literal['accept_partial', 'await_remainder', 'reject', 'propose_retry', 'accept']
    note: Note
    preferred_at: AwareDatetime | None = None
    request_version: Version | None = None


class CaseReview(CaseCommand):
    kind: Literal['owner', 'responsibility']
    owner_id: UUID | None = None
    responsible_party: Literal['WAREHOUSE', 'THIRD_PARTY_COURIER', 'UNDETERMINED'] = 'UNDETERMINED'
    basis: Annotated[str, Field(max_length=4000)] = ''


class CaseDetail(DTO):
    # The database projects authorized domain records, never arbitrary tables.
    id: UUID
    shipment_id: UUID
    warehouse_id: UUID
    sme_id: UUID
    stage: str
    type: str
    priority: str
    status: str
    handling_mode: str
    owner_id: UUID | None
    responsible_party: str
    responsibility_basis: str | None
    summary: str
    resolution_note: str | None
    verified_by: UUID | None
    verified_at: AwareDatetime | None
    created_at: AwareDatetime
    closed_at: AwareDatetime | None
    version: int
    source_version: str
    required_facts: list[str]
    events: list[dict]
    verifications: list[dict]
    approvals: list[dict]
    analyses: list[dict]
    jobs: list[dict]
    actions: list[dict]
    evidence: list[dict]
    job_id: UUID | None = None
    policy_version: int = 1
    allowed_actions: list[str] = []
