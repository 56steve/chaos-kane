const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_HEARTBEAT_MS = 15000;

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
 * Each tool is { name, description, inputSchema, handler(args, { progress }) -> string }.
 * A handler that throws becomes a tool error the agent can read, not a
 * protocol error.
 *
 * A call can take minutes. When the client sends a progress token, the server
 * sends `notifications/progress` while the tool runs: whatever the tool reports
 * through `progress(text)`, plus a heartbeat every `heartbeatMs`, so a client
 * that resets its timeout on activity keeps waiting. Without a token, `progress`
 * does nothing and nothing extra is sent.
 */
export function createMcpServer({ name, version, tools, heartbeatMs = DEFAULT_HEARTBEAT_MS }) {
  async function callTool(id, params, notify) {
    const tool = tools.find((candidate) => candidate.name === params?.name);
    if (!tool) {
      return failure(id, -32602, `unknown tool: ${params?.name}`);
    }

    const token = params?._meta?.progressToken;
    let step = 0;
    let finished = false;
    const progress = (text) => {
      if (token === undefined || token === null || finished) {
        return;
      }
      step += 1;
      notify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: step, message: text } });
    };
    const heartbeat = token === undefined || token === null ? null : setInterval(() => progress('still running'), heartbeatMs);
    heartbeat?.unref();

    try {
      const text = await tool.handler(params.arguments ?? {}, { progress });
      return result(id, { content: [{ type: 'text', text }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return result(id, { content: [{ type: 'text', text: message }], isError: true });
    } finally {
      finished = true;
      clearInterval(heartbeat);
    }
  }

  async function handle(message, notify = () => {}) {
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
        return callTool(id, params, notify);
      default:
        return isNotification ? null : failure(id, -32601, `method not found: ${method}`);
    }
  }

  return { handle };
}
