import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeFor, formatReport, parseDoctorArgs, runDoctor, summarizeResults, toJson } from './doctor.js';

/** A machine where everything is fine; tests override the one thing they care about. */
function machine(overrides = {}) {
  const calls = [];
  const deps = {
    platform: 'darwin',
    env: {},
    nodeVersion: '24.1.0',
    cwd: '/work',
    fileExists: async () => true,
    listenOn: async () => true,
    fetchImpl: async () => ({ status: 200 }),
    fetchCount: async () => 3,
    execFile: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'kane-cli' && args[0] === '--version') return { stdout: 'Skill update available\n0.10.6\n', stderr: '' };
      if (command === 'kane-cli' && args[0] === 'whoami') return { stdout: ' Identity\n  Authenticated\n  Token  valid\n', stderr: '' };
      if (command === 'kane-cli' && args[0] === 'balance') return { stdout: 'Available credits: 10163.4842\n', stderr: '' };
      if (command === 'unzip') return { stdout: 'UnZip 6.00', stderr: '' };
      throw new Error(`unexpected command ${command}`);
    },
    ...overrides,
  };
  return { deps, calls };
}

const byId = (results, id) => results.find((result) => result.id === id);
const missing = () => Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

test('a healthy machine is ready with nothing to fix', async () => {
  const { deps } = machine();
  const results = await runDoctor({}, deps);
  assert.equal(results.filter((result) => result.status === 'fail').length, 0);
  assert.equal(exitCodeFor(results), 0);
  assert.equal(byId(results, 'node').status, 'ok');
  assert.equal(byId(results, 'kane-login').status, 'ok');
  assert.match(byId(results, 'kane-credits').detail, /10,163/);
});

test('an old Node is a failure that says which version is needed', async () => {
  const { deps } = machine({ nodeVersion: '20.11.0' });
  const node = byId(await runDoctor({}, deps), 'node');
  assert.equal(node.status, 'fail');
  assert.match(node.fix, /22/);
  assert.match(node.detail, /20\.11\.0/);
});

test('missing Chrome fails and mentions the override variable', async () => {
  const { deps } = machine({ fileExists: async () => false });
  const chrome = byId(await runDoctor({}, deps), 'chrome');
  assert.equal(chrome.status, 'fail');
  assert.match(chrome.fix, /KANE_CLI_CHROME_PATH/);
});

test('a Chrome path from the environment is used, and a wrong one is called out', async () => {
  const seen = [];
  const good = machine({ env: { KANE_CLI_CHROME_PATH: '/opt/chrome' }, fileExists: async (path) => (seen.push(path), path === '/opt/chrome') });
  assert.equal(byId(await runDoctor({}, good.deps), 'chrome').status, 'ok');
  const bad = machine({ env: { KANE_CLI_CHROME_PATH: '/nope/chrome' }, fileExists: async () => false });
  const chrome = byId(await runDoctor({}, bad.deps), 'chrome');
  assert.equal(chrome.status, 'fail');
  assert.match(chrome.detail, /\/nope\/chrome/);
});

test('Kane CLI missing fails with the install command and skips the checks that need it', async () => {
  const { deps } = machine({ execFile: async (command) => { if (command === 'kane-cli') throw missing(); return { stdout: 'ok', stderr: '' }; } });
  const results = await runDoctor({}, deps);
  assert.equal(byId(results, 'kane').status, 'fail');
  assert.match(byId(results, 'kane').fix, /npm install -g @testmuai\/kane-cli/);
  assert.equal(byId(results, 'kane-login').status, 'skip');
  assert.equal(byId(results, 'kane-credits').status, 'skip');
});

