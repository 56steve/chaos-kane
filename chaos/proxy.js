import http from 'node:http';
import https from 'node:https';

export const SCENARIOS = ['none', 'error500', 'slow', 'timeout', 'garbage', 'empty', 'reset', 'ghost', 'double'];

const SLOW_DELAY_MS = 6000;
const DOUBLE_DELAY_MS = 2000;
const TIMEOUT_HOLD_MS = 30000;
export const DEFAULT_PREFIXES = ['/api/'];
export const DEFAULT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const FAULT_ACTION = {
  error500: 'answered HTTP 500',
  slow: 'delayed the response by 6 seconds',
  timeout: 'never answered',
  garbage: 'answered 200 with an HTML page',
  empty: 'answered 200 with an empty body',
  reset: 'dropped the connection',
  ghost: 'let the backend save it, then lost the response',
  double: 'held the reply for 2 seconds so a fast second click lands in flight',
};

/** Picks the transport for the upstream app: plain HTTP or HTTPS. */
export function upstreamModule(target) {
  return target.protocol === 'https:' ? https : http;
}

function sendText(res, status, contentType, body) {
  res.writeHead(status, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Forwards a request upstream and reports the upstream status through onUpstream.
 * With dropResponse the upstream still does its work, but the answer never
 * reaches the client: the connection is cut once the upstream has replied.
 */
function forward(req, res, target, { dropResponse = false, onUpstream = () => {} } = {}) {
  const secure = target.protocol === 'https:';
  const upstream = upstreamModule(target).request(
    {
      hostname: target.hostname,
      port: target.port || (secure ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      onUpstream(upstreamRes.statusCode ?? 0);
      if (dropResponse) {
        upstreamRes.resume();
        upstreamRes.on('end', () => req.socket.destroy());
        return;
      }
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
 * Fault-injecting reverse proxy for any web app (HTTP or HTTPS upstream).
 *
 * Only requests whose path starts with one of `prefixes` and whose method is in
 * `methods` are faulted (by default mutating calls under /api/), so pages and
 * read requests still load and the failure always happens inside the user's flow.
 * The active scenario is switched with POST /__chaos/scenario?name=<scenario>.
 *
 * The proxy only sees requests that go through it. An app whose frontend calls
 * an API on a different origin bypasses it, which the harness reports as an
 * incomplete result rather than a pass.
 *
 * - ghost: loses only the first matching response (backend saves, user sees a failure, a retry exposes duplicates).
 * - double: holds every matching reply for 2 seconds so a fast double click lands while the first request is in flight.
 *
 * The proxy also counts mutations the backend accepted (2xx), which is the
 * evidence of last resort when an app has no truth endpoint.
 */
export function createChaosProxy(targetUrl, options = {}) {
  const { prefixes = DEFAULT_PREFIXES, methods = DEFAULT_METHODS, onEvent = () => {} } = options;
  const target = new URL(targetUrl);
  let scenario = 'none';
  let ghostArmed = false;
  let accepted = 0;

  function select(name) {
    if (!SCENARIOS.includes(name)) {
      throw new Error(`unknown scenario: ${name}`);
    }
    scenario = name;
    ghostArmed = name === 'ghost';
  }

  function isFaultable(req, pathname) {
    return methods.includes(req.method ?? '') && prefixes.some((prefix) => pathname.startsWith(prefix));
  }

  function forwardTracked(req, res, extra = {}) {
    forward(req, res, target, {
      ...extra,
      onUpstream: (status) => {
        if (methods.includes(req.method ?? '') && status >= 200 && status < 300) {
          accepted += 1;
        }
      },
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/__chaos/scenario') {
      if (req.method === 'POST') {
        const name = url.searchParams.get('name') ?? '';
        if (!SCENARIOS.includes(name)) {
          sendText(res, 400, 'application/json', JSON.stringify({ error: `unknown scenario: ${name}`, scenarios: SCENARIOS }));
          return;
        }
        select(name);
      }
      sendText(res, 200, 'application/json', JSON.stringify({ scenario, scenarios: SCENARIOS }));
      return;
    }

    if (scenario === 'none' || !isFaultable(req, url.pathname)) {
      forwardTracked(req, res);
      return;
    }

    const announce = () =>
      onEvent({ type: 'fault', scenario, method: req.method, path: url.pathname, action: FAULT_ACTION[scenario] ?? scenario });

    switch (scenario) {
      case 'error500':
        announce();
        req.resume();
        sendText(res, 500, 'application/json', JSON.stringify({ error: 'injected failure' }));
        return;
      case 'garbage':
        announce();
        req.resume();
        sendText(res, 200, 'text/html', '<html><body>upstream exploded</body></html>');
        return;
      case 'empty':
        announce();
        req.resume();
        sendText(res, 200, 'application/json', '');
        return;
      case 'reset':
        announce();
        req.socket.destroy();
        return;
      case 'slow':
        announce();
        setTimeout(() => forwardTracked(req, res), SLOW_DELAY_MS).unref();
        return;
      case 'double':
        announce();
        setTimeout(() => forwardTracked(req, res), DOUBLE_DELAY_MS).unref();
        return;
      case 'timeout':
        announce();
        req.resume();
        setTimeout(() => req.socket.destroy(), TIMEOUT_HOLD_MS).unref();
        return;
      case 'ghost':
        if (ghostArmed) {
          ghostArmed = false;
          announce();
          forwardTracked(req, res, { dropResponse: true });
          return;
        }
        forwardTracked(req, res);
        return;
      default:
        forwardTracked(req, res);
    }
  });

  return {
    server,
    getScenario: () => scenario,
    setScenario: select,
    acceptedMutations: () => accepted,
    resetAccepted: () => {
      accepted = 0;
    },
  };
}
