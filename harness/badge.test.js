import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeFor, renderBadge } from './badge.js';

const summary = (overrides) => ({ survived: 0, failed: 0, incomplete: 0, total: 0, baseline: 'survived', ...overrides });

test('a fully surviving run is green and says so', () => {
  const badge = badgeFor(summary({ survived: 7, total: 7 }));
  assert.equal(badge.message, '7 of 7 survived');
  assert.equal(badge.color, '#1a7f37');
});

test('any failure makes the badge red with the real score', () => {
  const badge = badgeFor(summary({ survived: 1, failed: 6, total: 7 }));
  assert.equal(badge.message, '1 of 7 survived');
  assert.equal(badge.color, '#cf222e');
});

test('a failed healthy baseline is red even if no fault failed', () => {
  assert.equal(badgeFor(summary({ survived: 3, total: 3, baseline: 'failed' })).color, '#cf222e');
});

test('unverified results are amber and never shown as a pass', () => {
  const badge = badgeFor(summary({ survived: 2, incomplete: 2, total: 4 }));
  assert.equal(badge.message, 'unable to verify');
  assert.equal(badge.color, '#9a6700');
});

test('a run with no injected failures cannot be a green badge', () => {
  assert.equal(badgeFor(summary({ total: 0 })).message, 'unable to verify');
});

test('failure outranks unverified', () => {
  assert.equal(badgeFor(summary({ survived: 1, failed: 1, incomplete: 2, total: 4 })).color, '#cf222e');
});

test('the svg carries the label, the message and an accessible name', () => {
  const svg = renderBadge({ label: 'chaos-kane', message: '7 of 7 survived', color: '#1a7f37' });
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\n?$/);
  assert.match(svg, />chaos-kane</);
  assert.match(svg, />7 of 7 survived</);
  assert.match(svg, /aria-label="chaos-kane: 7 of 7 survived"/);
  assert.match(svg, /fill="#1a7f37"/);
});

test('text is escaped so it cannot break the svg', () => {
  const svg = renderBadge({ label: 'a<b', message: '"x" & y', color: '#000' });
  assert.doesNotMatch(svg, /a<b/);
  assert.match(svg, /a&lt;b/);
  assert.match(svg, /&quot;x&quot; &amp; y/);
});

test('a longer message makes a wider badge', () => {
  const width = (message) => Number(renderBadge({ label: 'x', message, color: '#000' }).match(/width="(\d+)"/)[1]);
  assert.ok(width('unable to verify and more') > width('1 of 1'));
});
