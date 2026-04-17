import type { YouTubeVideo } from './types.js';
import * as logger from '../utils/logger.js';

/**
 * Parse a duration string like "3:45" or "1:02:30" into milliseconds.
 */
export function parseDurationText(text: string): number {
  const parts = text.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  if (parts.length === 1 && parts[0] > 0) {
    return parts[0] * 1000;
  }
  return 0;
}

/**
 * Parse YTM search response into YouTubeVideo[].
 *
 * The response structure is deeply nested. We navigate defensively
 * and skip items we can't parse rather than throwing.
 */
export function parseSearchResponse(data: unknown): YouTubeVideo[] {
  const results: YouTubeVideo[] = [];

  try {
    const root = data as any;

    // Navigate to the search results shelves
    const tabs =
      root?.contents?.tabbedSearchResultsRenderer?.tabs ??
      [];

    for (const tab of tabs) {
      const sections =
        tab?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

      for (const section of sections) {
        // musicShelfRenderer path (most common)
        const shelfContents = section?.musicShelfRenderer?.contents ?? [];
        for (const item of shelfContents) {
          const video = parseSearchItem(item);
          if (video) results.push(video);
        }

        // musicCardShelfRenderer path (top result card)
        if (section?.musicCardShelfRenderer) {
          const video = parseCardItem(section.musicCardShelfRenderer);
          if (video) results.push(video);
        }
      }
    }
  } catch (err) {
    logger.debug(`Failed to parse search response: ${err}`);
  }

  return results;
}

function parseSearchItem(item: any): YouTubeVideo | null {
  try {
    const renderer = item?.musicResponsiveListItemRenderer;
    if (!renderer) return null;

    // Extract video ID from overlay or navigation endpoint
    const videoId =
      renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content
        ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
      renderer?.playlistItemData?.videoId ??
      null;

    if (!videoId) return null;

    // Extract title from first flex column
    const title = getFlexColumnText(renderer, 0);
    if (!title) return null;

    // Extract artist from second flex column (usually first run)
    const channelTitle = getFlexColumnText(renderer, 1) ?? '';

    // Extract duration — usually in fixedColumns or last run of a flex column
    const durationText =
      renderer?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer
        ?.text?.runs?.[0]?.text ?? '';
    const durationMs = parseDurationText(durationText);

    return {
      id: videoId,
      title,
      channelTitle,
      durationMs,
      url: `https://music.youtube.com/watch?v=${videoId}`,
    };
  } catch (err) {
    logger.debug(`Failed to parse search item: ${err}`);
    return null;
  }
}

function parseCardItem(card: any): YouTubeVideo | null {
  try {
    const videoId =
      card?.onTap?.watchEndpoint?.videoId ?? null;
    if (!videoId) return null;

    const title = card?.title?.runs?.[0]?.text ?? '';
    const subtitle = card?.subtitle?.runs?.map((r: any) => r.text).join('') ?? '';

    return {
      id: videoId,
      title,
      channelTitle: subtitle,
      durationMs: 0, // card items don't always show duration
      url: `https://music.youtube.com/watch?v=${videoId}`,
    };
  } catch {
    return null;
  }
}

function getFlexColumnText(renderer: any, index: number): string | null {
  const runs =
    renderer?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer
      ?.text?.runs;
  if (!runs || runs.length === 0) return null;
  return runs[0].text ?? null;
}

/**
 * Parse playlist create response — returns the playlist ID.
 */
export function parsePlaylistCreateResponse(data: unknown): string {
  const root = data as any;
  const playlistId = root?.playlistId;
  if (!playlistId || typeof playlistId !== 'string') {
    throw new Error('Failed to parse playlist creation response: no playlistId found');
  }
  return playlistId;
}

/**
 * Parse edit playlist response — returns true if successful.
 */
export function parsePlaylistEditResponse(data: unknown): boolean {
  const root = data as any;
  // The response typically has a status field or returns the actions
  return root?.status === 'STATUS_SUCCEEDED' || !!root?.actions;
}
