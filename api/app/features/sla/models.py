from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from ..exceptions.models import CaseReport
CaseType=CaseReport.model_fields['type'].annotation
Priority=Literal['low','normal','high','critical']
class SLACommand(BaseModel):
 model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
 expected_revision:int=Field(ge=0,strict=True)
 first_response_minutes:int=Field(ge=1,le=43200,strict=True)
 resolution_minutes:int=Field(ge=1,le=43200,strict=True)
 at_risk_percent:int=Field(default=80,ge=50,le=99,strict=True)
 @model_validator(mode='after')
 def ordered(self):
  if self.resolution_minutes<self.first_response_minutes:raise ValueError('Resolution must not precede response')
  return self
class SLAResponseCommand(BaseModel):
 model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
 note:str=Field(min_length=5,max_length=1000)
class SLAPolicy(BaseModel):
 case_type:CaseType
 priority:Priority
 first_response_minutes:int
 resolution_minutes:int
 at_risk_percent:int
 revision:int
class SLAPolicies(BaseModel):
 policies:list[SLAPolicy]
 can_edit:bool
 manager_count:int
 scheduler_last_run:str|None
 server_now:str
class CaseSLA(BaseModel):
 case_id:UUID
 warehouse_id:UUID
 type:CaseType
 priority:Priority
 summary:str
 case_status:str
 started_at:str
 first_response_due_at:str
 resolution_due_at:str
 first_response_at:str|None
 resolved_at:str|None
 first_response_flag:Literal['on_track','at_risk','overdue','met','breached','not_required']
 resolution_flag:Literal['on_track','at_risk','overdue','met','breached']
 first_response_minutes:int
 resolution_minutes:int
 at_risk_percent:int
 policy_revision:int
 response_escalated_at:str|None
 resolution_escalated_at:str|None
 manager_id:UUID|None
 server_now:str
class SLAPage(BaseModel):
 items:list[CaseSLA]
 next_cursor:UUID|None
 server_now:str
