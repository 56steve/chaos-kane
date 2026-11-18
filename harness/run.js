import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../app/server.js';
import { createChaosProxy, SCENARIOS } from '../chaos/proxy.js';
import { runKane } from './kane.js';
import { judge } from './verdict.js';
import { renderReport, summarize } from './report.js';

const APP_PORT = Number(process.env.APP_PORT ?? 4000);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4100);
const OUT_DIR = process.env.CHAOS_OUT ?? 'reports';

const OBJECTIVE = [
  "On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field,",
  'then click the Place order button. Wait up to 10 seconds for the page to react.',
  "Store the exact text of the status message shown under the form as 'status_message' (store 'none' if it is empty).",
  "Store the HTTP status code of the order request made when Place order was clicked as 'order_request_status'",
  "(store 'no response' if that request got no response).",
  'Do not judge the result. Only record these two values.',
].join(' ');

function parseArgs(argv) {
  const only = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const scenarios = only ? only.split(',').map((name) => name.trim()).filter(Boolean) : SCENARIOS;
  const unknown = scenarios.filter((name) => !SCENARIOS.includes(name));
  if (unknown.length > 0) {
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}. Valid: ${SCENARIOS.join(', ')}`);
  }
  return { scenarios };
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
    requestStatus: state.order_request_status ?? state.order_request_http_status,
  };
}

async function runScenario({ scenario, orders, proxy, outDir }) {
  proxy.setScenario(scenario);
  const ordersBefore = orders.length;
  const kane = await runKane({ objective: OBJECTIVE, url: `http://127.0.0.1:${PROXY_PORT}` });
  const orderCreated = orders.length > ordersBefore;

  await writeFile(path.join(outDir, `${scenario}.ndjson`), kane.stdout);

  const { statusMessage, requestStatus } = readObservation(kane.runEnd?.final_state);
  const verdict = judge({ statusMessage, requestStatus, orderCreated });

  return {
    scenario,
    outcome: verdict.outcome,
    reasons: verdict.reasons,
    statusMessage,
    requestStatus,
    orderCreated,
    kaneExitCode: kane.exitCode,
    credits: kane.runEnd?.credits_consumed ?? 0,
  };
}

async function main() {
  const { scenarios } = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(OUT_DIR);
  await mkdir(outDir, { recursive: true });

  const { server: appServer, orders } = createApp();
  const proxy = createChaosProxy(`http://127.0.0.1:${APP_PORT}`);
  await listen(appServer, APP_PORT);
  await listen(proxy.server, PROXY_PORT);

  const results = [];
  try {
    for (const scenario of scenarios) {
      process.stdout.write(`running ${scenario}... `);
      const result = await runScenario({ scenario, orders, proxy, outDir });
      results.push(result);
      console.log(`${result.outcome} (${result.reasons[0]})`);
    }
  } finally {
    appServer.close();
    proxy.server.close();
    appServer.closeAllConnections();
    proxy.server.closeAllConnections();
  }

  const generatedAt = new Date().toISOString();
  await writeFile(path.join(outDir, 'latest.json'), `${JSON.stringify({ generatedAt, results }, null, 2)}\n`);
  await writeFile(path.join(outDir, 'latest.html'), renderReport({ title: 'Chaos Kane resilience report', generatedAt, results }));

  const summary = summarize(results);
  console.log(`\nscore: ${summary.survived} of ${summary.total} failures survived (credits used: ${summary.credits.toFixed(1)})`);
  console.log(`report: ${path.join(outDir, 'latest.html')}`);

  if (summary.failed > 0 || results.some((result) => result.scenario === 'none' && result.outcome === 'failed')) {
    process.exitCode = 1;
  } else if (summary.incomplete > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
