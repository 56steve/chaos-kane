import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRuns } from './aggregate.js';

const run = (outcome, credits = 20) => ({ scenario: 'error500', outcome, reasons: [outcome], credits });

test('identical runs are stable', () => {
  const result = aggregateRuns([run('survived'), run('survived'), run('survived')]);
  assert.equal(result.outcome, 'survived');
  assert.equal(result.agreement, '3/3');
  assert.equal(result.stable, true);
});

test('the majority outcome wins and the result is marked unstable', () => {
  const result = aggregateRuns([run('failed'), run('survived'), run('failed')]);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.agreement, '2/3');
  assert.equal(result.stable, false);
});

test('a tie resolves to the worst outcome, never the best', () => {
  const result = aggregateRuns([run('survived'), run('failed')]);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.stable, false);
});

test('incomplete outranks survived on a tie', () => {
  const result = aggregateRuns([run('survived'), run('incomplete')]);
  assert.equal(result.outcome, 'incomplete');
});

test('credits are summed across all runs', () => {
  const result = aggregateRuns([run('survived', 10), run('survived', 12.5)]);
  assert.equal(result.credits, 22.5);
});

test('a single run reports 1/1', () => {
  const result = aggregateRuns([run('survived')]);
  assert.equal(result.agreement, '1/1');
  assert.equal(result.stable, true);
});

test('aggregating no runs is an error', () => {
  assert.throws(() => aggregateRuns([]), /no runs/i);
});
