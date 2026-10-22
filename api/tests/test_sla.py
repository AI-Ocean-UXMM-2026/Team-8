import unittest
from fastapi.testclient import TestClient
from test_foundation import uid,staff,sme
from app.core.application import create_app
from app.core.auth import AuthContext,Membership
from app.core.settings import Settings
from app.worker import WorkerDatabase
class SLATests(unittest.TestCase):
 def setUp(self):
  self.identity=staff;self.calls=[];self.result={};owner=self
  class Auth:
   def verify(self,token):return owner.identity
  class DB:
   def for_user(self,identity):return self
   def rpc(self,function,params):owner.calls.append((function,params));return owner.result
  self.client=TestClient(create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''),Auth(),DB()))
  self.headers={'Authorization':'Bearer verified','Idempotency-Key':str(uid(7))};self.query=f'?warehouse_id={uid(2)}'
 def test_no_token_and_nonstaff_never_reach_database(self):
  self.assertEqual(self.client.get('/api/sla/policies'+self.query).status_code,401)
  self.identity=sme;self.assertEqual(self.client.get('/api/sla/policies'+self.query,headers=self.headers).status_code,403);self.assertEqual(self.calls,[])
 def test_staff_cannot_change_policy(self):
  response=self.client.post('/api/sla/policies/courier_delay/normal'+self.query,headers=self.headers,json={'expected_revision':0,'first_response_minutes':30,'resolution_minutes':60})
  self.assertEqual(response.status_code,403);self.assertEqual(self.calls,[])
 def test_owner_write_has_scope_revision_and_key(self):
  self.identity=AuthContext(uid(1),(Membership(uid(2),'owner'),),'verified')
  self.result={'case_type':'courier_delay','priority':'normal','first_response_minutes':30,'resolution_minutes':60,'at_risk_percent':80,'revision':1}
  response=self.client.post('/api/sla/policies/courier_delay/normal'+self.query,headers=self.headers,json={'expected_revision':0,'first_response_minutes':30,'resolution_minutes':60})
  self.assertEqual(response.status_code,200);function,params=self.calls[-1];self.assertEqual(function,'sla_policy_write');self.assertEqual(params['p_key'],str(uid(7)));self.assertEqual(params['p_warehouse'],str(uid(2)));self.assertEqual(params['p_body']['expected_revision'],0)
 def test_policy_validation_and_unknown_type(self):
  for body in [{'expected_revision':0,'first_response_minutes':30,'resolution_minutes':20},{'expected_revision':0,'first_response_minutes':1.5,'resolution_minutes':20},{'expected_revision':0,'first_response_minutes':1,'resolution_minutes':20,'at_risk_percent':100}]:
   self.assertEqual(self.client.post('/api/sla/policies/courier_delay/normal'+self.query,headers=self.headers,json=body).status_code,422)
  self.assertEqual(self.client.post('/api/sla/policies/unknown/normal'+self.query,headers=self.headers,json={'expected_revision':0,'first_response_minutes':1,'resolution_minutes':2}).status_code,422);self.assertEqual(self.calls,[])
 def test_filter_validation_and_foreign_warehouse(self):
  for suffix in ['&limit=101','&flag=unknown']:
   self.assertEqual(self.client.get('/api/sla/cases'+self.query+suffix,headers=self.headers).status_code,422)
  self.assertEqual(self.client.get('/api/sla/policies?warehouse_id='+str(uid(999)),headers=self.headers).status_code,403)
 def test_missing_case_is_404_and_invalid_response_note_is_422(self):
  self.result={'items':[],'next_cursor':None,'server_now':'2026-10-22T00:00:00Z'}
  self.assertEqual(self.client.get('/api/sla/cases/'+str(uid(8))+self.query,headers=self.headers).status_code,404)
  self.assertEqual(self.client.post('/api/sla/cases/'+str(uid(8))+'/response'+self.query,headers=self.headers,json={'note':' '}).status_code,422)
 def test_scheduler_function_is_worker_only_and_not_user_allowlisted(self):
  self.assertIn('run_sla_escalations',WorkerDatabase.ALLOWED)
  from app.core.database import SupabaseUserDatabase
  with self.assertRaises(ValueError):SupabaseUserDatabase(None).rpc('run_sla_escalations',{})
