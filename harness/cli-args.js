import { SCENARIOS } from '../chaos/proxy.js';

const VALUE_FLAGS = new Set([
  'app',
  'flow',
  'faults',
  'only',
  'fault-paths',
  'fault-methods',
  'truth-url',
  'noun',
  'claims',
  'agent-claim',
  'baseline',
  'repeat',
  'max-steps',
  'proxy-port',
  'dashboard-port',
  'out',
]);
const BOOLEAN_FLAGS = new Set(['demo', 'no-dashboard', 'keep-open', 'dry-run', 'help']);

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireUrl(flag, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('not http');
    }
    return value;
  } catch {
    throw new Error(`${flag} must be an http(s) URL, got "${value}"`);
  }
}

function requireInteger(flag, value, minimum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${flag} must be an integer of at least ${minimum}, got "${value}"`);
  }
  return number;
}

function tokenize(argv) {
  const raw = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument "${token}"`);
    }
    const equals = token.indexOf('=');
    const name = (equals === -1 ? token.slice(2) : token.slice(2, equals)).trim();
    if (BOOLEAN_FLAGS.has(name)) {
      raw.set(name, true);
    } else if (VALUE_FLAGS.has(name)) {
      const value = equals === -1 ? argv[(index += 1)] : token.slice(equals + 1);
      if (value === undefined || value === '') {
        throw new Error(`--${name} needs a value`);
      }
      raw.set(name, value);
    } else {
      throw new Error(`unknown flag --${name}`);
    }
  }
  return raw;
}

/**
 * Parses the chaos-kane command line into a validated config. Throws an Error
 * with a readable message for anything invalid, so nothing is silently ignored.
 */
export function parseArgs(argv, env = {}) {
  const raw = tokenize(argv);
  if (raw.has('help')) {
    return { help: true };
  }

  const demo = raw.has('demo');
  const app = raw.get('app');
  if (demo && app) {
    throw new Error('use --demo or --app, not both');
  }
  if (!demo && !app) {
    throw new Error('choose a target: --demo or --app <url> --flow "<what a user does>"');
  }
  const flow = raw.get('flow');
  if (app && !flow) {
    throw new Error('--flow is required with --app: describe in plain English what a user does');
  }
  if (app) {
    requireUrl('--app', app);
  }

  const faultsRaw = raw.get('faults') ?? raw.get('only');
  const faults = faultsRaw ? splitList(faultsRaw) : null;
  if (faults) {
    const unknown = faults.filter((name) => !SCENARIOS.includes(name));
    if (unknown.length > 0) {
      throw new Error(`unknown fault(s): ${unknown.join(', ')}. Valid: ${SCENARIOS.join(', ')}`);
    }
  }

  const truthUrl = raw.get('truth-url');
  if (truthUrl) {
    requireUrl('--truth-url', truthUrl);
  }

  const claims = raw.get('claims');
  if (claims) {
    try {
      new RegExp(claims, 'i');
    } catch {
      throw new Error(`--claims must be a valid regular expression, got "${claims}"`);
    }
  }

  return {
    help: false,
    demo,
    app,
    flow,
    faults,
    autoTarget: Boolean(app) && !raw.has('fault-paths') && !raw.has('fault-methods'),
    faultPaths: splitList(raw.get('fault-paths') ?? '/api/'),
    faultMethods: splitList(raw.get('fault-methods') ?? 'POST,PUT,PATCH,DELETE').map((method) => method.toUpperCase()),
    truthUrl,
    noun: raw.get('noun') ?? (demo ? 'order' : 'record'),
    claims,
    agentClaim: raw.get('agent-claim'),
    baseline: raw.get('baseline'),
    repeat: requireInteger('--repeat', raw.get('repeat') ?? 1, 1),
    maxSteps: requireInteger('--max-steps', raw.get('max-steps') ?? 15, 5),
    proxyPort: requireInteger('--proxy-port', raw.get('proxy-port') ?? 4100, 1),
    dashboardPort: requireInteger('--dashboard-port', raw.get('dashboard-port') ?? 4200, 1),
    dashboard: !raw.has('no-dashboard'),
    keepOpen: raw.has('keep-open'),
    dryRun: raw.has('dry-run'),
    out: raw.get('out') ?? env.CHAOS_OUT ?? 'reports',
  };
}
