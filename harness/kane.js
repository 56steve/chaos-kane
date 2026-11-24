import { spawn } from 'node:child_process';
import { kaneCommand } from './kane-bin.js';

const KILL_GRACE_MS = 30000;

/**
 * Pulls the run_end record out of Kane's NDJSON stream. Progress events carry
 * no type; the final record carries final_state and the run summary.
 */
export function extractRunEnd(ndjson) {
  let runEnd = null;
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const record = JSON.parse(trimmed);
      if (record.type === 'run_end' || 'final_state' in record) {
        runEnd = record;
      }
    } catch {
      // Not a JSON line; Kane may print banners around the stream.
    }
  }
  return runEnd;
}

/**
 * Runs one Kane objective in agent mode and returns the raw stream plus the
 * parsed run_end record. Never throws on a failed run; the caller decides.
 */
export function runKane({ objective, url, maxSteps = 15, timeoutSec = 180, onLine = () => {} }) {
  return new Promise((resolve, reject) => {
    const args = [
      'run',
      objective,
      '--url',
      url,
      '--agent',
      '--headless',
      '--max-steps',
      String(maxSteps),
      '--timeout',
      String(timeoutSec),
    ];
    const launch = kaneCommand(args);
    const child = spawn(launch.command, launch.args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        onLine(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const killer = setTimeout(() => child.kill('SIGKILL'), timeoutSec * 1000 + KILL_GRACE_MS);

    child.on('error', (error) => {
      clearTimeout(killer);
      reject(new Error(`could not start kane-cli: ${error.message}`));
    });

    child.on('close', (exitCode) => {
      clearTimeout(killer);
      if (pending.length > 0) {
        onLine(pending);
      }
      resolve({ exitCode, stdout, stderr, runEnd: extractRunEnd(stdout) });
    });
  });
}
