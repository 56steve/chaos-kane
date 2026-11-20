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

test('a paginated list reports its real total, not the length of the page', () => {
  assert.equal(extractCount({ articles: [1, 2, 3], articlesCount: 57 }), 57);
  assert.equal(extractCount({ data: [1, 2], total: 120 }), 120);
  assert.equal(extractCount({ items: [1], total_count: 9 }), 9);
  assert.equal(extractCount({ results: [1, 2], totalCount: 31, page: 1 }), 31);
});

test('a plain count field still wins, and a list alone is counted by its length', () => {
  assert.equal(extractCount({ count: 5, total: 9, items: [1] }), 5);
  assert.equal(extractCount({ items: [1, 2, 3, 4] }), 4);
});

test('two different total-like fields are ambiguous, so the list length is used rather than a guess', () => {
  assert.equal(extractCount({ items: [1, 2], usersCount: 10, ordersCount: 20 }), 2);
});

test('a total that is not a finite number is ignored', () => {
  assert.equal(extractCount({ items: [1, 2], total: 'many' }), 2);
});

test('words that merely end in count, like discount, are not totals', () => {
  assert.equal(extractCount({ items: [1, 2, 3], discount: 5, account: 9 }), 3);
});
