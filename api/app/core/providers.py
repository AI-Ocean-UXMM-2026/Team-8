"""Server-only provider factories, reserved for authenticated feature services.

Not exposed by any public route, and never called in demo mode.
"""
from openai import OpenAI
from supabase import Client, create_client
from .settings import get_settings


def supabase_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError('Supabase is not configured')
    return create_client(settings.supabase_url, settings.supabase_key)


def openai_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError('OpenAI is not configured')
    return OpenAI(api_key=settings.openai_api_key, timeout=30, max_retries=2)
