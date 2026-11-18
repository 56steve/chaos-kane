import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixEvent, diffBody, labelEvents, parsePatchSpec } from './replay.js';

const events = [
  { type: 'run_start', scenarios: ['none'], at: 'T1' },
  { type: 'scenario_start', scenario: 'none', at: 'T2' },
  { type: 'scenario_result', scenario: 'none', screenshot: 'evidence/none-1.jpg', at: 'T3' },
  { type: 'scenario_result', scenario: 'ghost', at: 'T4' },
  { type: 'run_end', summary: {}, at: 'T5' },
];

test('run start and results are labelled; other events are left alone', () => {
  const labelled = labelEvents(events, 'before');
  assert.equal(labelled[0].label, 'before');
  assert.equal(labelled[2].label, 'before');
  assert.equal(labelled[1].label, undefined);
  assert.equal(labelled[4].label, undefined);
});

test('screenshot paths get the label folder so two runs never collide', () => {
  const labelled = labelEvents(events, 'after');
  assert.equal(labelled[2].screenshot, 'evidence/after/none-1.jpg');
  assert.equal(labelled[3].screenshot, undefined);
});

test('labelling does not change the original events', () => {
  labelEvents(events, 'before');
  assert.equal(events[0].label, undefined);
  assert.equal(events[2].screenshot, 'evidence/none-1.jpg');
});

test('a patch spec names a file and an optional git revision', () => {
  assert.deepEqual(parsePatchSpec('app/client.js'), { file: 'app/client.js', rev: null });
  assert.deepEqual(parsePatchSpec('app/client.js@abc123'), { file: 'app/client.js', rev: 'abc123' });
});

test('the diff body drops the git header and keeps the hunks', () => {
  const diff = ['diff --git a/x.js b/x.js', 'index 1..2 100644', '--- a/x.js', '+++ b/x.js', '@@ -1,2 +1,2 @@', '-old', '+new', ' same'].join('\n');
  assert.deepEqual(diffBody(diff), ['@@ -1,2 +1,2 @@', '-old', '+new', ' same']);
});

test('an empty diff has no body', () => {
  assert.deepEqual(diffBody(''), []);
});

test('the fix event carries the file, the diff lines and a timestamp', () => {
  const event = buildFixEvent({ file: 'app/client.js', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n', at: 'T9' });
  assert.equal(event.type, 'fix');
  assert.equal(event.file, 'app/client.js');
  assert.deepEqual(event.lines, ['@@ -1 +1 @@', '-a', '+b']);
  assert.equal(event.at, 'T9');
});
