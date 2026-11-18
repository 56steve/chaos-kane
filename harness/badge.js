const GREEN = '#1a7f37';
const RED = '#cf222e';
const AMBER = '#9a6700';
const CHAR_WIDTH = 6.6;
const PADDING = 10;

/** The text and colour for a run summary: green only when every failure survived. */
export function badgeFor(summary) {
  if (summary.failed > 0 || summary.baseline === 'failed') {
    return { message: `${summary.survived} of ${summary.total} survived`, color: RED };
  }
  if (summary.incomplete > 0 || summary.baseline === 'incomplete' || summary.total === 0) {
    return { message: 'unable to verify', color: AMBER };
  }
  return { message: `${summary.survived} of ${summary.total} survived`, color: GREEN };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sectionWidth(text) {
  return Math.round(text.length * CHAR_WIDTH) + PADDING * 2;
}

/** A flat two-part badge as a standalone SVG string. */
export function renderBadge({ label, message, color }) {
  const labelWidth = sectionWidth(label);
  const messageWidth = sectionWidth(message);
  const width = labelWidth + messageWidth;
  const name = escapeXml(`${label}: ${message}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${name}">
  <title>${name}</title>
  <clipPath id="round"><rect width="${width}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#round)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${escapeXml(color)}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>
`;
}
