import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crossCheck, pickFinalScreenshot, pickHars, readEvidencePack, writeRequestsFromHar } from './evidence.js';

const names = [
  'run.yaml',
  'tests/checkout--abc/steps/1-0-1/screenshot.jpg',
  'tests/checkout--abc/steps/10-0-11/screenshot.jpg',
  'tests/checkout--abc/steps/2-0-2/screenshot.jpg',
  'tests/checkout--abc/steps/3-0-3/annotated.png',
  'tests/checkout--abc/steps/11-0-12/screenshot.jpg',
  'tests/checkout--abc/logs/0-network.har',
];

const har = (entries) =>
  JSON.stringify({ log: { entries: entries.map(([method, url, status]) => ({ request: { method, url }, response: { status } })) } });

test('the final screenshot is the one from the highest step number, compared as a number', () => {
  assert.equal(pickFinalScreenshot(names), 'tests/checkout--abc/steps/11-0-12/screenshot.jpg');
});

test('annotated images and unrelated files are never picked as the screenshot', () => {
  assert.equal(pickFinalScreenshot(['tests/x/steps/3-0-3/annotated.png', 'run.yaml']), null);
});

test('network logs are found by name', () => {
  assert.deepEqual(pickHars(names), ['tests/checkout--abc/logs/0-network.har']);
  assert.deepEqual(pickHars(['run.yaml']), []);
});

test('Kane splits the network log into numbered files: all are found, in numeric order', () => {
  const found = pickHars([
    'tests/t--1/logs/10-network.har',
    'tests/t--1/logs/2-network.har',
    'tests/t--1/logs/0-network.har',
    'tests/t--1/logs/1-network.har',
    'tests/t--1/logs/console.log',
  ]);
  assert.deepEqual(found, [
    'tests/t--1/logs/0-network.har',
    'tests/t--1/logs/1-network.har',
    'tests/t--1/logs/2-network.har',
    'tests/t--1/logs/10-network.har',
  ]);
});

test('only write requests are read from the network log, with path and status', () => {
  const requests = writeRequestsFromHar(
    har([
      ['GET', 'http://127.0.0.1:4100/', 200],
      ['POST', 'http://127.0.0.1:4100/api/order?x=1', 500],
      ['GET', 'http://127.0.0.1:4100/client.js', 200],
    ]),
  );
  assert.deepEqual(requests, [{ method: 'POST', path: '/api/order', status: 500 }]);
});

test('a request with no response keeps status 0', () => {
  assert.deepEqual(writeRequestsFromHar(har([['POST', 'http://a.test/api/order', 0]])), [
    { method: 'POST', path: '/api/order', status: 0 },
  ]);
});

test('a log that cannot be parsed gives no requests instead of throwing', () => {
  assert.deepEqual(writeRequestsFromHar('not json'), []);
  assert.deepEqual(writeRequestsFromHar(JSON.stringify({ log: {} })), []);
});

test('cross-check agrees when Kane and the network log report the same status', () => {
  const result = crossCheck({ reportedStatus: '500', requests: [{ method: 'POST', path: '/api/order', status: 500 }], harAvailable: true });
  assert.equal(result.agreement, 'agreed');
  assert.equal(result.source, 'network-log');
  assert.equal(result.status, '500');
});

test('cross-check agrees when both say there was no response', () => {
  const result = crossCheck({ reportedStatus: 'no response', requests: [{ method: 'POST', path: '/a', status: 0 }], harAvailable: true });
  assert.equal(result.agreement, 'agreed');
  assert.equal(result.status, 'no response');
});

test('cross-check uses the LAST write, so a retry after a lost reply is judged by the retry', () => {
  const requests = [
    { method: 'POST', path: '/api/order', status: 0 },
    { method: 'POST', path: '/api/order', status: 201 },
  ];
  const result = crossCheck({ reportedStatus: '201', requests, harAvailable: true });
  assert.equal(result.agreement, 'agreed');
  assert.equal(result.status, '201');
});

