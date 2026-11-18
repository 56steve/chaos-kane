/**
 * Labels the events of one recorded run ("before", "after") so the dashboard can
 * pair the same scenario across two runs, and points screenshots at a folder per
 * label so the two runs never overwrite each other's files. Returns new events.
 */
export function labelEvents(events, label) {
  return events.map((event) => {
    const labelled = { ...event };
    if (event.type === 'run_start' || event.type === 'scenario_result') {
      labelled.label = label;
    }
    if (typeof event.screenshot === 'string') {
      labelled.screenshot = event.screenshot.replace(/^evidence\//, `evidence/${label}/`);
    }
    return labelled;
  });
}

/** "app/client.js@abc123" names a file and the git revision to compare it against. */
export function parsePatchSpec(spec) {
  const at = spec.lastIndexOf('@');
  return at === -1 ? { file: spec, rev: null } : { file: spec.slice(0, at), rev: spec.slice(at + 1) };
}

/** The hunk lines of a unified diff, without the git header. */
export function diffBody(diff) {
  const lines = diff.split('\n');
  const first = lines.findIndex((line) => line.startsWith('@@'));
  if (first === -1) {
    return [];
  }
  return lines.slice(first).filter((line, index, all) => !(index === all.length - 1 && line === ''));
}

/** The replay event that shows the fix between a before run and an after run. */
export function buildFixEvent({ file, diff, at }) {
  return { type: 'fix', file, lines: diffBody(diff), at };
}
