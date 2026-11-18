import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { SCENARIOS, createChaosProxy, upstreamModule } from '../chaos/proxy.js';

test('https targets use the https transport and http targets use http', () => {
  assert.equal(upstreamModule(new URL('https://staging.example.com')), https);
  assert.equal(upstreamModule(new URL('http://localhost:3000')), http);
});

test('the double scenario is registered', () => {
  assert.ok(SCENARIOS.includes('double'));
});

test('selecting an unknown scenario throws', () => {
  const proxy = createChaosProxy('http://127.0.0.1:1');
  assert.throws(() => proxy.setScenario('bogus'), /unknown scenario/);
});

test('mutations are counted only when the upstream accepts them', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(req.url === '/api/ok' ? 201 : 500);
    res.end('{}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createChaosProxy(`http://127.0.0.1:${upstream.address().port}`);
  await new Promise((resolve) => proxy.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.server.address().port}`;
  try {
    await fetch(`${base}/api/ok`, { method: 'POST' });
    await fetch(`${base}/api/bad`, { method: 'POST' });
    await fetch(`${base}/api/ok`, { method: 'GET' });
    assert.equal(proxy.acceptedMutations(), 1);
    proxy.resetAccepted();
    assert.equal(proxy.acceptedMutations(), 0);
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
    upstream.close();
    upstream.closeAllConnections();
  }
});

test('a fault only fires on requests that match the path and method rules', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const events = [];
  const proxy = createChaosProxy(`http://127.0.0.1:${upstream.address().port}`, {
    prefixes: ['/v2/'],
    methods: ['POST'],
    onEvent: (event) => events.push(event),
  });
  await new Promise((resolve) => proxy.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.server.address().port}`;
  try {
    proxy.setScenario('error500');
    assert.equal((await fetch(`${base}/api/order`, { method: 'POST' })).status, 200, 'other prefix passes through');
    assert.equal((await fetch(`${base}/v2/order`, { method: 'GET' })).status, 200, 'other method passes through');
    assert.equal(events.length, 0);
    assert.equal((await fetch(`${base}/v2/order`, { method: 'POST' })).status, 500);
    assert.equal(events.length, 1);
    assert.equal(events[0].scenario, 'error500');
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
    upstream.close();
    upstream.closeAllConnections();
  }
});
