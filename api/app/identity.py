from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from uuid import UUID
from .core.user_access import CurrentIdentity

router = APIRouter(prefix='/api', tags=['identity'])


class Membership(BaseModel):
    id: UUID
    warehouse_id: UUID
    sme_id: UUID | None
    role: Literal['owner', 'staff', 'sme', 'rider']


class Profile(BaseModel):
    id: UUID
    display_name: str


class Me(BaseModel):
    user_id: UUID
    profile: Profile | None
    memberships: list[Membership]


@router.get('/profile', response_model=Me)
def me(actor: CurrentIdentity):
    profiles = actor.database.rows('profiles', select='id,display_name', id=f'eq.{actor.user_id}')
    return {'user_id': actor.user_id, 'profile': profiles[0] if profiles else None,
            'memberships': actor.memberships}


class SMEBusiness(BaseModel):
    id: UUID
    warehouse_id: UUID
    name: str


@router.get('/sme/business', response_model=SMEBusiness, operation_id='smeBusiness')
def sme_business(actor: CurrentIdentity, warehouse_id: UUID, sme_id: UUID):
    allowed = any(str(m.get('warehouse_id')) == str(warehouse_id) and
                  (m.get('role') in ('owner', 'staff') or (m.get('role') == 'sme' and str(m.get('sme_id')) == str(sme_id)))
                  for m in actor.memberships)
    if not allowed:
        raise HTTPException(403, 'Access denied')
    rows = actor.database.rows('smes', select='id,warehouse_id,name', id=f'eq.{sme_id}', warehouse_id=f'eq.{warehouse_id}', limit='1')
    if not rows:
        raise HTTPException(404, 'SME business unavailable')
    return rows[0]
