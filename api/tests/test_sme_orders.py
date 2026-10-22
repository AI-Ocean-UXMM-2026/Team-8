import unittest
from fastapi.testclient import TestClient
from test_foundation import sme, uid
from app.core.application import create_app
from app.core.settings import Settings

class OrderTests(unittest.TestCase):
    def setUp(self):
        owner=self
        self.calls=[]
        class Auth:
            def verify(self,token): return sme
        class DB:
            def for_user(self,identity):
                owner.assertEqual(identity,sme)
                return self
            def rpc(self,name,params):
                owner.calls.append((name,params))
                return [] if name=='sme_orders_read' else {'id':str(uid(10))}
        self.client=TestClient(create_app(Settings(_env_file=None,supabase_url='',supabase_public_key=''),Auth(),DB()))
        self.headers={'Authorization':'Bearer verified','Idempotency-Key':str(uid(20))}
        self.body={'warehouse_id':str(uid(2)),'sme_id':str(uid(4)),'customer_name':'Customer','customer_phone':'091234567','address':'Yangon','latitude':16.8,'longitude':96.1,'maps_url':'https://maps.app.goo.gl/test','lines':[{'product_id':str(uid(9)),'expected_qty':2}]}
    def test_submit_uses_user_rpc_and_stable_key(self):
        r=self.client.post('/api/orders',json=self.body,headers=self.headers)
        self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(self.calls[-1][0],'sme_order_command')
        self.assertEqual(self.calls[-1][1]['p_key'],str(uid(20)))
    def test_foreign_tenant_and_anonymous_denied(self):
        self.assertEqual(self.client.post('/api/orders',json={**self.body,'sme_id':str(uid(99))},headers=self.headers).status_code,403)
        self.assertEqual(self.client.post('/api/orders',json=self.body).status_code,401)
        self.assertEqual(self.calls,[])
    def test_invalid_coordinates_links_and_lines(self):
        for change in [{'latitude':91},{'longitude':-181},{'maps_url':'https://google.com.evil.test/maps/x'},{'maps_url':'https://www.google.com/search?q=test'},{'customer_name':'  '},{'lines':self.body['lines']*2},{'lines':[{'product_id':str(uid(9)),'expected_qty':0}]}]:
            r=self.client.post('/api/orders',json={**self.body,**change},headers=self.headers)
            self.assertEqual(r.status_code,422,r.text)
        self.assertEqual(self.calls,[])
    def test_listing_scope(self):
        self.assertEqual(self.client.get(f'/api/orders?warehouse_id={uid(2)}&sme_id={uid(4)}',headers=self.headers).status_code,200)
        self.assertEqual(self.client.get(f'/api/orders?warehouse_id={uid(2)}',headers=self.headers).status_code,403)
