import type { SpotifyTrack } from '../spotify/types.js';
import type { YouTubeVideo } from '../youtube/types.js';
import type { MatchConfidence } from './types.js';

export interface ScoredResult {
  video: YouTubeVideo;
  confidence: MatchConfidence;
  score: number;
  details: {
    titleSimilarity: number;
    durationDelta: number;
    artistMatch: boolean;
  };
}

export function scoreResult(track: SpotifyTrack, video: YouTubeVideo): ScoredResult {
  const titleSim = titleSimilarity(track, video);
  const durationDelta = Math.abs(track.durationMs - video.durationMs);
  const artistMatch = hasArtistMatch(track, video);

  // Weighted score: title match matters most, then artist, then duration
  let score = titleSim * 0.5;
  score += artistMatch ? 0.3 : 0;
  score += durationScore(durationDelta) * 0.2;

  const confidence = scoreToConfidence(score);

  return {
    video,
    confidence,
    score,
    details: {
      titleSimilarity: titleSim,
      durationDelta,
      artistMatch,
    },
  };
}

export function scoreResults(
  track: SpotifyTrack,
  videos: YouTubeVideo[],
): ScoredResult[] {
  return videos
    .map((video) => scoreResult(track, video))
    .sort((a, b) => b.score - a.score);
}

function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  if (score >= 0.4) return 'low';
  return 'none';
}

function durationScore(deltaMs: number): number {
  // Perfect: within 2 seconds. Bad: more than 30 seconds off.
  if (deltaMs < 2000) return 1;
  if (deltaMs < 5000) return 0.9;
  if (deltaMs < 10000) return 0.7;
  if (deltaMs < 30000) return 0.3;
  return 0;
}

function titleSimilarity(track: SpotifyTrack, video: YouTubeVideo): number {
  const trackTitle = normalize(track.name);
  const videoTitle = normalize(video.title);

  // Exact substring match
  if (videoTitle.includes(trackTitle)) return 1;
  if (trackTitle.includes(videoTitle)) return 0.9;

  // Token overlap (Jaccard similarity)
  const trackTokens = new Set(trackTitle.split(/\s+/));
  const videoTokens = new Set(videoTitle.split(/\s+/));

  const intersection = new Set([...trackTokens].filter((t) => videoTokens.has(t)));
  const union = new Set([...trackTokens, ...videoTokens]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function hasArtistMatch(track: SpotifyTrack, video: YouTubeVideo): boolean {
  const videoText = normalize(video.title + ' ' + video.channelTitle);
  return track.artists.some((artist) => videoText.includes(normalize(artist)));
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
