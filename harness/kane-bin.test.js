import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { kaneCommand } from './kane-bin.js';

test('kaneCommand uses plain kane-cli outside Windows', () => {
  const launch = kaneCommand(['--version'], { platform: 'darwin', env: { PATH: '/usr/bin' }, exists: () => true });
  assert.deepEqual(launch, { command: 'kane-cli', args: ['--version'] });
});

// Windows rules (path.win32) are used on purpose: the launcher must behave the same whatever machine runs it.
test('kaneCommand runs the shim script with node on Windows, on any host', () => {
  const dir = path.win32.join('C:\\', 'npm');
  const script = path.win32.join(dir, 'node_modules', '@testmuai', 'kane-cli', 'bin', 'kane-cli.cjs');
  const launch = kaneCommand(['run', 'a b'], {
    platform: 'win32',
    env: { PATH: ['C:\\other', dir].join(path.win32.delimiter) },
    exists: (file) => file === path.win32.join(dir, 'kane-cli.cmd') || file === script,
    execPath: 'node.exe',
  });
  assert.deepEqual(launch, { command: 'node.exe', args: [script, 'run', 'a b'] });
});

test('kaneCommand reads the Windows spelling of the PATH variable', () => {
  const dir = 'D:\\tools';
  const script = path.win32.join(dir, 'node_modules', '@testmuai', 'kane-cli', 'bin', 'kane-cli.cjs');
  const launch = kaneCommand(['x'], {
    platform: 'win32',
    env: { Path: dir },
    exists: (file) => file === path.win32.join(dir, 'kane-cli.cmd') || file === script,
    execPath: 'node.exe',
  });
  assert.equal(launch.command, 'node.exe');
});

test('kaneCommand falls back to kane-cli when the shim is not found', () => {
  const launch = kaneCommand(['x'], { platform: 'win32', env: { PATH: 'C:\\none' }, exists: () => false });
  assert.deepEqual(launch, { command: 'kane-cli', args: ['x'] });
});
