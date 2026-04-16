import type { SpotifyTrack } from '../../src/spotify/types.js';

export const sampleTracks: SpotifyTrack[] = [
  {
    id: '1',
    name: 'Bohemian Rhapsody',
    artists: ['Queen'],
    album: 'A Night at the Opera',
    durationMs: 354000,
    isrc: 'GBUM71029604',
    uri: 'spotify:track:1',
  },
  {
    id: '2',
    name: 'Blinding Lights',
    artists: ['The Weeknd'],
    album: 'After Hours',
    durationMs: 200000,
    isrc: 'USUG12000497',
    uri: 'spotify:track:2',
  },
  {
    id: '3',
    name: 'Some Obscure Track',
    artists: ['Unknown Artist'],
    album: 'Unknown Album',
    durationMs: 180000,
    isrc: null,
    uri: 'spotify:track:3',
  },
];
