import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LIVE_PAGE } from '../harness/live-page.js';

/**
 * Builds a static replay of a recorded run into docs/, ready for GitHub Pages:
 * the same dashboard page plus the run's events.json. Usage:
 *   node scripts/build-replay.js [path/to/events.json]
 */
const source = path.resolve(process.argv[2] ?? 'reports/events.json');
const outDir = path.resolve('docs');

const events = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(events) || events.length === 0 || events[0].type !== 'run_start') {
  throw new Error(`${source} is not a recorded run (expected a list of events starting with run_start)`);
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'index.html'), LIVE_PAGE);
await copyFile(source, path.join(outDir, 'events.json'));
console.log(`replay written to ${outDir} (${events.length} events from ${source})`);
