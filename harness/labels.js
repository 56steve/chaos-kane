const LABELS = { survived: 'survived', failed: 'failed', incomplete: 'unable to verify' };

/**
 * The words people see for an outcome. Internally a run that produced no usable
 * evidence is "incomplete"; to a reader it is "unable to verify", the same
 * three-way verdict (pass, fail, unable to verify) used by agent assurance tools.
 */
export function outcomeLabel(outcome) {
  return LABELS[outcome] ?? outcome;
}
