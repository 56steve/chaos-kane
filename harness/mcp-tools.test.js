import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChaosArgv, createChaosTools, formatCheckResult } from './mcp-tools.js';
import { parseArgs } from './cli-args.js';

const results = [
  { scenario: 'none', outcome: 'survived', reasons: ['order was saved and the user was told so'] },
  {
    scenario: 'error500',
    outcome: 'failed',
    reasons: ['fake success: page says "Order placed!" but the backend has no order'],
    statusMessage: 'Order placed!',
    requestStatus: '500',
    orderCount: 0,
  },
];
const summary = { survived: 0, failed: 1, incomplete: 0, total: 1, baseline: 'survived', credits: 20 };

test('the arguments become a valid command line with safe defaults', () => {
  const argv = buildChaosArgv({ app_url: 'http://localhost:3000', flow: 'check out' }, 'reports/mcp');
  const config = parseArgs(argv);
  assert.equal(config.app, 'http://localhost:3000');
  assert.equal(config.dashboard, false);
  assert.deepEqual(config.faults, ['none', 'error500', 'ghost']);
  assert.equal(config.out, 'reports/mcp');
});

test('optional arguments are passed through and lists are joined', () => {
  const argv = buildChaosArgv(
    { app_url: 'http://localhost:3000', flow: 'x', faults: ['timeout', 'ghost'], truth_url: 'http://localhost:3000/api/orders', repeat: 2, noun: 'booking' },
    'out',
  );
  const config = parseArgs(argv);
  assert.deepEqual(config.faults, ['timeout', 'ghost']);
  assert.equal(config.truthUrl, 'http://localhost:3000/api/orders');
  assert.equal(config.repeat, 2);
  assert.equal(config.noun, 'booking');
});

test('missing required arguments are rejected with a clear message', () => {
  assert.throws(() => buildChaosArgv({ flow: 'x' }, 'out'), /app_url/);
  assert.throws(() => buildChaosArgv({ app_url: 'http://localhost:3000' }, 'out'), /flow/);
});

test('the result text carries the score, each scenario and the fix brief', () => {
  const text = formatCheckResult({ results, summary, brief: '# chaos-kane fix brief\n' });
  assert.match(text, /0 of 1 injected failures survived/);
  assert.match(text, /error500: failed/);
  assert.match(text, /fake success/);
  assert.match(text, /# chaos-kane fix brief/);
});

test('an all-survived result says so without a brief', () => {
  const text = formatCheckResult({ results: [results[0]], summary: { ...summary, survived: 0, failed: 0, total: 0 }, brief: null });
  assert.match(text, /nothing to fix/i);
});

test('chaos_check runs once at a time and reports the result', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const [check] = createChaosTools({
    run: async (config) => {
      calls.push(config.app);
      await gate;
      return { results, summary, briefPath: null, exitCode: 1 };
    },
    readBrief: async () => '# brief',
  });
  const first = check.handler({ app_url: 'http://localhost:3000', flow: 'x' });
  await assert.rejects(check.handler({ app_url: 'http://localhost:3000', flow: 'x' }), /already in progress/);
  release();
  assert.match(await first, /error500: failed/);
  assert.deepEqual(calls, ['http://localhost:3000']);
  release();
});

test('the tool list has a schema that names the required inputs', () => {
  const [check, scenarios] = createChaosTools({ run: async () => ({}), readBrief: async () => '' });
  assert.equal(check.name, 'chaos_check');
  assert.deepEqual(check.inputSchema.required, ['app_url', 'flow']);
  assert.equal(scenarios.name, 'chaos_scenarios');
});

test('chaos_scenarios lists every fault', async () => {
  const [, scenarios] = createChaosTools({ run: async () => ({}), readBrief: async () => '' });
  const text = await scenarios.handler({});
  for (const name of ['error500', 'ghost', 'double', 'timeout']) {
    assert.match(text, new RegExp(name));
  }
});
