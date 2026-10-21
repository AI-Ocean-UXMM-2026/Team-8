from fastapi import APIRouter
from .features.health.router import router as health
from .features.identity.router import router as identity

router = APIRouter()
router.include_router(health)
router.include_router(identity)
