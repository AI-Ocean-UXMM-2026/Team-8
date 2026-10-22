from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Request
from ...core.auth import AuthContext, current_identity
from ...core.errors import AppError
from ..operations.service import call, scope
from .models import CATEGORIES, CategoryOptions, CategoryState, MetadataCommand, AnalyzeCommand, ReviewCommand
from .service import ProductCategorizer, available, model_name

router = APIRouter(prefix='/api',tags=['Stock categorization'])
Identity = Annotated[AuthContext,Depends(current_identity)]
Key = Annotated[UUID,Header(alias='Idempotency-Key')]

def read(request, identity, warehouse, product):
    result=call(request,identity,'product_category_read',{'p_warehouse':warehouse,'p_product':str(product)})
    if result is None: raise AppError(404,'NOT_FOUND','Product was not found in this warehouse.')
    return result

def write(request,identity,warehouse,product,kind,key,body):
    return call(request,identity,'product_category_write',{'p_warehouse':warehouse,'p_product':str(product),
        'p_kind':kind,'p_key':str(key),'p_body':body})

@router.get('/inventory-categories',response_model=CategoryOptions)
def options(request:Request,identity:Identity,warehouse_id:UUID):
    identity.require_staff(warehouse_id)
    settings=request.app.state.settings
    return {'categories':CATEGORIES,'ai_available':available(settings),'provider':settings.categorization_provider,'model':model_name(settings)}

@router.get('/inventory/{product_id}/categorization',response_model=CategoryState)
def detail(product_id:UUID,request:Request,identity:Identity,warehouse_id:UUID):
    return read(request,identity,scope(identity,warehouse_id),product_id)

@router.post('/inventory/{product_id}/categorization/metadata',response_model=CategoryState)
def metadata(product_id:UUID,body:MetadataCommand,request:Request,identity:Identity,key:Key,warehouse_id:UUID):
    return write(request,identity,scope(identity,warehouse_id),product_id,'metadata',key,body.model_dump())

@router.post('/inventory/{product_id}/categorization/analyze',response_model=CategoryState)
def analyze(product_id:UUID,body:AnalyzeCommand,request:Request,identity:Identity,key:Key,warehouse_id:UUID):
    warehouse=scope(identity,warehouse_id)
    # Check a completed command before spending another provider request on a retry.
    cached=call(request,identity,'product_category_retry',{'p_warehouse':warehouse,'p_product':str(product_id),
        'p_key':str(key),'p_revision':body.expected_revision})
    if cached is not None: return cached
    snapshot=read(request,identity,warehouse,product_id)
    if snapshot['revision']!=body.expected_revision:
        raise AppError(409,'STALE_VERSION','Product metadata changed. Reload before classifying.')
    settings=request.app.state.settings
    provider=getattr(request.app.state,'categorizer',None)
    if provider is None:
        if not available(settings):
            raise AppError(503,'AI_NOT_CONFIGURED','AI categorization is not configured. Manual verification is available.')
        provider=ProductCategorizer(settings)
    try:
        suggestion=provider.classify(snapshot)
    except AppError: raise
    except Exception:
        raise AppError(503,'AI_UNAVAILABLE','AI categorization is unavailable. Retry or categorize manually.') from None
    return write(request,identity,warehouse,product_id,'analyze',key,
        {'expected_revision':body.expected_revision,'suggestion':suggestion})

@router.post('/inventory/{product_id}/categorization/review',response_model=CategoryState)
def review(product_id:UUID,body:ReviewCommand,request:Request,identity:Identity,key:Key,warehouse_id:UUID):
    return write(request,identity,scope(identity,warehouse_id),product_id,'review',key,body.model_dump())
