export function emptyState() {
  return { lastPassedHash: null, attempts: {} };
}

/** Code identical to the last verified pass does not need another Kane run. */
export function shouldVerify(hash, state) {
  return state.lastPassedHash !== hash;
}

/**
 * Counts one blocked stop for a session. After maxAttempts the gate stops
 * blocking so the agent can never be trapped in a loop.
 */
export function recordAttempt(state, sessionId, maxAttempts) {
  const attempt = (state.attempts[sessionId] ?? 0) + 1;
  return {
    state: { ...state, attempts: { ...state.attempts, [sessionId]: attempt } },
    attempt,
    exhausted: attempt > maxAttempts,
  };
}

export function recordPass(state, sessionId, hash) {
  const { [sessionId]: _cleared, ...remaining } = state.attempts;
  return { lastPassedHash: hash, attempts: remaining };
}

function describeEvidence(result) {
  if (result.outcome === 'incomplete') {
    return '  Kane returned no usable observation, so this is not counted as a pass.';
  }
  const status = /^\d{3}$/.test(String(result.requestStatus))
    ? `HTTP ${result.requestStatus}`
    : String(result.requestStatus ?? 'no recorded status');
  return `  The shopper saw: "${result.statusMessage ?? 'nothing recorded'}". Order request: ${status}. Orders saved: ${result.orderCount ?? 'unknown'}.`;
}

/**
 * The message fed back to the agent when the gate blocks a stop. It carries
 * Kane's evidence and the boundary: fix the app, never the checker.
 */
export function buildBlockMessage(failures, attempt, maxAttempts) {
  const lines = [
    `Kane gate blocked this stop (attempt ${attempt} of ${maxAttempts}). The checkout did not survive these injected failures:`,
    '',
  ];
  for (const result of failures) {
    lines.push(`- ${result.scenario}: ${result.outcome}. ${result.reasons[0] ?? ''}`.trimEnd());
    lines.push(describeEvidence(result));
  }
  lines.push(
    '',
    'Fix the app code in app/. Do not edit chaos/, harness/, hooks/ or the tests: they are the checker, and an honest fix is the only one that passes. Kane runs again when you stop.',
  );
  return lines.join('\n');
}