test('cross-check flags a disagreement and keeps what Kane reported', () => {
  const result = crossCheck({ reportedStatus: '500', requests: [{ method: 'POST', path: '/a', status: 201 }], harAvailable: true });
  assert.equal(result.agreement, 'disagreed');
  assert.equal(result.status, '201');
  assert.equal(result.kaneReported, '500');
});

test('Kane reporting a status when the network log shows no write at all is a disagreement', () => {
  const result = crossCheck({ reportedStatus: '201', requests: [], harAvailable: true });
  assert.equal(result.agreement, 'disagreed');
});

test('no write in the log and Kane reporting no response agree', () => {
  const result = crossCheck({ reportedStatus: 'no response', requests: [], harAvailable: true });
  assert.equal(result.agreement, 'agreed');
});

test('without a network log the Kane value is kept and marked unavailable', () => {
  const result = crossCheck({ reportedStatus: '500', requests: [], harAvailable: false });
  assert.equal(result.agreement, 'unavailable');
  assert.equal(result.source, 'kane');
  assert.equal(result.status, '500');
});

const haveZip = (() => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('an evidence pack is read without extracting it to disk', { skip: !haveZip }, async () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'ck-evidence-'));
  const content = path.join(work, 'content');
  mkdirSync(path.join(content, 'tests/t--1/steps/1-0-1'), { recursive: true });
  mkdirSync(path.join(content, 'tests/t--1/steps/2-0-2'), { recursive: true });
  mkdirSync(path.join(content, 'tests/t--1/logs'), { recursive: true });
  writeFileSync(path.join(content, 'tests/t--1/steps/1-0-1/screenshot.jpg'), 'FIRST');
  writeFileSync(path.join(content, 'tests/t--1/steps/2-0-2/screenshot.jpg'), 'LAST');
  writeFileSync(path.join(content, 'tests/t--1/logs/0-network.har'), har([['POST', 'http://a.test/api/order', 500]]));

  const session = path.join(work, 'session');
  mkdirSync(path.join(session, 'evidence'), { recursive: true });
  execFileSync('zip', ['-q', '-r', path.join(session, 'evidence', 'pack.evidence'), '.'], { cwd: content });

  const pack = await readEvidencePack(session);
  assert.equal(pack.screenshot.toString(), 'LAST');
  assert.equal(pack.harTexts.length, 1);
  assert.equal(writeRequestsFromHar(pack.harTexts[0])[0].status, 500);
});

test('a login in the first log and the real write in the second are both read, in order', { skip: !haveZip }, async () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'ck-evidence-'));
  const content = path.join(work, 'content');
  mkdirSync(path.join(content, 'tests/t--1/logs'), { recursive: true });
  writeFileSync(path.join(content, 'tests/t--1/logs/0-network.har'), har([['POST', 'http://a.test/api/users/login', 200]]));
  writeFileSync(path.join(content, 'tests/t--1/logs/1-network.har'), har([['POST', 'http://a.test/api/articles', 0]]));
  const session = path.join(work, 'session');
  mkdirSync(path.join(session, 'evidence'), { recursive: true });
  execFileSync('zip', ['-q', '-r', path.join(session, 'evidence', 'pack.evidence'), '.'], { cwd: content });

  const pack = await readEvidencePack(session);
  const requests = pack.harTexts.flatMap((text) => writeRequestsFromHar(text));
  assert.deepEqual(requests.map((request) => request.path), ['/api/users/login', '/api/articles']);
  assert.equal(requests.at(-1).status, 0);
});

test('a missing session or pack gives empty evidence instead of an error', async () => {
  const none = await readEvidencePack('/definitely/not/a/session');
  assert.equal(none.screenshot, null);
  assert.deepEqual(none.harTexts, []);
  const unset = await readEvidencePack(undefined);
  assert.equal(unset.screenshot, null);
});
