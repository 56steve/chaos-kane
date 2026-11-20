import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../app/server.js';
import { SCENARIOS } from '../chaos/proxy.js';
import { compareToBaseline } from './baseline.js';
import { buildFixBrief } from './brief.js';
import { APP_PORT, DEMO_FLOW, runChaosAgainst, writeReports } from './chaos.js';
import { claimVerdict } from './claim.js';
import { createHub } from './hub.js';
import { summarize } from './report.js';
import { buildSummaryMarkdown } from './summary.js';
import { fetchCount } from './truth.js';

/** Exit code contract: 0 all survived, 1 a failure was found, 2 no usable result. */
export function exitCodeFor(summary) {
  if (summary.failed > 0 || summary.baseline === 'failed') {
    return 1;
  }
  if (summary.incomplete > 0 || summary.baseline === 'incomplete') {
    return 2;
  }
  return 0;
}

/** With a baseline, only new problems fail the run; known failures are tolerated. */
export function exitCodeWithBaseline(comparison) {
  return comparison.regressions.length > 0 ? 1 : 0;
}

async function loadBaselineResults(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read baseline file ${file}: ${error instanceof Error ? error.message : error}`);
  }
  const results = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(results)) {
    throw new Error(`baseline file ${file} has no results list`);
  }
  return results;
}

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

/**
 * Runs a full chaos-kane check from a parsed config (see parseArgs): sets up the
 * target (demo shop or an external app), runs Kane through the fault proxy,
 * writes the reports, and writes a fix brief when anything did not survive.
 */
export async function runFromConfig(config, { hub = createHub(), onProgress = () => {}, log = () => {} } = {}) {
  const outDir = path.resolve(config.out);
  const baselineResults = config.baseline ? await loadBaselineResults(config.baseline) : null;
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
        log("note: no --truth-url, so the proxy's count of accepted writes is the backend evidence and duplicate detection is off");
      }
    }

    const results = await runChaosAgainst({
      appUrl,
      proxyPort: config.proxyPort,
      flow,
      scenarios: config.faults ?? SCENARIOS.filter((name) => name !== 'double'),
      repeat: config.repeat,
      maxSteps: config.maxSteps,
      outDir,
      truth,
      noun: config.noun,
      proxyOptions: { prefixes: config.faultPaths, methods: config.faultMethods },
      successPattern: config.claims ? new RegExp(config.claims, 'i') : undefined,
      claim: config.agentClaim,
      hub,
      onProgress,
    });
    await writeReports({ outDir, name: 'latest', title: 'Chaos Kane resilience report', results });

    const summary = summarize(results);
    const comparison = baselineResults ? compareToBaseline(baselineResults, results) : null;

    let briefPath = null;
    if (results.some((result) => result.outcome !== 'survived')) {
      briefPath = path.join(outDir, 'fix-brief.md');
      await writeFile(briefPath, buildFixBrief({ results, target: appUrl, flow, noun: config.noun, claim: config.agentClaim }));
    }

    const markdown = buildSummaryMarkdown({
      results,
      summary,
      target: appUrl,
      flow,
      noun: config.noun,
      claim: config.agentClaim,
      comparison,
    });
    const summaryPath = path.join(outDir, 'summary.md');
    await writeFile(summaryPath, markdown);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    }

    return {
      results,
      summary,
      outDir,
      briefPath,
      summaryPath,
      comparison,
      claim: config.agentClaim ? { text: config.agentClaim, verdict: claimVerdict(summary) } : null,
      exitCode: comparison ? exitCodeWithBaseline(comparison) : exitCodeFor(summary),
    };
  } finally {
    if (appServer) {
      appServer.close();
      appServer.closeAllConnections();
    }
  }
}
