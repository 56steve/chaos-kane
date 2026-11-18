import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../app/server.js';
import { createChaosProxy, SCENARIOS } from '../chaos/proxy.js';
import { aggregateRuns } from './aggregate.js';
import { createHub } from './hub.js';
import { runKane } from './kane.js';
import { renderReport, summarize } from './report.js';
import { judge } from './verdict.js';

export const APP_PORT = Number(process.env.APP_PORT ?? 4000);
export const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4100);

export const DEMO_FLOW =
  "On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.";

const WAIT = 'Wait up to 10 seconds for the page to react.';
const RETRY_ONCE =
  'If the page says there was a problem, repeat the same final action once more and wait up to 10 seconds again.';
const RECORD =
  "Store the exact text of the confirmation or error message the page shows at the end as 'status_message' (store 'none' if there is none). Store the HTTP status code of the last request the page made that saved or changed data (a POST, PUT, PATCH or DELETE) as 'last_request_status' (store 'no response' if that request got no response). Do not judge the result. Only record these two values.";

/**
 * Builds the Kane objective for one scenario. The ghost scenario adds a retry,
 * because duplicates only appear when the user tries again.
 */
export function objectiveFor(flow, scenario) {
  const parts = [flow, WAIT];
  if (scenario === 'ghost') {
    parts.push(RETRY_ONCE);
  }
  parts.push(RECORD);
  return parts.join(' ');
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function readObservation(finalState) {
  const state = finalState ?? {};
  return {
    statusMessage: state.status_message,
    requestStatus: state.last_request_status ?? state.order_request_status ?? state.order_request_http_status,
  };
}

/** Turns one line of Kane's progress stream into a short feed message, or null. */
function feedText(line) {
  try {
    const record = JSON.parse(line);
    if (
      record &&
      typeof record.step === 'number' &&
      record.status === 'done' &&
      typeof record.remark === 'string' &&
      !/^Step \d+$/.test(record.remark)
    ) {
      return record.remark.slice(0, 160);
    }
  } catch {
    // Not a progress record.
  }
  return null;
}

async function runScenario({ scenario, runIndex, runs, ctx }) {
  const { proxy, truth, flow, noun, outDir, proxyPort, hub } = ctx;
  proxy.setScenario(scenario);
  proxy.resetAccepted();
  hub.emit({ type: 'scenario_start', scenario, run: runIndex, runs });

  const before = truth ? await truth.count() : 0;
  const kane = await runKane({
    objective: objectiveFor(flow, scenario),
    url: `http://127.0.0.1:${proxyPort}`,
    onLine: (line) => {
      const text = feedText(line);
      if (text) {
        hub.emit({ type: 'kane_line', scenario, text });
      }
    },
  });
  const orderCount = truth ? (await truth.count()) - before : proxy.acceptedMutations();
  const orderCreated = orderCount > 0;

  await writeFile(path.join(outDir, `${scenario}-${runIndex}.ndjson`), kane.stdout);

  const { statusMessage, requestStatus } = readObservation(kane.runEnd?.final_state);
  // Duplicate detection needs a real backend count; the proxy's count of accepted calls can include idempotent replays.
  const verdict = judge({ statusMessage, requestStatus, orderCreated, orderCount: truth ? orderCount : undefined, noun });

  return {
    scenario,
    outcome: verdict.outcome,
    reasons: verdict.reasons,
    statusMessage,
    requestStatus,
    orderCreated,
    orderCount,
    evidence: truth ? 'backend' : 'proxy',
    kaneExitCode: kane.exitCode,
    credits: kane.runEnd?.credits_consumed ?? 0,
  };
}

/**
 * Runs Kane once (or `repeat` times) per scenario against any web app. A fault
 * proxy sits in front of `appUrl`; Kane drives `flow` through the proxy and
 * records what the page shows. `truth.count()` reports how many records the
 * backend really holds; without it the proxy's count of accepted writes is used.
 */
export async function runChaosAgainst({
  appUrl,
  proxyPort = PROXY_PORT,
  flow,
  scenarios = SCENARIOS,
  repeat = 1,
  outDir,
  truth = null,
  noun = 'order',
  proxyOptions = {},
  hub = createHub(),
  onProgress = () => {},
}) {
  const unknown = scenarios.filter((name) => !SCENARIOS.includes(name));
  if (unknown.length > 0) {
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}. Valid: ${SCENARIOS.join(', ')}`);
  }
  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new Error(`repeat must be a positive integer, got ${repeat}`);
  }
  await mkdir(outDir, { recursive: true });

  const proxy = createChaosProxy(appUrl, { ...proxyOptions, onEvent: (event) => hub.emit(event) });
  await listen(proxy.server, proxyPort);
  hub.emit({ type: 'run_start', scenarios, repeat, target: appUrl, flow, noun });

  const ctx = { proxy, truth, flow, noun, outDir, proxyPort, hub };
  const results = [];
  try {
    for (const scenario of scenarios) {
      const runs = [];
      for (let runIndex = 1; runIndex <= repeat; runIndex += 1) {
        runs.push(await runScenario({ scenario, runIndex, runs: repeat, ctx }));
      }
      const result = aggregateRuns(runs);
      results.push(result);
      hub.emit({ type: 'scenario_result', ...result });
      onProgress(result);
    }
  } finally {
    proxy.server.close();
    proxy.server.closeAllConnections();
  }

  hub.emit({ type: 'run_end', summary: summarize(results) });
  await writeFile(path.join(outDir, 'events.json'), `${JSON.stringify(hub.history())}\n`);
  return results;
}

/**
 * Runs the checks against the bundled demo shop. Used by the stop hook, the
 * repair loop and `chaos-kane --demo`.
 */
export async function runChaos({ scenarios = SCENARIOS, outDir, repeat = 1, onProgress = () => {}, hub = createHub() }) {
  const { server: appServer, orders } = createApp();
  await listen(appServer, APP_PORT);
  try {
    return await runChaosAgainst({
      appUrl: `http://127.0.0.1:${APP_PORT}`,
      proxyPort: PROXY_PORT,
      flow: DEMO_FLOW,
      scenarios,
      repeat,
      outDir,
      truth: { count: async () => orders.length },
      noun: 'order',
      hub,
      onProgress,
    });
  } finally {
    appServer.close();
    appServer.closeAllConnections();
  }
}

export async function writeReports({ outDir, name, title, results }) {
  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify({ generatedAt, results }, null, 2)}\n`);
  await writeFile(path.join(outDir, `${name}.html`), renderReport({ title, generatedAt, results }));
}
