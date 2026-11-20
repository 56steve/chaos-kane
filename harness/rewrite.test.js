import test from 'node:test';
import assert from 'node:assert/strict';
import { isRewritable, rewriteLocation, rewriteSetCookie, rewriteText, upstreamRequestHeaders } from '../chaos/rewrite.js';

const target = new URL('https://shop.example.com');
const proxy = 'http://127.0.0.1:4100';

test('the site\'s own address is pointed back at the proxy, in plain, escaped and protocol-relative form', () => {
  const html = '<a href="https://shop.example.com/cart">c</a> <script src="//shop.example.com/app.js"></script>';
  assert.equal(
    rewriteText(html, target, proxy),
    '<a href="http://127.0.0.1:4100/cart">c</a> <script src="//127.0.0.1:4100/app.js"></script>',
  );
  assert.equal(rewriteText('{"u":"https:\\/\\/shop.example.com\\/x"}', target, proxy), '{"u":"http:\\/\\/127.0.0.1:4100\\/x"}');
});

test('other hosts, and hosts that only start with the same name, are left alone', () => {
  const text = 'https://cdn.shop.example.com/a https://shop.example.com.evil.test/b https://other.test/c https://shop.example.com-x.test/d';
  assert.equal(rewriteText(text, target, proxy), text);
});

test('a sentence that ends with the address still gets rewritten', () => {
  assert.equal(rewriteText('Visit https://shop.example.com. Thanks', target, proxy), 'Visit http://127.0.0.1:4100. Thanks');
});

test('an http address of an http target with a port is rewritten too', () => {
  assert.equal(rewriteText('go http://localhost:3000/a', new URL('http://localhost:3000'), proxy), 'go http://127.0.0.1:4100/a');
});

test('text without the address comes back identical', () => {
  assert.equal(rewriteText('nothing to see', target, proxy), 'nothing to see');
});

test('only text-like content is rewritten, never images or archives', () => {
  for (const type of ['text/html; charset=utf-8', 'application/json', 'application/javascript', 'text/css', 'application/ld+json', 'text/plain']) {
    assert.equal(isRewritable(type), true, type);
  }
  for (const type of ['image/png', 'application/zip', 'application/octet-stream', 'text/event-stream', undefined]) {
    assert.equal(isRewritable(type), false, String(type));
  }
});

test('a redirect to the site itself stays inside the proxy; one to another site does not', () => {
  assert.equal(rewriteLocation('https://shop.example.com/login?x=1', target, proxy), 'http://127.0.0.1:4100/login?x=1');
  assert.equal(rewriteLocation('/relative', target, proxy), '/relative');
  assert.equal(rewriteLocation('https://pay.example.org/x', target, proxy), 'https://pay.example.org/x');
  assert.equal(rewriteLocation(undefined, target, proxy), undefined);
});

test('cookies lose the attributes that would make the browser refuse them on the proxy address', () => {
  const [first, second] = rewriteSetCookie(
    ['sid=1; Path=/; Domain=shop.example.com; Secure; HttpOnly; SameSite=None', 'theme=dark; path=/; domain=.example.com; SameSite=Lax'],
  );
  assert.equal(first, 'sid=1; Path=/; HttpOnly; SameSite=Lax');
  assert.equal(second, 'theme=dark; path=/; SameSite=Lax');
  assert.equal(rewriteSetCookie(undefined), undefined);
});

test('requests to the site carry the site\'s own origin, and ask for an uncompressed answer', () => {
  const headers = upstreamRequestHeaders(
    { host: '127.0.0.1:4100', origin: proxy, referer: `${proxy}/cart`, 'accept-encoding': 'gzip, br', cookie: 'a=b' },
    target,
    proxy,
  );
  assert.equal(headers.host, 'shop.example.com');
  assert.equal(headers.origin, 'https://shop.example.com');
  assert.equal(headers.referer, 'https://shop.example.com/cart');
  assert.equal(headers['accept-encoding'], 'identity');
  assert.equal(headers.cookie, 'a=b');
});
