/**
 * A fault scenario only means something if the fault really hit a request.
 * When the proxy never saw a matching request (for example because the app's
 * API lives on another origin), the run tested nothing, so the verdict is
 * downgraded to incomplete instead of being reported as a pass.
 */
/**
 * Without a truth endpoint the only backend evidence is what the proxy saw. If
 * no write request ever went through it (for example the API is on another
 * origin), "the backend has no order" means nothing, so the verdict becomes
 * unable to verify instead of a false accusation.
 */
export function applyEvidenceCheck(verdict, { hasTruth, writesSeen }) {
  if (hasTruth || writesSeen > 0 || verdict.outcome === 'incomplete') {
    return verdict;
  }
  return {
    outcome: 'incomplete',
    reasons: [
      "no write request went through the proxy, so there is no backend evidence. If the app's API is on another origin, the proxy cannot see it; pass --truth-url to read the backend directly",
    ],
  };
}

export function applyFaultCheck(verdict, scenario, faultsFired, rules) {
  if (scenario === 'none' || faultsFired > 0) {
    return verdict;
  }
  return {
    outcome: 'incomplete',
    reasons: [
      `the ${scenario} fault never fired: no ${rules.methods.join('/')} request under ${rules.prefixes.join(', ')} reached the proxy. If the app's API is on another origin, the proxy cannot see it`,
    ],
  };
}
