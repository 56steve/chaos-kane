import test from 'node:test';
import assert from 'node:assert/strict';
import { claimVerdict, describeClaim } from './claim.js';
import { outcomeLabel } from './labels.js';

const summary = (overrides) => ({ survived: 0, failed: 0, incomplete: 0, total: 0, baseline: 'survived', ...overrides });

test('a claim is supported only when every failure survived', () => {
  assert.equal(claimVerdict(summary({ survived: 5, total: 5 })), 'supported');
});

test('any failed scenario means the claim is not supported', () => {
  assert.equal(claimVerdict(summary({ survived: 4, failed: 1, total: 5 })), 'not supported');
});

test('a failed healthy baseline also refutes the claim', () => {
  assert.equal(claimVerdict(summary({ survived: 5, total: 5, baseline: 'failed' })), 'not supported');
});

test('unverified scenarios mean the claim cannot be confirmed', () => {
  assert.equal(claimVerdict(summary({ survived: 3, incomplete: 2, total: 5 })), 'unable to verify');
});

test('a run with no injected failures cannot support a claim', () => {
  assert.equal(claimVerdict(summary({ total: 0 })), 'unable to verify');
});

test('failure outranks unverified', () => {
  assert.equal(claimVerdict(summary({ survived: 2, failed: 1, incomplete: 2, total: 5 })), 'not supported');
});

test('the description quotes the claim and the evidence', () => {
  const text = describeClaim('handles API failures', summary({ survived: 1, failed: 5, total: 6 }));
  assert.match(text, /handles API failures/);
  assert.match(text, /1 of 6/);
  assert.match(text, /not supported/);
});

test('incomplete reads as unable to verify to people', () => {
  assert.equal(outcomeLabel('incomplete'), 'unable to verify');
  assert.equal(outcomeLabel('failed'), 'failed');
  assert.equal(outcomeLabel('survived'), 'survived');
  assert.equal(outcomeLabel('something-else'), 'something-else');
});
