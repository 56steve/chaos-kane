import { execFile } from 'node:child_process';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { runAgent } from './agent.js';
import { runChaos, writeReports } from './chaos.js';
import { buildRepairPrompt } from './prompt.js';
import { summarize } from './report.js';
import { outOfScope, parsePorcelain } from './scope.js';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'reports');
const ALLOWED = ['app/client.js'];
const IGNORED_PREFIXES = ['reports/', 'runs/'];
const MAX_ATTEMPTS = Number(process.env.REPAIR_MAX_ATTEMPTS ?? 3);

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT });
  return stdout;
}

async function changedFiles() {
  return parsePorcelain(await git(['status', '--porcelain']));
}

async function isTracked(file) {
  try {
    await git(['ls-files', '--error-unmatch', file]);
    return true;
  } catch {
    return false;
  }
}

async function revertOutOfScope(files) {
  for (const file of files) {
    if (await isTracked(file)) {
      await git(['checkout', '--', file]);
    } else {
      await rm(path.join(ROOT, file), { recursive: true, force: true });
    }
    console.log(`scope guard: reverted ${file}`);
  }
}

async function loadBaseline() {
  try {
    const parsed = JSON.parse(await readFile(path.join(OUT_DIR, 'baseline.json'), 'utf8'));
    return parsed.results;
  } catch {
    return null;
  }
}

function logLine(result) {
  console.log(`  ${result.scenario}: ${result.outcome}`);
}

function isFullySurvived(results) {
  return results.every((result) => result.outcome === 'survived');
}

async function main() {
  const dirty = (await changedFiles()).filter((file) => !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)));
  if (dirty.length > 0) {
    throw new Error(`working tree must be clean before repairing (found: ${dirty.join(', ')}). Commit or stash first.`);
  }

  let results = process.argv.includes('--fresh') ? null : await loadBaseline();
  if (results) {
    console.log('starting from reports/baseline.json');
  } else {
    console.log('running a fresh baseline...');
    results = await runChaos({ outDir: path.join(OUT_DIR, 'attempt-0'), onProgress: logLine });
    await writeReports({ outDir: OUT_DIR, name: 'baseline', title: 'Chaos Kane baseline (before the fix)', results });
  }

  const before = summarize(results);
  const attempts = [];
  let previousDiff = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !isFullySurvived(results); attempt += 1) {
    const failures = results.filter((result) => result.outcome === 'failed');
    console.log(`\nattempt ${attempt}: ${failures.length} failing scenario(s): ${failures.map((f) => f.scenario).join(', ')}`);

    const entry = { attempt, failing: failures.map((f) => f.scenario) };
    attempts.push(entry);

    if (failures.length > 0) {
      const prompt = buildRepairPrompt({ failures, attempt, previousDiff });
      const agent = await runAgent({ prompt, cwd: ROOT });
      if (agent.exitCode !== 0) {
        throw new Error(
          `coding agent failed (exit ${agent.exitCode}): ${agent.stdout || agent.stderr || 'no output'}. Fix the agent login, then run again.`,
        );
      }
      entry.agentExitCode = agent.exitCode;
      entry.agentSaid = agent.stdout.slice(0, 500);
      console.log(`agent: ${entry.agentSaid || '(no output)'}`);

      const offenders = outOfScope(await changedFiles(), { allowed: ALLOWED, ignoredPrefixes: IGNORED_PREFIXES });
      entry.revertedOutOfScope = offenders;
      await revertOutOfScope(offenders);

      const diff = await git(['diff', '--', ...ALLOWED]);
      await writeFile(path.join(OUT_DIR, `attempt-${attempt}.diff`), diff);
      if (diff.trim().length === 0) {
        console.log('agent made no change to app/client.js');
        entry.changed = false;
        continue;
      }
      entry.changed = true;
      previousDiff = diff;
    } else {
      console.log('only incomplete observations remain; re-running without changing code');
    }

    results = await runChaos({ outDir: path.join(OUT_DIR, `attempt-${attempt}`), onProgress: logLine });
    await writeReports({ outDir: OUT_DIR, name: `attempt-${attempt}`, title: `Chaos Kane after repair attempt ${attempt}`, results });
    entry.score = summarize(results);
  }

  const after = summarize(results);
  await writeReports({ outDir: OUT_DIR, name: 'after', title: 'Chaos Kane after the fix', results });
  await copyFile(path.join(OUT_DIR, 'after.json'), path.join(OUT_DIR, 'latest.json'));
  await copyFile(path.join(OUT_DIR, 'after.html'), path.join(OUT_DIR, 'latest.html'));
  await writeFile(
    path.join(OUT_DIR, 'repair-log.json'),
    `${JSON.stringify({ before, after, attempts }, null, 2)}\n`,
  );

  console.log(`\nbefore: ${before.survived} of ${before.total} failures survived`);
  console.log(`after:  ${after.survived} of ${after.total} failures survived`);

  if (!isFullySurvived(results)) {
    console.log(`not fixed after ${MAX_ATTEMPTS} attempts: escalate to a human. See reports/repair-log.json`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
