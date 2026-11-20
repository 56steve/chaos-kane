import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli-args.js';
import { buildPlan, estimateCredits, formatPlan } from './plan.js';

const config = (extra = []) => parseArgs(['--app', 'http://localhost:3000', '--flow', 'Place an order', ...extra]);

test('the default plan runs every scenario except double, once each', () => {
  const plan = buildPlan(config());
  assert.equal(plan.scenarios.includes('double'), false);
  assert.equal(plan.scenarios[0], 'none');
  assert.equal(plan.runs, plan.scenarios.length);
});

test('chosen faults and repeats set the number of Kane runs', () => {
  const plan = buildPlan(config(['--faults', 'error500,ghost', '--repeat', '3']));
  assert.deepEqual(plan.scenarios, ['error500', 'ghost']);
  assert.equal(plan.runs, 6);
});

test('with automatic targets the baseline moves to the front, so the target can be learned', () => {
  const plan = buildPlan(config(['--faults', 'ghost,none,error500']));
  assert.deepEqual(plan.scenarios, ['none', 'ghost', 'error500']);
  assert.equal(plan.canLearn, true);
});

test('without a baseline the target cannot be learned, and the plan says so', () => {
  const plan = buildPlan(config(['--faults', 'ghost,error500']));
  assert.equal(plan.canLearn, false);
  assert.match(formatPlan(plan), /include none/i);
});

test('credits are a range, because a longer flow costs more per run', () => {
  assert.deepEqual(estimateCredits(10), { low: 150, high: 300 });
  assert.deepEqual(estimateCredits(1), { low: 15, high: 30 });
});

test('the printed plan says what will be broken, how many runs, and the cost, and starts nothing', () => {
  const text = formatPlan(buildPlan(config(['--faults', 'none,error500', '--truth-url', 'http://localhost:3000/api/orders'])));
  assert.match(text, /Dry run/);
  assert.match(text, /http:\/\/localhost:3000/);
  assert.match(text, /Place an order/);
  assert.match(text, /2 Kane runs/);
  assert.match(text, /30 to 60 credits/);
  assert.match(text, /learned from the baseline/i);
  assert.match(text, /No browser was opened and no credits were used/);
});

test('explicit fault paths are shown instead of the learned target', () => {
  const text = formatPlan(buildPlan(config(['--fault-paths', '/api/orders', '--fault-methods', 'POST'])));
  assert.match(text, /\/api\/orders/);
  assert.doesNotMatch(text, /learned from the baseline/i);
});

test('without a truth endpoint the plan warns that duplicates will not be detected', () => {
  assert.match(formatPlan(buildPlan(config())), /duplicate detection is off/i);
  assert.doesNotMatch(formatPlan(buildPlan(config(['--truth-url', 'http://localhost:3000/api/orders']))), /duplicate detection is off/i);
});

test('the dry-run flag is parsed', () => {
  assert.equal(config().dryRun, false);
  assert.equal(config(['--dry-run']).dryRun, true);
});