test('not being logged in fails with the login command and skips credits', async () => {
  const { deps } = machine({
    execFile: async (command, args) => {
      if (args[0] === '--version') return { stdout: '0.10.6', stderr: '' };
      if (args[0] === 'whoami') return { stdout: ' Identity\n  Not logged in\n', stderr: '' };
      return { stdout: 'ok', stderr: '' };
    },
  });
  const results = await runDoctor({}, deps);
  assert.equal(byId(results, 'kane-login').status, 'fail');
  assert.match(byId(results, 'kane-login').fix, /kane-cli login/);
  assert.equal(byId(results, 'kane-credits').status, 'skip');
});

test('credits: none fails, few warns, plenty is fine', async () => {
  const withCredits = (text) => machine({
    execFile: async (command, args) => {
      if (args[0] === '--version') return { stdout: '0.10.6', stderr: '' };
      if (args[0] === 'whoami') return { stdout: 'Authenticated', stderr: '' };
      if (args[0] === 'balance') return { stdout: text, stderr: '' };
      return { stdout: 'ok', stderr: '' };
    },
  }).deps;
  assert.equal(byId(await runDoctor({}, withCredits('Available credits: 0')), 'kane-credits').status, 'fail');
  assert.equal(byId(await runDoctor({}, withCredits('Available credits: 150.5')), 'kane-credits').status, 'warn');
  assert.equal(byId(await runDoctor({}, withCredits('Available credits: 5000')), 'kane-credits').status, 'ok');
});

test('credits that cannot be read are a warning, not a crash', async () => {
  const { deps } = machine({
    execFile: async (command, args) => {
      if (args[0] === '--version') return { stdout: '0.10.6', stderr: '' };
      if (args[0] === 'whoami') return { stdout: 'Authenticated', stderr: '' };
      return { stdout: 'something unexpected', stderr: '' };
    },
  });
  assert.equal(byId(await runDoctor({}, deps), 'kane-credits').status, 'warn');
});

test('a missing unzip is a warning that explains what stops working', async () => {
  const { deps } = machine({
    execFile: async (command, args) => {
      if (command === 'unzip') throw missing();
      if (args[0] === '--version') return { stdout: '0.10.6', stderr: '' };
      if (args[0] === 'whoami') return { stdout: 'Authenticated', stderr: '' };
      return { stdout: 'Available credits: 9999', stderr: '' };
    },
  });
  const unzip = byId(await runDoctor({}, deps), 'unzip');
  assert.equal(unzip.status, 'warn');
  assert.match(unzip.detail, /screenshots|network log/i);
});

test('a port in use is a warning that names the flag to change it', async () => {
  const { deps } = machine({ listenOn: async (port) => port !== 4100 });
  const port = byId(await runDoctor({}, deps), 'port-proxy');
  assert.equal(port.status, 'warn');
  assert.match(port.fix, /--proxy-port/);
});

test('custom ports are the ones that get checked', async () => {
  const asked = [];
  const { deps } = machine({ listenOn: async (port) => (asked.push(port), true) });
  await runDoctor({ proxyPort: 4500, dashboardPort: 4600 }, deps);
  assert.ok(asked.includes(4500));
  assert.ok(asked.includes(4600));
});

