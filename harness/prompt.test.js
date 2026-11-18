import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepairPrompt } from './prompt.js';

const failures = [
  {
    scenario: 'error500',
    outcome: 'failed',
    statusMessage: 'Order placed! Confirmation pending',
    requestStatus: '500',
    orderCreated: false,
    reasons: ['fake success: page says "Order placed! Confirmation pending" but the backend has no order'],
  },
  {
    scenario: 'timeout',
    outcome: 'failed',
    statusMessage: 'Placing order...',
    requestStatus: 'no response',
    orderCreated: false,
    reasons: ['no order saved and no clear error shown'],
  },
];

test('prompt names every failing scenario with the evidence', () => {
  const prompt = buildRepairPrompt({ failures, attempt: 1, previousDiff: '' });
  assert.match(prompt, /error500/);
  assert.match(prompt, /timeout/);
  assert.match(prompt, /Order placed! Confirmation pending/);
  assert.match(prompt, /HTTP 500/);
  assert.match(prompt, /no response/);
});

test('prompt restricts edits to app/client.js', () => {
  const prompt = buildRepairPrompt({ failures, attempt: 1, previousDiff: '' });
  assert.match(prompt, /only edit app\/client\.js/i);
  assert.match(prompt, /do not change the test/i);
});

test('later attempts include the previous diff so it is not repeated', () => {
  const prompt = buildRepairPrompt({ failures, attempt: 2, previousDiff: '-old line\n+new line' });
  assert.match(prompt, /attempt 2/i);
  assert.match(prompt, /\+new line/);
});

test('first attempt has no previous diff section', () => {
  const prompt = buildRepairPrompt({ failures, attempt: 1, previousDiff: '' });
  assert.doesNotMatch(prompt, /previous attempt/i);
});
