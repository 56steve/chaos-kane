import test from 'node:test';
import assert from 'node:assert/strict';
import { dynamicPrefix, learnFaultTarget, orderScenarios } from './target.js';

const write = (method, path, status = 200) => ({ method, path, status });

test('the flow ends on the write that matters: the login is not the target', () => {
  const target = learnFaultTarget([write('POST', '/api/users/login'), write('POST', '/api/articles', 201)]);
  assert.deepEqual(target, { prefixes: ['/api/articles'], methods: ['POST'] });
});

test('the last successful write wins, even when an earlier one has a different method', () => {
  const target = learnFaultTarget([write('POST', '/api/cart'), write('PUT', '/api/orders/confirm', 200)]);
  assert.deepEqual(target, { prefixes: ['/api/orders/confirm'], methods: ['PUT'] });
});

test('writes that failed or got no answer are ignored when a successful one exists', () => {
  const target = learnFaultTarget([write('POST', '/api/save', 200), write('POST', '/api/retry', 500), write('POST', '/api/lost', 0)]);
  assert.deepEqual(target, { prefixes: ['/api/save'], methods: ['POST'] });
});

test('no successful write means nothing is learned', () => {
  assert.equal(learnFaultTarget([]), null);
  assert.equal(learnFaultTarget([write('POST', '/api/x', 500), write('POST', '/api/y', 0)]), null);
});

test('ids in the path are cut off so the next run, with a new id, still matches', () => {
  assert.equal(dynamicPrefix('/api/orders/123/confirm'), '/api/orders');
  assert.equal(dynamicPrefix('/api/items/3f2a9c1e-7b4d-4e2a-9a10-5d6f8c2b1a77'), '/api/items');
  assert.equal(dynamicPrefix('/api/token/9f86d081884c7d659a2feaa0c55ad015'), '/api/token');
  assert.equal(dynamicPrefix('/api/articles'), '/api/articles');
  assert.equal(dynamicPrefix('/api/v2/orders'), '/api/v2/orders');
});

test('a path that is only an id falls back to the root', () => {
  assert.equal(dynamicPrefix('/12345'), '/');
});

test('the baseline runs first when learning, and nothing else moves', () => {
  assert.deepEqual(orderScenarios(['error500', 'none', 'ghost']), ['none', 'error500', 'ghost']);
  assert.deepEqual(orderScenarios(['error500', 'ghost']), ['error500', 'ghost']);
  assert.deepEqual(orderScenarios(['none', 'ghost']), ['none', 'ghost']);
});
