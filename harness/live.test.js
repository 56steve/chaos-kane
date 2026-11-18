import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHub } from './hub.js';
import { startLiveServer } from './live.js';
import { LIVE_PAGE } from './live-page.js';

test('the page script is valid JavaScript', () => {
  const match = LIVE_PAGE.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, 'page should contain an inline script');
  assert.doesNotThrow(() => new vm.Script(match[1]));
});

test('the page renders untrusted text with textContent, never innerHTML', () => {
  assert.doesNotMatch(LIVE_PAGE, /innerHTML/);
});

test('the server serves the page and replays history over server-sent events', async () => {
  const hub = createHub(() => 'T');
  hub.emit({ type: 'run_start', scenarios: ['none'], repeat: 1, target: 'http://app.test', flow: 'f', noun: 'order' });
  const live = await startLiveServer({ hub, port: 0 });
  try {
    const page = await fetch(live.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Chaos Kane/);

    const missing = await fetch(`${live.url}/events.json`);
    assert.equal(missing.status, 404);

    const controller = new AbortController();
    const stream = await fetch(`${live.url}/events`, { signal: controller.signal });
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const reader = stream.body.getReader();
    let received = '';
    while (!received.includes('run_start')) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      received += Buffer.from(value).toString('utf8');
    }
    hub.emit({ type: 'scenario_start', scenario: 'none', run: 1, runs: 1 });
    while (!received.includes('scenario_start')) {
      const { value } = await reader.read();
      received += Buffer.from(value).toString('utf8');
    }
    assert.match(received, /http:\/\/app\.test/);
    controller.abort();
  } finally {
    live.close();
  }
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('the server serves saved screenshots but nothing else from disk', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ck-shots-'));
  writeFileSync(path.join(dir, 'a.jpg'), 'JPEGDATA');
  writeFileSync(path.join(dir, 'secret.txt'), 'nope');
  const live = await startLiveServer({ hub: createHub(() => 'T'), port: 0, evidenceDir: dir });
  try {
    const ok = await fetch(`${live.url}/evidence/a.jpg`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/jpeg');
    assert.equal(await ok.text(), 'JPEGDATA');
    assert.equal((await fetch(`${live.url}/evidence/missing.jpg`)).status, 404);
    assert.equal((await fetch(`${live.url}/evidence/secret.txt`)).status, 404, 'only .jpg files are served');
    assert.equal((await fetch(`${live.url}/evidence/..%2Fa.jpg`)).status, 404, 'encoded traversal is refused');
    assert.equal((await fetch(`${live.url}/evidence/%2e%2e/a.jpg`)).status, 404);
  } finally {
    live.close();
  }
});

test('without an evidence folder there is no evidence route', async () => {
  const live = await startLiveServer({ hub: createHub(() => 'T'), port: 0 });
  try {
    assert.equal((await fetch(`${live.url}/evidence/a.jpg`)).status, 404);
  } finally {
    live.close();
  }
});
