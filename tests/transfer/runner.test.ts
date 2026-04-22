import { describe, it, expect } from 'vitest';
import { dedupeByVideoId } from '../../src/transfer/runner.js';
import type { MatchResult } from '../../src/matching/types.js';

function makeResult(spotifyId: string, youtubeId: string | null): MatchResult {
  return {
    spotifyTrack: {
      id: spotifyId,
      name: `track ${spotifyId}`,
      artists: ['artist'],
      album: '',
      durationMs: 180_000,
      isrc: null,
      uri: `spotify:track:${spotifyId}`,
    },
    youtubeVideo: youtubeId
      ? {
          id: youtubeId,
          title: `yt ${youtubeId}`,
          url: `https://music.youtube.com/watch?v=${youtubeId}`,
          channelTitle: 'artist',
          durationMs: 180_000,
        }
      : null,
    confidence: youtubeId ? 'high' : 'none',
    matchMethod: youtubeId ? 'search' : 'none',
  };
}

describe('dedupeByVideoId', () => {
  it('returns all unique results unchanged', () => {
    const results = [makeResult('s1', 'y1'), makeResult('s2', 'y2'), makeResult('s3', 'y3')];
    const { unique, duplicateCount } = dedupeByVideoId(results);
    expect(unique).toHaveLength(3);
    expect(duplicateCount).toBe(0);
  });

  it('keeps first occurrence when a YouTube id repeats', () => {
    const results = [
      makeResult('s1', 'y1'),
      makeResult('s2', 'y1'), // dupe
      makeResult('s3', 'y2'),
      makeResult('s4', 'y1'), // dupe
    ];
    const { unique, duplicateCount } = dedupeByVideoId(results);
    expect(unique.map((r) => r.spotifyTrack.id)).toEqual(['s1', 's3']);
    expect(duplicateCount).toBe(2);
  });

  it('drops results with no YouTube match', () => {
    const results = [makeResult('s1', 'y1'), makeResult('s2', null), makeResult('s3', 'y2')];
    const { unique, duplicateCount } = dedupeByVideoId(results);
    expect(unique.map((r) => r.spotifyTrack.id)).toEqual(['s1', 's3']);
    expect(duplicateCount).toBe(1);
  });

  it('returns empty on empty input', () => {
    const { unique, duplicateCount } = dedupeByVideoId([]);
    expect(unique).toEqual([]);
    expect(duplicateCount).toBe(0);
  });
});
