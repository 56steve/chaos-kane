import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LIVE_PAGE } from '../harness/live-page.js';

/**
 * Builds a static replay of recorded runs into docs/, ready for static hosting:
 * the dashboard page, the events, and the screenshots they point to. Usage:
 *   node scripts/build-replay.js before=reports/replay-before after=reports/replay-after
 *   node scripts/build-replay.js path/to/events.json
 * Each label=dir source needs dir/events.json (and dir/evidence/ if it has screenshots);
 * screenshots are copied to docs/evidence/<label>/ so runs never overwrite each other.
 */
const outDir = path.resolve('docs');
const args = process.argv.slice(2);
const sources = args.length > 0 ? args : [path.resolve('reports/replay/events.json')];

const combined = [];
await mkdir(outDir, { recursive: true });

for (const source of sources) {
  const labelled = source.includes('=');
  const [label, dir] = labelled ? source.split('=') : [null, path.dirname(path.resolve(source))];
  const eventsFile = labelled ? path.join(path.resolve(dir), 'events.json') : path.resolve(source);
  const evidenceDir = path.join(labelled ? path.resolve(dir) : dir, 'evidence');

  const events = JSON.parse(await readFile(eventsFile, 'utf8'));
  if (!Array.isArray(events) || events.length === 0 || events[0].type !== 'run_start') {
    throw new Error(`${eventsFile} is not a recorded run (expected a list of events starting with run_start)`);
  }

  const target = label ? path.join(outDir, 'evidence', label) : path.join(outDir, 'evidence');
  try {
    await cp(evidenceDir, target, { recursive: true });
  } catch {
    // This run has no screenshots; the replay still works without them.
  }
  for (const event of events) {
    if (label && typeof event.screenshot === 'string') {
      event.screenshot = event.screenshot.replace(/^evidence\//, `evidence/${label}/`);
    }
    combined.push(event);
  }
}

await writeFile(path.join(outDir, 'index.html'), LIVE_PAGE);
await writeFile(path.join(outDir, 'events.json'), `${JSON.stringify(combined)}\n`);
console.log(`replay written to ${outDir} (${combined.length} events from ${sources.length} source(s))`);
