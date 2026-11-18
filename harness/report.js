function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function summarize(results) {
  const faults = results.filter((result) => result.scenario !== 'none');
  return {
    survived: faults.filter((result) => result.outcome === 'survived').length,
    failed: faults.filter((result) => result.outcome === 'failed').length,
    incomplete: faults.filter((result) => result.outcome === 'incomplete').length,
    total: faults.length,
    baseline: results.find((result) => result.scenario === 'none')?.outcome ?? 'not run',
    credits: results.reduce((sum, result) => sum + (result.credits ?? 0), 0),
  };
}

export function renderReport({ title, generatedAt, results }) {
  const summary = summarize(results);
  const rows = results
    .map(
      (result) => `
      <tr class="${escapeHtml(result.outcome)}">
        <td><code>${escapeHtml(result.scenario)}</code></td>
        <td><span class="badge ${escapeHtml(result.outcome)}">${escapeHtml(result.outcome)}</span></td>
        <td>${escapeHtml(result.statusMessage ?? 'no value')}</td>
        <td>${escapeHtml(result.requestStatus ?? 'no value')}</td>
        <td>${result.orderCreated ? 'order saved' : 'no order'}</td>
        <td>${escapeHtml(result.reasons.join('; '))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; --ok: #1a7f37; --bad: #cf222e; --warn: #9a6700; }
    body { font-family: system-ui, sans-serif; max-width: 70rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.4; }
    h1 { margin-bottom: 0.25rem; }
    .score { font-size: 2.5rem; font-weight: 700; margin: 1rem 0 0.25rem; }
    .muted { opacity: 0.7; }
    table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid rgba(128,128,128,0.35); vertical-align: top; }
    .badge { padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; color: #fff; }
    .badge.survived { background: var(--ok); }
    .badge.failed { background: var(--bad); }
    .badge.incomplete { background: var(--warn); }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Generated ${escapeHtml(generatedAt)}. Kane observes; the verdict comes from what the shopper saw compared with what the backend did.</p>
  <div class="score">${summary.survived} of ${summary.total} failures survived</div>
  <p class="muted">Healthy baseline: ${escapeHtml(summary.baseline)} &middot; failed: ${summary.failed} &middot; incomplete: ${summary.incomplete} &middot; Kane credits used: ${summary.credits.toFixed(1)}</p>
  <table>
    <thead><tr><th>Scenario</th><th>Verdict</th><th>Page said</th><th>Order request</th><th>Backend truth</th><th>Why</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}
