import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../app/server.js';
import { createChaosProxy, SCENARIOS } from '../chaos/proxy.js';
import { runKane } from './kane.js';
import { judge } from './verdict.js';
import { renderReport } from './report.js';

export const APP_PORT = Number(process.env.APP_PORT ?? 4000);
export const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4100);

export const OBJECTIVE = [
  "On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field,",
  'then click the Place order button. Wait up to 10 seconds for the page to react.',
  "Store the exact text of the status message shown under the form as 'status_message' (store 'none' if it is empty).",
  "Store the HTTP status code of the order request made when Place order was clicked as 'order_request_status'",
  "(store 'no response' if that request got no response).",
  'Do not judge the result. Only record these two values.',
].join(' ');

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

/**
 * Starts the demo app and chaos proxy, runs Kane once per scenario, and returns
 * one judged result per scenario. The app serves client.js from disk on every
 * request, so a repaired client is picked up by the next call.
 */
export async function runChaos({ scenarios = SCENARIOS, outDir, onProgress = () => {} }) {
  const unknown = scenarios.filter((name) => !SCENARIOS.includes(name));
  if (unknown.length > 0) {
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}. Valid: ${SCENARIOS.join(', ')}`);
  }
  await mkdir(outDir, { recursive: true });

  const { server: appServer, orders } = createApp();
  const proxy = createChaosProxy(`http://127.0.0.1:${APP_PORT}`);
  await listen(appServer, APP_PORT);
  await listen(proxy.server, PROXY_PORT);

  const results = [];
  try {
    for (const scenario of scenarios) {
      const result = await runScenario({ scenario, orders, proxy, outDir });
      results.push(result);
      onProgress(result);
    }
  } finally {
    appServer.close();
    proxy.server.close();
    appServer.closeAllConnections();
    proxy.server.closeAllConnections();
  }
  return results;
}

export async function writeReports({ outDir, name, title, results }) {
  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify({ generatedAt, results }, null, 2)}\n`);
  await writeFile(path.join(outDir, `${name}.html`), renderReport({ title, generatedAt, results }));
}
