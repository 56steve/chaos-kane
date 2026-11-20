#!/usr/bin/env node
import path from 'node:path';
import { SCENARIOS } from '../chaos/proxy.js';
import { parseArgs } from '../harness/cli-args.js';
import { buildPlan, formatPlan } from '../harness/plan.js';
import { createHub } from '../harness/hub.js';
import { startLiveServer } from '../harness/live.js';
import { exitCodeFor, formatReport, parseDoctorArgs, runDoctor, toJson } from '../harness/doctor.js';
import { runFromConfig } from '../harness/runner.js';

const HELP = `chaos-kane: break an app's API with Kane and check what the user is really told

Usage:
  chaos-kane doctor [--app <url>] [--truth-url <url>] [--json]   check this machine is ready
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
  --agent-claim "<text>"   what the agent claimed (for example "handles API failures"); the report says
                            whether the evidence supports it
  --baseline <file.json>    compare with an earlier run; only NEW failures fail the run

Faults:
  --faults a,b              scenarios to run (default: all but double). One of: ${SCENARIOS.join(', ')}
  --fault-paths /api/,...   request paths to fault. Default: learned from the baseline run, which faults only
                            the last write of the flow (the login and setup requests are left alone)
  --fault-methods POST,...  methods to fault (default: learned, or POST,PUT,PATCH,DELETE)
  --repeat <n>              runs per scenario, majority verdict (default: 1)
  --max-steps <n>           Kane's step budget per run (default: 15); raise it for flows with a login or a long form

Output:
  --out <dir>               report folder (default: reports)
  --proxy-port <n>          port of the fault proxy Kane visits (default: 4100)
  --dashboard-port <n>      port of the live dashboard (default: 4200)
  --dry-run                 show what would run and what it would cost, then stop (no browser, no credits)
  --no-dashboard            do not start the live dashboard
  --keep-open               keep the dashboard up after the run

Works on apps whose API calls go through the app URL (same origin). If the frontend calls
an API on another origin, the proxy cannot see it and those scenarios report "incomplete".
Writes <out>/summary.md (also appended to the GitHub Actions job summary when running there) and
<out>/fix-brief.md for any coding agent when something did not survive.

Exit code: 0 all failures survived, 1 at least one was not, 2 no usable result.
Needs Kane CLI installed and logged in (kane-cli login) and Google Chrome.
`;

async function runDoctorCommand(argv) {
  const options = parseDoctorArgs(argv);
  const results = await runDoctor(options);
  console.log(options.json ? toJson(results) : formatReport(results));
  process.exitCode = exitCodeFor(results);
}

async function main() {
  if (process.argv[2] === 'doctor') {
    await runDoctorCommand(process.argv.slice(3));
    return;
  }
  const config = parseArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(HELP);
    return;
  }

  if (config.dryRun) {
    console.log(formatPlan(buildPlan(config)));
    return;
  }

  const hub = createHub();
  const live = config.dashboard ? await startLiveServer({ hub, port: config.dashboardPort, evidenceDir: path.resolve(config.out, 'evidence') }) : null;
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
    if (outcome.claim) {
      console.log(`agent claim "${outcome.claim.text}": ${outcome.claim.verdict}`);
    }
    if (outcome.comparison) {
      const { regressions, fixed, known } = outcome.comparison;
      console.log(`baseline: ${regressions.length} regression(s), ${fixed.length} fixed, ${known.length} known failure(s)`);
      if (regressions.length > 0) {
        console.log(`regressions: ${regressions.join(', ')}`);
      }
    }
    console.log(`summary: ${outcome.summaryPath}`);
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
