import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeFor, exitCodeWithBaseline } from './runner.js';

const summary = (overrides) => ({ survived: 0, failed: 0, incomplete: 0, total: 0, baseline: 'survived', ...overrides });

test('everything survived exits 0', () => {
  assert.equal(exitCodeFor(summary({ survived: 3, total: 3 })), 0);
});

test('any failure exits 1', () => {
  assert.equal(exitCodeFor(summary({ failed: 1, total: 3 })), 1);
});

test('a failed healthy baseline exits 1 even with no failed faults', () => {
  assert.equal(exitCodeFor(summary({ baseline: 'failed' })), 1);
});

test('only incomplete results exit 2, never 0', () => {
  assert.equal(exitCodeFor(summary({ incomplete: 2, total: 3 })), 2);
});

test('an incomplete baseline exits 2', () => {
  assert.equal(exitCodeFor(summary({ baseline: 'incomplete' })), 2);
});

test('failures take priority over incomplete', () => {
  assert.equal(exitCodeFor(summary({ failed: 1, incomplete: 1 })), 1);
});


test('with a baseline, any regression exits 1', () => {
  assert.equal(exitCodeWithBaseline({ regressions: ['slow'], known: [], fixed: [] }), 1);
});

test('with a baseline, known failures alone do not fail the run', () => {
  assert.equal(exitCodeWithBaseline({ regressions: [], known: ['reset', 'timeout'], fixed: [] }), 0);
});

test('with a baseline, fixes and unchanged results exit 0', () => {
  assert.equal(exitCodeWithBaseline({ regressions: [], known: [], fixed: ['empty'] }), 0);
});
