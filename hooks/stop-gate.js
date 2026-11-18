import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runChaos } from '../harness/chaos.js';
import { buildBlockMessage, emptyState, recordAttempt, recordPass, shouldVerify } from '../harness/gate.js';

/**
 * Claude Code Stop hook. When the agent tries to finish, Kane verifies the
 * checkout under injected failures. A failing run exits with code 2, which
 * blocks the stop and feeds the evidence back to the agent.
 *
 * Environment:
 *   CHAOS_GATE=off            disable the gate
 *   CHAOS_GATE_SCENARIOS=a,b  scenarios to check (default: none,error500,ghost)
 *   CHAOS_GATE_MAX=3          blocked stops allowed per session before giving up
 */

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const STATE_FILE = path.join(ROOT, '.kane-gate-state.json');
const WATCHED_DIRS = ['app', 'chaos'];
const DEFAULT_SCENARIOS = ['none', 'error500', 'ghost'];

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function listFiles(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(relative) : [relative];
    }),
  );
  return nested.flat().sort();
}

async function hashWatchedCode() {
  const hash = createHash('sha256');
  for (const dir of WATCHED_DIRS) {
    for (const file of await listFiles(dir)) {
      hash.update(file);
      hash.update(await readFile(path.join(ROOT, file)));
    }
  }
  return hash.digest('hex');
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return emptyState();
  }
}

async function main() {
  if (process.env.CHAOS_GATE === 'off') {
    return;
  }

  const input = await readStdinJson();
  const sessionId = typeof input.session_id === 'string' ? input.session_id : 'default';
  const maxAttempts = Number(process.env.CHAOS_GATE_MAX ?? 3);
  const scenarios = (process.env.CHAOS_GATE_SCENARIOS ?? DEFAULT_SCENARIOS.join(','))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const hash = await hashWatchedCode();
  const state = await loadState();
  if (!shouldVerify(hash, state)) {
    return;
  }

  const results = await runChaos({ scenarios, outDir: path.join(ROOT, 'reports', 'gate') });
  const failures = results.filter((result) => result.outcome !== 'survived');

  if (failures.length === 0) {
    await writeFile(STATE_FILE, JSON.stringify(recordPass(state, sessionId, hash)));
    return;
  }

  const step = recordAttempt(state, sessionId, maxAttempts);
  await writeFile(STATE_FILE, JSON.stringify(step.state));
  if (step.exhausted) {
    process.stderr.write(`Kane gate: still failing after ${maxAttempts} blocked stops. A human needs to look at reports/gate.\n`);
    return;
  }
  process.stderr.write(`${buildBlockMessage(failures, step.attempt, maxAttempts)}\n`);
  process.exitCode = 2;
}

main().catch((error) => {
  // The gate must never trap the agent because of its own failure: report and let the stop through.
  process.stderr.write(`Kane gate could not run: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
