"""Verified identity interfaces. Client roles/tenant headers are never authority."""
from dataclasses import dataclass, field
from typing import Literal, Protocol
from uuid import UUID
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from .errors import AppError

Role = Literal['owner', 'staff', 'sme', 'rider']


@dataclass(frozen=True)
class Membership:
    warehouse_id: UUID
    role: Role
    sme_id: UUID | None = None

    def __post_init__(self):
        if self.role not in ('owner', 'staff', 'sme', 'rider') or ((self.role == 'sme') != (self.sme_id is not None)):
            raise ValueError('Invalid membership scope')


@dataclass(frozen=True)
class AuthContext:
    actor_id: UUID
    memberships: tuple[Membership, ...]
    access_token: str = field(repr=False, compare=False)

    def require_staff(self, warehouse_id: UUID) -> None:
        if not any(m.warehouse_id == warehouse_id and m.role in ('owner', 'staff') for m in self.memberships):
            raise AppError(403, 'FORBIDDEN', 'Access denied.')

    def require_tenant_read(self, warehouse_id: UUID, sme_id: UUID) -> None:
        # Riders require a separate current assignment check in their domain service.
        if not any(m.warehouse_id == warehouse_id and
                   (m.role in ('owner', 'staff') or (m.role == 'sme' and m.sme_id == sme_id))
                   for m in self.memberships):
            raise AppError(403, 'FORBIDDEN', 'Access denied.')


class Authenticator(Protocol):
    def verify(self, access_token: str) -> AuthContext: ...


class UnconfiguredAuthenticator:
    def verify(self, access_token: str) -> AuthContext:
        raise AppError(503, 'SERVICE_UNAVAILABLE', 'Authentication is not configured.')


bearer = HTTPBearer(auto_error=False)


def current_identity(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthContext:
    if credentials is None or credentials.scheme.lower() != 'bearer' or not credentials.credentials:
        raise AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
    authenticator: Authenticator = request.app.state.authenticator
    return authenticator.verify(credentials.credentials)
