from fastapi import APIRouter, Depends
from ...core.auth import AuthContext, current_identity
from ...contracts import IdentityResponse, MembershipDTO, ErrorResponse

router = APIRouter(prefix='/api', tags=['identity'])


@router.get('/me', response_model=IdentityResponse, operation_id='getIdentity',
            responses={code: {'model': ErrorResponse} for code in (401, 403, 503)})
def me(identity: AuthContext = Depends(current_identity)) -> IdentityResponse:
    return IdentityResponse(actor_id=identity.actor_id, memberships=[MembershipDTO(
        warehouse_id=m.warehouse_id, role=m.role, sme_id=m.sme_id) for m in identity.memberships])
