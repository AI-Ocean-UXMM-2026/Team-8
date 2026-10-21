from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def install_error_handlers(app: FastAPI) -> None:
    def envelope(request: Request, status: int, code: str, message: str):
        headers = {'X-Correlation-ID': str(request.state.correlation_id)}
        if status == 401:
            headers['WWW-Authenticate'] = 'Bearer'
        return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message}}, headers=headers)

    @app.exception_handler(AppError)
    async def application_error(request: Request, exc: AppError):
        return envelope(request, exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, _exc: RequestValidationError):
        # Validation details can contain submitted tokens or sensitive values.
        return envelope(request, 422, 'VALIDATION_ERROR', 'Request validation failed.')

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        codes = {401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND'}
        return envelope(request, exc.status_code, codes.get(exc.status_code, 'HTTP_ERROR'), 'Request could not be completed.')

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, _exc: Exception):
        return envelope(request, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.')
