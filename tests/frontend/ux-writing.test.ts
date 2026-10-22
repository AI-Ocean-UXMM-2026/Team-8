import test from 'node:test';
import assert from 'node:assert/strict';
import {safeError} from '../../src/shared/i18n/errors';
import {localizedText} from '../../src/shared/i18n/text';
import {decisionLabel} from '../../src/shared/i18n/labels';
import {ApiError} from '../../src/shared/api/transport';

test('an unconfirmed write never claims failure, even after a rejected replay',()=>{
 for(const status of [0,401,403,409,422,500]){
  const result=safeError(new ApiError(status,'INTERNAL','private database detail'),true);
  assert.match(result,/could not confirm/);assert.match(result,/same request/);
  assert.doesNotMatch(result,/private database detail/);
 }
});
test('read errors provide safe recovery without exposing backend details',()=>{
 assert.match(safeError(new ApiError(401,'UNAUTHENTICATED','secret')),/Sign in/);
 assert.match(safeError(new ApiError(403,'FORBIDDEN','secret')),/cannot access/);
 assert.match(safeError(new ApiError(409,'STALE_VERSION','secret')),/Refresh/);
 assert.match(safeError(new ApiError(422,'VALIDATION_ERROR','secret')),/quantities/);
 assert.match(safeError(new ApiError(0,'NETWORK_ERROR','secret')),/connection/);
 assert.doesNotMatch(safeError(new Error('private stack trace')),/private stack trace/);
});
test('native confirmations resolve complete messages in the selected language',()=>{
 for(const message of [
 'Confirm the evidence supports this operational review. This does not establish legal liability or compensation.',
 'Confirm the recorded physical step, evidence and selected delivery before submitting.'
 ]){
  assert.equal(localizedText(message,'en'),message);
  assert.match(localizedText(message,'my'),/[\u1000-\u109f]/);
  assert.doesNotMatch(localizedText(message,'my'),/Confirm|evidence/);
 }
 assert.equal(localizedText('PC-OUT-0003','my'),'PC-OUT-0003');
});
test('approval labels preserve proposed retry meaning and unknown options do not invent consent',()=>{
 assert.equal(decisionLabel('propose_retry'),'Request another delivery time');
 assert.equal(decisionLabel('accept_partial'),'Accept the partial receipt');
 assert.match(decisionLabel('unknown_option'),/Review/);
});
