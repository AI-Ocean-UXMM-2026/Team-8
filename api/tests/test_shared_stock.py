import unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from test_foundation import sme, staff, uid
from app.core.application import create_app
from app.core.settings import Settings
from app.core.database import SupabaseUserDatabase

class SharedStockTests(unittest.TestCase):
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
                if name=='warehouse_catalog':return [{'id':str(uid(9)),'warehouse_id':str(uid(2)),'sku':'SHARED','name':'Shared tea','available_qty':10}]
                if name=='sme_delivery_profile':return params['p_value'] or owner.profile
                return {'id':str(uid(10))}
        self.client=TestClient(create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''),Auth(),DB()))
        self.headers={'Authorization':'Bearer verified','Idempotency-Key':str(uid(20))}
        self.query=f'?warehouse_id={uid(2)}&sme_id={uid(4)}'
    def test_catalog_has_no_tenant_or_shipment_fields_and_is_scoped(self):
        self.assertEqual(self.client.get(f'/api/orders/catalog?warehouse_id={uid(2)}',headers=self.headers).status_code,403)
        self.identity=staff
        r=self.client.get(f'/api/orders/catalog?warehouse_id={uid(2)}',headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(set(r.json()[0]),{'id','warehouse_id','sku','name','available_qty'})
        self.assertEqual(self.client.get(f'/api/orders/catalog?warehouse_id={uid(99)}',headers=self.headers).status_code,403)
        self.assertEqual(self.client.get(f'/api/orders/catalog?warehouse_id={uid(2)}').status_code,401)
    def test_profile_own_write_staff_read_only_and_foreign_denial(self):
        self.assertEqual(self.client.put('/api/orders/delivery-profile'+self.query,json=self.profile,headers=self.headers).status_code,200)
        self.assertEqual(self.calls[-1][1]['p_value'],self.profile)
        self.assertEqual(self.client.get('/api/orders/delivery-profile'+self.query,headers=self.headers).json(),self.profile)
        self.assertEqual(self.client.get(f'/api/orders/delivery-profile?warehouse_id={uid(2)}&sme_id={uid(99)}',headers=self.headers).status_code,403)
        self.identity=staff
        self.assertEqual(self.client.get('/api/orders/delivery-profile'+self.query,headers=self.headers).status_code,200)
        self.assertEqual(self.client.put('/api/orders/delivery-profile'+self.query,json=self.profile,headers=self.headers).status_code,403)
    def test_new_order_has_explicit_recipient_and_pool_with_legacy_input_supported(self):
        body={**self.profile,'order_kind':'sme_self_delivery','save_delivery_profile':True,'warehouse_id':str(uid(2)),'sme_id':str(uid(4)),'lines':[{'product_id':str(uid(9)),'expected_qty':2}]}
        r=self.client.post('/api/orders',json=body,headers=self.headers)
        self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(self.calls[-1][1]['p_body'],body)
        for changed in [{'order_kind':'customer_delivery'},{'latitude':91},{'recipient_name':' '},{'maps_url':'https://evil.test/'}]:
            self.assertEqual(self.client.post('/api/orders',json={**body,**changed},headers=self.headers).status_code,422)
    def test_real_user_database_adapter_allows_only_registered_functions(self):
        class Client:
            def rpc(self,name,params):return SimpleNamespace(execute=lambda:SimpleNamespace(data=name))
        db=SupabaseUserDatabase(Client())
        for name in ['warehouse_catalog','sme_delivery_profile','sme_order_command','sme_orders_read','order_customer','delivery_destination']:
            self.assertEqual(db.rpc(name,{}),name)
        with self.assertRaises(ValueError):db.rpc('arbitrary_sql',{})
