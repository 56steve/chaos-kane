const SUCCESS_CLAIM = /order placed|order confirmed|order complete|thank you|success/i;
const FAILURE_NOTICE = /fail|error|couldn't|could not|unable|try again|something went wrong|problem|not (?:been )?(?:placed|completed|saved)/i;

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

function claimsSuccess(message) {
  return SUCCESS_CLAIM.test(message) && !FAILURE_NOTICE.test(message);
}

function showsFailureNotice(message) {
  return FAILURE_NOTICE.test(message) && !claimsSuccess(message);
}

/**
 * Decides whether the app survived one scenario. Kane only observes: the verdict
 * comes from what the shopper was told compared with what the backend actually did.
 *
 * Outcomes:
 * - survived: the shopper was told the truth
 * - failed: the shopper was misled or left without a clear answer
 * - incomplete: Kane returned no usable observation, which is never counted as a pass
 */
export function judge({ statusMessage, requestStatus, orderCreated }) {
  if (typeof statusMessage !== 'string') {
    return { outcome: 'incomplete', reasons: ['Kane returned no status message, so nothing can be judged'] };
  }

  const message = statusMessage.trim();
  const status = parseStatusCode(requestStatus);
  const statusNote = status === null ? 'order request got no HTTP status' : `order request returned HTTP ${status}`;

  if (orderCreated) {
    if (claimsSuccess(message)) {
      return { outcome: 'survived', reasons: ['order was saved and the shopper was told so'] };
    }
    return {
      outcome: 'failed',
      reasons: [`order was saved but the shopper saw "${message}" (${statusNote})`],
    };
  }

  if (claimsSuccess(message)) {
    return {
      outcome: 'failed',
      reasons: [`fake success: page says "${message}" but the backend has no order (${statusNote})`],
    };
  }

  if (showsFailureNotice(message)) {
    return { outcome: 'survived', reasons: [`no order saved and the shopper saw a clear error: "${message}"`] };
  }

  return {
    outcome: 'failed',
    reasons: [`no order saved and no clear error shown; page says "${message}" (${statusNote})`],
  };
}
