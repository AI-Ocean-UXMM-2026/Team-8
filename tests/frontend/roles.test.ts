import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspacePath } from '../../src/features/auth/roles';
test('routes verified memberships and refuses unknown or missing roles', () => {
  assert.equal(workspacePath([{ role: 'owner' }]), '/warehouse');
  assert.equal(workspacePath([{ role: 'staff' }]), '/warehouse');
  assert.equal(workspacePath([{ role: 'sme' }]), '/sme');
  assert.equal(workspacePath([{ role: 'rider' }]), '/rider');
  assert.equal(workspacePath([]), null);
  assert.equal(workspacePath([{ role: 'admin' }]), null);
  assert.equal(workspacePath([{ role: 'rider' }, { role: 'staff' }]), '/warehouse');
});
