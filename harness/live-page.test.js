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

/**
 * Runs the real dashboard script. With `events` it starts in replay mode (a recording
 * is "found"); otherwise it connects to the live event stream. Timers are captured so
 * the tests control time and can read the delays the replay asks for.
 */
async function startPage({ events = null } = {}) {
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
  const state = { source: null, timers: [], preloaded: [] };
  const sandbox = {
    document,
    location: { hash: '' },
    fetch: () => (events ? Promise.resolve({ ok: true, json: async () => events }) : Promise.reject(new Error('no recording'))),
    EventSource: class {
      constructor(url) {
        this.url = url;
        state.source = this;
      }
    },
    Image: class {
      set src(value) {
        state.preloaded.push(value);
      }
    },
    Date,
    setTimeout(fn, ms) {
      state.timers.push({ fn, ms });
      return state.timers.length;
    },
    clearTimeout(id) {
      if (state.timers[id - 1]) {
        state.timers[id - 1].cleared = true;
      }
    },
  };
  const script = LIVE_PAGE.match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInNewContext(script, sandbox, { timeout: 2000 });
  await new Promise((resolve) => setImmediate(resolve));
  const el = (id) => document.getElementById(id);
  const send = (event) => state.source.onmessage({ data: JSON.stringify(event) });
  /** Runs the most recent pending timer, like time passing. Returns the delay it had asked for. */
  const tick = () => {
    const pending = state.timers.filter((timer) => !timer.cleared && !timer.done);
    const timer = pending[pending.length - 1];
    timer.done = true;
    timer.fn();
    return timer.ms;
  };
  return { el, send, state, tick };
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
const phases = (el) => el('phases').children.map((child) => `${child.textContent}:${child.className.replace('phase', '').trim() || 'todo'}`);

test('a live run shows the headline, the verdict and one screenshot in the shared frame', async () => {
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
  assert.match(el('said').textContent, /request: HTTP 500 · network log/);
  assert.equal(el('compare').hidden, false);
  assert.equal(el('cmpBeforeImg').src, 'evidence/error500-1.jpg');
  assert.match(el('cmpBeforeCap').textContent, /Kane's screenshot · ≠ fake success/);
  assert.equal(el('cmpAfterLink').className, 'ghost', 'the second cell keeps its space but stays invisible');
});

test('a result without any screenshot keeps the panel hidden', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({}));
  assert.equal(el('compare').hidden, true);
});

test('once a screenshot has been shown the panel dims instead of collapsing, so the page never jumps', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({ screenshot: 'evidence/error500-1.jpg' }));
  assert.equal(el('compare').className, 'compare');
  send({ type: 'scenario_start', scenario: 'none', run: 1, runs: 1 });
  assert.equal(el('compare').className, 'compare dim');
  assert.equal(el('compare').hidden, false);
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
  assert.equal(el('cmpBeforeImg').src, 'evidence/before/error500-1.jpg');
  assert.equal(el('cmpAfterImg').src, 'evidence/after/error500-1.jpg');
  assert.equal(el('cmpAfterLink').className, '');
  assert.match(el('cmpBeforeCap').textContent, /Before the fix · ≠ fake success/);
  assert.match(el('cmpAfterCap').textContent, /After the fix · honest/);
  assert.equal(el('cmpBeforeCap').className, 'cap bad');
  assert.equal(el('cmpAfterCap').className, 'cap good');
});

