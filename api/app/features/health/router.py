from fastapi import APIRouter

router = APIRouter(tags=['health'])


@router.get('/health')
def health() -> dict:
    return {'status': 'ok', 'service': 'parcelcare-api', 'mode': 'demo', 'live_integrations': False}
