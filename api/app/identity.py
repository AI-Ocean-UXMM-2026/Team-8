from fastapi import APIRouter
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
