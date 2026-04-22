import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import * as logger from '../utils/logger.js';
import { getYTMusicHeaders, setYTMusicHeaders, restrictConfigPermissions } from '../utils/config.js';
import { YTM_ORIGIN, YTM_CLIENT_NAME, YTM_CLIENT_VERSION } from './constants.js';
import type { YTMusicHeaders } from './types.js';

const STALE_WARNING_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_HEADERS_FILE_BYTES = 1 * 1024 * 1024; // 1 MiB — cURL commands are a few KB at most

export async function authenticateYTMusic(headersFile?: string): Promise<YTMusicHeaders> {
  let input: string;

  if (headersFile) {
    input = readHeadersFile(headersFile);
  } else {
    console.log(`
YouTube Music Authentication
${'─'.repeat(30)}

This tool uses browser cookies to communicate with YouTube Music.
No Google API keys or OAuth app needed.

Steps:
  1. Open https://music.youtube.com in your browser (make sure you're logged in)
  2. Open DevTools (F12 or Cmd+Shift+I)
  3. Go to the Network tab
  4. Click on any request to music.youtube.com
  5. Right-click the request > Copy > Copy as cURL
`);

    const { pastedInput } = await inquirer.prompt([
      {
        type: 'editor',
        name: 'pastedInput',
        message: 'Paste the copied cURL command (an editor will open):',
      },
    ]);
    input = pastedInput;
  }

  const cookie = parseHeadersFromInput(input);
  const sapisid = extractSAPISID(cookie);

  const headers: YTMusicHeaders = {
    cookie,
    sapisid,
    storedAt: Date.now(),
  };

  logger.info('Verifying credentials...');
  await verifyHeaders(headers);

  setYTMusicHeaders(headers);
  restrictConfigPermissions();

  logger.warn('Cookies are stored in ~/.config/spyt/. Keep this directory private.');
  return headers;
}

function readHeadersFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error(`Headers file not found: ${resolved}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Headers file is not a regular file: ${resolved}`);
  }
  if (stat.size > MAX_HEADERS_FILE_BYTES) {
    throw new Error(
      `Headers file is too large (${stat.size} bytes, max ${MAX_HEADERS_FILE_BYTES}).`,
    );
  }
  // Use a bounded read so non-regular files reporting size 0 (/dev/zero, pipes) can't OOM us.
  const fd = fs.openSync(resolved, 'r');
  try {
    const buf = Buffer.alloc(MAX_HEADERS_FILE_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, MAX_HEADERS_FILE_BYTES, 0);
    return buf.subarray(0, bytesRead).toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

export function getValidYTMusicHeaders(): YTMusicHeaders {
  const headers = getYTMusicHeaders();
  if (!headers) {
    throw new Error('Not authenticated with YouTube Music. Run: spyt auth youtube');
  }

  const age = Date.now() - headers.storedAt;
  if (age > STALE_WARNING_MS) {
    logger.warn(
      'YouTube Music cookies are over 7 days old. If you get auth errors, re-run: spyt auth youtube',
    );
  }

  return headers;
}

export function generateSAPISIDHASH(sapisid: string, origin: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} ${origin}`;
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

export function parseHeadersFromInput(input: string): string {
  const trimmed = input.trim();

  // Try JSON format: { "cookie": "..." }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      const cookie = parsed.cookie ?? parsed.Cookie;
      if (cookie) return cookie;
    } catch {
      // not JSON, continue
    }
  }

  // Try cURL format: look for -H 'Cookie: ...' or --header 'Cookie: ...'
  // Separate patterns for single-quoted and double-quoted values
  const curlPatterns = [
    /-H\s+'cookie:\s*([^']+)'/gi,
    /-H\s+"cookie:\s*([^"]+)"/gi,
    /--header\s+'cookie:\s*([^']+)'/gi,
    /--header\s+"cookie:\s*([^"]+)"/gi,
  ];

  for (const pattern of curlPatterns) {
    const match = pattern.exec(trimmed);
    if (match) return match[1].trim();
  }

  // Try raw header format: Cookie: ...
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const headerMatch = /^cookie:\s*(.+)/i.exec(line.trim());
    if (headerMatch) return headerMatch[1].trim();
  }

  throw new Error(
    'Could not find a Cookie header in the pasted input.\n' +
      'Make sure you copied the full cURL command or headers from DevTools.',
  );
}

export function extractSAPISID(cookie: string): string {
  // The "SAPISIDHASH" authorization scheme is computed from the SAPISID cookie specifically.
  // __Secure-3PAPISID pairs with SAPISID3PHASH (a different scheme), so use it only as a fallback.
  const sapisidMatch = /(?:^|;\s*)SAPISID=([^;]+)/.exec(cookie);
  if (sapisidMatch) return sapisidMatch[1];

  const secure3Match = /(?:^|;\s*)__Secure-3PAPISID=([^;]+)/.exec(cookie);
  if (secure3Match) return secure3Match[1];

  throw new Error(
    'Could not find SAPISID in cookies. Make sure you are logged into YouTube Music ' +
      'and copied headers from a request to music.youtube.com.',
  );
}

async function verifyHeaders(headers: YTMusicHeaders): Promise<void> {
  const authHeader = generateSAPISIDHASH(headers.sapisid, YTM_ORIGIN);

  const response = await fetch(
    `${YTM_ORIGIN}/youtubei/v1/account/account_menu?prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Cookie': headers.cookie,
        'Authorization': authHeader,
        'Origin': YTM_ORIGIN,
        'Referer': `${YTM_ORIGIN}/`,
        'Content-Type': 'application/json',
        'X-Goog-AuthUser': '0',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: YTM_CLIENT_NAME,
            clientVersion: YTM_CLIENT_VERSION,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `YouTube Music authentication failed (HTTP ${response.status}). ` +
        'Make sure you are logged in and copied headers from music.youtube.com.',
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (data.error) {
    throw new Error('YouTube Music authentication failed. Cookies may be invalid.');
  }

  // Verify we actually got account data back
  if (!data.actions && !data.header) {
    throw new Error(
      'YouTube Music returned an empty response. Cookies may have expired or belong to a different domain.',
    );
  }
}
