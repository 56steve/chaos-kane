import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixBrief } from './brief.js';

const failing = {
  scenario: 'error500',
  outcome: 'failed',
  statusMessage: 'Order placed! Confirmation pending',
  requestStatus: '500',
  orderCount: 0,
  reasons: ['fake success: page says "Order placed! Confirmation pending" but the backend has no order'],
};
const passing = { scenario: 'none', outcome: 'survived', reasons: ['ok'] };
const incomplete = { scenario: 'ghost', outcome: 'incomplete', reasons: ['the ghost fault never fired'] };
const context = { target: 'http://localhost:3000', flow: 'check out', noun: 'order' };

test('the brief lists each failing scenario with the evidence', () => {
  const brief = buildFixBrief({ results: [passing, failing], ...context });
  assert.match(brief, /error500/);
  assert.match(brief, /Order placed! Confirmation pending/);
  assert.match(brief, /HTTP 500/);
  assert.match(brief, /0 orders/);
});

test('passing scenarios are only counted, not described', () => {
  const brief = buildFixBrief({ results: [passing, failing], ...context });
  assert.match(brief, /1 of 1 injected failure|0 of 1/i);
  assert.doesNotMatch(brief, /### none/);
});

test('the brief states the fix rules and forbids touching the checker', () => {
  const brief = buildFixBrief({ results: [failing], ...context });
  assert.match(brief, /2xx/);
  assert.match(brief, /do not (edit|change)/i);
});

test('incomplete scenarios are called out as not verified', () => {
  const brief = buildFixBrief({ results: [failing, incomplete], ...context });
  assert.match(brief, /ghost/);
  assert.match(brief, /unable to verify/i);
});

test('an all-survived run says there is nothing to fix', () => {
  const brief = buildFixBrief({ results: [passing], ...context });
  assert.match(brief, /nothing to fix/i);
});

test('the target and flow are in the brief so any agent has the context', () => {
  const brief = buildFixBrief({ results: [failing], ...context });
  assert.match(brief, /http:\/\/localhost:3000/);
  assert.match(brief, /check out/);
});
