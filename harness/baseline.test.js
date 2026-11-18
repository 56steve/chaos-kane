import test from 'node:test';
import assert from 'node:assert/strict';
import { compareToBaseline } from './baseline.js';

const r = (scenario, outcome) => ({ scenario, outcome });

test('a scenario that used to survive and now fails is a regression', () => {
  const result = compareToBaseline([r('error500', 'survived')], [r('error500', 'failed')]);
  assert.deepEqual(result.regressions, ['error500']);
});

test('a scenario that used to survive and is now unverifiable is also a regression', () => {
  const result = compareToBaseline([r('ghost', 'survived')], [r('ghost', 'incomplete')]);
  assert.deepEqual(result.regressions, ['ghost']);
});

test('a scenario that failed before and still fails is a known failure, not a regression', () => {
  const result = compareToBaseline([r('timeout', 'failed')], [r('timeout', 'failed')]);
  assert.deepEqual(result.known, ['timeout']);
  assert.deepEqual(result.regressions, []);
});

test('a scenario that failed before and now survives is fixed', () => {
  const result = compareToBaseline([r('empty', 'failed')], [r('empty', 'survived')]);
  assert.deepEqual(result.fixed, ['empty']);
});

test('unchanged survivors are reported as unchanged', () => {
  const result = compareToBaseline([r('none', 'survived')], [r('none', 'survived')]);
  assert.deepEqual(result.unchanged, ['none']);
});

test('a new scenario that fails counts as a regression, a new one that survives is just added', () => {
  const result = compareToBaseline([], [r('double', 'failed'), r('ghost', 'survived')]);
  assert.deepEqual(result.regressions, ['double']);
  assert.deepEqual(result.added, ['ghost']);
});

test('a mixed run is split correctly', () => {
  const previous = [r('none', 'survived'), r('error500', 'failed'), r('slow', 'survived'), r('reset', 'failed')];
  const current = [r('none', 'survived'), r('error500', 'survived'), r('slow', 'failed'), r('reset', 'failed')];
  const result = compareToBaseline(previous, current);
  assert.deepEqual(result.fixed, ['error500']);
  assert.deepEqual(result.regressions, ['slow']);
  assert.deepEqual(result.known, ['reset']);
  assert.deepEqual(result.unchanged, ['none']);
});