test('the steps move Break, Observe, Diagnose, Fix, Verify as the story advances', async () => {
  const { el, send } = await startPage();
  assert.deepEqual(phases(el), ['Break:active', 'Observe:todo', 'Diagnose:todo', 'Fix:todo', 'Verify:todo']);
  send(runStart({ label: 'before' }));
  send({ type: 'scenario_start', scenario: 'error500', run: 1, runs: 1 });
  assert.deepEqual(phases(el), ['Break:done', 'Observe:active', 'Diagnose:todo', 'Fix:todo', 'Verify:todo']);
  send(result({ label: 'before' }));
  send({ type: 'run_end', summary: summary({ survived: 0, failed: 1 }) });
  assert.deepEqual(phases(el), ['Break:done', 'Observe:done', 'Diagnose:active', 'Fix:todo', 'Verify:todo']);
  send({ type: 'fix', file: 'app/client.js', lines: ['@@ -1 +1 @@'] });
  assert.deepEqual(phases(el), ['Break:done', 'Observe:done', 'Diagnose:done', 'Fix:active', 'Verify:todo']);
  send(runStart({ label: 'after' }));
  assert.deepEqual(phases(el), ['Break:done', 'Observe:done', 'Diagnose:done', 'Fix:done', 'Verify:active']);
});

test('the diagnosis groups the failures by cause and names the scenarios', async () => {
  const { el, send } = await startPage();
  send(runStart({ scenarios: ['error500', 'garbage', 'timeout', 'ghost'], label: 'before' }));
  send(result({ scenario: 'error500', label: 'before' }));
  send(result({ scenario: 'garbage', label: 'before' }));
  send(result({ scenario: 'timeout', label: 'before', reasons: ['no order saved and no clear error shown'] }));
  send(result({ scenario: 'ghost', label: 'before', reasons: ['duplicate order: one flow produced 2 orders'] }));
  send(result({ scenario: 'none', label: 'before', outcome: 'survived', reasons: ['ok'] }));
  send({ type: 'run_end', summary: summary({ survived: 1, failed: 4, total: 5 }) });

  const lines = el('diagList').children.map((li) => li.textContent);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /2 × Fake success/);
  assert.match(lines[0], /Server error, HTML, not JSON/);
  assert.match(lines[1], /1 × Duplicate order/);
  assert.match(lines[2], /1 × Silent failure/);
  assert.equal(el('diag').hidden, false);
});

test('a run where everything survived has no diagnosis', async () => {
  const { el, send } = await startPage();
  send(runStart({ label: 'after' }));
  send(result({ label: 'after', outcome: 'survived', reasons: ['ok'] }));
  send({ type: 'run_end', summary: summary() });
  assert.equal(el('diag').hidden, true);
});

test('the diagnosis is cleared when the next run starts', async () => {
  const { el, send } = await startPage();
  send(runStart({ label: 'before' }));
  send(result({ label: 'before' }));
  send({ type: 'run_end', summary: summary({ survived: 0, failed: 1 }) });
  assert.equal(el('diag').hidden, false);
  send(runStart({ label: 'after' }));
  assert.equal(el('diag').hidden, true);
});

test('the wire diagram is not redrawn on every event, so its animation does not restart', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send({ type: 'scenario_start', scenario: 'error500', run: 1, runs: 1 });
  const first = el('wire').children[0];
  send({ type: 'kane_line', scenario: 'error500', text: 'type: Type "Grace Hopper"' });
  send({ type: 'kane_line', scenario: 'error500', text: 'click: Place order' });
  send({ type: 'fault', scenario: 'error500', method: 'POST', path: '/api/order', action: 'answered HTTP 500' });
  assert.equal(el('wire').children[0], first, 'the same drawing stays in place');
  send(result({}));
  assert.notEqual(el('wire').children[0], first, 'a changed state is redrawn');
});

test('the fix event shows a colored diff that survives the next run starting', async () => {
  const { el, send } = await startPage();
  send(runStart({ label: 'before' }));
  send({ type: 'fix', file: 'app/client.js', lines: ['@@ -1 +1 @@', '-old', '+new', ' same'] });
  send(runStart({ label: 'after' }));
  assert.equal(el('fix').hidden, false);
  assert.match(el('fixTitle').textContent, /Agent fix · app\/client\.js/);
  assert.deepEqual(el('fixBody').children.map((child) => child.className), ['hunk', 'del', 'add', '']);
});

