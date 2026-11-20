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

test('writes are counted even when the fault answers them itself', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createChaosProxy(`http://127.0.0.1:${upstream.address().port}`);
  await new Promise((resolve) => proxy.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.server.address().port}`;
  try {
    proxy.setScenario('error500');
    await fetch(`${base}/api/order`, { method: 'POST' });
    await fetch(`${base}/anything`, { method: 'GET' });
    assert.equal(proxy.writesSeen(), 1);
    assert.equal(proxy.acceptedMutations(), 0);
    proxy.resetAccepted();
    assert.equal(proxy.writesSeen(), 0);
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
    upstream.close();
    upstream.closeAllConnections();
  }
});

test('the fault target can be changed while the proxy runs, without changing what is counted', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('{}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createChaosProxy(`http://127.0.0.1:${upstream.address().port}`);
  await new Promise((resolve) => proxy.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.server.address().port}`;
  try {
    proxy.setScenario('error500');
    assert.equal((await fetch(`${base}/api/users/login`, { method: 'POST' })).status, 500);
    proxy.setFaultTarget({ prefixes: ['/api/articles'], methods: ['POST'] });
    assert.equal((await fetch(`${base}/api/users/login`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${base}/api/articles`, { method: 'POST' })).status, 500);
    assert.equal(proxy.acceptedMutations(), 1);
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
    upstream.close();
    upstream.closeAllConnections();
  }
});

test('a site that writes its own absolute address stays inside the proxy, and the browser never leaves it', async () => {
  let seen;
  let origin;
  const upstream = http.createServer((req, res) => {
    seen = req.headers;
    if (req.url === '/') {
      const body = `<a href="${origin}/cart">cart</a><script>fetch("${origin}/api/add",{method:"POST"})</script>`;
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': 'upgrade-insecure-requests', 'set-cookie': ['sid=1; Domain=127.0.0.1; Secure; SameSite=None'] });
      res.end(body);
    } else if (req.url === '/go') {
      res.writeHead(302, { location: `${origin}/cart` });
      res.end();
    } else if (req.url === '/logo.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from(`${origin} stays as it is`));
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${upstream.address().port}`;
  const proxy = createChaosProxy(origin);
  await new Promise((resolve) => proxy.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.server.address().port}`;
  try {
    const page = await fetch(`${base}/`, { headers: { origin: base, referer: `${base}/start`, 'accept-encoding': 'gzip' } });
    const html = await page.text();
    assert.ok(html.includes(`href="${base}/cart"`), html);
    assert.ok(html.includes(`fetch("${base}/api/add"`), html);
    assert.equal(html.includes(origin), false);
    assert.equal(Number(page.headers.get('content-length')), Buffer.byteLength(html));
    assert.equal(page.headers.get('content-security-policy'), null);
    assert.equal(page.headers.get('set-cookie'), 'sid=1; SameSite=Lax');
    assert.equal(seen.origin, origin);
    assert.equal(seen.referer, `${origin}/start`);
    assert.equal(seen['accept-encoding'], 'identity');

    const redirect = await fetch(`${base}/go`, { redirect: 'manual' });
    assert.equal(redirect.headers.get('location'), `${base}/cart`);

    const binary = Buffer.from(await (await fetch(`${base}/logo.bin`)).arrayBuffer()).toString();
    assert.ok(binary.startsWith(origin));
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
    upstream.close();
    upstream.closeAllConnections();
  }
});
