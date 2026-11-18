import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { badgeFor, renderBadge } from '../harness/badge.js';
import { summarize } from '../harness/report.js';

/**
 * Writes a status badge from a saved run. Usage:
 *   node scripts/make-badge.js [reports/replay-after/latest.json] [docs/badge.svg]
 * The badge is a snapshot of that recorded run, not a live status.
 */
const input = path.resolve(process.argv[2] ?? 'reports/replay-after/latest.json');
const output = path.resolve(process.argv[3] ?? 'docs/badge.svg');

const { results } = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(results)) {
  throw new Error(`${input} has no results list`);
}
const { message, color } = badgeFor(summarize(results));

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, renderBadge({ label: 'chaos-kane', message, color }));
console.log(`badge written to ${output}: ${message}`);
