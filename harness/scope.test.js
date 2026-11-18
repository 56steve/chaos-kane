import test from 'node:test';
import assert from 'node:assert/strict';
import { outOfScope, parsePorcelain } from './scope.js';

test('parsePorcelain reads modified, untracked and renamed files', () => {
  const text = [' M app/client.js', '?? scripts/new.js', 'R  old.js -> app/renamed.js', 'A  harness/run.js'].join('\n');
  assert.deepEqual(parsePorcelain(text), ['app/client.js', 'scripts/new.js', 'app/renamed.js', 'harness/run.js']);
});

test('parsePorcelain handles empty output', () => {
  assert.deepEqual(parsePorcelain(''), []);
});

test('outOfScope keeps only files the agent may not touch', () => {
  const files = ['app/client.js', 'harness/verdict.js', 'chaos/proxy.js'];
  assert.deepEqual(outOfScope(files, { allowed: ['app/client.js'], ignoredPrefixes: ['reports/'] }), [
    'harness/verdict.js',
    'chaos/proxy.js',
  ]);
});

test('outOfScope ignores generated report files', () => {
  const files = ['reports/latest.json', 'reports/attempt-1/none.ndjson'];
  assert.deepEqual(outOfScope(files, { allowed: ['app/client.js'], ignoredPrefixes: ['reports/'] }), []);
});

test('outOfScope does not treat a similarly named file as allowed', () => {
  const files = ['app/client.js.bak', 'app/client.jsx'];
  assert.deepEqual(outOfScope(files, { allowed: ['app/client.js'], ignoredPrefixes: [] }), files);
});
