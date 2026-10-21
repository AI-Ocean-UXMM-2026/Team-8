"""Request-local Supabase access. Every database/storage call carries the user's JWT.

No general service-role factory exists. Trusted maintenance runs separately using
the narrowly granted SQL worker role; HTTP callers cannot select that role.
"""
import base64
import json
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .settings import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


def public_key(settings: Settings) -> str:
    key = settings.supabase_publishable_key or settings.supabase_public_key
    if not key or not settings.supabase_url:
        raise HTTPException(503, 'Supabase user access is not configured')
    if key.startswith('sb_publishable_'):
        return key
    try:
        payload = key.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if claims.get('role') == 'anon':
            return key
    except (ValueError, IndexError, TypeError):
        pass
    raise HTTPException(503, 'A Supabase publishable or anon key is required')


@dataclass(frozen=True)
class UserDatabase:
    http: httpx.Client
    correlation_id: str

    def call(self, method: str, path: str, **kwargs):
        try:
            response = self.http.request(method, path, **kwargs)
        except httpx.RequestError:
            raise HTTPException(503, 'Supabase is unavailable') from None
        if response.is_error:
            # Do not return upstream bodies: they may contain SQL, tokens or PII.
            status = response.status_code
            if path == '/auth/v1/user' and 400 <= status < 500 and status != 429:
                raise HTTPException(401, 'Invalid or expired session', headers={'WWW-Authenticate': 'Bearer'})
            if status == 401:
                raise HTTPException(401, 'Invalid or expired session', headers={'WWW-Authenticate': 'Bearer'})
            if status in (403, 404):
                raise HTTPException(404, 'Resource unavailable')
            if status == 409:
                raise HTTPException(409, 'Operation conflicts with current state')
            if status in (400, 422):
                raise HTTPException(422, 'Request rejected by database or storage policy')
            raise HTTPException(503, 'Supabase request failed')
        try:
            return response.json() if response.content else None
        except ValueError:
            raise HTTPException(503, 'Invalid Supabase response') from None

    def rows(self, table: str, **filters):
        return self.call('GET', f'/rest/v1/{table}', params=filters)

    def rpc(self, command: str, arguments: dict):
        return self.call('POST', f'/rest/v1/rpc/{command}', json=arguments)


@dataclass(frozen=True)
class Identity:
    user_id: str
    memberships: list[dict]
    database: UserDatabase


def user_database(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise HTTPException(401, 'Bearer session required', headers={'WWW-Authenticate': 'Bearer'})
    with httpx.Client(
        base_url=settings.supabase_url, timeout=15, follow_redirects=False,
        headers={'apikey': public_key(settings), 'Authorization': f'Bearer {credentials.credentials}',
                 'X-Correlation-ID': str(request.state.correlation_id)},
    ) as client:
        yield UserDatabase(client, str(request.state.correlation_id))


def identity(database: Annotated[UserDatabase, Depends(user_database)]) -> Identity:
    # Auth server verification, never unverified JWT claims or user_metadata roles.
    user = database.call('GET', '/auth/v1/user')
    try:
        user_id = str(UUID(user['id']))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(401, 'Invalid session identity') from None
    memberships = database.rows('memberships', select='id,warehouse_id,sme_id,role',
                                profile_id=f'eq.{user_id}', active='eq.true')
    if not memberships:
        raise HTTPException(403, 'Active membership required')
    return Identity(user_id, memberships, database)


CurrentIdentity = Annotated[Identity, Depends(identity)]
