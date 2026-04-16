import { describe, it, expect } from 'vitest';
import { parseSpotifyUrl } from '../../src/spotify/client.js';

describe('parseSpotifyUrl', () => {
  it('parses a standard Spotify playlist URL', () => {
    const result = parseSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    expect(result).toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('parses a Spotify playlist URL with query params', () => {
    const result = parseSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123',
    );
    expect(result).toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('parses a Spotify URI', () => {
    const result = parseSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
    expect(result).toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('returns null for invalid URLs', () => {
    expect(parseSpotifyUrl('https://google.com')).toBeNull();
    expect(parseSpotifyUrl('not a url')).toBeNull();
    expect(parseSpotifyUrl('')).toBeNull();
  });

  it('returns null for non-playlist Spotify URLs', () => {
    expect(
      parseSpotifyUrl('https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6'),
    ).toBeNull();
    expect(
      parseSpotifyUrl('https://open.spotify.com/album/6rqhFgbbKwnb9MLmUQDhG6'),
    ).toBeNull();
  });
});
