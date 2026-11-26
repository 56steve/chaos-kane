import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvidenceCheck, applyFaultCheck } from './validity.js';

const rules = { prefixes: ['/api/'], methods: ['POST', 'PUT'] };
const survived = { outcome: 'survived', reasons: ['order was saved and the user was told so'] };

test('the healthy baseline never needs a fault to fire', () => {
  assert.deepEqual(applyFaultCheck(survived, 'none', 0, rules), survived);
});

test('a verdict stands when the fault actually fired', () => {
  assert.deepEqual(applyFaultCheck(survived, 'error500', 1, rules), survived);
});

test('a fault that never fired cannot count as survived', () => {
  const result = applyFaultCheck(survived, 'error500', 0, rules);
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.reasons[0], /error500 fault never fired/);
});

test('the explanation names the rules and the cross-origin cause', () => {
  const result = applyFaultCheck(survived, 'ghost', 0, rules);
  assert.match(result.reasons[0], /POST\/PUT/);
  assert.match(result.reasons[0], /\/api\//);
  assert.match(result.reasons[0], /another origin/);
});

test('a failed verdict is also downgraded, because nothing was really tested', () => {
  const failed = { outcome: 'failed', reasons: ['x'] };
  assert.equal(applyFaultCheck(failed, 'timeout', 0, rules).outcome, 'incomplete');
});

const fakeSuccess = { outcome: 'failed', reasons: ['fake success: page says "Order placed!" but the backend has no order'] };

test('without a truth endpoint, no write through the proxy means unable to verify', () => {
  const result = applyEvidenceCheck(fakeSuccess, { hasTruth: false, writesSeen: 0 });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.reasons[0], /no write request went through the proxy/);
  assert.match(result.reasons[0], /another origin/);
});

test('a truth endpoint is real evidence even if no write passed through the proxy', () => {
  assert.deepEqual(applyEvidenceCheck(fakeSuccess, { hasTruth: true, writesSeen: 0 }), fakeSuccess);
});

test('writes seen by the proxy keep the verdict', () => {
  assert.deepEqual(applyEvidenceCheck(fakeSuccess, { hasTruth: false, writesSeen: 2 }), fakeSuccess);
});

test('an incomplete verdict is left as it is, with its own reason', () => {
  const incomplete = { outcome: 'incomplete', reasons: ['the ghost fault never fired'] };
  assert.deepEqual(applyEvidenceCheck(incomplete, { hasTruth: false, writesSeen: 0 }), incomplete);
});

import { applyCrossCheck } from './validity.js';

test('a status disagreement between Kane and the network log makes the verdict unable to verify', () => {
  const verdict = { outcome: 'survived', reasons: ['ok'] };
  const result = applyCrossCheck(verdict, { agreement: 'disagreed', status: '201', kaneReported: '500' });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.reasons[0], /Kane reported HTTP 500/);
  assert.match(result.reasons[0], /network log shows HTTP 201/);
});

test('a disagreement can also be about no response', () => {
  const result = applyCrossCheck({ outcome: 'failed', reasons: ['x'] }, { agreement: 'disagreed', status: 'no response', kaneReported: '201' });
  assert.match(result.reasons[0], /shows no response/);
});

test('agreement or an unavailable log leaves the verdict alone', () => {
  const verdict = { outcome: 'failed', reasons: ['x'] };
  assert.deepEqual(applyCrossCheck(verdict, { agreement: 'agreed' }), verdict);
  assert.deepEqual(applyCrossCheck(verdict, { agreement: 'unavailable' }), verdict);
});

test('an already unverifiable verdict keeps its own reason', () => {
  const verdict = { outcome: 'incomplete', reasons: ['the fault never fired'] };
  assert.deepEqual(applyCrossCheck(verdict, { agreement: 'disagreed', status: '1', kaneReported: '2' }), verdict);
});

test('an unreadable network log, with no status from Kane, makes the result unable to verify', () => {
  const verdict = applyCrossCheck({ outcome: 'failed', reasons: ['fake success'] }, { source: 'none', agreement: 'unreadable', status: 'unknown' });
  assert.equal(verdict.outcome, 'incomplete');
  assert.match(verdict.reasons[0], /network log could not be read/i);
});

test('an unreadable network log does not change a result that was already incomplete', () => {
  const incomplete = { outcome: 'incomplete', reasons: ['no message'] };
  assert.deepEqual(applyCrossCheck(incomplete, { source: 'none', agreement: 'unreadable', status: 'unknown' }), incomplete);
});
