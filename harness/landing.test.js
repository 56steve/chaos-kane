import test from 'node:test';
import assert from 'node:assert/strict';
import { messageOrLanding } from './landing.js';

const claims = /article\//i;

test('a message the page really showed is never replaced', () => {
  assert.equal(messageOrLanding({ statusMessage: 'Order placed!', finalUrl: 'http://x.test/#/article/a', successPattern: claims }), 'Order placed!');
});

test('no message, but the flow ended on a page the claims pattern matches: that is the success signal', () => {
  const result = messageOrLanding({ statusMessage: 'none', finalUrl: 'http://127.0.0.1:4100/#/article/chaos-test-1', successPattern: claims });
  assert.equal(result, 'Taken to /#/article/chaos-test-1');
});

test('an empty message counts as none', () => {
  assert.match(messageOrLanding({ statusMessage: '  ', finalUrl: 'http://x.test/article/7', successPattern: claims }), /^Taken to \/article\/7$/);
});

test('no message and the page does not match: nothing is invented', () => {
  assert.equal(messageOrLanding({ statusMessage: 'none', finalUrl: 'http://x.test/#/editor', successPattern: claims }), 'none');
});

test('without a claims pattern, a url, or a message at all, the value is left alone', () => {
  assert.equal(messageOrLanding({ statusMessage: 'none', finalUrl: 'http://x.test/article/1', successPattern: undefined }), 'none');
  assert.equal(messageOrLanding({ statusMessage: 'none', finalUrl: undefined, successPattern: claims }), 'none');
  assert.equal(messageOrLanding({ statusMessage: undefined, finalUrl: 'http://x.test/article/1', successPattern: claims }), undefined);
});

test('an unreadable url is ignored', () => {
  assert.equal(messageOrLanding({ statusMessage: 'none', finalUrl: 'not a url', successPattern: claims }), 'none');
});

test('only the path and hash are used: no host, no query string', () => {
  const result = messageOrLanding({ statusMessage: 'none', finalUrl: 'http://127.0.0.1:4100/article/9?token=secret#top', successPattern: claims });
  assert.equal(result, 'Taken to /article/9#top');
  assert.doesNotMatch(result, /secret|127\.0\.0\.1/);
});
