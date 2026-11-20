import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from './mcp.js';

function server(tools = []) {
  return createMcpServer({ name: 'chaos-kane', version: '9.9.9', tools });
}

const echo = {
  name: 'echo',
  description: 'echoes text',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  handler: async ({ text }) => `said: ${text}`,
};

test('initialize answers with the server info and the tools capability', async () => {
  const reply = await server().handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(reply.id, 1);
  assert.equal(reply.result.serverInfo.name, 'chaos-kane');
  assert.deepEqual(reply.result.capabilities, { tools: {} });
  assert.equal(reply.result.protocolVersion, '2024-11-05');
});

test('notifications get no reply', async () => {
  assert.equal(await server().handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list exposes name, description and schema but not the handler', async () => {
  const reply = await server([echo]).handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(reply.result.tools.length, 1);
  assert.deepEqual(Object.keys(reply.result.tools[0]).sort(), ['description', 'inputSchema', 'name']);
});

test('tools/call returns the handler text as content', async () => {
  const reply = await server([echo]).handle({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hi' } },
  });
  assert.deepEqual(reply.result.content, [{ type: 'text', text: 'said: hi' }]);
  assert.equal(reply.result.isError, undefined);
});

test('a throwing handler becomes a tool error, not a protocol error', async () => {
  const failing = { ...echo, name: 'boom', handler: async () => { throw new Error('kane is not logged in'); } };
  const reply = await server([failing]).handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'boom', arguments: {} } });
  assert.equal(reply.error, undefined);
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /kane is not logged in/);
});

test('an unknown tool is an invalid-params error', async () => {
  const reply = await server([echo]).handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(reply.error.code, -32602);
});

test('an unknown method is method-not-found', async () => {
  const reply = await server().handle({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
  assert.equal(reply.error.code, -32601);
});

test('a malformed message is an invalid request', async () => {
  const reply = await server().handle({ id: 7, method: 'ping' });
  assert.equal(reply.error.code, -32600);
});

test('ping answers with an empty result', async () => {
  const reply = await server().handle({ jsonrpc: '2.0', id: 8, method: 'ping' });
  assert.deepEqual(reply.result, {});
});

const callWith = (tool, meta) => ({
  jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: tool.name, arguments: {}, ...(meta ? { _meta: meta } : {}) },
});

test('with a progress token, a tool can report progress and the client gets increasing notifications', async () => {
  const sent = [];
  const slow = {
    name: 'slow', description: 'x', inputSchema: { type: 'object' },
    handler: async (_args, { progress }) => {
      progress('first step');
      progress('second step');
      return 'done';
    },
  };
  const reply = await server([slow]).handle(callWith(slow, { progressToken: 'tok-1' }), (message) => sent.push(message));
  assert.equal(reply.result.content[0].text, 'done');
  assert.deepEqual(sent.map((m) => m.method), ['notifications/progress', 'notifications/progress']);
  assert.deepEqual(sent.map((m) => m.params.message), ['first step', 'second step']);
  assert.ok(sent.every((m) => m.params.progressToken === 'tok-1' && m.jsonrpc === '2.0' && !('id' in m)));
  assert.ok(sent[1].params.progress > sent[0].params.progress);
});

test('without a progress token, progress calls are harmless and nothing is sent', async () => {
  const sent = [];
  const quiet = {
    name: 'quiet', description: 'x', inputSchema: { type: 'object' },
    handler: async (_args, { progress }) => {
      progress('ignored');
      return 'ok';
    },
  };
  const reply = await server([quiet]).handle(callWith(quiet), (message) => sent.push(message));
  assert.equal(reply.result.content[0].text, 'ok');
  assert.deepEqual(sent, []);
});

test('a long call sends a heartbeat so the client keeps waiting, and stops when the call ends', async () => {
  const sent = [];
  const waiting = {
    name: 'waiting', description: 'x', inputSchema: { type: 'object' },
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 90));
      return 'finished';
    },
  };
  const core = createMcpServer({ name: 'chaos-kane', version: '1', tools: [waiting], heartbeatMs: 20 });
  await core.handle(callWith(waiting, { progressToken: 7 }), (message) => sent.push(message));
  const countAtEnd = sent.length;
  assert.ok(countAtEnd >= 2, `expected heartbeats, got ${countAtEnd}`);
  assert.ok(sent.every((m) => m.params.progressToken === 7));
  assert.deepEqual(sent.map((m) => m.params.progress), [...sent.map((m) => m.params.progress)].sort((a, b) => a - b));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(sent.length, countAtEnd);
});

test('a failing tool still stops its heartbeat', async () => {
  const sent = [];
  const failing = {
    name: 'failing', description: 'x', inputSchema: { type: 'object' },
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new Error('boom');
    },
  };
  const core = createMcpServer({ name: 'chaos-kane', version: '1', tools: [failing], heartbeatMs: 15 });
  const reply = await core.handle(callWith(failing, { progressToken: 'x' }), (message) => sent.push(message));
  assert.equal(reply.result.isError, true);
  const countAtEnd = sent.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(sent.length, countAtEnd);
});
