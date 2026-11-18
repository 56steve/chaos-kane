import http from 'node:http';

export const SCENARIOS = ['none', 'error500', 'slow', 'timeout', 'garbage', 'empty', 'reset'];

const SLOW_DELAY_MS = 6000;
const TIMEOUT_HOLD_MS = 30000;
const FAULTED_PREFIX = '/api/';

function sendText(res, status, contentType, body) {
  res.writeHead(status, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function forward(req, res, target) {
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      sendText(res, 502, 'application/json', JSON.stringify({ error: 'upstream unavailable' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

/**
 * Fault-injecting reverse proxy. Only /api/ calls are faulted, so the page
 * still loads and the failure always happens inside the user's flow.
 * The active scenario is switched with POST /__chaos/scenario?name=<scenario>.
 */
export function createChaosProxy(targetUrl) {
  const target = new URL(targetUrl);
  let scenario = 'none';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/__chaos/scenario') {
      if (req.method === 'POST') {
        const name = url.searchParams.get('name') ?? '';
        if (!SCENARIOS.includes(name)) {
          sendText(res, 400, 'application/json', JSON.stringify({ error: `unknown scenario: ${name}`, scenarios: SCENARIOS }));
          return;
        }
        scenario = name;
      }
      sendText(res, 200, 'application/json', JSON.stringify({ scenario, scenarios: SCENARIOS }));
      return;
    }

    if (scenario === 'none' || !url.pathname.startsWith(FAULTED_PREFIX)) {
      forward(req, res, target);
      return;
    }

    switch (scenario) {
      case 'error500':
        req.resume();
        sendText(res, 500, 'application/json', JSON.stringify({ error: 'injected failure' }));
        return;
      case 'garbage':
        req.resume();
        sendText(res, 200, 'text/html', '<html><body>upstream exploded</body></html>');
        return;
      case 'empty':
        req.resume();
        sendText(res, 200, 'application/json', '');
        return;
      case 'reset':
        req.socket.destroy();
        return;
      case 'slow':
        setTimeout(() => forward(req, res, target), SLOW_DELAY_MS).unref();
        return;
      case 'timeout':
        req.resume();
        setTimeout(() => req.socket.destroy(), TIMEOUT_HOLD_MS).unref();
        return;
      default:
        forward(req, res, target);
    }
  });

  function setScenario(name) {
    if (!SCENARIOS.includes(name)) {
      throw new Error(`unknown scenario: ${name}`);
    }
    scenario = name;
  }

  return { server, getScenario: () => scenario, setScenario };
}
