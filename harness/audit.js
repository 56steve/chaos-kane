import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { judge } from './verdict.js';

/**
 * Recomputes the verdicts of a saved report from the evidence stored in it: what
 * the user saw, the status of the write request, and what the backend really
 * held. No Kane, no credits, no network: anyone can check that the recorded
 * verdicts follow from the recorded evidence.
 *
 * An "incomplete" result depends on live checks (the fault fired, a write went
 * through the proxy, the network log agreed with Kane) that cannot be replayed
 * from a report, so those are skipped and shown with their reason.
 */

function patternFrom(source) {
  return typeof source === 'string' && source !== '' ? new RegExp(source, 'i') : undefined;
}

function auditResult(result, { noun, successPattern }) {
  const row = {
    scenario: result.scenario,
    saw: result.statusMessage ?? 'nothing recorded',
    request: /^\d{3}$/.test(String(result.requestStatus)) ? `HTTP ${result.requestStatus}` : String(result.requestStatus ?? 'no response'),
    saved: typeof result.orderCount === 'number' ? result.orderCount : result.orderCreated ? 'yes' : 'no',
    recorded: result.outcome,
  };
  if (result.outcome === 'incomplete') {
    return { ...row, status: 'skipped', recomputed: null, why: result.reasons?.[0] ?? 'needs the live checks' };
  }
  // A count that came from the proxy cannot show duplicates, so it is not used for them.
  const again = judge({
    statusMessage: result.statusMessage,
    requestStatus: result.requestStatus,
    orderCreated: result.orderCreated,
    orderCount: result.evidence === 'proxy' ? undefined : result.orderCount,
    noun,
    successPattern,
  });
  return {
    ...row,
    status: again.outcome === result.outcome ? 'reproduced' : 'differs',
    recomputed: again.outcome,
    recomputedWhy: again.reasons[0],
  };
}

/** A report is { results, judging? } or a bare list of results. */
export function auditReport(report, options = {}) {
  const results = Array.isArray(report) ? report : report?.results ?? [];
  const judging = Array.isArray(report) ? {} : report?.judging ?? {};
  const settings = {
    noun: options.noun ?? judging.noun ?? 'order',
    successPattern: patternFrom(options.claims ?? judging.claims),
  };
  const rows = results.map((result) => auditResult(result, settings));
  const count = (status) => rows.filter((row) => row.status === status).length;
  return { rows, summary: { total: rows.length, reproduced: count('reproduced'), differs: count('differs'), skipped: count('skipped') } };
}

/** 0 when everything audited reproduces, 1 when something differs, 2 when nothing could be audited. */
export function auditExitCode(summary) {
  if (summary.differs > 0) {
    return 1;
  }
  return summary.reproduced === 0 ? 2 : 0;
}

const LABEL = { reproduced: 'ok     ', differs: 'DIFFERS', skipped: 'skip   ' };

function clip(text, length) {
  const value = String(text);
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function formatAudit({ rows, summary }, source) {
  const lines = [`chaos-kane audit: ${source}`, 'Verdicts recomputed from the saved evidence only. No Kane, no credits, no network.', ''];
  for (const row of rows) {
    lines.push(`  ${LABEL[row.status]} ${row.scenario}`);
    if (row.status === 'skipped') {
      lines.push(`           needs the live checks: ${clip(row.why, 110)}`);
      continue;
    }
    lines.push(`           the user saw "${clip(row.saw, 70)}"`);
    lines.push(`           request: ${row.request}; backend saved: ${row.saved}`);
    lines.push(`           recorded ${row.recorded}, recomputed ${row.recomputed}: ${clip(row.recomputedWhy, 100)}`);
  }
  const { total, reproduced, differs, skipped } = summary;
  const audited = total - skipped;
  const parts = [`${reproduced} of ${audited} verdicts reproduced from the evidence`];
  if (differs > 0) {
    parts.push(`${differs} differs`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }
  lines.push('', `${parts.join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

/** Parses `chaos-kane audit <folder or latest.json> [--noun x] [--claims regex] [--json]`. */
export function parseAuditArgs(argv) {
  const options = { path: undefined, noun: undefined, claims: undefined, json: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    if (name !== '--noun' && name !== '--claims') {
      throw new Error(`unknown option ${name} for audit`);
    }
    const value = equals === -1 ? argv[(index += 1)] : token.slice(equals + 1);
    if (value === undefined || value === '') {
      throw new Error(`${name} needs a value`);
    }
    if (name === '--claims') {
      try {
        new RegExp(value, 'i');
      } catch {
        throw new Error(`--claims must be a valid regular expression, got "${value}"`);
      }
    }
    options[name.slice(2)] = value;
  }
  if (positional.length === 0) {
    throw new Error('give the report folder (or its latest.json) to audit');
  }
  if (positional.length > 1) {
    throw new Error('audit takes one report folder or file');
  }
  options.path = positional[0];
  return options;
}

/** Reads a report from a folder (its latest.json) or from a .json file. */
export async function loadReport(target) {
  const resolved = path.resolve(target);
  let file = resolved;
  try {
    if ((await stat(resolved)).isDirectory()) {
      file = path.join(resolved, 'latest.json');
    }
  } catch {
    throw new Error(`cannot find ${target}`);
  }
  try {
    return { report: JSON.parse(await readFile(file, 'utf8')), file };
  } catch {
    throw new Error(`cannot read a report from ${file}`);
  }
}
