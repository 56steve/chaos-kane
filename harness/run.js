import path from 'node:path';
import { SCENARIOS } from '../chaos/proxy.js';
import { runChaos, writeReports } from './chaos.js';
import { summarize } from './report.js';

const OUT_DIR = path.resolve(process.env.CHAOS_OUT ?? 'reports');

function parseScenarios(argv) {
  const only = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  return only ? only.split(',').map((name) => name.trim()).filter(Boolean) : SCENARIOS;
}

async function main() {
  const scenarios = parseScenarios(process.argv.slice(2));
  const results = await runChaos({
    scenarios,
    outDir: OUT_DIR,
    onProgress: (result) => console.log(`${result.scenario}: ${result.outcome} (${result.reasons[0]})`),
  });
  await writeReports({ outDir: OUT_DIR, name: 'latest', title: 'Chaos Kane resilience report', results });

  const summary = summarize(results);
  console.log(`\nscore: ${summary.survived} of ${summary.total} failures survived (credits used: ${summary.credits.toFixed(1)})`);
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
