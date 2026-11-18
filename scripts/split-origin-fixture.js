import http from 'node:http';

/**
 * Test fixture: a checkout whose frontend (one origin) calls its API on a
 * different origin. A reverse proxy in front of the frontend never sees those
 * calls, so chaos-kane must report such faults as incomplete, not as passes.
 *
 *   node scripts/split-origin-fixture.js   (web on 4400, API on 4401)
 */
const WEB_PORT = Number(process.env.WEB_PORT ?? 4400);
const API_PORT = Number(process.env.API_PORT ?? 4401);

const orders = [];

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Split origin checkout</title></head>
<body>
  <h1>Split Shop</h1>
  <form id="checkout">
    <label for="name">Full name</label> <input id="name" name="name" required>
    <label for="email">Email</label> <input id="email" name="email" type="email" required>
    <button id="place-order" type="submit">Place order</button>
  </form>
  <p id="status" role="status"></p>
  <script>
    document.querySelector('#checkout').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.querySelector('#status');
      const payload = Object.fromEntries(new FormData(event.target));
      status.textContent = 'Placing order...';
      try {
        const response = await fetch('http://127.0.0.1:${API_PORT}/api/order', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        status.textContent = 'Order placed! Confirmation ' + data.id;
      } catch {
        status.textContent = "We couldn't place your order. Please try again.";
      }
    });
  </script>
</body></html>`;

const web = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

const api = http.createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, idempotency-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/api/orders') {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ orders }));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/order') {
    for await (const chunk of req) {
      void chunk;
    }
    const order = { id: `ORD-${String(orders.length + 1).padStart(4, '0')}` };
    orders.push(order);
    res.writeHead(201, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify(order));
    return;
  }
  res.writeHead(404, cors);
  res.end();
});

web.listen(WEB_PORT, '127.0.0.1', () => console.log(`web http://127.0.0.1:${WEB_PORT}`));
api.listen(API_PORT, '127.0.0.1', () => console.log(`api http://127.0.0.1:${API_PORT}`));
