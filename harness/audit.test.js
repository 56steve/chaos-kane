import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditExitCode, auditReport, formatAudit, parseAuditArgs } from './audit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fake = (over = {}) => ({
  scenario: 'error500',
  outcome: 'failed',
  statusMessage: 'Order placed! Confirmation pending',
  requestStatus: 500,
  orderCreated: false,
  orderCount: 0,
  evidence: 'backend',
  reasons: ['fake success'],
  ...over,
});

test('a verdict that follows from the saved evidence is reproduced', () => {
  const { rows, summary } = auditReport({ results: [fake()] });
  assert.equal(rows[0].status, 'reproduced');
  assert.equal(rows[0].recomputed, 'failed');
  assert.deepEqual(summary, { total: 1, reproduced: 1, differs: 0, skipped: 0 });
});

test('a verdict that was tampered with is caught', () => {
  const { rows, summary } = auditReport({ results: [fake({ outcome: 'survived' })] });
  assert.equal(rows[0].status, 'differs');
  assert.equal(rows[0].recorded, 'survived');
  assert.equal(rows[0].recomputed, 'failed');
  assert.equal(summary.differs, 1);
});

test('an incomplete result depends on live checks, so it is skipped with its reason', () => {
  const { rows, summary } = auditReport({ results: [fake({ outcome: 'incomplete', reasons: ['the fault never fired'] })] });
  assert.equal(rows[0].status, 'skipped');
  assert.match(rows[0].why, /fault never fired/);
  assert.equal(summary.skipped, 1);
});

test('a backend count is used for duplicates, but a count from the proxy is not', () => {
  const duplicate = { scenario: 'ghost', outcome: 'failed', statusMessage: 'Order placed!', requestStatus: 201, orderCreated: true, orderCount: 2 };
  assert.equal(auditReport({ results: [{ ...duplicate, evidence: 'backend' }] }).rows[0].status, 'reproduced');
  assert.equal(auditReport({ results: [{ ...duplicate, evidence: undefined }] }).rows[0].status, 'reproduced');
  const viaProxy = auditReport({ results: [{ ...duplicate, evidence: 'proxy', outcome: 'survived' }] }).rows[0];
  assert.equal(viaProxy.recomputed, 'survived');
});

test('the noun and claims pattern come from the report, and options override them', () => {
  const landing = fake({ scenario: 'none', outcome: 'survived', statusMessage: 'Taken to /#/article/x', requestStatus: 201, orderCreated: true, orderCount: 1 });
  assert.equal(auditReport({ results: [landing], judging: { noun: 'article', claims: '/article/' } }).rows[0].status, 'reproduced');
  assert.equal(auditReport({ results: [landing] }).rows[0].status, 'differs');
  assert.equal(auditReport({ results: [landing] }, { claims: '/article/', noun: 'article' }).rows[0].status, 'reproduced');
  assert.match(auditReport({ results: [fake()] }, { noun: 'booking' }).rows[0].recomputedWhy, /booking|order|saw|fake/i);
});

test('a report can be a bare list of results', () => {
  assert.equal(auditReport([fake()]).rows.length, 1);
});

test('the exit code is 0 when everything reproduces, 1 when something differs, 2 when there is nothing to audit', () => {
  assert.equal(auditExitCode(auditReport({ results: [fake()] }).summary), 0);
  assert.equal(auditExitCode(auditReport({ results: [fake({ outcome: 'survived' })] }).summary), 1);
  assert.equal(auditExitCode(auditReport({ results: [] }).summary), 2);
  assert.equal(auditExitCode(auditReport({ results: [fake({ outcome: 'incomplete' })] }).summary), 2);
});

test('the printed audit shows the three facts, both verdicts and the conclusion, and says nothing was run', () => {
  const text = formatAudit(auditReport({ results: [fake(), fake({ scenario: 'none', outcome: 'incomplete', reasons: ['no message'] })] }), 'reports/x/latest.json');
  assert.match(text, /reports\/x\/latest\.json/);
  assert.match(text, /No Kane, no credits, no network/);
  assert.match(text, /error500/);
  assert.match(text, /Order placed! Confirmation pending/);
  assert.match(text, /HTTP 500/);
  assert.match(text, /1 of 1 verdict.*reproduced/i);
  assert.match(text, /1 skipped/);
});

test('a mismatch is called out as a difference, not a pass', () => {
  const text = formatAudit(auditReport({ results: [fake({ outcome: 'survived' })] }), 'x');
  assert.match(text, /DIFFERS/);
  assert.match(text, /1 differs/i);
});

test('audit arguments need one path and reject anything unknown or invalid', () => {
  assert.deepEqual(parseAuditArgs(['reports/a']), { path: 'reports/a', noun: undefined, claims: undefined, json: false });
  const parsed = parseAuditArgs(['reports/a', '--noun', 'article', '--claims=/article/', '--json']);
  assert.equal(parsed.noun, 'article');
  assert.equal(parsed.claims, '/article/');
  assert.equal(parsed.json, true);
  assert.throws(() => parseAuditArgs([]), /report folder/i);
  assert.throws(() => parseAuditArgs(['a', 'b']), /one/i);
  assert.throws(() => parseAuditArgs(['a', '--bogus']), /unknown/i);
  assert.throws(() => parseAuditArgs(['a', '--claims', '(']), /--claims/);
});

test('every committed report reproduces from its own evidence', () => {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', 'reports'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file.endsWith('latest.json'));
  } catch {
    return;
  }
  assert.ok(tracked.length >= 10, `expected committed reports, found ${tracked.length}`);
  let checked = 0;
  for (const file of tracked) {
    const { rows } = auditReport(JSON.parse(readFileSync(path.join(root, file), 'utf8')));
    for (const row of rows) {
      assert.notEqual(row.status, 'differs', `${file} ${row.scenario}: recorded ${row.recorded}, recomputed ${row.recomputed}`);
      checked += row.status === 'reproduced' ? 1 : 0;
    }
  }
  assert.ok(checked >= 50, `expected many reproduced verdicts, got ${checked}`);
});
