const SCENARIO_MEANING = {
  none: 'the API works normally',
  error500: 'the order API answers HTTP 500',
  slow: 'the order API answers correctly but takes about 6 seconds',
  timeout: 'the order API never answers',
  garbage: 'the order API answers HTTP 200 with an HTML page instead of JSON',
  empty: 'the order API answers HTTP 200 with an empty body',
  reset: 'the connection to the order API is dropped',
  ghost: 'the first order is saved by the backend but its response is lost, so the shopper sees a failure and retries',
};

function describeFailure(failure) {
  const backend = failure.orderCreated ? 'the backend saved an order' : 'the backend saved NO order';
  const status = /^\d{3}$/.test(String(failure.requestStatus))
    ? `the order request returned HTTP ${failure.requestStatus}`
    : `the order request had ${failure.requestStatus ?? 'no recorded status'}`;
  return [
    `- Scenario "${failure.scenario}" (${SCENARIO_MEANING[failure.scenario] ?? 'unknown fault'}):`,
    `  the shopper saw: "${failure.statusMessage ?? 'nothing recorded'}"; ${status}; ${backend}.`,
    `  Verdict: ${failure.reasons.join('; ')}`,
  ].join('\n');
}

/**
 * Builds the instruction for the repair agent from Kane's evidence. The agent may
 * only change the checkout client; the test, proxy, server and harness are off limits.
 */
export function buildRepairPrompt({ failures, attempt, previousDiff }) {
  const sections = [
    `You are fixing the checkout page client of a small shop. This is repair attempt ${attempt}.`,
    '',
    'An independent browser test (Kane CLI) filled in the checkout form, clicked "Place order" and recorded what the shopper saw and what the order request returned. A separate check compared that with what the backend actually stored. These scenarios failed:',
    '',
    failures.map(describeFailure).join('\n'),
    '',
    'Requirements:',
    '- Show a success message only when the order request returned a 2xx status and a JSON body containing an order id. Show that id in the message.',
    '- In every other case (HTTP error, invalid or empty body, dropped connection, no answer) show a clear error to the shopper, such as "We couldn\'t place your order. Please try again.", and never claim the order was placed.',
    '- If the order API gives no answer, give up after 8 seconds and show the error. The API can legitimately take about 6 seconds to answer, and that case must still end in success.',
    '- Keep the form working so the shopper can try again after an error.',
    '',
    'Rules:',
    '- You may only edit app/client.js. Do not change the test, the proxy, the server, the HTML or anything else.',
    '- Do not hide failures or fake results. The test checks what the shopper sees against the real backend, so an honest fix is the only one that passes.',
    '- Keep the code small, readable and free of placeholder comments.',
  ];

  if (previousDiff.trim().length > 0) {
    sections.push(
      '',
      `The previous attempt changed app/client.js like this, and the scenarios above still failed. Do not repeat it:`,
      '```diff',
      previousDiff.trim(),
      '```',
    );
  }

  sections.push('', 'Read app/client.js, edit it, and reply with one short sentence describing the change.');
  return sections.join('\n');
}
