from uuid import UUID
from .auth import AuthContext, Membership
from .errors import AppError


class SupabaseAuthenticator:
    def __init__(self, create_user_client):
        self._create_user_client = create_user_client

    def verify(self, access_token: str) -> AuthContext:
        # Auth server verifies signature/expiry/revocation. Never decode an unverified JWT.
        client = self._create_user_client(access_token)
        try:
            response = client.auth.get_user(access_token)
        except Exception as exc:
            status = getattr(exc, 'status', None)
            if str(status) in ('400', '401', '403', '422'):
                raise AppError(401, 'UNAUTHENTICATED', 'Session is invalid or expired.') from None
            raise AppError(503, 'SERVICE_UNAVAILABLE', 'Authentication is temporarily unavailable.') from None
        if not response.user:
            raise AppError(401, 'UNAUTHENTICATED', 'Session is invalid or expired.')
        try:
            actor = UUID(str(response.user.id))
            rows = client.table('memberships').select('warehouse_id,sme_id,role').eq('profile_id', str(actor)).eq('active', True).execute().data
            memberships = tuple(Membership(warehouse_id=UUID(row['warehouse_id']), role=row['role'],
                                           sme_id=UUID(row['sme_id']) if row['sme_id'] else None) for row in rows)
        except Exception:
            raise AppError(503, 'SERVICE_UNAVAILABLE', 'Membership lookup is temporarily unavailable.') from None
        if not memberships:
            raise AppError(403, 'FORBIDDEN', 'No active membership.')
        return AuthContext(actor, memberships, access_token)
