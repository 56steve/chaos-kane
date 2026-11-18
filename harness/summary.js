import { describeClaim } from './claim.js';
import { outcomeLabel } from './labels.js';

function cell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function backendSaved(result, noun) {
  if (typeof result.orderCount !== 'number') {
    return 'unknown';
  }
  return `${result.orderCount} ${noun}${result.orderCount === 1 ? '' : 's'}`;
}

function listLine(label, scenarios) {
  return scenarios.length > 0 ? `- ${label}: ${scenarios.join(', ')}` : null;
}

/**
 * A short Markdown report for a CI job summary or a pull request comment:
 * the score, an optional agent claim, one row per scenario, and an optional
 * comparison with a baseline run.
 */
export function buildSummaryMarkdown({ results, summary, target, flow, noun = 'record', claim, comparison }) {
  const lines = [
    '## chaos-kane',
    '',
    `${summary.survived} of ${summary.total} injected failures survived. Target: ${target}`,
    `Flow: ${flow}`,
    '',
  ];

  if (claim) {
    lines.push(describeClaim(claim, summary), '');
  }

  lines.push('| Fault | Result | The user saw | Backend saved |', '| --- | --- | --- | --- |');
  for (const result of results) {
    lines.push(
      `| ${cell(result.scenario)} | ${outcomeLabel(result.outcome)} | ${cell(result.statusMessage ?? 'nothing recorded')} | ${backendSaved(result, noun)} |`,
    );
  }

  if (comparison) {
    lines.push(
      '',
      '### Compared with baseline',
      '',
      ...[
        listLine('Regressions', comparison.regressions),
        listLine('Fixed', comparison.fixed),
        listLine('Known failures', comparison.known),
        listLine('Unchanged', comparison.unchanged),
        listLine('New and passing', comparison.added),
      ].filter(Boolean),
    );
  }
  return `${lines.join('\n')}\n`;
}
