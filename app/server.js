import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/client.js', { file: 'client.js', type: 'text/javascript; charset=utf-8' }],
]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Creates the demo shop backend. The orders array is the ground truth:
 * a run only counts as a real success if an order exists here.
 */
export function createApp() {
  const orders = [];
  const ordersByKey = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      const asset = req.method === 'GET' ? STATIC_FILES.get(url.pathname) : undefined;
      if (asset) {
        const body = await readFile(path.join(here, asset.file));
        res.writeHead(200, { 'content-type': asset.type });
        res.end(body);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/orders') {
        sendJson(res, 200, { orders });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/order') {
        const body = await readJsonBody(req);
        if (!body || !isNonEmptyString(body.name) || !isNonEmptyString(body.email)) {
          sendJson(res, 400, { error: 'name and email are required' });
          return;
        }
        const idempotencyKey = req.headers['idempotency-key'];
        const existing = typeof idempotencyKey === 'string' ? ordersByKey.get(idempotencyKey) : undefined;
        if (existing) {
          sendJson(res, 201, { id: existing.id });
          return;
        }
        const order = {
          id: `ORD-${String(orders.length + 1).padStart(4, '0')}`,
          name: body.name.trim(),
          email: body.email.trim(),
          item: isNonEmptyString(body.item) ? body.item.trim() : 'Trail Backpack',
          createdAt: new Date().toISOString(),
        };
        orders.push(order);
        if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
          ordersByKey.set(idempotencyKey, order);
        }
        sendJson(res, 201, { id: order.id });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'unexpected error' });
    }
  });

  return { server, orders };
}
