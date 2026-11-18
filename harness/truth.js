/**
 * Reads "how many records exist" out of a truth endpoint's JSON. Accepts a bare
 * number, an array, an object with a numeric `count`, or an object whose first
 * array property is the list. Anything else is an error: a guessed zero would
 * make a broken check look healthy.
 */
export function extractCount(json) {
  if (typeof json === 'number' && Number.isFinite(json)) {
    return json;
  }
  if (Array.isArray(json)) {
    return json.length;
  }
  if (json !== null && typeof json === 'object') {
    if (typeof json.count === 'number' && Number.isFinite(json.count)) {
      return json.count;
    }
    const list = Object.values(json).find((value) => Array.isArray(value));
    if (list) {
      return list.length;
    }
  }
  throw new Error('truth endpoint returned JSON with no countable array or count');
}

/** Fetches the truth endpoint and returns the current record count. */
export async function fetchCount(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`truth endpoint ${url} answered HTTP ${response.status}`);
  }
  return extractCount(await response.json());
}
