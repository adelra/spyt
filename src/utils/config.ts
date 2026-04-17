import fs from 'node:fs';
import Conf from 'conf';
import type { SpotifyTokens } from '../spotify/types.js';
import type { YTMusicHeaders } from '../youtube/types.js';

interface ConfigSchema {
  spotifyTokens: SpotifyTokens | null;
  spotifyClientId: string | null;
  ytmusicHeaders: YTMusicHeaders | null;
}

const config = new Conf<ConfigSchema>({
  projectName: 'spyt',
  defaults: {
    spotifyTokens: null,
    spotifyClientId: null,
    ytmusicHeaders: null,
  },
});

export function getSpotifyTokens(): SpotifyTokens | null {
  return config.get('spotifyTokens');
}

export function setSpotifyTokens(tokens: SpotifyTokens): void {
  config.set('spotifyTokens', tokens);
}

export function getSpotifyClientId(): string | null {
  return config.get('spotifyClientId');
}

export function setSpotifyClientId(id: string): void {
  config.set('spotifyClientId', id);
}

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
