#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import readline from 'node:readline';
import { runDoctor } from '../harness/doctor.js';
import { createMcpServer } from '../harness/mcp.js';
import { createChaosTools } from '../harness/mcp-tools.js';
import { runFromConfig } from '../harness/runner.js';

/**
 * MCP server (stdio) exposing chaos_check to any coding agent. Messages are
 * newline-delimited JSON-RPC on stdout, so everything else goes to stderr.
 *
 * Example: claude mcp add chaos-kane -- node /path/to/chaos-kane/bin/chaos-kane-mcp.js
 */
const server = createMcpServer({
  name: 'chaos-kane',
  version: '0.3.0',
  tools: createChaosTools({
    run: (config) => runFromConfig(config, { log: (line) => process.stderr.write(`${line}\n`) }),
    readBrief: (file) => readFile(file, 'utf8'),
    doctor: (options) => runDoctor(options),
  }),
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (line.trim() === '') {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  server.handle(message).then((reply) => {
    if (reply) {
      send(reply);
    }
  });
});
