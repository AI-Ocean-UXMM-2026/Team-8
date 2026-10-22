from fastapi import APIRouter
from .features.health.router import router as health
from .features.identity.router import router as identity
from .features.operations.router import router as operations
from .features.exceptions.router import router as exceptions
from .features.deliveries.router import router as deliveries

router = APIRouter()
router.include_router(health)
router.include_router(identity)
router.include_router(operations)
router.include_router(exceptions)
router.include_router(deliveries)

from .features.categorization.router import router as categorization
router.include_router(categorization)

from .features.sla.router import router as sla
router.include_router(sla)
