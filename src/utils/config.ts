import fs from 'node:fs';
import Conf from 'conf';
import type { YTMusicHeaders } from '../youtube/types.js';

interface ConfigSchema {
  ytmusicHeaders: YTMusicHeaders | null;
}

const config = new Conf<ConfigSchema>({
  projectName: 'spyt',
  defaults: {
    ytmusicHeaders: null,
  },
});

export function getYTMusicHeaders(): YTMusicHeaders | null {
  return config.get('ytmusicHeaders');
}

export function setYTMusicHeaders(headers: YTMusicHeaders): void {
  config.set('ytmusicHeaders', headers);
}

/** Restrict config file to owner-only read/write (0o600). */
export function restrictConfigPermissions(): void {
  try {
    fs.chmodSync(config.path, 0o600);
  } catch {
    // Non-fatal — may fail on Windows
  }
}

export function clearAll(): void {
  config.clear();
}

export { config };
