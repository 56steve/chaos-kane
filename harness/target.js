const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{12,}$/i;
const DIGITS = /^\d+$/;

function looksLikeId(segment) {
  return DIGITS.test(segment) || UUID.test(segment) || LONG_HEX.test(segment);
}

/**
 * The part of a path before its first id-like segment (digits, a UUID or a long
 * hex string), so a request made with a different id on the next run still matches.
 */
export function dynamicPrefix(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const cut = segments.findIndex(looksLikeId);
  const kept = cut === -1 ? segments : segments.slice(0, cut);
  return `/${kept.join('/')}`;
}

/**
 * Learns what to break from a run where nothing was broken: the last write that
 * succeeded is the one the flow ends on (the order, the post, the booking), so
 * that is the target. Earlier writes such as a login are left alone. Returns
 * null when no write succeeded, because then there is nothing to learn from.
 */
export function learnFaultTarget(writeRequests) {
  const succeeded = writeRequests.filter((request) => request.status >= 200 && request.status < 300);
  const last = succeeded.at(-1);
  if (!last) {
    return null;
  }
  return { prefixes: [dynamicPrefix(last.path)], methods: [last.method] };
}

/** The baseline has to run first for its network log to be learned from; every other scenario keeps its order. */
export function orderScenarios(scenarios) {
  return scenarios.includes('none') ? ['none', ...scenarios.filter((name) => name !== 'none')] : [...scenarios];
}
