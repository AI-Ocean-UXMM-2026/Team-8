from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Request
from ...core.auth import AuthContext, current_identity
from ..operations.service import call
from .models import CaseAction, CaseCommand, CaseDetail, CaseReport, CaseReview, Decision, Verification, CaseRiskCommand

router = APIRouter(prefix='/api', tags=['Cases and decisions'])
Identity = Annotated[AuthContext, Depends(current_identity)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]


def mutate(request, identity, kind, entity, key, body):
    return call(request, identity, 'case_command', {'p_kind': kind, 'p_entity': str(entity),
        'p_key': str(key), 'p_body': body.model_dump(mode='json', exclude={'shipment_id'}),
        'p_correlation': str(request.state.correlation_id)})


@router.post('/exceptions', response_model=CaseDetail, status_code=201, operation_id='reportException')
def report(body: CaseReport, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'report', body.shipment_id, key, body)


@router.get('/exceptions/{case_id}', response_model=CaseDetail, operation_id='getException')
def detail(case_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'case_read', {'p_case': str(case_id)})


@router.post('/exceptions/{case_id}/actions', response_model=CaseDetail, operation_id='actOnException')
def action(case_id: UUID, body: CaseAction, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'action', case_id, key, body)


@router.post('/exceptions/{case_id}/verifications', response_model=CaseDetail, operation_id='verifyExceptionFact')
def verify(case_id: UUID, body: Verification, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'verify', case_id, key, body)


@router.post('/exceptions/{case_id}/review', response_model=CaseDetail, operation_id='reviewException')
def review(case_id: UUID, body: CaseReview, request: Request, identity: Identity, key: Key):
    return call(request, identity, 'review_case', {'p_case': str(case_id), 'p_key': str(key),
        'p_body': body.model_dump(mode='json'), 'p_correlation': str(request.state.correlation_id)})


@router.post('/exceptions/{case_id}/risk', response_model=CaseDetail, operation_id='updateExceptionRisk')
def risk(case_id: UUID, body: CaseRiskCommand, request: Request, identity: Identity, key: Key):
    return call(request, identity, 'case_risk_command', {'p_case': str(case_id), 'p_key': str(key),
        'p_body': body.model_dump(mode='json'), 'p_correlation': str(request.state.correlation_id)})


@router.post('/exceptions/{case_id}/close', response_model=CaseDetail, operation_id='closeException')
def close(case_id: UUID, body: CaseCommand, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'close', case_id, key, body)


@router.post('/exceptions/{case_id}/information', response_model=CaseDetail, operation_id='provideExceptionInformation')
def information(case_id: UUID, body: CaseCommand, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'information', case_id, key, body)


@router.post('/exceptions/{case_id}/analyze', response_model=CaseDetail, status_code=202, operation_id='analyzeException')
def analyze(case_id: UUID, body: CaseCommand, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'analyze', case_id, key, body)


@router.post('/approvals/{approval_id}/decision', response_model=CaseDetail, operation_id='decideApproval')
def decide(approval_id: UUID, body: Decision, request: Request, identity: Identity, key: Key):
    return mutate(request, identity, 'decision', approval_id, key, body)


@router.get('/sme/overview', response_model=dict, operation_id='smeOverview')
def overview(sme_id: UUID, request: Request, identity: Identity):
    return call(request, identity, 'tenant_feed', {'p_kind': 'overview', 'p_sme': str(sme_id)})


@router.get('/notifications', response_model=list[dict], operation_id='listNotifications')
def notifications(request: Request, identity: Identity, sme_id: UUID | None = None):
    return call(request, identity, 'tenant_feed', {'p_kind': 'notifications', 'p_sme': str(sme_id) if sme_id else None})


@router.post('/notifications/{notification_id}/read', status_code=204, operation_id='readNotification')
def read_notification(notification_id: UUID, request: Request, identity: Identity):
    call(request, identity, 'mark_notification_read', {'p_notification': str(notification_id)})


@router.post('/notifications/{notification_id}/unread', status_code=204, operation_id='unreadNotification')
def unread_notification(notification_id: UUID, request: Request, identity: Identity):
    call(request, identity, 'mark_notification_unread', {'p_notification': str(notification_id)})
