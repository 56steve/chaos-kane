import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockMessage, emptyState, recordAttempt, recordPass, shouldVerify } from './gate.js';

const failure = {
  scenario: 'error500',
  outcome: 'failed',
  statusMessage: 'Order placed! Confirmation pending',
  requestStatus: '500',
  orderCount: 0,
  reasons: ['fake success: page says "Order placed! Confirmation pending" but the backend has no order'],
};

test('code that was never verified must be verified', () => {
  assert.equal(shouldVerify('abc', emptyState()), true);
});

test('code identical to the last verified pass is skipped', () => {
  const state = recordPass(emptyState(), 's1', 'abc');
  assert.equal(shouldVerify('abc', state), false);
  assert.equal(shouldVerify('changed', state), true);
});

test('attempts count per session and run out after the maximum', () => {
  let state = emptyState();
  let step = recordAttempt(state, 's1', 3);
  assert.equal(step.attempt, 1);
  assert.equal(step.exhausted, false);
  state = step.state;
  step = recordAttempt(state, 's1', 3);
  state = step.state;
  step = recordAttempt(state, 's1', 3);
  state = step.state;
  assert.equal(step.attempt, 3);
  assert.equal(step.exhausted, false);
  step = recordAttempt(state, 's1', 3);
  assert.equal(step.exhausted, true);
});

test('sessions do not share attempts', () => {
  const first = recordAttempt(emptyState(), 's1', 3);
  const second = recordAttempt(first.state, 's2', 3);
  assert.equal(second.attempt, 1);
});

test('a pass resets that session attempts and stores the hash', () => {
  const failed = recordAttempt(emptyState(), 's1', 3).state;
  const passed = recordPass(failed, 's1', 'hash1');
  assert.equal(passed.lastPassedHash, 'hash1');
  assert.equal(recordAttempt(passed, 's1', 3).attempt, 1);
});

test('the block message names the scenario, the evidence and the attempt', () => {
  const message = buildBlockMessage([failure], 1, 3);
  assert.match(message, /attempt 1 of 3/i);
  assert.match(message, /error500/);
  assert.match(message, /Order placed! Confirmation pending/);
  assert.match(message, /HTTP 500/);
  assert.match(message, /fake success/);
});

test('the block message forbids editing the checker', () => {
  const message = buildBlockMessage([failure], 2, 3);
  assert.match(message, /do not edit/i);
  assert.match(message, /harness/);
});

test('an incomplete scenario is reported as having no usable observation', () => {
  const message = buildBlockMessage(
    [{ scenario: 'ghost', outcome: 'incomplete', reasons: ['Kane returned no status message'] }],
    1,
    3,
  );
  assert.match(message, /ghost/);
  assert.match(message, /no usable observation/i);
});
