import type { SpotifyTrack } from '../spotify/types.js';
import type { YouTubeVideo } from '../youtube/types.js';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

export type MatchMethod = 'isrc' | 'search' | 'none';

export interface MatchResult {
  spotifyTrack: SpotifyTrack;
  youtubeVideo: YouTubeVideo | null;
  confidence: MatchConfidence;
  matchMethod: MatchMethod;
}
