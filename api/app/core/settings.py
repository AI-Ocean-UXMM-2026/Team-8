from functools import lru_cache
import base64
import json
from urllib.parse import urlparse
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    supabase_url: str = ''
    supabase_key: str = ''
    supabase_public_key: str = ''
    cors_origins: list[str] = []
    openai_api_key: str = ''
    openai_model: str = ''

    @field_validator('supabase_public_key')
    @classmethod
    def public_key_only(cls, value: str) -> str:
        if not value or value.startswith('sb_publishable_'):
            return value
        # Configuration classification only, not JWT identity verification.
        try:
            encoded = value.split('.')[1]
            payload = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
            if payload.get('role') == 'anon':
                return value
        except (ValueError, IndexError, TypeError):
            pass
        raise ValueError('SUPABASE_PUBLIC_KEY must be a publishable or legacy anon key')

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, values: list[str]) -> list[str]:
        for value in values:
            url = urlparse(value)
            if url.scheme not in ('http', 'https') or not url.netloc or url.path or url.query or url.fragment or url.username or url.password:
                raise ValueError('CORS origins must be explicit HTTP(S) origins without paths')
        return values


@lru_cache
def get_settings() -> Settings:
    return Settings()
