import { describe, it, expect } from 'vitest';
import {
  parseDurationText,
  parseSearchResponse,
  parsePlaylistCreateResponse,
  parsePlaylistEditResponse,
} from '../../src/youtube/parsers.js';

describe('parseDurationText', () => {
  it('parses mm:ss format', () => {
    expect(parseDurationText('3:45')).toBe(225_000);
  });

  it('parses h:mm:ss format', () => {
    expect(parseDurationText('1:02:30')).toBe(3_750_000);
  });

  it('parses 0:30', () => {
    expect(parseDurationText('0:30')).toBe(30_000);
  });

  it('parses bare seconds', () => {
    expect(parseDurationText('30')).toBe(30_000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDurationText('')).toBe(0);
    expect(parseDurationText('abc')).toBe(0);
  });
});

describe('parseSearchResponse', () => {
  it('extracts videos from a YTM search response', () => {
    const fixture = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicShelfRenderer: {
                          contents: [
                            {
                              musicResponsiveListItemRenderer: {
                                flexColumns: [
                                  {
                                    musicResponsiveListItemFlexColumnRenderer: {
                                      text: { runs: [{ text: 'Bohemian Rhapsody' }] },
                                    },
                                  },
                                  {
                                    musicResponsiveListItemFlexColumnRenderer: {
                                      text: { runs: [{ text: 'Queen' }] },
                                    },
                                  },
                                ],
                                fixedColumns: [
                                  {
                                    musicResponsiveListItemFixedColumnRenderer: {
                                      text: { runs: [{ text: '5:55' }] },
                                    },
                                  },
                                ],
                                overlay: {
                                  musicItemThumbnailOverlayRenderer: {
                                    content: {
                                      musicPlayButtonRenderer: {
                                        playNavigationEndpoint: {
                                          watchEndpoint: { videoId: 'fJ9rUzIMcZQ' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const results = parseSearchResponse(fixture);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'fJ9rUzIMcZQ',
      title: 'Bohemian Rhapsody',
      channelTitle: 'Queen',
      durationMs: 355_000,
      url: 'https://music.youtube.com/watch?v=fJ9rUzIMcZQ',
    });
  });

  it('skips items without a videoId', () => {
    const fixture = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicShelfRenderer: {
                          contents: [
                            {
                              musicResponsiveListItemRenderer: {
                                flexColumns: [
                                  {
                                    musicResponsiveListItemFlexColumnRenderer: {
                                      text: { runs: [{ text: 'Some Track' }] },
                                    },
                                  },
                                ],
                                // no overlay with videoId
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const results = parseSearchResponse(fixture);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for unexpected structure', () => {
    expect(parseSearchResponse({})).toEqual([]);
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({ contents: {} })).toEqual([]);
  });

  it('parses top result card (musicCardShelfRenderer)', () => {
    const fixture = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicCardShelfRenderer: {
                          title: { runs: [{ text: 'Stairway to Heaven' }] },
                          subtitle: { runs: [{ text: 'Led Zeppelin' }] },
                          onTap: {
                            watchEndpoint: { videoId: 'QkF3oxziUI4' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const results = parseSearchResponse(fixture);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('QkF3oxziUI4');
    expect(results[0].title).toBe('Stairway to Heaven');
  });
});

describe('parsePlaylistCreateResponse', () => {
  it('extracts playlist ID', () => {
    const data = { playlistId: 'PLxxxxxxxxxxxxxxxx' };
    expect(parsePlaylistCreateResponse(data)).toBe('PLxxxxxxxxxxxxxxxx');
  });

  it('throws when no playlistId', () => {
    expect(() => parsePlaylistCreateResponse({})).toThrow('no playlistId found');
  });
});

describe('parsePlaylistEditResponse', () => {
  it('returns true for STATUS_SUCCEEDED', () => {
    expect(parsePlaylistEditResponse({ status: 'STATUS_SUCCEEDED' })).toBe(true);
  });

  it('returns true when actions present', () => {
    expect(parsePlaylistEditResponse({ actions: [{}] })).toBe(true);
  });

  it('returns false for empty response', () => {
    expect(parsePlaylistEditResponse({})).toBe(false);
  });
});
