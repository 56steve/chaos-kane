/**
 * Some apps signal success by moving to a new page instead of showing a message
 * (a published article, an order page). When the page showed no message and the
 * flow ended on a page that the success pattern matches, that page is the
 * success signal. Only the path and hash are used, never the host or the query
 * string. A message the page really showed is never replaced.
 */
export function messageOrLanding({ statusMessage, finalUrl, successPattern }) {
  if (typeof statusMessage !== 'string') {
    return statusMessage;
  }
  const said = statusMessage.trim();
  if ((said !== '' && said.toLowerCase() !== 'none') || !successPattern || typeof finalUrl !== 'string') {
    return statusMessage;
  }
  let where;
  try {
    const url = new URL(finalUrl);
    where = `${url.pathname}${url.hash}`;
  } catch {
    return statusMessage;
  }
  return successPattern.test(where) ? `Taken to ${where}` : statusMessage;
}
