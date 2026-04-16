import { describe, it, expect } from 'vitest';
import { scoreResult, scoreResults } from '../../src/matching/scoring.js';
import { sampleTracks } from '../fixtures/spotify-tracks.js';
import { sampleVideos } from '../fixtures/youtube-videos.js';

describe('scoreResult', () => {
  it('scores a close title + artist + duration match as high', () => {
    const track = sampleTracks[0]; // Bohemian Rhapsody - Queen
    const video = sampleVideos[0]; // Queen - Bohemian Rhapsody (Official Video)

    const result = scoreResult(track, video);

    expect(result.confidence).toBe('high');
    expect(result.details.artistMatch).toBe(true);
    expect(result.details.durationDelta).toBeLessThan(5000);
  });

  it('penalizes large duration differences', () => {
    const track = sampleTracks[0]; // 354s
    const video = sampleVideos[1]; // Live version, 420s (66s longer)

    const result = scoreResult(track, video);

    // Still has title and artist match but worse duration
    expect(result.score).toBeLessThan(
      scoreResult(track, sampleVideos[0]).score,
    );
  });

  it('scores an unrelated video as low or none', () => {
    const track = sampleTracks[1]; // Blinding Lights - The Weeknd
    const video = sampleVideos[3]; // Random Unrelated Video About Lights

    const result = scoreResult(track, video);

    expect(['low', 'none']).toContain(result.confidence);
    expect(result.details.artistMatch).toBe(false);
  });

  it('detects artist match in video title', () => {
    const track = sampleTracks[1]; // Blinding Lights - The Weeknd
    const video = sampleVideos[2]; // The Weeknd - Blinding Lights (Official)

    const result = scoreResult(track, video);

    expect(result.details.artistMatch).toBe(true);
    expect(result.confidence).toBe('high');
  });
});

describe('scoreResults', () => {
  it('returns results sorted by score descending', () => {
    const track = sampleTracks[0]; // Bohemian Rhapsody
    const videos = [sampleVideos[1], sampleVideos[0], sampleVideos[3]];

    const results = scoreResults(track, videos);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }

    // Official video should rank first
    expect(results[0].video.id).toBe('yt1');
  });

  it('handles empty video list', () => {
    const results = scoreResults(sampleTracks[0], []);
    expect(results).toHaveLength(0);
  });
});
