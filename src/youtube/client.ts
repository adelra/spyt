import { getValidYTMusicHeaders, generateSAPISIDHASH } from './auth.js';
import { parseSearchResponse, parsePlaylistCreateResponse, parsePlaylistEditResponse } from './parsers.js';
import { YTM_API_KEY, YTM_ORIGIN, YTM_CLIENT_NAME, YTM_CLIENT_VERSION } from './constants.js';
import { RateLimiter } from '../utils/rate-limit.js';
import * as logger from '../utils/logger.js';
import type { YouTubeVideo, YouTubePlaylist } from './types.js';

const YTM_BASE_URL = `${YTM_ORIGIN}/youtubei/v1`;

const YTM_CONTEXT = {
  client: {
    clientName: YTM_CLIENT_NAME,
    clientVersion: YTM_CLIENT_VERSION,
    hl: 'en',
    gl: 'US',
  },
};

const rateLimiter = new RateLimiter({ minIntervalMs: 300 });

async function ytmFetch(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const headers = getValidYTMusicHeaders();
  const authHeader = generateSAPISIDHASH(headers.sapisid, YTM_ORIGIN);

  let response: Response;
  try {
    response = await rateLimiter.execute(() =>
      fetch(`${YTM_BASE_URL}/${endpoint}?key=${YTM_API_KEY}&prettyPrint=false`, {
        method: 'POST',
        headers: {
          'Cookie': headers.cookie,
          'Authorization': authHeader,
          'Origin': YTM_ORIGIN,
          'Referer': `${YTM_ORIGIN}/`,
          'Content-Type': 'application/json',
          'X-Goog-AuthUser': '0',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          context: YTM_CONTEXT,
          ...body,
        }),
      }),
    );
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Network error connecting to YouTube Music: ${err.message}. Check your internet connection.`,
        { cause: err },
      );
    }
    throw err;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'YouTube Music cookies have expired or are invalid. Please re-authenticate: spyt auth youtube',
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube Music API error (${response.status}): ${text}`);
  }

  return response.json();
}

export async function searchVideos(
  query: string,
  maxResults = 5,
): Promise<YouTubeVideo[]> {
  logger.debug(`YTM search: "${query}"`);

  // params filter for "Songs" category in YTM
  const data = await ytmFetch('search', {
    query,
    params: 'EgWKAQIIAQ%3D%3D', // Songs filter
  });

  const results = parseSearchResponse(data);
  return results.slice(0, maxResults);
}

export async function searchByISRC(isrc: string): Promise<YouTubeVideo | null> {
  const results = await searchVideos(isrc, 3);
  return results[0] ?? null;
}

export async function createPlaylist(
  title: string,
  description?: string,
): Promise<YouTubePlaylist> {
  const data = await ytmFetch('playlist/create', {
    title,
    description: description ?? `Transferred from Spotify via spyt`,
    privacyStatus: 'PRIVATE',
    videoIds: [],
  });

  const id = parsePlaylistCreateResponse(data);
  return {
    id,
    title,
    url: `https://music.youtube.com/playlist?list=${id}`,
  };
}

export async function addVideoToPlaylist(
  playlistId: string,
  videoId: string,
): Promise<void> {
  const data = await ytmFetch('browse/edit_playlist', {
    playlistId,
    actions: [
      {
        action: 'ACTION_ADD_VIDEO',
        addedVideoId: videoId,
      },
    ],
  });

  const success = parsePlaylistEditResponse(data);
  if (!success) {
    throw new Error(`Failed to add video ${videoId} to playlist ${playlistId}`);
  }
}
