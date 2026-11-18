import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { LIVE_PAGE } from '../harness/live-page.js';
import { buildFixEvent, labelEvents, parsePatchSpec } from '../harness/replay.js';

const execFileAsync = promisify(execFile);

/**
 * Builds a static replay of recorded runs into docs/, ready for static hosting:
 * the dashboard page, the events, and the screenshots they point to. Usage:
 *   node scripts/build-replay.js before=reports/replay-before after=reports/replay-after patch=app/client.js
 *   node scripts/build-replay.js path/to/events.json
 *
 * - label=dir      a recorded run (dir/events.json, dir/evidence/); its screenshots go to docs/evidence/<label>/
 * - patch=file[@rev]  the fix: a diff of `file` between git revision rev (default: the commit that
 *                  first added it) and the working tree, shown between the first and the last run
 */
const outDir = path.resolve('docs');
const args = process.argv.slice(2);

async function firstCommitAdding(file) {
  const { stdout } = await execFileAsync('git', ['log', '--diff-filter=A', '--format=%h', '--', file]);
  const commits = stdout.trim().split('\n').filter(Boolean);
  if (commits.length === 0) {
    throw new Error(`no commit found that added ${file}`);
  }
  return commits[commits.length - 1];
}

async function loadRun(source) {
  const labelled = source.includes('=');
  const [label, dir] = labelled ? source.split('=') : [null, path.dirname(path.resolve(source))];
  const eventsFile = labelled ? path.join(path.resolve(dir), 'events.json') : path.resolve(source);
  const events = JSON.parse(await readFile(eventsFile, 'utf8'));
  if (!Array.isArray(events) || events.length === 0 || events[0].type !== 'run_start') {
    throw new Error(`${eventsFile} is not a recorded run (expected a list of events starting with run_start)`);
  }
  const evidenceDir = path.join(labelled ? path.resolve(dir) : dir, 'evidence');
  const target = label ? path.join(outDir, 'evidence', label) : path.join(outDir, 'evidence');
  try {
    await cp(evidenceDir, target, { recursive: true });
  } catch {
    // This run has no screenshots; the replay still works without them.
  }
  return label ? labelEvents(events, label) : events;
}

const patchArg = args.find((arg) => arg.startsWith('patch='));
const runArgs = args.filter((arg) => !arg.startsWith('patch='));
const sources = runArgs.length > 0 ? runArgs : [path.resolve('reports/replay/events.json')];

await mkdir(outDir, { recursive: true });
const runs = [];
for (const source of sources) {
  runs.push(await loadRun(source));
}

if (patchArg) {
  if (runs.length < 2) {
    throw new Error('patch= needs at least two runs (a before and an after)');
  }
  const { file, rev } = parsePatchSpec(patchArg.slice('patch='.length));
  const base = rev ?? (await firstCommitAdding(file));
  const { stdout: diff } = await execFileAsync('git', ['diff', '--no-color', base, '--', file]);
  const previous = runs[runs.length - 2];
  runs.splice(runs.length - 1, 0, [buildFixEvent({ file, diff, at: previous[previous.length - 1].at })]);
}

const combined = runs.flat();
await writeFile(path.join(outDir, 'index.html'), LIVE_PAGE);
await writeFile(path.join(outDir, 'events.json'), `${JSON.stringify(combined)}\n`);
console.log(`replay written to ${outDir} (${combined.length} events from ${runArgs.length || 1} run(s)${patchArg ? ' and a fix' : ''})`);