test('an app that cannot be reached fails; any HTTP answer counts as reachable', async () => {
  const down = machine({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const failed = byId(await runDoctor({ app: 'http://localhost:3000' }, down.deps), 'app');
  assert.equal(failed.status, 'fail');
  assert.match(failed.detail, /ECONNREFUSED/);
  assert.match(failed.fix, /running/i);
  const notFound = machine({ fetchImpl: async () => ({ status: 404 }) });
  assert.equal(byId(await runDoctor({ app: 'http://localhost:3000' }, notFound.deps), 'app').status, 'ok');
});

test('the app and truth checks only run when asked for', async () => {
  const { deps } = machine();
  const results = await runDoctor({}, deps);
  assert.equal(byId(results, 'app'), undefined);
  assert.equal(byId(results, 'truth'), undefined);
});

test('a truth endpoint with nothing countable fails, a good one reports the count', async () => {
  const bad = machine({ fetchCount: async () => { throw new Error('truth endpoint returned JSON with no countable array or count'); } });
  const failed = byId(await runDoctor({ truthUrl: 'http://localhost:3000/api/orders' }, bad.deps), 'truth');
  assert.equal(failed.status, 'fail');
  assert.match(failed.detail, /countable/);
  const good = machine({ fetchCount: async () => 12 });
  const ok = byId(await runDoctor({ truthUrl: 'http://localhost:3000/api/orders' }, good.deps), 'truth');
  assert.equal(ok.status, 'ok');
  assert.match(ok.detail, /12/);
});

test('the exit code is 1 only when something failed, never for warnings or skips', () => {
  assert.equal(exitCodeFor([{ status: 'ok' }, { status: 'warn' }, { status: 'skip' }]), 0);
  assert.equal(exitCodeFor([{ status: 'ok' }, { status: 'fail' }]), 1);
});

test('the summary counts each status and says whether the machine is ready', () => {
  const summary = summarizeResults([{ status: 'ok' }, { status: 'ok' }, { status: 'warn' }, { status: 'fail' }, { status: 'skip' }]);
  assert.deepEqual(summary, { ok: 2, warn: 1, fail: 1, skip: 1, ready: false });
  assert.equal(summarizeResults([{ status: 'ok' }, { status: 'warn' }]).ready, true);
});

test('the report lists every check and shows how to fix only what needs fixing', () => {
  const text = formatReport([
    { id: 'node', name: 'Node 22 or newer', status: 'ok', detail: 'v24.1.0' },
    { id: 'kane', name: 'Kane CLI', status: 'fail', detail: 'not found', fix: 'npm install -g @testmuai/kane-cli' },
    { id: 'unzip', name: 'unzip', status: 'warn', detail: 'missing', fix: 'install unzip' },
  ]);
  assert.match(text, /ok\s+Node 22 or newer\s+v24\.1\.0/);
  assert.match(text, /fail\s+Kane CLI/);
  assert.match(text, /fix: npm install -g @testmuai\/kane-cli/);
  assert.match(text, /fix: install unzip/);
  assert.match(text, /Not ready: 1 problem/);
  assert.equal((text.match(/fix:/g) ?? []).length, 2);
});

test('a clean report says ready, and mentions warnings when there are some', () => {
  assert.match(formatReport([{ id: 'a', name: 'A', status: 'ok', detail: 'fine' }]), /Ready to run/);
  assert.match(formatReport([{ id: 'a', name: 'A', status: 'ok', detail: 'x' }, { id: 'b', name: 'B', status: 'warn', detail: 'y', fix: 'z' }]), /Ready to run.*1 warning/);
});

test('the JSON form has the results, the summary and the exit code', () => {
  const parsed = JSON.parse(toJson([{ id: 'a', name: 'A', status: 'fail', detail: 'x', fix: 'y' }]));
  assert.equal(parsed.ready, false);
  assert.equal(parsed.exitCode, 1);
  assert.equal(parsed.results[0].fix, 'y');
});

test('doctor arguments are validated like the main command', () => {
  assert.deepEqual(parseDoctorArgs([]), { app: undefined, truthUrl: undefined, proxyPort: 4100, dashboardPort: 4200, out: 'reports', json: false });
  const parsed = parseDoctorArgs(['--app', 'http://localhost:3000', '--truth-url=http://localhost:3000/api/orders', '--proxy-port', '4500', '--json']);
  assert.equal(parsed.app, 'http://localhost:3000');
  assert.equal(parsed.truthUrl, 'http://localhost:3000/api/orders');
  assert.equal(parsed.proxyPort, 4500);
  assert.equal(parsed.json, true);
  assert.throws(() => parseDoctorArgs(['--app', 'not a url']), /--app/);
  assert.throws(() => parseDoctorArgs(['--proxy-port', 'abc']), /--proxy-port/);
  assert.throws(() => parseDoctorArgs(['--turbo']), /unknown/i);
});
