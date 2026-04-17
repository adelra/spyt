import * as logger from '../utils/logger.js';
import type { SpotifyTrack, SpotifyPlaylist } from './types.js';

const EMBED_BASE = 'https://open.spotify.com/embed';
const SPCLIENT_BASE = 'https://spclient.wg.spotify.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// --- URL parsing ---

export function parseSpotifyUrl(url: string): { type: 'playlist'; id: string } | null {
  const urlMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return { type: 'playlist', id: urlMatch[1] };

  const uriMatch = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return { type: 'playlist', id: uriMatch[1] };

  return null;
}

// --- Anonymous token (from embed pages) ---

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAnonymousToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  // Any embed page includes an anonymous access token
  const res = await fetch(`${EMBED_BASE}/track/4cOdK2wGLETKBW3PvgPWqT`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Spotify embed page (HTTP ${res.status})`);
  }

  const html = await res.text();
  const match = html.match(/"accessToken":"([^"]+)"/);
  if (!match) {
    throw new Error('Could not extract Spotify access token from embed page');
  }

  cachedToken = {
    value: match[1],
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return cachedToken.value;
}

// --- Embed page helpers ---

function trackIdFromUri(uri: string): string {
  return uri.split(':').pop() ?? uri;
}

interface PlaylistEmbedData {
  name: string;
  subtitle: string;
  uri: string;
  id: string;
  trackList: Array<{
    uri: string;
    title: string;
    subtitle: string;
    duration: number;
    isPlayable: boolean;
  }>;
}

// Cache playlist embed to avoid double-fetch between getPlaylist and getPlaylistTracks
const playlistEmbedCache = new Map<
  string,
  { data: PlaylistEmbedData; token: string; fetchedAt: number }
>();

async function fetchPlaylistEmbed(
  playlistId: string,
): Promise<{ data: PlaylistEmbedData; token: string }> {
  const cached = playlistEmbedCache.get(playlistId);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return { data: cached.data, token: cached.token };
  }

  const res = await fetch(`${EMBED_BASE}/playlist/${playlistId}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Spotify playlist page (HTTP ${res.status})`);
  }

  const html = await res.text();

  const dataMatch = html.match(/<script[^>]*>({"props":[\s\S]*?)<\/script>/);
  if (!dataMatch) {
    throw new Error('Could not parse Spotify playlist page');
  }

  const json = JSON.parse(dataMatch[1]);
  const entity = json?.props?.pageProps?.state?.data?.entity;
  if (!entity?.trackList) {
    throw new Error('Unexpected Spotify embed page structure');
  }

  const tokenMatch = html.match(/"accessToken":"([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('Could not extract access token from embed page');
  }

  const token = tokenMatch[1];
  // Update global token cache too
  cachedToken = { value: token, expiresAt: Date.now() + 50 * 60 * 1000 };

  const result = { data: entity as PlaylistEmbedData, token };
  playlistEmbedCache.set(playlistId, { ...result, fetchedAt: Date.now() });
  return result;
}

// --- spclient: get all track URIs (no rate limits, no 100-track cap) ---

async function fetchAllTrackUris(playlistId: string, token: string): Promise<string[]> {
  const res = await fetch(
    `${SPCLIENT_BASE}/playlist/v2/playlist/${playlistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch playlist from Spotify (HTTP ${res.status})`);
  }

  const data = (await res.json()) as any;
  return (data.contents?.items ?? []).map(
    (item: { uri: string }) => item.uri,
  );
}

// --- Track embed: get details for individual tracks ---

async function fetchTrackDetails(trackId: string): Promise<SpotifyTrack | null> {
  const res = await fetch(`${EMBED_BASE}/track/${trackId}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return null;

  const html = await res.text();
  const match = html.match(/<script[^>]*>({"props":[\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const entity = JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
    if (!entity || !entity.isPlayable) return null;

    return {
      id: entity.id ?? trackId,
      name: entity.title ?? entity.name ?? '',
      artists: (entity.artists ?? []).map((a: { name: string }) => a.name),
      album: '', // not in track embeds
      durationMs: entity.duration ?? 0,
      isrc: null,
      uri: entity.uri ?? `spotify:track:${trackId}`,
    };
  } catch {
    return null;
  }
}

async function fetchTrackDetailsBatch(
  trackIds: string[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<SpotifyTrack[]> {
  const results: SpotifyTrack[] = [];
  let completed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < trackIds.length; i += concurrency) {
    const batch = trackIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((id) => fetchTrackDetails(id)),
    );

    for (const track of batchResults) {
      if (track) results.push(track);
    }

    completed += batch.length;
    onProgress?.(completed, trackIds.length);
  }

  return results;
}

// --- Public endpoints ---

export async function getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
  const { data, token } = await fetchPlaylistEmbed(playlistId);

  // Embed caps at 100 tracks. Use spclient to get the real total.
  let trackCount = data.trackList.length;
  if (trackCount >= 100) {
    try {
      const allUris = await fetchAllTrackUris(playlistId, token);
      trackCount = allUris.length;
    } catch {
      // Fall back to embed count
    }
  }

  return {
    id: data.id,
    name: data.name,
    description: '',
    trackCount,
    owner: data.subtitle ?? '',
    uri: data.uri,
    url: `https://open.spotify.com/playlist/${data.id}`,
  };
}

export async function getPlaylistTracks(
  playlistId: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<SpotifyTrack[]> {
  const { data, token } = await fetchPlaylistEmbed(playlistId);

  // Parse tracks from embed (up to 100)
  const embedTracks: SpotifyTrack[] = [];
  for (const item of data.trackList) {
    if (!item.isPlayable) continue;
    embedTracks.push({
      id: trackIdFromUri(item.uri),
      name: item.title,
      artists: [item.subtitle],
      album: '',
      durationMs: item.duration,
      isrc: null,
      uri: item.uri,
    });
  }

  // If embed returned < 100, that's all tracks
  if (data.trackList.length < 100) {
    onProgress?.(embedTracks.length, embedTracks.length);
    return embedTracks;
  }

  // Get all URIs from spclient to find tracks beyond the embed's 100
  const allUris = await fetchAllTrackUris(playlistId, token);
  const total = allUris.length;
  onProgress?.(embedTracks.length, total);

  const embedTrackIds = new Set(embedTracks.map((t) => t.id));
  const remainingIds = allUris
    .map(trackIdFromUri)
    .filter((id) => !embedTrackIds.has(id));

  if (remainingIds.length === 0) {
    return embedTracks;
  }

  // Fetch remaining track details from individual embed pages (5 concurrent)
  logger.debug(`Fetching details for ${remainingIds.length} additional tracks...`);
  const extraTracks = await fetchTrackDetailsBatch(remainingIds, 5, (done, batchTotal) => {
    onProgress?.(embedTracks.length + done, total);
  });

  return [...embedTracks, ...extraTracks];
}
