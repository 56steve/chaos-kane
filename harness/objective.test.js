import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveFor } from './chaos.js';

test('Kane is told to record the message and the request status, and not to judge', () => {
  const text = objectiveFor('Do the thing.', 'none');
  assert.match(text, /status_message/);
  assert.match(text, /last_request_status/);
  assert.match(text, /Do not judge the result/);
});

test('a missing message is recorded as none, with no extra conditions that could make Kane stop', () => {
  const text = objectiveFor('Do the thing.', 'none');
  assert.match(text, /store 'none' if there is none/i);
  assert.doesNotMatch(text, /main heading/i);
});

test('the flow comes first, the retry belongs to ghost only and the double click to double only', () => {
  assert.ok(objectiveFor('Do the thing.', 'none').startsWith('Do the thing.'));
  assert.doesNotMatch(objectiveFor('x', 'none'), /repeat the same final action/i);
  assert.match(objectiveFor('x', 'ghost'), /repeat the same final action/i);
  assert.match(objectiveFor('x', 'double'), /two clicks within half a second/i);
  assert.doesNotMatch(objectiveFor('x', 'ghost'), /two clicks within half a second/i);
});
