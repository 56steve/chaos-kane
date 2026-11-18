import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from './hub.js';

test('events are stamped and kept in history', () => {
  const hub = createHub(() => 'T');
  hub.emit({ type: 'run_start' });
  assert.deepEqual(hub.history(), [{ type: 'run_start', at: 'T' }]);
});

test('subscribers receive new events until they unsubscribe', () => {
  const hub = createHub(() => 'T');
  const seen = [];
  const unsubscribe = hub.subscribe((event) => seen.push(event.type));
  hub.emit({ type: 'a' });
  unsubscribe();
  hub.emit({ type: 'b' });
  assert.deepEqual(seen, ['a']);
  assert.equal(hub.history().length, 2);
});

test('history is a copy, so callers cannot rewrite it', () => {
  const hub = createHub(() => 'T');
  hub.emit({ type: 'a' });
  hub.history().push({ type: 'forged' });
  assert.equal(hub.history().length, 1);
});