test('without a fix event the fix panel is never filled in', async () => {
  const { el, send } = await startPage();
  send(runStart());
  send(result({}));
  assert.equal(el('fixBody').children.length, 0);
  assert.equal(el('fixTitle').textContent, '');
});

test('the panels the script controls start hidden in the markup', () => {
  assert.match(LIVE_PAGE, /id="compare" hidden/);
  assert.match(LIVE_PAGE, /id="fix" hidden/);
  assert.match(LIVE_PAGE, /id="diag" hidden/);
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

const recording = [
  { type: 'run_start', label: 'before', scenarios: ['error500'], repeat: 1, target: 'http://app.test', flow: 'f', noun: 'order', at: 'T0' },
  { type: 'scenario_start', scenario: 'error500', run: 1, runs: 1, at: 'T1' },
  { type: 'fault', scenario: 'error500', method: 'POST', path: '/api/order', action: 'answered HTTP 500', at: 'T2' },
  { type: 'kane_line', scenario: 'error500', text: 'click: Place order', at: 'T3' },
  { ...result({ label: 'before', screenshot: 'evidence/before/error500-1.jpg' }), at: 'T4' },
  { type: 'run_end', summary: summary({ survived: 0, failed: 1 }), at: 'T5' },
  { type: 'fix', file: 'app/client.js', lines: ['@@ -1 +1 @@', '-a', '+b'], at: 'T6' },
  { type: 'run_start', label: 'after', scenarios: ['error500'], repeat: 1, target: 'http://app.test', flow: 'f', noun: 'order', at: 'T7' },
];

test('the replay is paced for a person: slow enough to read each result, the diagnosis and the fix', async () => {
  const { tick, state } = await startPage({ events: recording });
  const pending = () => state.timers.filter((timer) => !timer.cleared && !timer.done).at(-1)?.ms;
  const delays = [];
  for (let step = 0; step < 7; step += 1) {
    delays.push(pending()); // how long the event just shown stays on screen
    tick();
  }
  // run_start, scenario_start, fault, kane_line, scenario_result, run_end, fix
  assert.deepEqual(delays, [1600, 1100, 1400, 600, 3500, 5500, 6500]);
  assert.ok(delays[4] >= 3000, 'a result stays on screen for several seconds');
  assert.ok(delays[5] >= 5000, 'the diagnosis stays on screen long enough to read');
  assert.ok(delays[6] >= 6000, 'the fix stays on screen long enough to read');
});

test('the replay preloads every screenshot so images do not flash in', async () => {
  const { state } = await startPage({ events: recording });
  assert.deepEqual(state.preloaded, ['evidence/before/error500-1.jpg']);
});

test('the speed button changes the pace and pause stops it', async () => {
  const { el, tick, state } = await startPage({ events: recording });
  const pending = () => state.timers.filter((timer) => !timer.cleared && !timer.done).at(-1)?.ms;
  const [pauseBtn, speedBtn] = el('mode').children[0].children;
  assert.equal(pauseBtn.textContent, 'Pause');
  assert.equal(speedBtn.textContent, '1x');
  assert.equal(pending(), 1600);
  speedBtn.onclick();
  assert.equal(speedBtn.textContent, '2x');
  tick();
  assert.equal(pending(), 1100 / 2, 'at 2x the next delay is half as long');

  pauseBtn.onclick();
  assert.equal(pauseBtn.textContent, 'Resume');
  assert.equal(pending(), undefined, 'pausing cancels the next step');
  const before = state.timers.length;
  pauseBtn.onclick();
  assert.equal(state.timers.length, before + 1, 'resuming schedules the next step again');
  assert.equal(pauseBtn.textContent, 'Pause');
});

test('restarting the replay does not add more buttons', async () => {
  const { el } = await startPage({ events: recording });
  const buttons = () => el('mode').children.flatMap((child) => child.children).length;
  assert.equal(buttons(), 3);
  el('mode').children[0].children[2].onclick();
  el('mode').children[0].children[2].onclick();
  assert.equal(buttons(), 3);
  assert.equal(el('mode').children.length, 1);
});
