import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspacePath } from '../../src/features/auth/roles';
import {canEnterDemo,demoRole,demoRouteRole,demoHomes} from '../../src/features/auth/demo-access';

test('demo roles stay isolated across routes, accounts, legacy aliases and preview queries',()=>{
 const roles=['warehouse','sme','rider','manager'] as const;
 for(const selected of roles){
  for(const target of roles){
   for(const suffix of ['', '/account','/tracking']){
    const requested=demoRouteRole(demoHomes[target]+suffix,new URLSearchParams());
    assert.equal(canEnterDemo(selected,requested),selected===target);
   }
  }
 }
 assert.equal(canEnterDemo(null,'warehouse'),false);
 assert.equal(canEnterDemo('admin','warehouse'),false);
 assert.equal(demoRole('owner'),null);
 assert.equal(demoRouteRole('/demo/warehouses',new URLSearchParams()),null);
 assert.equal(demoRouteRole('/demo/workspace',new URLSearchParams('workspace=manager')),'manager');
 assert.equal(demoRouteRole('/demo/delivery-preview',new URLSearchParams('role=courier')),'rider');
 assert.equal(canEnterDemo('rider',demoRouteRole('/demo/delivery-preview',new URLSearchParams('role=warehouse'))),false);
 assert.equal(demoRouteRole('/demo/delivery-preview',new URLSearchParams('role=admin')),null);
});
test('routes verified memberships and refuses unknown or missing roles', () => {
  assert.equal(workspacePath([{ role: 'owner' }]), '/warehouse');
  assert.equal(workspacePath([{ role: 'staff' }]), '/warehouse');
  assert.equal(workspacePath([{ role: 'sme' }]), '/sme');
  assert.equal(workspacePath([{ role: 'rider' }]), '/courier');
  assert.equal(workspacePath([]), null);
  assert.equal(workspacePath([{ role: 'admin' }]), null);
  assert.equal(workspacePath([{ role: 'rider' }, { role: 'staff' }]), '/warehouse');
});
