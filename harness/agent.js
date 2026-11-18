import { spawn } from 'node:child_process';

const KILL_GRACE_MS = 5000;

/**
 * Runs the coding agent (Claude Code in print mode) with a prompt on stdin.
 * Only file reading and editing are allowed; shell and web tools are denied.
 * The caller still enforces scope by checking which files changed.
 */
export function runAgent({ prompt, cwd, timeoutSec = 300 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--allowedTools', 'Read', 'Edit', '--disallowedTools', 'Bash', 'WebFetch', 'WebSearch'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const killer = setTimeout(() => child.kill('SIGKILL'), timeoutSec * 1000 + KILL_GRACE_MS);

    child.on('error', (error) => {
      clearTimeout(killer);
      reject(new Error(`could not start the coding agent: ${error.message}`));
    });
    child.on('close', (exitCode) => {
      clearTimeout(killer);
      resolve({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    child.stdin.end(prompt);
  });
}
