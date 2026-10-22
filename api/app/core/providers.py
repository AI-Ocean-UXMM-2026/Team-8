"""Server-only provider factories, reserved for authenticated feature services.

User-scoped Supabase clients support configured identity; OpenAI remains unused
until its authorized domain service is implemented.
"""
from .settings import Settings, get_settings


def create_user_client(access_token: str, settings: Settings | None = None):
    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions
    settings = settings or get_settings()
    if not settings.supabase_url or not settings.supabase_public_key:
        raise RuntimeError('Supabase is not configured')
    # Caller token is verified by Auth before the identity is used. Each request
    # receives a distinct client; never mutate global auth state or use service keys.
    if not access_token:
        raise ValueError('A user access token is required')
    return create_client(settings.supabase_url, settings.supabase_public_key,
                         options=SyncClientOptions(headers={'Authorization': f'Bearer {access_token}'},
                                               persist_session=False, auto_refresh_token=False))


def openai_client():
    from openai import OpenAI
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError('OpenAI is not configured')
    return OpenAI(api_key=settings.openai_api_key, timeout=30, max_retries=2)
