const SEVERITY = { survived: 0, incomplete: 1, failed: 2 };

/**
 * Combines repeated runs of one scenario into a single result. The majority
 * outcome wins; a tie resolves to the worst outcome so instability can never
 * be reported as a pass.
 */
export function aggregateRuns(runs) {
  if (runs.length === 0) {
    throw new Error('no runs to aggregate');
  }

  const counts = new Map();
  for (const run of runs) {
    counts.set(run.outcome, (counts.get(run.outcome) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  const [outcome] = [...counts]
    .filter(([, count]) => count === top)
    .map(([name]) => name)
    .sort((a, b) => SEVERITY[b] - SEVERITY[a]);

  const representative = runs.find((run) => run.outcome === outcome);
  return {
    ...representative,
    agreement: `${top}/${runs.length}`,
    stable: top === runs.length,
    runOutcomes: runs.map((run) => run.outcome),
    credits: runs.reduce((sum, run) => sum + (run.credits ?? 0), 0),
  };
}
