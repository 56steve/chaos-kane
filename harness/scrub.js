const HOME_PATH = /\/Users\/[^/\s"\\]+\//g;
const SYSTEM_TEMP = /\/(?:private\/)?var\/folders\/[^\s"\\]+/g;
const SHARE_LINK = /https:\/\/test-manager\.lambdatest\.com\/[^\s"\\]*/g;

/**
 * Removes what should not be published from saved Kane output: the local user
 * name inside home paths, system temp paths, and Test Manager share links
 * (which carry a project id and a share token). Replacements never contain
 * quotes, so JSON lines stay valid, and scrubbing twice changes nothing more.
 */
export function scrubText(text) {
  return text
    .replace(SHARE_LINK, '<link removed>')
    .replace(SYSTEM_TEMP, '<tmp>')
    .replace(HOME_PATH, '~/');
}
