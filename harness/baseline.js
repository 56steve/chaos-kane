/**
 * Compares a run with a saved earlier run, scenario by scenario, so CI can fail
 * on new problems while tolerating ones that are already known.
 *
 * - regressions: survived before (or is new) and does not survive now
 * - known: did not survive before and still does not
 * - fixed: did not survive before and survives now
 * - unchanged / added: everything else
 */
export function compareToBaseline(previous, current) {
  const comparison = { regressions: [], known: [], fixed: [], unchanged: [], added: [] };

  for (const result of current) {
    const before = previous.find((candidate) => candidate.scenario === result.scenario);
    const nowBad = result.outcome !== 'survived';

    if (!before) {
      (nowBad ? comparison.regressions : comparison.added).push(result.scenario);
      continue;
    }
    const wasBad = before.outcome !== 'survived';
    if (!wasBad && nowBad) {
      comparison.regressions.push(result.scenario);
    } else if (wasBad && nowBad) {
      comparison.known.push(result.scenario);
    } else if (wasBad && !nowBad) {
      comparison.fixed.push(result.scenario);
    } else {
      comparison.unchanged.push(result.scenario);
    }
  }
  return comparison;
}
