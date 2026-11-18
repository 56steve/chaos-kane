/**
 * Reads `git status --porcelain` output and returns the touched paths.
 * For renames the new path is used.
 */
export function parsePorcelain(text) {
  return text
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => {
      const entry = line.slice(3);
      const arrow = entry.indexOf(' -> ');
      return arrow === -1 ? entry : entry.slice(arrow + 4);
    });
}

/**
 * Returns the changed files the repair agent is not allowed to touch.
 * Generated output (for example reports/) is ignored; everything else must be allowed exactly.
 */
export function outOfScope(files, { allowed, ignoredPrefixes }) {
  return files.filter(
    (file) => !allowed.includes(file) && !ignoredPrefixes.some((prefix) => file.startsWith(prefix)),
  );
}
