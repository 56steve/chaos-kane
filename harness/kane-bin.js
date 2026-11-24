import { existsSync } from 'node:fs';
import path from 'node:path';

const KANE_SCRIPT = path.join('node_modules', '@testmuai', 'kane-cli', 'bin', 'kane-cli.cjs');

/**
 * Where to start kane-cli. On Windows npm installs a kane-cli.cmd shim, which
 * Node cannot start without a shell, and a shell would mangle the objective
 * text. So there we run the shim's real script with the current Node instead.
 * Everywhere else, and whenever the script cannot be found, it is plain kane-cli.
 */
export function kaneCommand(args, { platform = process.platform, env = process.env, exists = existsSync, execPath = process.execPath } = {}) {
  if (platform === 'win32') {
    const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      if (exists(path.join(dir, 'kane-cli.cmd'))) {
        const script = path.join(dir, KANE_SCRIPT);
        if (exists(script)) {
          return { command: execPath, args: [script, ...args] };
        }
      }
    }
  }
  return { command: 'kane-cli', args };
}
