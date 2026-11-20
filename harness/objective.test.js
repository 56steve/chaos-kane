import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveFor } from './chaos.js';

test('Kane is told to record the page heading when success is shown by moving to a new page', () => {
  const text = objectiveFor('Do the thing.', 'none');
  assert.match(text, /no message/i);
  assert.match(text, /main heading/i);
  assert.match(text, /status_message/);
  assert.match(text, /last_request_status/);
});

test('a blank or unchanged page is recorded as none, never invented', () => {
  assert.match(objectiveFor('Do the thing.', 'none'), /'none' only if the page is blank or unchanged/i);
});

test('the flow comes first, the retry belongs to ghost only and the double click to double only', () => {
  assert.ok(objectiveFor('Do the thing.', 'none').startsWith('Do the thing.'));
  assert.doesNotMatch(objectiveFor('x', 'none'), /repeat the same final action/i);
  assert.match(objectiveFor('x', 'ghost'), /repeat the same final action/i);
  assert.match(objectiveFor('x', 'double'), /two clicks within half a second/i);
  assert.doesNotMatch(objectiveFor('x', 'ghost'), /two clicks within half a second/i);
});
