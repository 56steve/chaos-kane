import { execFile as execFileCallback } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { kaneCommand } from './kane-bin.js';
import { fetchCount } from './truth.js';

const execFileAsync = promisify(execFileCallback);
const MIN_NODE_MAJOR = 22;
const LOW_CREDITS = 200;
const CREDITS_PER_RUN = 20;
const COMMAND_TIMEOUT_MS = 20000;

/** The real machine: used by the command; tests pass a fake one. */
export function defaultDeps() {
  return {
    platform: process.platform,
    env: process.env,
    nodeVersion: process.versions.node,
    cwd: process.cwd(),
    execFile: (command, args) => {
      const launch = command === 'kane-cli' ? kaneCommand(args) : { command, args };
      return execFileAsync(launch.command, launch.args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
    },
    fileExists: (file) => access(file, constants.F_OK).then(() => true, () => false),
    listenOn: (port) =>
      new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      }),
    fetchImpl: (url) => fetch(url, { signal: AbortSignal.timeout(5000) }),
    fetchCount,
  };
}

function result(id, name, status, detail, fix) {
  return fix ? { id, name, status, detail, fix } : { id, name, status, detail };
}

function chromeCandidates(platform) {
  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  if (platform === 'win32') {
    return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
}

function checkNode(deps) {
  const major = Number(deps.nodeVersion.split('.')[0]);
  return major >= MIN_NODE_MAJOR
    ? result('node', `Node ${MIN_NODE_MAJOR} or newer`, 'ok', `v${deps.nodeVersion}`)
    : result('node', `Node ${MIN_NODE_MAJOR} or newer`, 'fail', `found v${deps.nodeVersion}`, `Install Node ${MIN_NODE_MAJOR} or newer from https://nodejs.org`);
}

async function checkChrome(deps) {
  const override = deps.env.KANE_CLI_CHROME_PATH;
  if (override) {
    return (await deps.fileExists(override))
      ? result('chrome', 'Google Chrome', 'ok', `${override} (from KANE_CLI_CHROME_PATH)`)
      : result('chrome', 'Google Chrome', 'fail', `KANE_CLI_CHROME_PATH points to ${override}, which does not exist`, 'Fix or unset KANE_CLI_CHROME_PATH');
  }
  for (const candidate of chromeCandidates(deps.platform)) {
    if (await deps.fileExists(candidate)) {
      return result('chrome', 'Google Chrome', 'ok', candidate);
    }
  }
  return result('chrome', 'Google Chrome', 'fail', 'not found in the usual places', 'Install Google Chrome, or set KANE_CLI_CHROME_PATH to its location');
}

async function checkKane(deps) {
  try {
    const { stdout } = await deps.execFile('kane-cli', ['--version']);
    const version = stdout.match(/\d+\.\d+\.\d+/)?.[0];
    return result('kane', 'Kane CLI', 'ok', version ? `version ${version}` : 'installed');
  } catch {
    return result('kane', 'Kane CLI', 'fail', 'kane-cli was not found or did not run', 'npm install -g @testmuai/kane-cli');
  }
}

async function checkLogin(deps) {
  try {
    const { stdout, stderr } = await deps.execFile('kane-cli', ['whoami']);
    const text = `${stdout}\n${stderr}`;
    if (/not (logged in|authenticated)/i.test(text) || !/authenticated/i.test(text)) {
      return result('kane-login', 'Kane login', 'fail', 'not signed in', 'kane-cli login   (sign up at https://www.testmuai.com first if you have no account)');
    }
    return result('kane-login', 'Kane login', 'ok', 'signed in');
  } catch {
    return result('kane-login', 'Kane login', 'fail', 'could not read the login status', 'kane-cli login');
  }
}

async function checkCredits(deps) {
  try {
    const { stdout } = await deps.execFile('kane-cli', ['balance']);
    const amount = stdout.match(/Available credits:\s*([\d.]+)/i)?.[1];
    if (amount === undefined) {
      return result('kane-credits', 'Kane credits', 'warn', 'could not read the balance', 'Run kane-cli balance and check it shows a number');
    }
    const credits = Number(amount);
    const runs = Math.floor(credits / CREDITS_PER_RUN);
    const shown = Math.floor(credits).toLocaleString('en-US');
    if (credits <= 0) {
      return result('kane-credits', 'Kane credits', 'fail', 'no credits left', 'Claim the free credits at https://www.testmuai.com/kane-cli/#creditOffer');
    }
    if (credits < LOW_CREDITS) {
      return result('kane-credits', 'Kane credits', 'warn', `${shown} (about ${runs} single runs)`, 'A full run of every scenario needs about 160 credits; claim more or run fewer scenarios with --faults');
    }
    return result('kane-credits', 'Kane credits', 'ok', `${shown} (about ${runs} single runs)`);
  } catch {
    return result('kane-credits', 'Kane credits', 'warn', 'could not read the balance', 'Run kane-cli balance');
  }
}

async function checkUnzip(deps) {
  try {
    await deps.execFile('unzip', ['-v']);
    return result('unzip', 'unzip', 'ok', 'found, so screenshots and the network-log cross-check work');
  } catch {
    return result('unzip', 'unzip', 'warn', 'not found: runs still work, but without screenshots or the network-log cross-check', 'Install unzip (for example: sudo apt-get install unzip)');
  }
}

async function checkPort(deps, id, label, port, flag) {
  return (await deps.listenOn(port))
    ? result(id, `Port ${port} (${label})`, 'ok', 'free')
    : result(id, `Port ${port} (${label})`, 'warn', 'already in use', `Use a different port with ${flag} <free port>`);
}

async function checkOutput(deps, out) {
  const target = path.resolve(deps.cwd, out);
  for (const candidate of [target, path.dirname(target)]) {
    if (await deps.fileExists(candidate)) {
      return result('output', 'Report folder', 'ok', `${out} (reports will be written here)`);
    }
  }
  return result('output', 'Report folder', 'warn', `${out} and its parent folder do not exist yet`, 'Run from your project folder, or pass --out <folder>');
}

async function checkApp(deps, app) {
  try {
    const response = await deps.fetchImpl(app);
    return result('app', 'Your app', 'ok', `${app} answered (HTTP ${response.status})`);
  } catch (error) {
    return result('app', 'Your app', 'fail', `cannot reach ${app}: ${error instanceof Error ? error.message : error}`, 'Make sure your app is running, then check the URL and port');
  }
}

async function checkTruth(deps, truthUrl) {
  try {
    const count = await deps.fetchCount(truthUrl);
    return result('truth', 'Truth endpoint', 'ok', `${truthUrl} lists ${count} record(s)`);
  } catch (error) {
    return result('truth', 'Truth endpoint', 'fail', error instanceof Error ? error.message : String(error),
      'It must return JSON that is a list, a number, an object with a numeric count, or an object holding a list');
  }
}

function skipped(id, name, reason) {
  return result(id, name, 'skip', reason);
}

/**
 * Checks everything chaos-kane needs on this machine and, optionally, a target app.
 * Each result has an id, a status (ok, warn, fail or skip), a detail, and a fix for
 * anything that needs one. Nothing here launches a browser or changes any file.
 */
export async function runDoctor(options = {}, deps = defaultDeps()) {
  const { app, truthUrl, proxyPort = 4100, dashboardPort = 4200, out = 'reports' } = options;
  const results = [checkNode(deps), await checkChrome(deps)];

  const kane = await checkKane(deps);
  results.push(kane);
  if (kane.status === 'ok') {
    const login = await checkLogin(deps);
    results.push(login);
    results.push(login.status === 'ok' ? await checkCredits(deps) : skipped('kane-credits', 'Kane credits', 'needs a Kane login first'));
  } else {
    results.push(skipped('kane-login', 'Kane login', 'needs Kane CLI first'), skipped('kane-credits', 'Kane credits', 'needs Kane CLI first'));
  }

  results.push(await checkUnzip(deps));
  results.push(await checkPort(deps, 'port-proxy', 'fault proxy', proxyPort, '--proxy-port'));
  results.push(await checkPort(deps, 'port-dashboard', 'live dashboard', dashboardPort, '--dashboard-port'));
  results.push(await checkOutput(deps, out));
  if (app) {
    results.push(await checkApp(deps, app));
  }
  if (truthUrl) {
    results.push(await checkTruth(deps, truthUrl));
  }
  return results;
}

export function summarizeResults(results) {
  const count = (status) => results.filter((entry) => entry.status === status).length;
  const summary = { ok: count('ok'), warn: count('warn'), fail: count('fail'), skip: count('skip') };
  return { ...summary, ready: summary.fail === 0 };
}

/** 0 when nothing failed (warnings and skips do not block), 1 otherwise. */
export function exitCodeFor(results) {
  return results.some((entry) => entry.status === 'fail') ? 1 : 0;
}

export function formatReport(results) {
  const nameWidth = Math.max(...results.map((entry) => entry.name.length));
  const lines = ['chaos-kane doctor', ''];
  for (const entry of results) {
    lines.push(`  ${entry.status.padEnd(4)}  ${entry.name.padEnd(nameWidth)}  ${entry.detail}`);
    if (entry.fix && (entry.status === 'fail' || entry.status === 'warn')) {
      lines.push(`        fix: ${entry.fix}`);
    }
  }
  const { warn, fail, ready } = summarizeResults(results);
  lines.push('');
  if (ready) {
    lines.push(warn > 0 ? `Ready to run, with ${warn} warning${warn === 1 ? '' : 's'}.` : 'Ready to run.');
  } else {
    lines.push(`Not ready: ${fail} problem${fail === 1 ? '' : 's'} to fix.`);
  }
  return `${lines.join('\n')}\n`;
}

export function toJson(results) {
  return JSON.stringify({ ...summarizeResults(results), exitCode: exitCodeFor(results), results }, null, 2);
}

/** Parses `chaos-kane doctor` arguments, rejecting anything unknown. */
export function parseDoctorArgs(argv) {
  const options = { app: undefined, truthUrl: undefined, proxyPort: 4100, dashboardPort: 4200, out: 'reports', json: false };
  const url = (flag, value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('not http');
      }
      return value;
    } catch {
      throw new Error(`${flag} must be an http(s) URL, got "${value}"`);
    }
  };
  const port = (flag, value) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`${flag} must be a port number, got "${value}"`);
    }
    return number;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      options.json = true;
      continue;
    }
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const known = ['--app', '--truth-url', '--proxy-port', '--dashboard-port', '--out'];
    if (!known.includes(name)) {
      throw new Error(`unknown option ${name} for doctor`);
    }
    const value = equals === -1 ? argv[(index += 1)] : token.slice(equals + 1);
    if (value === undefined || value === '') {
      throw new Error(`${name} needs a value`);
    }
    if (name === '--app') options.app = url(name, value);
    if (name === '--truth-url') options.truthUrl = url(name, value);
    if (name === '--proxy-port') options.proxyPort = port(name, value);
    if (name === '--dashboard-port') options.dashboardPort = port(name, value);
    if (name === '--out') options.out = value;
  }
  return options;
}
