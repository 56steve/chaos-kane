import { SCENARIOS } from '../chaos/proxy.js';
import { orderScenarios } from './target.js';

const CREDITS_PER_RUN = { low: 15, high: 30 };

/** A run costs between about 15 credits (a short flow) and 30 (a login plus a long form). */
export function estimateCredits(runs) {
  return { low: runs * CREDITS_PER_RUN.low, high: runs * CREDITS_PER_RUN.high };
}

/** What a run would do, worked out from the parsed config alone. Nothing is started. */
export function buildPlan(config) {
  const requested = config.faults ?? SCENARIOS.filter((name) => name !== 'double');
  const scenarios = config.autoTarget ? orderScenarios(requested) : requested;
  return {
    target: config.demo ? 'the bundled demo shop' : config.app,
    flow: config.flow ?? 'the demo checkout',
    scenarios,
    repeat: config.repeat,
    runs: scenarios.length * config.repeat,
    maxSteps: config.maxSteps,
    autoTarget: config.autoTarget,
    canLearn: config.autoTarget && scenarios.includes('none'),
    faultPaths: config.faultPaths,
    faultMethods: config.faultMethods,
    hasTruth: Boolean(config.truthUrl),
    noun: config.noun,
  };
}

export function formatPlan(plan) {
  const credits = estimateCredits(plan.runs);
  const lines = [
    'chaos-kane: Dry run',
    '',
    `  Target      ${plan.target}`,
    `  Flow        ${plan.flow}`,
    `  Scenarios   ${plan.scenarios.join(', ')}${plan.repeat > 1 ? `  (each ${plan.repeat} times)` : ''}`,
    `  Cost        ${plan.runs} Kane runs, about ${credits.low} to ${credits.high} credits`,
    `  Step limit  ${plan.maxSteps} steps per run`,
  ];
  if (plan.autoTarget && plan.canLearn) {
    lines.push('  Breaks      the last write of the flow, learned from the baseline run (the login and other setup requests are left alone)');
  } else if (plan.autoTarget) {
    lines.push(`  Breaks      every ${plan.faultMethods.join('/')} request under ${plan.faultPaths.join(', ')}; include none in --faults so the target can be learned instead`);
  } else {
    lines.push(`  Breaks      ${plan.faultMethods.join('/')} requests under ${plan.faultPaths.join(', ')}`);
  }
  if (!plan.hasTruth) {
    lines.push('', "  Note: no --truth-url, so the proxy's count of accepted writes is the backend evidence and duplicate detection is off.");
  }
  lines.push('', 'No browser was opened and no credits were used. Run the same command without --dry-run to start.');
  return `${lines.join('\n')}\n`;
}
