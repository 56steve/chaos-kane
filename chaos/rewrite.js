/**
 * Keeps the browser inside the proxy. Many sites write their own full address
 * into pages, scripts, redirects and cookies. If that reached the browser as is,
 * the first click would leave the proxy and the faults would never fire. These
 * helpers point the site's own address back at the proxy, and change nothing else.
 */

const HOST_END = '(?![A-Za-z0-9-])(?!\\.[A-Za-z0-9])';
const TEXT_TYPE = /^(text\/(html|css|plain|javascript|xml)|application\/(json|javascript|x-javascript|xml|[\w.+-]*\+json|[\w.+-]*\+xml))/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function siteOrigin(target) {
  return `${target.protocol}//${target.host}`;
}

/** Points every mention of the site's own address (plain, JSON-escaped or protocol-relative) at the proxy. */
export function rewriteText(text, target, proxyOrigin) {
  const host = escapeRegExp(target.host);
  const proxyHost = proxyOrigin.replace(/^https?:/, '');
  return text
    .replace(new RegExp(`https?://${host}${HOST_END}`, 'g'), proxyOrigin)
    .replace(new RegExp(`https?:\\\\/\\\\/${host}${HOST_END}`, 'g'), proxyOrigin.replace(/\//g, '\\/'))
    .replace(new RegExp(`//${host}${HOST_END}`, 'g'), proxyHost);
}

/** Only text-like content is rewritten: never images, archives or event streams. */
export function isRewritable(contentType) {
  return typeof contentType === 'string' && TEXT_TYPE.test(contentType);
}

/** A redirect back to the site stays on the proxy; a redirect to another site is left alone. */
export function rewriteLocation(value, target, proxyOrigin) {
  return typeof value === 'string' ? rewriteText(value, target, proxyOrigin) : value;
}

/**
 * Cookies set for the site's real domain would be refused on the proxy's address,
 * so Domain and Secure are dropped, and SameSite=None (which needs Secure) becomes Lax.
 */
export function rewriteSetCookie(values) {
  if (!Array.isArray(values)) {
    return values;
  }
  return values.map((cookie) =>
    cookie
      .split(';')
      .map((part) => part.trim())
      .filter((part) => !/^domain=/i.test(part) && !/^secure$/i.test(part))
      .map((part) => (/^samesite=none$/i.test(part) ? 'SameSite=Lax' : part))
      .join('; '),
  );
}

/** Headers for the request to the real site: its own host and origin, and an uncompressed answer so it can be rewritten. */
export function upstreamRequestHeaders(headers, target, proxyOrigin) {
  const origin = siteOrigin(target);
  const result = { ...headers, host: target.host, 'accept-encoding': 'identity' };
  if (typeof headers.origin === 'string' && headers.origin === proxyOrigin) {
    result.origin = origin;
  }
  if (typeof headers.referer === 'string' && headers.referer.startsWith(proxyOrigin)) {
    result.referer = `${origin}${headers.referer.slice(proxyOrigin.length)}`;
  }
  return result;
}
