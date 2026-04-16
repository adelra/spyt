import { searchVideos, searchByISRC } from './client.js';
import type { SpotifyTrack } from '../spotify/types.js';
import type { YouTubeVideo } from './types.js';
import * as logger from '../utils/logger.js';

export interface SearchResult {
  video: YouTubeVideo;
  query: string;
  method: 'isrc' | 'search';
}

export async function findYouTubeMatch(
  track: SpotifyTrack,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 1. Try ISRC search first
  if (track.isrc) {
    logger.debug(`Searching YouTube by ISRC: ${track.isrc}`);
    const isrcResult = await searchByISRC(track.isrc);
    if (isrcResult) {
      results.push({
        video: isrcResult,
        query: track.isrc,
        method: 'isrc',
      });
    }
  }

  // 2. Search by "artist - track name"
  const query = `${track.artists[0]} - ${track.name}`;
  logger.debug(`Searching YouTube: "${query}"`);
  const searchResults = await searchVideos(query, 5);

  for (const video of searchResults) {
    results.push({
      video,
      query,
      method: 'search',
    });
  }

  return results;
}
