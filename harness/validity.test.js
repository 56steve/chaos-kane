import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFaultCheck } from './validity.js';

const rules = { prefixes: ['/api/'], methods: ['POST', 'PUT'] };
const survived = { outcome: 'survived', reasons: ['order was saved and the user was told so'] };

test('the healthy baseline never needs a fault to fire', () => {
  assert.deepEqual(applyFaultCheck(survived, 'none', 0, rules), survived);
});

test('a verdict stands when the fault actually fired', () => {
  assert.deepEqual(applyFaultCheck(survived, 'error500', 1, rules), survived);
});

test('a fault that never fired cannot count as survived', () => {
  const result = applyFaultCheck(survived, 'error500', 0, rules);
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.reasons[0], /error500 fault never fired/);
});

test('the explanation names the rules and the cross-origin cause', () => {
  const result = applyFaultCheck(survived, 'ghost', 0, rules);
  assert.match(result.reasons[0], /POST\/PUT/);
  assert.match(result.reasons[0], /\/api\//);
  assert.match(result.reasons[0], /another origin/);
});

test('a failed verdict is also downgraded, because nothing was really tested', () => {
  const failed = { outcome: 'failed', reasons: ['x'] };
  assert.equal(applyFaultCheck(failed, 'timeout', 0, rules).outcome, 'incomplete');
});
