import unittest
from types import SimpleNamespace
from uuid import UUID
from fastapi.testclient import TestClient
from app.core.application import create_app
from app.core.settings import Settings
from app.core.user_access import identity

class BusinessTests(unittest.TestCase):
    def test_business_name_is_scoped_to_authorized_sme(self):
        w='10000000-0000-4000-8000-000000000001'
        s='20000000-0000-4000-8000-000000000001'
        calls=[]
        class DB:
            def rows(self,table,**filters):
                calls.append((table,filters))
                return [{'id':s,'warehouse_id':w,'name':'Golden Bloom'}]
        app=create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''))
        app.dependency_overrides[identity]=lambda:SimpleNamespace(memberships=[{'warehouse_id':w,'sme_id':s,'role':'sme'}],database=DB())
        client=TestClient(app)
        result=client.get(f'/api/sme/business?warehouse_id={w}&sme_id={s}')
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['name'],'Golden Bloom')
        self.assertEqual(calls[0][1]['id'],f'eq.{s}')
        self.assertEqual(calls[0][1]['warehouse_id'],f'eq.{w}')
        self.assertEqual(client.get(f'/api/sme/business?warehouse_id={w}&sme_id=20000000-0000-4000-8000-000000000002').status_code,403)
        self.assertEqual(len(calls),1)
