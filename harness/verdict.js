const DEFAULT_SUCCESS_CLAIM = /placed|confirmed|complete|created|saved|submitted|thank you|success|done/i;
const FAILURE_NOTICE =
  /fail|error|couldn't|could not|unable|unavailable|invalid|denied|try again|something went wrong|problem|not (?:been )?(?:placed|completed|saved|created)/i;

/**
 * Reads an HTTP status value that Kane extracted. Returns null when the value
 * is missing or not a number (for example "no response").
 */
export function parseStatusCode(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && /^\d{3}$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return null;
}

function claimsSuccess(message, successPattern) {
  return successPattern.test(message) && !FAILURE_NOTICE.test(message);
}

function showsFailureNotice(message, successPattern) {
  return FAILURE_NOTICE.test(message) && !claimsSuccess(message, successPattern);
}

/**
 * Decides whether the app survived one scenario. Kane only observes: the verdict
 * comes from what the user was told compared with what the backend actually did.
 *
 * Outcomes:
 * - survived: the user was told the truth
 * - failed: the user was misled or left without a clear answer
 * - incomplete: Kane returned no usable observation, which is never counted as a pass
 *
 * `noun` names the thing being created ("order", "booking", "record") in the reasons.
 */
export function judge({
  statusMessage,
  requestStatus,
  orderCreated,
  orderCount,
  noun = 'order',
  successPattern = DEFAULT_SUCCESS_CLAIM,
}) {
  if (typeof statusMessage !== 'string') {
    return { outcome: 'incomplete', reasons: ['Kane returned no status message, so nothing can be judged'] };
  }

  const message = statusMessage.trim();
  const count = typeof orderCount === 'number' ? orderCount : Number(orderCreated);
  if (count > 1) {
    return {
      outcome: 'failed',
      reasons: [`duplicate ${noun}: one flow produced ${count} ${noun}s after a retry (page says "${message}")`],
    };
  }

  const status = parseStatusCode(requestStatus);
  const statusNote = status === null ? 'request got no HTTP status' : `request returned HTTP ${status}`;
  const claimed = claimsSuccess(message, successPattern);

  if (orderCreated) {
    if (claimed) {
      return { outcome: 'survived', reasons: [`${noun} was saved and the user was told so`] };
    }
    return {
      outcome: 'failed',
      reasons: [`${noun} was saved but the user saw "${message}" (${statusNote})`],
    };
  }

  if (claimed) {
    return {
      outcome: 'failed',
      reasons: [`fake success: page says "${message}" but the backend has no ${noun} (${statusNote})`],
    };
  }

  if (showsFailureNotice(message, successPattern)) {
    return { outcome: 'survived', reasons: [`no ${noun} saved and the user saw a clear error: "${message}"`] };
  }

  return {
    outcome: 'failed',
    reasons: [`no ${noun} saved and no clear error shown; page says "${message}" (${statusNote})`],
  };
}
