import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scrubText } from '../harness/scrub.js';

/**
 * Scrubs saved Kane output in place (paths and share links). Usage:
 *   node scripts/scrub-reports.js [dir]     (default: reports)
 */
const SCRUBBED_EXTENSIONS = new Set(['.ndjson', '.json', '.html']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return nested.flat();
}

const root = path.resolve(process.argv[2] ?? 'reports');
let changed = 0;
let scanned = 0;
for (const file of await walk(root)) {
  if (!SCRUBBED_EXTENSIONS.has(path.extname(file))) {
    continue;
  }
  scanned += 1;
  const before = await readFile(file, 'utf8');
  const after = scrubText(before);
  if (after !== before) {
    await writeFile(file, after);
    changed += 1;
  }
}
console.log(`scrubbed ${changed} of ${scanned} files under ${root}`);
