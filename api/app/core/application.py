from uuid import UUID, uuid4
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .auth import Authenticator, UnconfiguredAuthenticator
from .errors import install_error_handlers
from .settings import Settings, get_settings
from ..routers import router


def create_app(settings: Settings | None = None, authenticator: Authenticator | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title='ParcelCare API', version='0.3.0')
    if authenticator is None and settings.supabase_url and settings.supabase_public_key:
        from .providers import create_user_client
        from .supabase_auth import SupabaseAuthenticator
        authenticator = SupabaseAuthenticator(lambda token: create_user_client(token, settings))
    app.state.authenticator = authenticator or UnconfiguredAuthenticator()
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Correlation-ID'],
                           expose_headers=['X-Correlation-ID'], allow_credentials=False)

    @app.middleware('http')
    async def correlation(request: Request, call_next):
        try:
            correlation_id = UUID(request.headers.get('X-Correlation-ID', ''))
        except ValueError:
            correlation_id = uuid4()
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers['X-Correlation-ID'] = str(correlation_id)
        return response

    install_error_handlers(app)
    app.include_router(router)
    return app
