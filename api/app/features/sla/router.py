from typing import Annotated,Literal
from uuid import UUID
from fastapi import APIRouter,Depends,Header,Request,Query
from ...core.auth import AuthContext,current_identity
from ...core.errors import AppError
from ..operations.service import call,scope
from .models import SLACommand,SLAResponseCommand,SLAPolicies,SLAPolicy,CaseSLA,SLAPage,CaseType,Priority
router=APIRouter(prefix='/api/sla',tags=['SLA policies'])
Identity=Annotated[AuthContext,Depends(current_identity)]
Key=Annotated[UUID,Header(alias='Idempotency-Key')]
@router.get('/policies',response_model=SLAPolicies)
def policies(request:Request,identity:Identity,warehouse_id:UUID):
 return call(request,identity,'sla_policies_read',{'p_warehouse':scope(identity,warehouse_id)})
@router.post('/policies/{case_type}/{priority}',response_model=SLAPolicy)
def save(case_type:CaseType,priority:Priority,body:SLACommand,request:Request,identity:Identity,key:Key,warehouse_id:UUID):
 warehouse=scope(identity,warehouse_id)
 if not any(m.warehouse_id==warehouse_id and m.role=='owner' for m in identity.memberships):raise AppError(403,'FORBIDDEN','Only warehouse managers can change SLA policies.')
 return call(request,identity,'sla_policy_write',{'p_warehouse':warehouse,'p_type':case_type,'p_priority':priority,'p_key':str(key),'p_body':body.model_dump()})
@router.get('/cases',response_model=SLAPage)
def cases(request:Request,identity:Identity,warehouse_id:UUID,cursor:UUID|None=None,limit:Annotated[int,Query(ge=1,le=100)]=25,
 flag:Literal['all','at_risk','overdue','escalated']='all',include_closed:bool=False):
 return call(request,identity,'sla_cases_read',{'p_warehouse':scope(identity,warehouse_id),'p_case':None,'p_cursor':str(cursor) if cursor else None,'p_limit':limit,'p_flag':flag,'p_include_closed':include_closed})
@router.get('/cases/{case_id}',response_model=CaseSLA)
def detail(case_id:UUID,request:Request,identity:Identity,warehouse_id:UUID):
 result=call(request,identity,'sla_cases_read',{'p_warehouse':scope(identity,warehouse_id),'p_case':str(case_id),'p_cursor':None,'p_limit':1,'p_flag':'all','p_include_closed':True})
 if not result['items']:raise AppError(404,'NOT_FOUND','Case was not found in this warehouse.')
 return result['items'][0]
@router.post('/cases/{case_id}/response',response_model=CaseSLA)
def respond(case_id:UUID,body:SLAResponseCommand,request:Request,identity:Identity,key:Key,warehouse_id:UUID):
 return call(request,identity,'sla_response',{'p_warehouse':scope(identity,warehouse_id),'p_case':str(case_id),'p_key':str(key),'p_note':body.note})
