"""Deterministic V4 foundation guards, called with authorized stored facts only."""
import json
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID
from ...core.auth import AuthContext
from ...core.errors import AppError

POLICY = json.loads((Path(__file__).resolve().parents[4] / 'contracts/policies/v1.json').read_text(encoding='utf-8'))
PRIORITIES = ('low', 'normal', 'high', 'critical')


@dataclass(frozen=True)
class PriorityResult:
    priority: str | None
    pending: bool
    policy_version: int = 1


def classify_priority(amount_mmk: int | None, categories: tuple[str, ...] = ()) -> PriorityResult:
    minimum = max((PRIORITIES.index(POLICY['category_minimums'].get(c, 'low')) for c in categories), default=0)
    if amount_mmk is None:
        return PriorityResult(PRIORITIES[minimum] if minimum else None, True)
    if type(amount_mmk) is not int or amount_mmk < 0:
        raise AppError(422, 'VALIDATION_ERROR', 'Impact amount must be a nonnegative integer MMK value.')
    thresholds = POLICY['priority_thresholds']
    level = sum(amount_mmk >= thresholds[name] for name in PRIORITIES[1:])
    return PriorityResult(PRIORITIES[max(minimum, level)], False)


def require_allowed_action(action: str) -> None:
    if action not in POLICY['allowed_actions']:
        raise AppError(422, 'VALIDATION_ERROR', 'Action is not permitted by this policy.')


def require_verified_closure(*, identity: AuthContext, warehouse_id: UUID, case_type: str,
                             verified_facts: dict[str, UUID], pending_mandatory_actions: int,
                             source_version: int, expected_version: int,
                             sme_decision: str | None = None) -> None:
    """Facts must be loaded from same-case verified records, never request booleans.

    This is a policy guard, not the closure API or an evidence-verification service.
    Domain services still resolve evidence ownership/verification and commit closure.
    """
    identity.require_staff(warehouse_id)
    if source_version != expected_version:
        raise AppError(409, 'STALE_VERSION', 'Refresh the case before closing.')
    required = POLICY['closure_evidence'].get(case_type)
    if required is None:
        raise AppError(422, 'VALIDATION_ERROR', 'Unknown case type.')
    missing = set(required) - {name for name, reference in verified_facts.items() if isinstance(reference, UUID)}
    if sme_decision == 'await_remainder' and not isinstance(verified_facts.get('remainder_completed'), UUID):
        missing.add('remainder_completed')
    if 'sme_decision_recorded' in required and sme_decision not in ('accept_partial', 'await_remainder'):
        missing.add('accepted_sme_decision')
    if missing or pending_mandatory_actions != 0:
        raise AppError(409, 'CLOSURE_PENDING', 'Required verified outcomes or actions are still pending.')
