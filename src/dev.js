import { createApp } from '../app/server.js';
import { createChaosProxy } from '../chaos/proxy.js';

const APP_PORT = Number(process.env.APP_PORT ?? 4000);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4100);

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

const { server: appServer } = createApp();
const { server: proxyServer } = createChaosProxy(`http://127.0.0.1:${APP_PORT}`);

await listen(appServer, APP_PORT);
await listen(proxyServer, PROXY_PORT);

console.log(`app   http://127.0.0.1:${APP_PORT}  (ground truth: /api/orders)`);
console.log(`proxy http://127.0.0.1:${PROXY_PORT}  (point Kane here; POST /__chaos/scenario?name=error500)`);
