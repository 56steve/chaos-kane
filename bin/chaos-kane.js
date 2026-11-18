#!/usr/bin/env node
import path from 'node:path';
import { SCENARIOS } from '../chaos/proxy.js';
import { parseArgs } from '../harness/cli-args.js';
import { createHub } from '../harness/hub.js';
import { startLiveServer } from '../harness/live.js';
import { runFromConfig } from '../harness/runner.js';

const HELP = `chaos-kane: break an app's API with Kane and check what the user is really told

Usage:
  chaos-kane --demo
  chaos-kane --app <url> --flow "<what a user does>" [options]

Target (choose one):
  --demo                    run against the bundled demo shop
  --app <url>               a web app that is already running (http or https)
  --flow "<text>"           the user journey in plain English (required with --app)

Evidence:
  --truth-url <url>         JSON endpoint that lists or counts what the backend stored.
                            Without it, the proxy's count of accepted writes is used and
                            duplicate detection is off.
  --noun <word>             what the flow creates, for readable verdicts (default: record)
  --claims "<regex>"        what counts as a success message (default: placed, saved, success, ...)

Faults:
  --faults a,b              scenarios to run (default: all but double). One of: ${SCENARIOS.join(', ')}
  --fault-paths /api/,...   request paths that may be faulted (default: /api/)
  --fault-methods POST,...  methods that may be faulted (default: POST,PUT,PATCH,DELETE)
  --repeat <n>              runs per scenario, majority verdict (default: 1)

Output:
  --out <dir>               report folder (default: reports)
  --proxy-port <n>          port of the fault proxy Kane visits (default: 4100)
  --dashboard-port <n>      port of the live dashboard (default: 4200)
  --no-dashboard            do not start the live dashboard
  --keep-open               keep the dashboard up after the run

Works on apps whose API calls go through the app URL (same origin). If the frontend calls
an API on another origin, the proxy cannot see it and those scenarios report "incomplete".
Writes <out>/fix-brief.md for any coding agent when something did not survive.

Exit code: 0 all failures survived, 1 at least one was not, 2 no usable result.
Needs Kane CLI installed and logged in (kane-cli login) and Google Chrome.
`;

async function main() {
  const config = parseArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(HELP);
    return;
  }

  const hub = createHub();
  const live = config.dashboard ? await startLiveServer({ hub, port: config.dashboardPort }) : null;
  if (live) {
    console.log(`live dashboard: ${live.url}`);
  }

  try {
    const outcome = await runFromConfig(config, {
      hub,
      log: (line) => console.log(line),
      onProgress: (result) => {
        const agreement = config.repeat > 1 ? ` [agreement ${result.agreement}]` : '';
        console.log(`${result.scenario}: ${result.outcome}${agreement} (${result.reasons[0]})`);
      },
    });
    const { summary } = outcome;

    console.log(`\nscore: ${summary.survived} of ${summary.total} failures survived (credits used: ${summary.credits.toFixed(1)})`);
    if (config.repeat > 1) {
      console.log(`stability: ${summary.total - summary.unstable} of ${summary.total} scenarios gave the same verdict on all ${config.repeat} runs`);
    }
    console.log(`report: ${path.join(outcome.outDir, 'latest.html')}`);
    if (outcome.briefPath) {
      console.log(`fix brief for any coding agent: ${outcome.briefPath}`);
    }
    process.exitCode = outcome.exitCode;

    if (live && config.keepOpen) {
      console.log(`dashboard stays open at ${live.url} (Ctrl+C to exit)`);
      await new Promise(() => {});
    }
  } finally {
    live?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
