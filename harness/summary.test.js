import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryMarkdown } from './summary.js';

const results = [
  { scenario: 'none', outcome: 'survived', statusMessage: 'Order placed! Confirmation ORD-0001', orderCount: 1, reasons: ['ok'] },
  { scenario: 'error500', outcome: 'failed', statusMessage: 'Order placed! | pending', orderCount: 0, reasons: ['fake success'] },
  { scenario: 'ghost', outcome: 'incomplete', statusMessage: undefined, orderCount: undefined, reasons: ['never fired'] },
];
const summary = { survived: 0, failed: 1, incomplete: 1, total: 2, baseline: 'survived' };
const base = { results, summary, target: 'http://localhost:3000', flow: 'check out', noun: 'order' };

test('the summary has a header, the score and one table row per scenario', () => {
  const text = buildSummaryMarkdown(base);
  assert.match(text, /## chaos-kane/);
  assert.match(text, /0 of 2 injected failures survived/);
  assert.match(text, /\| error500 \| failed \|/);
  assert.equal(text.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Fault') && !line.startsWith('| ---')).length, 3);
});

test('incomplete is shown as unable to verify', () => {
  assert.match(buildSummaryMarkdown(base), /\| ghost \| unable to verify \|/);
});

test('table cells cannot be broken by pipes or newlines in page text', () => {
  const text = buildSummaryMarkdown(base);
  assert.match(text, /Order placed! \\\| pending/);
});

test('the backend count is shown with the noun, or unknown', () => {
  const text = buildSummaryMarkdown(base);
  assert.match(text, /\| 0 orders \|/);
  assert.match(text, /\| unknown \|/);
});

test('an agent claim adds a claim line with its verdict', () => {
  const text = buildSummaryMarkdown({ ...base, claim: 'handles API failures' });
  assert.match(text, /Agent claimed: "handles API failures"/);
  assert.match(text, /not supported/);
});

test('a comparison adds regressions, fixes and known failures', () => {
  const comparison = { regressions: ['slow'], known: ['reset'], fixed: ['empty'], unchanged: [], added: [] };
  const text = buildSummaryMarkdown({ ...base, comparison });
  assert.match(text, /### Compared with baseline/);
  assert.match(text, /Regressions: slow/);
  assert.match(text, /Fixed: empty/);
  assert.match(text, /Known failures: reset/);
});

test('without a claim or comparison those sections are absent', () => {
  const text = buildSummaryMarkdown(base);
  assert.doesNotMatch(text, /Agent claimed/);
  assert.doesNotMatch(text, /Compared with baseline/);
});
