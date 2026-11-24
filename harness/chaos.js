import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../app/server.js';
import { DEFAULT_METHODS, DEFAULT_PREFIXES, createChaosProxy, SCENARIOS } from '../chaos/proxy.js';
import { aggregateRuns } from './aggregate.js';
import { claimVerdict } from './claim.js';
import { createHub } from './hub.js';
import { runKane } from './kane.js';
import { renderReport, summarize } from './report.js';
import { scrubText } from './scrub.js';
import { crossCheck, readEvidencePack, unzipAvailable, writeRequestsFromHar } from './evidence.js';
import { messageOrLanding } from './landing.js';
import { learnFaultTarget, orderScenarios } from './target.js';
import { applyCrossCheck, applyEvidenceCheck, applyFaultCheck } from './validity.js';
import { judge } from './verdict.js';

export const APP_PORT = Number(process.env.APP_PORT ?? 4000);
export const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4100);

export const DEMO_FLOW =
  "On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.";

const WAIT = 'Wait up to 10 seconds for the page to react.';
const RETRY_ONCE =
  'If the page says there was a problem, repeat the same final action once more and wait up to 10 seconds again.';
const DOUBLE_CLICK =
  'Do not click that last button once: click it twice in very quick succession, two clicks within half a second.';
const RECORD_MESSAGE =
  "Store the exact text of the confirmation or error message the page shows at the end as 'status_message' (store 'none' if there is none).";
const RECORD_STATUS =
  " Store the HTTP status code of the last request the page made that saved or changed data (a POST, PUT, PATCH or DELETE) as 'last_request_status' (store 'no response' if that request got no response).";
const RECORD_STATUS_ONLY_MESSAGE = ' Do not judge the result. Only record this value.';
const RECORD_BOTH = ' Do not judge the result. Only record these two values.';

/**
 * Builds the Kane objective for one scenario. The ghost scenario adds a retry,
 * because duplicates only appear when the user tries again; the double scenario
 * asks for a fast double click for the same reason.
 */
