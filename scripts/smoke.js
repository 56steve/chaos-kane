import { createApp } from '../app/server.js';
import { createChaosProxy, SCENARIOS } from '../chaos/proxy.js';

const APP_PORT = 4010;
const PROXY_PORT = 4110;

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`smoke failed: ${message}`);
  }
}

const { server: appServer, orders } = createApp();
const { server: proxyServer } = createChaosProxy(`http://127.0.0.1:${APP_PORT}`);
await listen(appServer, APP_PORT);
await listen(proxyServer, PROXY_PORT);

const base = `http://127.0.0.1:${PROXY_PORT}`;
const order = { name: 'Ada', email: 'ada@example.com', item: 'Trail Backpack' };

async function setScenario(name) {
  const res = await fetch(`${base}/__chaos/scenario?name=${name}`, { method: 'POST' });
  assert(res.ok, `could not set scenario ${name}`);
}

async function postOrder(extraHeaders = {}) {
  return fetch(`${base}/api/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(order),
    signal: AbortSignal.timeout(2000),
  });
}

try {
  const page = await fetch(`${base}/`);
  assert(page.ok && (await page.text()).includes('Place order'), 'page should load through the proxy');

  await setScenario('none');
  const ok = await postOrder();
  assert(ok.status === 201, 'healthy order should return 201');
  assert(orders.length === 1, 'healthy order should be stored');

  await setScenario('error500');
  const failed = await postOrder();
  assert(failed.status === 500, 'error500 should return 500');

  await setScenario('garbage');
  const garbage = await postOrder();
  let parsed = true;
  try {
    await garbage.json();
  } catch {
    parsed = false;
  }
  assert(!parsed, 'garbage should not be valid JSON');

  await setScenario('empty');
  const empty = await postOrder();
  assert((await empty.text()) === '', 'empty should have no body');

  await setScenario('reset');
  let reset = false;
  try {
    await postOrder();
  } catch {
    reset = true;
  }
  assert(reset, 'reset should drop the connection');

  await setScenario('timeout');
  let timedOut = false;
  try {
    await postOrder();
  } catch {
    timedOut = true;
  }
  assert(timedOut, 'timeout should not respond within 2s');

  assert(orders.length === 1, 'faulted calls must not create orders');
  assert(SCENARIOS.length === 8, 'expected 8 scenarios');

  await setScenario('ghost');
  let ghostDropped = false;
  try {
    await postOrder({ 'idempotency-key': 'smoke-key' });
  } catch {
    ghostDropped = true;
  }
  assert(ghostDropped, 'ghost should lose the first response');
  assert(orders.length === 2, 'ghost should still save the first order');
  const retry = await postOrder({ 'idempotency-key': 'smoke-key' });
  assert(retry.status === 201, 'ghost retry should answer normally');
  assert(orders.length === 2, 'a retry with the same idempotency key must not create a second order');
  console.log('smoke ok: proxy faults behave, ground truth holds');
} finally {
  appServer.close();
  proxyServer.close();
  appServer.closeAllConnections();
  proxyServer.closeAllConnections();
}
