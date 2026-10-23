import unittest
from test_foundation import staff, sme, uid
from fastapi.testclient import TestClient
from app.core.application import create_app
from app.core.settings import Settings

class ShipmentExceptionsTests(unittest.TestCase):
    def test_filters_and_scope(self):
        calls=[]
        class Auth:
            def verify(self,token):return staff if token=='staff' else sme
        class DB:
            def for_user(self,identity):return self
            def rpc(self,name,params):
                calls.append((name,params));return {'items':[],'next_cursor':None}
        client=TestClient(create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''),Auth(),DB()))
        url=f'/api/shipments?warehouse_id={uid(2)}&exceptions=open&direction=outbound&limit=20'
        self.assertEqual(client.get(url,headers={'Authorization':'Bearer staff'}).status_code,200)
        self.assertEqual(calls[0][0],'shipments_queue_read');self.assertEqual(calls[0][1]['p_filters']['exceptions'],'open')
        self.assertEqual(client.get(url,headers={'Authorization':'Bearer sme'}).status_code,403)
        self.assertEqual(client.get(url.replace('exceptions=open','exceptions=invalid'),headers={'Authorization':'Bearer staff'}).status_code,422)
        self.assertEqual(len(calls),1)
