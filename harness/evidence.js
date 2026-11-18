import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseStatusCode } from './verdict.js';

const execFileAsync = promisify(execFile);
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_BYTES = 64 * 1024 * 1024;

/** The screenshot of the last step: highest step number, compared as a number. */
export function pickFinalScreenshot(entryNames) {
  const candidates = entryNames
    .map((name) => ({ name, match: name.match(/\/steps\/(\d+)-\d+-\d+\/screenshot\.jpg$/) }))
    .filter((candidate) => candidate.match)
    .map((candidate) => ({ name: candidate.name, step: Number(candidate.match[1]) }))
    .sort((a, b) => b.step - a.step);
  return candidates[0]?.name ?? null;
}

export function pickHar(entryNames) {
  return entryNames.find((name) => name.endsWith('logs/0-network.har')) ?? null;
}

/**
 * Reads the write requests the browser really made from Kane's network log:
 * method, path (no query, no headers, no bodies) and status. Status 0 means the
 * request got no response. Anything unreadable gives an empty list.
 */
export function writeRequestsFromHar(harText, methods = WRITE_METHODS) {
  let entries;
  try {
    entries = JSON.parse(harText)?.log?.entries;
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((entry) => methods.includes(entry?.request?.method))
    .map((entry) => {
      let pathname = '';
      try {
        pathname = new URL(entry.request.url).pathname;
      } catch {
        pathname = String(entry.request.url ?? '');
      }
      return { method: entry.request.method, path: pathname, status: Number(entry.response?.status ?? 0) };
    });
}

/**
 * Compares the status Kane reported for the last write request with the one in
 * the browser's own network log. The log is machine recorded, so when it is
 * available it is the authoritative value; a mismatch means Kane's observation
 * cannot be trusted.
 */
export function crossCheck({ reportedStatus, requests, harAvailable }) {
  const kane = parseStatusCode(reportedStatus);
  if (!harAvailable) {
    return { source: 'kane', agreement: 'unavailable', status: reportedStatus ?? 'no response' };
  }
  const last = requests[requests.length - 1];
  const logged = last && last.status > 0 ? last.status : null;
  const agreed = logged === kane;
  return {
    source: 'network-log',
    agreement: agreed ? 'agreed' : 'disagreed',
    status: logged === null ? 'no response' : String(logged),
    kaneReported: reportedStatus === undefined ? undefined : String(reportedStatus),
  };
}

function escapeZipPattern(name) {
  return name.replace(/([[\]*?\\])/g, '\\$1');
}

async function newestPack(sessionDir) {
  const dir = path.join(sessionDir, 'evidence');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.evidence'));
  const dated = await Promise.all(files.map(async (file) => ({ file, time: (await stat(path.join(dir, file))).mtimeMs })));
  dated.sort((a, b) => b.time - a.time);
  return dated[0] ? path.join(dir, dated[0].file) : null;
}

/**
 * Reads the final screenshot and the network log out of a run's evidence pack
 * (a zip) straight to memory, never extracting to disk. Packs also hold account
 * details, so only these two items are ever read. Returns nulls when anything is
 * missing, including a machine without `unzip`.
 */
export async function readEvidencePack(sessionDir) {
  const empty = { screenshot: null, harText: null };
  if (typeof sessionDir !== 'string' || sessionDir === '') {
    return empty;
  }
  try {
    const pack = await newestPack(sessionDir);
    if (!pack) {
      return empty;
    }
    const { stdout } = await execFileAsync('unzip', ['-Z1', pack], { maxBuffer: MAX_BYTES });
    const entryNames = stdout.split('\n').filter(Boolean);
    const screenshotName = pickFinalScreenshot(entryNames);
    const harName = pickHar(entryNames);

    const read = async (name, encoding) => {
      const { stdout: content } = await execFileAsync('unzip', ['-p', pack, escapeZipPattern(name)], { maxBuffer: MAX_BYTES, encoding });
      return content;
    };
    return {
      screenshot: screenshotName ? await read(screenshotName, 'buffer') : null,
      harText: harName ? await read(harName, 'utf8') : null,
    };
  } catch {
    return empty;
  }
}
