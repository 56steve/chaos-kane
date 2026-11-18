import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli-args.js';

test('demo mode needs nothing else', () => {
  const config = parseArgs(['--demo']);
  assert.equal(config.demo, true);
  assert.equal(config.repeat, 1);
  assert.equal(config.dashboard, true);
});

test('bring-your-own-app needs a flow', () => {
  assert.throws(() => parseArgs(['--app', 'http://localhost:3000']), /--flow/);
  const config = parseArgs(['--app', 'http://localhost:3000', '--flow', 'add an item and check out']);
  assert.equal(config.app, 'http://localhost:3000');
  assert.equal(config.flow, 'add an item and check out');
});

test('either demo or app, never both and never neither', () => {
  assert.throws(() => parseArgs([]), /--demo or --app/);
  assert.throws(() => parseArgs(['--demo', '--app', 'http://localhost:3000', '--flow', 'x']), /not both/i);
});

test('flags accept both --key value and --key=value', () => {
  const config = parseArgs(['--demo', '--repeat=3', '--proxy-port', '4500']);
  assert.equal(config.repeat, 3);
  assert.equal(config.proxyPort, 4500);
});

test('faults are validated against the known scenarios', () => {
  assert.deepEqual(parseArgs(['--demo', '--faults', 'error500,ghost']).faults, ['error500', 'ghost']);
  assert.deepEqual(parseArgs(['--demo', '--only=none']).faults, ['none']);
  assert.throws(() => parseArgs(['--demo', '--faults', 'error500,bogus']), /bogus/);
});

test('bad numbers and URLs are rejected with a clear message', () => {
  assert.throws(() => parseArgs(['--demo', '--repeat', '0']), /--repeat/);
  assert.throws(() => parseArgs(['--demo', '--proxy-port', 'abc']), /--proxy-port/);
  assert.throws(() => parseArgs(['--app', 'not a url', '--flow', 'x']), /--app/);
  assert.throws(() => parseArgs(['--demo', '--truth-url', 'nope']), /--truth-url/);
});

test('unknown flags fail instead of being ignored', () => {
  assert.throws(() => parseArgs(['--demo', '--turbo']), /unknown/i);
});

test('dashboard flags', () => {
  const config = parseArgs(['--demo', '--no-dashboard', '--keep-open']);
  assert.equal(config.dashboard, false);
  assert.equal(config.keepOpen, true);
});

test('fault paths and methods are normalised', () => {
  const config = parseArgs(['--demo', '--fault-paths', '/api/,/v2/', '--fault-methods', 'post,put']);
  assert.deepEqual(config.faultPaths, ['/api/', '/v2/']);
  assert.deepEqual(config.faultMethods, ['POST', 'PUT']);
});

test('--claims takes a regular expression and rejects an invalid one', () => {
  assert.equal(parseArgs(['--demo', '--claims', 'all set|booked']).claims, 'all set|booked');
  assert.equal(parseArgs(['--demo']).claims, undefined);
  assert.throws(() => parseArgs(['--demo', '--claims', '(unclosed']), /--claims/);
});

test('every fault scenario, including double, is accepted', () => {
  assert.deepEqual(parseArgs(['--demo', '--faults', 'double,ghost']).faults, ['double', 'ghost']);
});

test('help short circuits validation', () => {
  assert.equal(parseArgs(['--help']).help, true);
});

test('--agent-claim and --baseline are accepted and default to undefined', () => {
  const config = parseArgs(['--demo', '--agent-claim', 'handles API failures', '--baseline', 'reports/baseline.json']);
  assert.equal(config.agentClaim, 'handles API failures');
  assert.equal(config.baseline, 'reports/baseline.json');
  const plain = parseArgs(['--demo']);
  assert.equal(plain.agentClaim, undefined);
  assert.equal(plain.baseline, undefined);
});
