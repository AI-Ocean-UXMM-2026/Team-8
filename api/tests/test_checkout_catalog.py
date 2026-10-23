import unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from test_foundation import sme, staff, uid
from app.core.application import create_app
from app.core.settings import Settings
from app.core.database import SupabaseUserDatabase

class CheckoutCatalogTests(unittest.TestCase):
    def setUp(self):
        self.identity=sme
        self.calls=[]
        owner=self
        self.profile={'recipient_name':'SME shop','recipient_phone':'091234567','address':'Shop, Yangon','latitude':16.84,'longitude':96.17,'maps_url':'','notes':''}
        class Auth:
            def verify(self,token): return owner.identity
        class DB:
            def for_user(self,identity):
                owner.assertEqual(identity,owner.identity)
                return self
            def rpc(self,name,params):
                owner.calls.append((name,params))
                if name=='warehouse_catalog_page':return {'items':[],'selected_items':[],'total':0,'categories':[],'next_cursor':None}
                if name=='warehouse_catalog':return [{'id':str(uid(9)),'warehouse_id':str(uid(2)),'sku':'SHARED','name':'Shared tea','available_qty':10}]
                if name=='sme_delivery_profile':return params['p_value'] or owner.profile
                return {'id':str(uid(10))}
        self.client=TestClient(create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''),Auth(),DB()))
        self.headers={'Authorization':'Bearer verified','Idempotency-Key':str(uid(20))}
        self.query=f'?warehouse_id={uid(2)}&sme_id={uid(4)}'
    def test_scoped_catalog_filters(self):
        r=self.client.get(f'/api/orders/catalog-page?warehouse_id={uid(2)}&search=tea&category=food_beverages&limit=12&selected_ids={uid(9)}',headers=self.headers)
        self.assertEqual(r.status_code,200);name,params=self.calls[-1];self.assertEqual(name,'warehouse_catalog_page');self.assertEqual(params['p_filters']['search'],'tea');self.assertEqual(params['p_filters']['selected_ids'],[str(uid(9))])
    def test_permission_and_validation(self):
        self.assertEqual(self.client.get(f'/api/orders/catalog-page?warehouse_id={uid(2)}').status_code,401)
        self.assertEqual(self.client.get(f'/api/orders/catalog-page?warehouse_id={uid(999)}',headers=self.headers).status_code,403)
        for suffix in ['&category=invalid','&limit=49','&selected_ids=invalid','&search='+('x'*201)]:
            self.assertEqual(self.client.get(f'/api/orders/catalog-page?warehouse_id={uid(2)}'+suffix,headers=self.headers).status_code,422)
        self.assertEqual(self.calls,[])
