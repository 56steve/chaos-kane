#!/usr/bin/env node
import path from 'node:path';
import { createApp } from '../app/server.js';
import { SCENARIOS } from '../chaos/proxy.js';
import { APP_PORT, DEMO_FLOW, runChaosAgainst, writeReports } from '../harness/chaos.js';
import { parseArgs } from '../harness/cli-args.js';
import { createHub } from '../harness/hub.js';
import { startLiveServer } from '../harness/live.js';
import { summarize } from '../harness/report.js';
import { fetchCount } from '../harness/truth.js';

const HELP = `chaos-kane: break an app's API with Kane and check what the user is really told

Usage:
  chaos-kane --demo
  chaos-kane --app <url> --flow "<what a user does>" [options]

Target (choose one):
  --demo                    run against the bundled demo shop
  --app <url>               a web app that is already running
  --flow "<text>"           the user journey in plain English (required with --app)

Evidence:
  --truth-url <url>         JSON endpoint that lists or counts what the backend stored.
                            Without it, the proxy's count of accepted writes is used and
                            duplicate detection is off.
  --noun <word>             what the flow creates, for readable verdicts (default: record)

Faults:
  --faults a,b              scenarios to run (default: all). One of: ${SCENARIOS.join(', ')}
  --fault-paths /api/,...   request paths that may be faulted (default: /api/)
  --fault-methods POST,...  methods that may be faulted (default: POST,PUT,PATCH,DELETE)
  --repeat <n>              runs per scenario, majority verdict (default: 1)

Output:
  --out <dir>               report folder (default: reports)
  --proxy-port <n>          port of the fault proxy Kane visits (default: 4100)
  --dashboard-port <n>      port of the live dashboard (default: 4200)
  --no-dashboard            do not start the live dashboard
  --keep-open               keep the dashboard up after the run

Exit code: 0 all failures survived, 1 at least one was not, 2 no usable result.
Needs Kane CLI installed and logged in (kane-cli login) and Google Chrome.
`;

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function assertReachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new Error(`cannot reach ${url}: ${error instanceof Error ? error.message : error}. Is the app running?`);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(HELP);
    return;
  }

  const outDir = path.resolve(config.out);
  const hub = createHub();
  const live = config.dashboard ? await startLiveServer({ hub, port: config.dashboardPort }) : null;
  if (live) {
    console.log(`live dashboard: ${live.url}`);
  }

  let appServer = null;
  let appUrl = config.app;
  let flow = config.flow;
  let truth = null;

  try {
    if (config.demo) {
      const demo = createApp();
      appServer = demo.server;
      await listen(appServer, APP_PORT);
      appUrl = `http://127.0.0.1:${APP_PORT}`;
      flow = DEMO_FLOW;
      truth = { count: async () => demo.orders.length };
    } else {
      await assertReachable(appUrl);
      if (config.truthUrl) {
        const url = config.truthUrl;
        await fetchCount(url);
        truth = { count: () => fetchCount(url) };
      } else {
        console.log("note: no --truth-url, so the proxy's count of accepted writes is the backend evidence and duplicate detection is off");
      }
    }

    const results = await runChaosAgainst({
      appUrl,
      proxyPort: config.proxyPort,
      flow,
      scenarios: config.faults ?? SCENARIOS,
      repeat: config.repeat,
      outDir,
      truth,
      noun: config.noun,
      proxyOptions: { prefixes: config.faultPaths, methods: config.faultMethods },
      hub,
      onProgress: (result) => {
        const agreement = config.repeat > 1 ? ` [agreement ${result.agreement}]` : '';
        console.log(`${result.scenario}: ${result.outcome}${agreement} (${result.reasons[0]})`);
      },
    });
    await writeReports({ outDir, name: 'latest', title: 'Chaos Kane resilience report', results });

    const summary = summarize(results);
    console.log(`\nscore: ${summary.survived} of ${summary.total} failures survived (credits used: ${summary.credits.toFixed(1)})`);
    if (config.repeat > 1) {
      console.log(`stability: ${summary.total - summary.unstable} of ${summary.total} scenarios gave the same verdict on all ${config.repeat} runs`);
    }
    console.log(`report: ${path.join(outDir, 'latest.html')}`);

    if (summary.failed > 0 || summary.baseline === 'failed') {
      process.exitCode = 1;
    } else if (summary.incomplete > 0) {
      process.exitCode = 2;
    }

    if (live && config.keepOpen) {
      console.log(`dashboard stays open at ${live.url} (Ctrl+C to exit)`);
      await new Promise(() => {});
    }
  } finally {
    live?.close();
    if (appServer) {
      appServer.close();
      appServer.closeAllConnections();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
