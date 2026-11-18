/**
 * Compares what an agent claimed ("handles API failures") with what Kane found.
 * Supported only when every injected failure survived and the healthy baseline
 * held; one failure refutes it; missing evidence leaves it unverifiable.
 */
export function claimVerdict(summary) {
  if (summary.failed > 0 || summary.baseline === 'failed') {
    return 'not supported';
  }
  if (summary.incomplete > 0 || summary.baseline === 'incomplete' || summary.total === 0) {
    return 'unable to verify';
  }
  return 'supported';
}

export function describeClaim(claim, summary) {
  return `Agent claimed: "${claim}". Kane found: ${summary.survived} of ${summary.total} injected failures survived. Claim ${claimVerdict(summary)}.`;
}
