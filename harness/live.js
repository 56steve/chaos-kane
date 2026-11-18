import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { LIVE_PAGE } from './live-page.js';

const KEEPALIVE_MS = 15000;

/**
 * Serves the live dashboard on localhost. The page connects to /events, gets
 * the history of the run so far, then receives new events as they happen.
 */
const EVIDENCE_FILE = /^[A-Za-z0-9._-]+\.jpg$/;

export function startLiveServer({ hub, port, evidenceDir = null }) {
  const streams = new Set();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(LIVE_PAGE);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/evidence/') && evidenceDir) {
      const name = url.pathname.slice('/evidence/'.length);
      if (!EVIDENCE_FILE.test(name) || name.includes('..')) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      readFile(path.join(evidenceDir, name))
        .then((body) => {
          res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
          res.end(body);
        })
        .catch(() => {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('not found');
        });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      for (const event of hub.history()) {
        send(event);
      }
      const unsubscribe = hub.subscribe(send);
      const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
      streams.add(res);
      req.on('close', () => {
        clearInterval(keepalive);
        unsubscribe();
        streams.delete(res);
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => {
          for (const stream of streams) {
            stream.end();
          }
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}
