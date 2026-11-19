import { parseArgs } from './cli-args.js';
import { formatReport } from './doctor.js';
import { outcomeLabel } from './labels.js';

const QUICK_FAULTS = ['none', 'error500', 'ghost'];

const SCENARIO_LIST = [
  ['none', 'nothing is broken; the baseline'],
  ['error500', 'the write request gets HTTP 500'],
  ['slow', 'the reply is held for 6 seconds'],
  ['timeout', 'the write request never gets an answer'],
  ['garbage', 'the reply is 200 with an HTML page instead of JSON'],
  ['empty', 'the reply is 200 with an empty body'],
  ['reset', 'the connection is dropped'],
  ['ghost', 'the backend saves the change but the first reply is lost, then the user retries (finds duplicates)'],
  ['double', 'the reply is held for 2 seconds while the user double clicks (finds duplicates)'],
];

function requireString(args, key) {
  if (typeof args[key] !== 'string' || args[key].trim() === '') {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return args[key];
}

function listOf(value) {
  return Array.isArray(value) ? value.join(',') : value;
}

/**
 * Turns the tool arguments into the same command line the CLI accepts, so the
 * MCP tool and the CLI share one validation path. Defaults to a quick
 * three-scenario check and never starts the live dashboard.
 */
export function buildChaosArgv(args, outDir) {
  const argv = ['--no-dashboard', '--out', outDir, '--app', requireString(args, 'app_url'), '--flow', requireString(args, 'flow')];
  const optional = [
    ['--faults', listOf(args.faults) ?? QUICK_FAULTS.join(',')],
    ['--truth-url', args.truth_url],
    ['--noun', args.noun],
    ['--claims', args.claims],
    ['--agent-claim', args.agent_claim],
    ['--repeat', args.repeat],
    ['--fault-paths', listOf(args.fault_paths)],
    ['--fault-methods', listOf(args.fault_methods)],
    ['--proxy-port', args.proxy_port],
  ];
  for (const [flag, value] of optional) {
    if (value !== undefined && value !== null && value !== '') {
      argv.push(flag, String(value));
    }
  }
  return argv;
}

/** The text an agent reads: the score, one line per scenario, then the fix brief. */
export function formatCheckResult({ results, summary, brief }) {
  const lines = [`chaos-kane: ${summary.survived} of ${summary.total} injected failures survived.`, ''];
  for (const result of results) {
    lines.push(`- ${result.scenario}: ${outcomeLabel(result.outcome)}. ${result.reasons[0] ?? ''}`.trimEnd());
  }
  lines.push('');
  lines.push(brief ?? 'All scenarios survived, so there is nothing to fix.');
  return lines.join('\n');
}

/**
 * The MCP tools. `run(config)` performs the check (injected so it can be
 * tested without Kane); `readBrief(path)` loads the written fix brief.
 */
export function createChaosTools({ run, readBrief, doctor, outDir = 'reports/mcp' }) {
  let running = false;

  return [
    {
      name: 'chaos_check',
      description:
        'Break the API of a running web app with Kane CLI and check whether what the user sees matches what the backend really did. ' +
        'Drives the given user flow in a real browser while a proxy injects faults (HTTP 500, no answer, bad body, dropped connection, a lost reply that causes duplicates). ' +
        'Returns which scenarios survived, the evidence for each failure, and a fix brief. Takes a few minutes. Only works on same-origin apps whose API calls go through the app URL.',
      inputSchema: {
        type: 'object',
        properties: {
          app_url: { type: 'string', description: 'URL of the running web app, for example http://localhost:3000' },
          flow: { type: 'string', description: 'What a user does, in plain English, ending with the action that saves something' },
          faults: { type: 'array', items: { type: 'string' }, description: 'Scenarios to run (default: none, error500, ghost). See chaos_scenarios.' },
          truth_url: { type: 'string', description: 'JSON endpoint that lists or counts what the backend stored; enables duplicate detection' },
          noun: { type: 'string', description: 'What the flow creates, for example order or booking' },
          claims: { type: 'string', description: 'Regular expression for what counts as a success message' },
          agent_claim: { type: 'string', description: 'What the agent claimed, for example "handles API failures"; the result says whether the evidence supports it' },
          repeat: { type: 'integer', description: 'Runs per scenario, majority verdict (default 1)' },
          fault_paths: { type: 'array', items: { type: 'string' }, description: 'Request path prefixes that may be faulted (default /api/)' },
          fault_methods: { type: 'array', items: { type: 'string' }, description: 'HTTP methods that may be faulted (default POST, PUT, PATCH, DELETE)' },
          proxy_port: { type: 'integer', description: 'Port for the fault proxy (default 4100)' },
        },
        required: ['app_url', 'flow'],
      },
      async handler(args) {
        if (running) {
          throw new Error('a chaos_check run is already in progress; wait for it to finish');
        }
        running = true;
        try {
          const config = parseArgs(buildChaosArgv(args, outDir));
          const outcome = await run(config);
          const brief = outcome.briefPath ? await readBrief(outcome.briefPath) : null;
          return formatCheckResult({ results: outcome.results, summary: outcome.summary, brief });
        } finally {
          running = false;
        }
      },
    },
    {
      name: 'chaos_scenarios',
      description: 'List the fault scenarios chaos_check can run and what each one does.',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        return SCENARIO_LIST.map(([name, meaning]) => `${name}: ${meaning}`).join('\n');
      },
    },
    {
      name: 'chaos_doctor',
      description:
        'Check that this machine is ready to run chaos_check: Node, Chrome, Kane CLI installed, logged in and with credits, free ports, and optionally that the app and its truth endpoint answer. ' +
        'Changes nothing and costs no credits. Call it first when chaos_check fails to start; every problem comes with the exact fix.',
      inputSchema: {
        type: 'object',
        properties: {
          app_url: { type: 'string', description: 'URL of the app you plan to check, to confirm it is reachable' },
          truth_url: { type: 'string', description: 'The truth endpoint you plan to use, to confirm it returns something countable' },
        },
      },
      async handler(args) {
        if (typeof doctor !== 'function') {
          throw new Error('doctor is not available in this server');
        }
        const results = await doctor({ app: args.app_url, truthUrl: args.truth_url });
        return formatReport(results);
      },
    },
  ];
}
