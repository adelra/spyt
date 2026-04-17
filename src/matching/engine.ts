import type { SpotifyTrack } from '../spotify/types.js';
import type { MatchResult } from './types.js';
import { findYouTubeMatch } from '../youtube/search.js';
import { scoreResult } from './scoring.js';
import * as logger from '../utils/logger.js';

export async function matchTrack(track: SpotifyTrack): Promise<MatchResult> {
  const searchResults = await findYouTubeMatch(track);

  if (searchResults.length === 0) {
    logger.debug(`No results for: ${track.artists[0]} - ${track.name}`);
    return {
      spotifyTrack: track,
      youtubeVideo: null,
      confidence: 'none',
      matchMethod: 'none',
    };
  }

  // Check ISRC results first (they get 'exact' confidence)
  const isrcResults = searchResults.filter((r) => r.method === 'isrc');
  if (isrcResults.length > 0) {
    const scored = scoreResult(track, isrcResults[0].video);
    // ISRC matches with reasonable duration match get 'exact' confidence
    if (scored.details.durationDelta < 10_000) {
      return {
        spotifyTrack: track,
        youtubeVideo: isrcResults[0].video,
        confidence: 'exact',
        matchMethod: 'isrc',
      };
    }
  }

  // Score all search results and pick the best
  const searchVideos = searchResults
    .filter((r) => r.method === 'search')
    .map((r) => r.video);

  if (searchVideos.length === 0) {
    return {
      spotifyTrack: track,
      youtubeVideo: null,
      confidence: 'none',
      matchMethod: 'none',
    };
  }

  const scored = searchVideos
    .map((video) => scoreResult(track, video))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (best.confidence === 'none') {
    logger.debug(`Low confidence match for: ${track.artists[0]} - ${track.name}`);
    return {
      spotifyTrack: track,
      youtubeVideo: null,
      confidence: 'none',
      matchMethod: 'none',
    };
  }

  return {
    spotifyTrack: track,
    youtubeVideo: best.video,
    confidence: best.confidence,
    matchMethod: 'search',
  };
}

export async function matchTracks(
  tracks: SpotifyTrack[],
  onProgress?: (completed: number, total: number) => void,
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const result = await matchTrack(tracks[i]);
    results.push(result);
    onProgress?.(i + 1, tracks.length);
  }

  return results;
}
