/**
 * A fault scenario only means something if the fault really hit a request.
 * When the proxy never saw a matching request (for example because the app's
 * API lives on another origin), the run tested nothing, so the verdict is
 * downgraded to incomplete instead of being reported as a pass.
 */
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
