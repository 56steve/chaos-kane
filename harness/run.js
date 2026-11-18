import path from 'node:path';
import { SCENARIOS } from '../chaos/proxy.js';
import { runChaos, writeReports } from './chaos.js';
import { summarize } from './report.js';

const OUT_DIR = path.resolve(process.env.CHAOS_OUT ?? 'reports');

function parseScenarios(argv) {
  const only = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  return only ? only.split(',').map((name) => name.trim()).filter(Boolean) : SCENARIOS;
}

function parseRepeat(argv) {
  const raw = argv.find((arg) => arg.startsWith('--repeat='))?.slice('--repeat='.length);
  return raw === undefined ? 1 : Number(raw);
}

async function main() {
  const argv = process.argv.slice(2);
  const scenarios = parseScenarios(argv);
  const repeat = parseRepeat(argv);
  const results = await runChaos({
    scenarios,
    repeat,
    outDir: OUT_DIR,
    onProgress: (result) => {
      const agreement = repeat > 1 ? ` [agreement ${result.agreement}]` : '';
      console.log(`${result.scenario}: ${result.outcome}${agreement} (${result.reasons[0]})`);
    },
  });
  await writeReports({ outDir: OUT_DIR, name: 'latest', title: 'Chaos Kane resilience report', results });

  const summary = summarize(results);
  console.log(`\nscore: ${summary.survived} of ${summary.total} failures survived (credits used: ${summary.credits.toFixed(1)})`);
  if (repeat > 1) {
    console.log(`stability: ${summary.total - summary.unstable} of ${summary.total} scenarios gave the same verdict on all ${repeat} runs`);
  }
  console.log(`report: ${path.join(OUT_DIR, 'latest.html')}`);

  if (summary.failed > 0 || summary.baseline === 'failed') {
    process.exitCode = 1;
  } else if (summary.incomplete > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
