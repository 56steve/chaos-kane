import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, parseStatusCode } from './verdict.js';

test('healthy order that is saved and confirmed survives', () => {
  const result = judge({ statusMessage: 'Order placed! Confirmation ORD-0001', requestStatus: '201', orderCreated: true });
  assert.equal(result.outcome, 'survived');
});

test('page claims success while no order exists is a fake success', () => {
  const result = judge({ statusMessage: 'Order placed! Confirmation pending', requestStatus: '500', orderCreated: false });
  assert.equal(result.outcome, 'failed');
  assert.match(result.reasons.join(' '), /fake success/i);
});

test('clear error with no order saved survives', () => {
  const result = judge({ statusMessage: "We couldn't place your order. Please try again.", requestStatus: '500', orderCreated: false });
  assert.equal(result.outcome, 'survived');
});

test('a spinner that never resolves is not a survival', () => {
  const result = judge({ statusMessage: 'Placing order...', requestStatus: 'no response', orderCreated: false });
  assert.equal(result.outcome, 'failed');
  assert.match(result.reasons.join(' '), /no clear error/i);
});

test('order saved but shopper told nothing useful fails', () => {
  const result = judge({ statusMessage: 'Placing order...', requestStatus: '201', orderCreated: true });
  assert.equal(result.outcome, 'failed');
});

test('missing status message is incomplete, never a pass', () => {
  const result = judge({ statusMessage: undefined, requestStatus: undefined, orderCreated: false });
  assert.equal(result.outcome, 'incomplete');
});

test('empty status message with no order is a failure to inform', () => {
  const result = judge({ statusMessage: 'none', requestStatus: '500', orderCreated: false });
  assert.equal(result.outcome, 'failed');
});

test('a retry that creates a second order is a duplicate even when the page says success', () => {
  const result = judge({
    statusMessage: 'Order placed! Confirmation ORD-0002',
    requestStatus: '201',
    orderCreated: true,
    orderCount: 2,
  });
  assert.equal(result.outcome, 'failed');
  assert.match(result.reasons.join(' '), /duplicate/i);
});

test('a retry that ends with exactly one order and a success message survives', () => {
  const result = judge({
    statusMessage: 'Order placed! Confirmation ORD-0001',
    requestStatus: '201',
    orderCreated: true,
    orderCount: 1,
  });
  assert.equal(result.outcome, 'survived');
});

test('the noun appears in the reasons so other apps read naturally', () => {
  const result = judge({ statusMessage: 'Booking saved!', requestStatus: '500', orderCreated: false, noun: 'booking' });
  assert.equal(result.outcome, 'failed');
  assert.match(result.reasons.join(' '), /fake success/);
  assert.match(result.reasons.join(' '), /no booking/);
});

test('a custom success pattern decides what counts as a success claim', () => {
  const result = judge({
    statusMessage: 'All set, see you soon',
    requestStatus: '500',
    orderCreated: false,
    successPattern: /all set/i,
  });
  assert.equal(result.outcome, 'failed');
  assert.match(result.reasons.join(' '), /fake success/);
});

test('generic success wording is recognised without a custom pattern', () => {
  const result = judge({ statusMessage: 'Saved!', requestStatus: '201', orderCreated: true });
  assert.equal(result.outcome, 'survived');
});

test('parseStatusCode reads numeric strings and rejects the rest', () => {
  assert.equal(parseStatusCode('500'), 500);
  assert.equal(parseStatusCode(201), 201);
  assert.equal(parseStatusCode('no response'), null);
  assert.equal(parseStatusCode(undefined), null);
});
