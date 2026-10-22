import copy
import unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from pydantic import ValidationError
from test_foundation import uid, staff, sme
from app.core.application import create_app
from app.core.settings import Settings
from app.features.categorization.models import Suggestion
from app.features.categorization.service import ProductCategorizer, missing_attributes
from unittest.mock import patch
import httpx
import json

class CategorizationTests(unittest.TestCase):
 def setUp(self):
  self.identity=staff; self.calls=[]; self.cached=None; self.provider_calls=0; owner=self
  self.snapshot={'product_id':str(uid(8)),'warehouse_id':str(uid(2)),'sme_id':str(uid(4)),
   'name':'Tea box','sku':'TEA','revision':1,'metadata':{'description':'Black tea bags','material':'Tea leaves','intended_use':'Drinking','storage_notes':''},
   'suggestion':None,'category':None,'status':'pending','review_note':None,'reviewed_by':None,'reviewed_at':None,'updated_at':None}
  class Auth:
   def verify(self,token):return owner.identity
  class Database:
   def for_user(self,identity):return self
   def rpc(self,function,params):
    owner.calls.append((function,params))
    if function=='product_category_retry':return owner.cached
    if function=='product_category_read':return owner.snapshot
    return {**owner.snapshot,'revision':2,'suggestion':params['p_body'].get('suggestion')}
  self.app=create_app(Settings(_env_file=None,supabase_url='',supabase_public_key='',groq_api_key=''),Auth(),Database())
  self.client=TestClient(self.app);self.headers={'Authorization':'Bearer verified','Idempotency-Key':str(uid(9))}
  self.url=f'/api/inventory/{uid(8)}/categorization';self.query=f'?warehouse_id={uid(2)}'
 def post(self,kind,body):return self.client.post(self.url+'/'+kind+self.query,json=body,headers=self.headers)
 def provider(self,result=None,error=None):
  owner=self
  class Provider:
   def classify(self,snapshot):
    owner.provider_calls+=1
    if error:raise error
    return result or {'category':'food_beverages','confidence':0.9,'rationale':'Tea is a beverage','uncertain_attributes':[], 'missing_attributes':['storage_notes'],'model':'test-double','requires_review':True}
  self.app.state.categorizer=Provider()
 def test_auth_scope_and_missing_key(self):
  self.assertEqual(self.client.get(self.url+self.query).status_code,401)
  self.identity=sme
  self.assertEqual(self.post('analyze',{'expected_revision':1}).status_code,403)
  self.assertEqual(self.calls,[])
 def test_unconfigured_allows_metadata_and_manual_review(self):
  self.assertEqual(self.post('analyze',{'expected_revision':1}).status_code,503)
  response=self.post('metadata',{'expected_revision':1,'description':'Tea'})
  self.assertEqual(response.status_code,200)
  self.assertEqual(self.calls[-1][1]['p_body']['material'],'')
  self.assertEqual(self.post('review',{'expected_revision':1,'category':'other','note':'Package checked','acknowledge_flags':True}).status_code,200)
 def test_success_and_completed_retry_does_not_call_provider(self):
  self.provider();result=self.post('analyze',{'expected_revision':1})
  self.assertEqual(result.status_code,200);self.assertEqual(result.json()['suggestion']['missing_attributes'],['storage_notes'])
  self.cached=result.json();self.assertEqual(self.post('analyze',{'expected_revision':1}).json(),self.cached);self.assertEqual(self.provider_calls,1)
 def test_stale_snapshot_prevents_provider_call(self):
  self.provider();self.assertEqual(self.post('analyze',{'expected_revision':0}).status_code,409);self.assertEqual(self.provider_calls,0)
 def test_provider_failure_does_not_persist_or_expose_details(self):
  self.provider(error=TimeoutError('secret provider response'))
  result=self.post('analyze',{'expected_revision':1});self.assertEqual(result.status_code,503)
  self.assertNotIn('secret',result.text);self.assertFalse(any(f=='product_category_write' for f,_ in self.calls))
 def test_bounded_input_and_allowlisted_categories(self):
  self.assertEqual(self.post('metadata',{'expected_revision':1,'description':'a'*2001}).status_code,422)
  self.assertEqual(self.post('review',{'expected_revision':1,'category':'invented','note':'test note'}).status_code,422)
  self.assertEqual(self.post('metadata',{'expected_revision':1,'unexpected':'field'}).status_code,422)
 def test_real_provider_adapter_bounds_payload_and_flags_missing(self):
  provider=ProductCategorizer(Settings(_env_file=None,groq_api_key='fake-key'))
  captured={}
  def send(_client,url,**kwargs):
   captured.update(kwargs);captured['url']=url
   output={'category':'food_beverages','confidence':0.8,'rationale':'Tea','uncertain_attributes':['material','material']}
   return httpx.Response(200,request=httpx.Request('POST',url),json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(output)}}]})
  with patch('httpx.Client.post',send):result=provider.classify(self.snapshot)
  self.assertEqual(result['uncertain_attributes'],['material']);self.assertEqual(result['missing_attributes'],['storage_notes'])
  payload=captured['json'];self.assertNotIn('warehouse_id',str(payload));self.assertNotIn('sku',str(payload));self.assertIn('untrusted',payload['messages'][0]['content'])
  self.assertEqual(captured['url'],'https://api.groq.com/openai/v1/chat/completions');self.assertTrue(payload['response_format']['json_schema']['strict'])
 def test_free_quota_error_is_actionable(self):
  provider=ProductCategorizer(Settings(_env_file=None,groq_api_key='fake-key'))
  with patch('httpx.Client.post',return_value=httpx.Response(429)):
   from app.core.errors import AppError
   with self.assertRaises(AppError) as result:provider.classify(self.snapshot)
   self.assertEqual(result.exception.code,'AI_RATE_LIMIT')
 def test_local_ollama_uses_no_api_key_and_validates_json(self):
  provider=ProductCategorizer(Settings(_env_file=None,categorization_provider='ollama'))
  captured={}
  def send(_client,url,**kwargs):
   captured.update(kwargs);captured['url']=url
   return httpx.Response(200,request=httpx.Request('POST',url),json={'done':True,'message':{'content':json.dumps({'category':'home_kitchen','confidence':0.7,'rationale':'Mug','uncertain_attributes':[]})}})
  with patch('httpx.Client.post',send):self.assertEqual(provider.classify(self.snapshot)['category'],'home_kitchen')
  self.assertNotIn('headers',captured);self.assertEqual(captured['url'],'http://127.0.0.1:11434/api/chat')
 def test_invalid_confidence_and_blank_rationale(self):
  for confidence in [-1,1.2,float('nan')]:
   with self.assertRaises(ValidationError):Suggestion(category='other',confidence=confidence,rationale='unknown',uncertain_attributes=[])
  with self.assertRaises(ValidationError):Suggestion(category='other',confidence=0.1,rationale=' ',uncertain_attributes=[])
