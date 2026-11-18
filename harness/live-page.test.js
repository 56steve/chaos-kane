import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { LIVE_PAGE } from './live-page.js';

/** A minimal DOM: just enough surface for the dashboard script to run for real. */
class El {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this._text = '';
    this.className = '';
    this.hidden = false;
    this.href = '';
    this.src = '';
    this.attrs = {};
    this.onclick = null;
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
  }

  setAttribute(key, value) {
    this.attrs[key] = value;
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0];
  }
}

async function startPage() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new El());
      }
      return elements.get(id);
    },
    createElement: (tag) => new El(tag),
    createElementNS: (_ns, tag) => new El(tag),
    createTextNode(text) {
      const node = new El('#text');
      node._text = String(text);
      return node;
    },
  };
  const context = { source: null };
  context.EventSource = class {
    constructor(url) {
      this.url = url;
      context.source = this;
    }
  };
  const script = LIVE_PAGE.match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInNewContext(
    script,
    {
      document,
      location: { hash: '' },
      fetch: () => Promise.reject(new Error('no recording')),
      EventSource: context.EventSource,
      Date,
      setTimeout,
      clearTimeout,
    },
    { timeout: 2000 },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(context.source, 'the page should connect to the live event stream when there is no recording');
  const el = (id) => document.getElementById(id);
  const send = (event) => context.source.onmessage({ data: JSON.stringify(event) });
  return { el, send, source: context.source };
}

const result = (overrides) => ({
  type: 'scenario_result',
  scenario: 'error500',
  outcome: 'failed',
  statusMessage: 'Order placed! Confirmation pending',
  requestStatus: '500',
  statusSource: 'network-log',
  orderCount: 0,
  orderCreated: false,
  reasons: ['fake success: page says "Order placed!" but the backend has no order'],
  ...overrides,
});

const runStart = (extra = {}) => ({ type: 'run_start', scenarios: ['none', 'error500'], repeat: 1, target: 'http://app.test', flow: 'f', noun: 'order', ...extra });
const summary = (overrides) => ({ survived: 1, failed: 0, incomplete: 0, total: 1, baseline: 'survived', credits: 10, ...overrides });

test('a live run shows the headline, the verdict and a single screenshot', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send({ type: 'scenario_start', scenario: 'error500', run: 1, runs: 1 });
  send({ type: 'fault', scenario: 'error500', method: 'POST', path: '/api/order', action: 'answered HTTP 500' });
  assert.match(el('now').textContent, /fault: answered HTTP 500/);
  send(result({ screenshot: 'evidence/error500-1.jpg' }));
  send({ type: 'run_end', summary: summary({ survived: 0, failed: 1 }) });

  assert.equal(el('headline').textContent, '0 of 1 survived');
  assert.equal(el('stageTitle').textContent, 'Server error');
  assert.match(el('verdict').textContent, /fake success/);
  assert.match(el('said').textContent, /Order placed! Confirmation pending/);
  assert.match(el('said').textContent, /request: HTTP 500 · network log/);
  assert.equal(el('count').textContent.startsWith('0'), true);
  assert.equal(el('shotLink').hidden, false);
  assert.equal(el('shotImg').src, 'evidence/error500-1.jpg');
  assert.equal(el('compare').hidden, true);
});

test('a result without a screenshot hides the screenshot panel', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({}));
  assert.equal(el('shotLink').hidden, true);
  assert.equal(el('compare').hidden, true);
});

test('the same scenario in a before run and an after run is shown side by side', async () => {
  const { el, send } = await startPage();
  send(runStart({ label: 'before' }));
  send(result({ label: 'before', screenshot: 'evidence/before/error500-1.jpg' }));
  send({ type: 'run_end', summary: summary({ survived: 0, failed: 1 }) });
  send({ type: 'fix', file: 'app/client.js', lines: ['@@ -1,2 +1,2 @@', '-old line', '+new line', ' same'] });
  send(runStart({ label: 'after' }));
  send({ type: 'scenario_start', scenario: 'error500', run: 1, runs: 1 });
  send(
    result({
      label: 'after',
      outcome: 'survived',
      statusMessage: "We couldn't place your order.",
      reasons: ['no order saved and the user saw a clear error'],
      screenshot: 'evidence/after/error500-1.jpg',
    }),
  );

  assert.equal(el('compare').hidden, false);
  assert.equal(el('shotLink').hidden, true);
  assert.equal(el('cmpBeforeImg').src, 'evidence/before/error500-1.jpg');
  assert.equal(el('cmpAfterImg').src, 'evidence/after/error500-1.jpg');
  assert.match(el('cmpBeforeCap').textContent, /Before the fix · ≠ fake success/);
  assert.match(el('cmpAfterCap').textContent, /After the fix · honest/);
  assert.equal(el('cmpBeforeCap').className, 'cap bad');
  assert.equal(el('cmpAfterCap').className, 'cap good');
});

test('the fix event shows a colored diff that survives the next run starting', async () => {
  const { el, send } = await startPage();
  send(runStart({ label: 'before' }));
  send({ type: 'fix', file: 'app/client.js', lines: ['@@ -1 +1 @@', '-old', '+new', ' same'] });
  send(runStart({ label: 'after' }));

  assert.equal(el('fix').hidden, false);
  assert.match(el('fixTitle').textContent, /Agent fix · app\/client\.js/);
  const kinds = el('fixBody').children.map((child) => child.className);
  assert.deepEqual(kinds, ['hunk', 'del', 'add', '']);
  assert.match(el('fixBody').children[1].textContent, /^-old/);
});

test('without a fix event the fix panel is never filled in', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({}));
  assert.equal(el('fixBody').children.length, 0);
  assert.equal(el('fixTitle').textContent, '');
});

test('the page does not mark HTML hidden by default for the panels it controls', () => {
  assert.match(LIVE_PAGE, /id="compare" hidden/);
  assert.match(LIVE_PAGE, /id="fix" hidden/);
  assert.match(LIVE_PAGE, /id="shotLink"[^>]* hidden/);
});

test('clicking a scenario in the list selects it', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({ scenario: 'none', outcome: 'survived', statusMessage: 'Order placed!', orderCount: 1, orderCreated: true, requestStatus: '201', reasons: ['ok'] }));
  send(result({}));
  assert.equal(el('stageTitle').textContent, 'Server error');
  el('list').children[0].onclick();
  assert.equal(el('stageTitle').textContent, 'Healthy API');
  assert.match(el('verdict').textContent, /honest/);
});

test('an agent claim line shows the claim and its verdict', async () => {
  const { el, send } = await startPage();
  send(runStart({ claim: 'handles API failures' }));
  assert.match(el('claim').textContent, /Agent claimed: "handles API failures"/);
  send({ type: 'run_end', summary: summary({ survived: 0, failed: 1 }), claim: { text: 'handles API failures', verdict: 'not supported' } });
  assert.match(el('claim').textContent, /not supported/);
  assert.equal(el('claim').className, 'claim bad');
});

test('unknown events and hostile text do not break the page', async () => {
  const { el, send } = await startPage();
  send(runStart());
  assert.doesNotThrow(() => send({ type: 'something_new', whatever: 1 }));
  assert.doesNotThrow(() => send({ type: 'kane_line', scenario: 'error500', text: '<img src=x onerror=alert(1)>' }));
  assert.equal(el('now').textContent, 'Kane: <img src=x onerror=alert(1)>');
});
