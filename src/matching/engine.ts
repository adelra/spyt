import type { SpotifyTrack } from '../spotify/types.js';
import type { YouTubeVideo } from '../youtube/types.js';
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

  // Check ISRC results first (they can earn 'exact' confidence).
  // We require a title-similarity floor to guard against karaoke / covers / re-recordings
  // that can share an ISRC with the original recording.
  const ISRC_TITLE_SIMILARITY_FLOOR = 0.5;
  const isrcResults = searchResults.filter((r) => r.method === 'isrc');
  if (isrcResults.length > 0) {
    const scored = scoreResult(track, isrcResults[0].video);
    if (
      scored.details.durationDelta < 10_000 &&
      scored.details.titleSimilarity >= ISRC_TITLE_SIMILARITY_FLOOR
    ) {
      return {
        spotifyTrack: track,
        youtubeVideo: isrcResults[0].video,
        confidence: 'exact',
        matchMethod: 'isrc',
      };
    }
    logger.debug(
      `ISRC candidate rejected for "${track.name}" (titleSim=${scored.details.titleSimilarity.toFixed(2)}, durationDelta=${scored.details.durationDelta}ms); falling back to search.`,
    );
  }

  // Score all search results (plus any ISRC candidates that didn't clear the floor) and pick the best.
  const byId = new Map<string, YouTubeVideo>();
  for (const r of searchResults) {
    byId.set(r.video.id, r.video);
  }
  const searchVideos = [...byId.values()];

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
