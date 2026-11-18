const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

function result(id, value) {
  return { jsonrpc: '2.0', id, result: value };
}

function failure(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * A small Model Context Protocol server core (JSON-RPC 2.0), with no
 * dependencies. `handle` takes one decoded message and returns the reply, or
 * null when the message was a notification.
 *
 * Each tool is { name, description, inputSchema, handler(args) -> string }.
 * A handler that throws becomes a tool error the agent can read, not a
 * protocol error.
 */
export function createMcpServer({ name, version, tools }) {
  async function callTool(id, params) {
    const tool = tools.find((candidate) => candidate.name === params?.name);
    if (!tool) {
      return failure(id, -32602, `unknown tool: ${params?.name}`);
    }
    try {
      const text = await tool.handler(params.arguments ?? {});
      return result(id, { content: [{ type: 'text', text }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return result(id, { content: [{ type: 'text', text: message }], isError: true });
    }
  }

  async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return failure(message && 'id' in message ? message.id : null, -32600, 'invalid request');
    }
    const isNotification = !('id' in message);
    const { id, method, params } = message;

    switch (method) {
      case 'initialize':
        return result(id, {
          protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name, version },
        });
      case 'ping':
        return result(id, {});
      case 'tools/list':
        return result(id, {
          tools: tools.map(({ name: toolName, description, inputSchema }) => ({ name: toolName, description, inputSchema })),
        });
      case 'tools/call':
        return callTool(id, params);
      default:
        return isNotification ? null : failure(id, -32601, `method not found: ${method}`);
    }
  }

  return { handle };
}