export function objectiveFor(flow, scenario, { askStatus = true } = {}) {
  const parts = [flow];
  if (scenario === 'double') {
    parts.push(DOUBLE_CLICK);
  }
  parts.push(WAIT);
  if (scenario === 'ghost') {
    parts.push(RETRY_ONCE);
  }
  parts.push(askStatus ? `${RECORD_MESSAGE}${RECORD_STATUS}${RECORD_BOTH}` : `${RECORD_MESSAGE}${RECORD_STATUS_ONLY_MESSAGE}`);
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
    finalUrl: state.url,
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
  const { proxy, truth, flow, noun, outDir, proxyPort, hub, successPattern, rules, maxSteps, faultsFired, askStatus } = ctx;
  proxy.setScenario(scenario);
  proxy.resetAccepted();
  const firedBefore = faultsFired();
  hub.emit({ type: 'scenario_start', scenario, run: runIndex, runs });

  const before = truth ? await truth.count() : 0;
  const kane = await runKane({
    objective: objectiveFor(flow, scenario, { askStatus }),
    url: `http://127.0.0.1:${proxyPort}`,
    maxSteps,
    onLine: (line) => {
      const text = feedText(line);
      if (text) {
        hub.emit({ type: 'kane_line', scenario, text });
      }
    },
  });
  const orderCount = truth ? (await truth.count()) - before : proxy.acceptedMutations();
  const orderCreated = orderCount > 0;

  await writeFile(path.join(outDir, `${scenario}-${runIndex}.ndjson`), scrubText(kane.stdout));

  const observed = readObservation(kane.runEnd?.final_state);
  const { requestStatus: reportedStatus } = observed;
  const statusMessage = messageOrLanding({ statusMessage: observed.statusMessage, finalUrl: observed.finalUrl, successPattern });

  // The browser's own network log and the final screenshot come from Kane's evidence pack.
  const evidence = await readEvidencePack(kane.runEnd?.session_dir);
  const network = evidence.harTexts.flatMap((text) => writeRequestsFromHar(text));
  const check = crossCheck({ reportedStatus, requests: network, harAvailable: evidence.harTexts.length > 0, statusAsked: askStatus });
  const requestStatus = check.status;
  let screenshot;
  if (evidence.screenshot) {
    await mkdir(path.join(outDir, 'evidence'), { recursive: true });
    const file = `${scenario}-${runIndex}.jpg`;
    await writeFile(path.join(outDir, 'evidence', file), evidence.screenshot);
    screenshot = `evidence/${file}`;
  }
  // Duplicate detection needs a real backend count; the proxy's count of accepted calls can include idempotent replays.
  const judged = judge({
    statusMessage,
    requestStatus,
    orderCreated,
    orderCount: truth ? orderCount : undefined,
    noun,
    successPattern,
  });
  const verdict = applyCrossCheck(
    applyEvidenceCheck(applyFaultCheck(judged, scenario, faultsFired() - firedBefore, rules), {
      hasTruth: Boolean(truth),
      writesSeen: proxy.writesSeen(),
    }),
    check,
  );

  return {
    scenario,
    outcome: verdict.outcome,
    reasons: verdict.reasons,
    statusMessage,
    requestStatus,
    statusSource: check.source,
    crossCheck: check.agreement,
    kaneReportedStatus: reportedStatus,
    network: network.map(({ method, path: requestPath, status }) => ({ method, path: requestPath, status })),
    screenshot,
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
  maxSteps = 15,
  outDir,
  truth = null,
  noun = 'order',
  proxyOptions = {},
  successPattern = undefined,
  claim = undefined,
  hub = createHub(),
  autoTarget = false,
  log = () => {},
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

  let faultCount = 0;
  const proxy = createChaosProxy(appUrl, {
    ...proxyOptions,
    onEvent: (event) => {
      if (event.type === 'fault') {
        faultCount += 1;
      }
      hub.emit(event);
    },
  });
  await listen(proxy.server, proxyPort);
  hub.emit({ type: 'run_start', scenarios, repeat, target: appUrl, flow, noun, claim });

  const rules = { prefixes: proxyOptions.prefixes ?? DEFAULT_PREFIXES, methods: proxyOptions.methods ?? DEFAULT_METHODS };
  // With a readable network log, Kane is only asked for the page message: the browser's own log is the authority on the status, and a lighter last step is less likely to fail.
  const askStatus = !(await unzipAvailable());
  const ctx = { proxy, truth, flow, noun, outDir, proxyPort, hub, successPattern, rules, maxSteps, askStatus, faultsFired: () => faultCount };
  const results = [];
  try {
    const order = autoTarget ? orderScenarios(scenarios) : scenarios;
    let learned = false;
    for (const scenario of order) {
      const runs = [];
      for (let runIndex = 1; runIndex <= repeat; runIndex += 1) {
        runs.push(await runScenario({ scenario, runIndex, runs: repeat, ctx }));
      }
      if (autoTarget && !learned && scenario === 'none') {
        const target = runs[0].orderCreated ? learnFaultTarget(runs[0].network) : null;
        if (target) {
          proxy.setFaultTarget(target);
          ctx.rules = { prefixes: target.prefixes, methods: target.methods };
          learned = true;
          log(`learned the target from the baseline: faults will hit ${target.methods.join('/')} ${target.prefixes.join(', ')} only (pass --fault-paths to choose yourself)`);
        } else {
          log('note: the baseline saved nothing, so the fault target could not be learned; faulting every write under /api/ (pass --fault-paths to choose)');
        }
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

  const finalSummary = summarize(results);
  hub.emit({
    type: 'run_end',
    summary: finalSummary,
    claim: claim ? { text: claim, verdict: claimVerdict(finalSummary) } : undefined,
  });
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

/** `judging` records the settings the verdicts were made with, so `chaos-kane audit` can recompute them. */
export async function writeReports({ outDir, name, title, results, judging }) {
  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify({ generatedAt, ...(judging ? { judging } : {}), results }, null, 2)}\n`);
  await writeFile(path.join(outDir, `${name}.html`), renderReport({ title, generatedAt, results }));
}
