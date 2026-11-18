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
