import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCount } from './truth.js';

test('a bare number is the count', () => {
  assert.equal(extractCount(7), 7);
});

test('an array counts its items', () => {
  assert.equal(extractCount([{ id: 1 }, { id: 2 }]), 2);
});

test('an object with a count field uses it', () => {
  assert.equal(extractCount({ count: 4, items: [] }), 4);
});

test('an object with one array property counts that array', () => {
  assert.equal(extractCount({ orders: [{ id: 1 }, { id: 2 }, { id: 3 }] }), 3);
});

test('an empty array property counts zero', () => {
  assert.equal(extractCount({ orders: [] }), 0);
});

test('JSON with nothing countable is an error, not a silent zero', () => {
  assert.throws(() => extractCount({ ok: true }), /countable/i);
  assert.throws(() => extractCount('hello'), /countable/i);
  assert.throws(() => extractCount(null), /countable/i);
});
