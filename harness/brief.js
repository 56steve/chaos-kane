function describeRequest(status) {
  return /^\d{3}$/.test(String(status)) ? `HTTP ${status}` : String(status ?? 'no recorded status');
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describeFailure(result, noun) {
  const saved = typeof result.orderCount === 'number' ? plural(result.orderCount, noun) : 'an unknown number of records';
  return [
    `### ${result.scenario}`,
    `- Verdict: ${result.outcome}. ${result.reasons[0] ?? ''}`.trimEnd(),
    `- The user saw: "${result.statusMessage ?? 'nothing recorded'}"`,
    `- The write request: ${describeRequest(result.requestStatus)}`,
    `- The backend actually saved: ${saved}`,
  ].join('\n');
}

/**
 * Builds an agent-agnostic fix brief in Markdown. Any coding agent can read it:
 * it carries Kane's evidence, what a correct fix looks like, and what must not
 * be touched.
 */
export function buildFixBrief({ results, target, flow, noun = 'record' }) {
  const faults = results.filter((result) => result.scenario !== 'none');
  const survived = faults.filter((result) => result.outcome === 'survived').length;
  const failed = results.filter((result) => result.outcome === 'failed');
  const incomplete = results.filter((result) => result.outcome === 'incomplete');

  const lines = [
    '# chaos-kane fix brief',
    '',
    `Target: ${target}`,
    `User flow: ${flow}`,
    '',
    `Result: ${survived} of ${faults.length} injected failures survived.`,
    '',
  ];

  if (failed.length === 0 && incomplete.length === 0) {
    lines.push('All scenarios survived, so there is nothing to fix.');
    return `${lines.join('\n')}\n`;
  }

  if (failed.length > 0) {
    lines.push(
      'Kane drove the flow in a real browser while a proxy broke the API. A separate check compared what the user was told with what the backend really stored. These scenarios failed:',
      '',
      failed.map((result) => describeFailure(result, noun)).join('\n\n'),
      '',
      '## What a correct fix looks like',
      '',
      `- Show a success message only when the write request returned a 2xx status and a valid body that confirms the ${noun}.`,
      '- In every other case (HTTP error, invalid or empty body, dropped connection, no answer) show a clear error and never claim success.',
      '- Give up on a request that gets no answer after a few seconds and show the error.',
      `- A retry after a lost response must not create a second ${noun}: send an idempotency key that stays the same for a retry of the same action, and have the server return the existing ${noun} for a repeated key.`,
      '',
    );
  }

  if (incomplete.length > 0) {
    lines.push(
      '## Not verified',
      '',
      'These scenarios produced no usable result, so nothing can be said about them. They are not passes.',
      '',
      ...incomplete.map((result) => `- ${result.scenario}: ${result.reasons[0] ?? 'no usable observation'}`),
      '',
    );
  }

  lines.push(
    '## Rules',
    '',
    '- Fix the application code. Do not edit chaos-kane, its proxy, its checks or any test that verifies the behaviour: they are the checker, and an honest fix is the only one that passes.',
    '- Do not hide failures. The check compares what the user sees with the real backend state.',
    '- Run chaos-kane again after the change to confirm.',
  );
  return `${lines.join('\n')}\n`;
}
