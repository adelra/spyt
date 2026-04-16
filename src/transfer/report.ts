import chalk from 'chalk';
import type { TransferState } from './state.js';
import type { MatchConfidence } from '../matching/types.js';

const CONFIDENCE_COLORS: Record<MatchConfidence, (s: string) => string> = {
  exact: chalk.green,
  high: chalk.greenBright,
  medium: chalk.yellow,
  low: chalk.red,
  none: chalk.gray,
};

export function formatReport(state: TransferState): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(`Transfer Report: ${state.spotifyPlaylistName}`));
  lines.push(chalk.gray(`ID: ${state.id}`));
  lines.push(chalk.gray(`Date: ${state.createdAt}`));
  lines.push(chalk.gray(`Status: ${state.status}`));
  lines.push('');

  // Summary
  const counts = countByConfidence(state);
  const total = state.results.length;
  const matched = total - (counts.none ?? 0);

  lines.push(chalk.bold('Summary'));
  lines.push(`  Total tracks:   ${total}`);
  lines.push(`  Matched:        ${chalk.green(String(matched))} (${pct(matched, total)})`);
  lines.push(`  Not found:      ${chalk.red(String(counts.none ?? 0))}`);
  lines.push('');
  lines.push(`  ${chalk.green('exact')}: ${counts.exact ?? 0}  ${chalk.greenBright('high')}: ${counts.high ?? 0}  ${chalk.yellow('medium')}: ${counts.medium ?? 0}  ${chalk.red('low')}: ${counts.low ?? 0}`);
  lines.push('');

  // Track details
  lines.push(chalk.bold('Track Details'));
  lines.push(chalk.gray('─'.repeat(80)));

  for (const result of state.results) {
    const track = result.spotifyTrack;
    const label = `${track.artists[0]} - ${track.name}`;
    const colorFn = CONFIDENCE_COLORS[result.confidence];
    const badge = colorFn(`[${result.confidence}]`);

    if (result.youtubeVideo) {
      lines.push(`  ${badge} ${label}`);
      lines.push(chalk.gray(`         → ${result.youtubeVideo.title} (${result.matchMethod})`));
    } else {
      lines.push(`  ${badge} ${label}`);
      lines.push(chalk.gray(`         → No match found`));
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function toJSON(state: TransferState): string {
  return JSON.stringify(
    state.results.map((r) => ({
      spotifyTrack: `${r.spotifyTrack.artists[0]} - ${r.spotifyTrack.name}`,
      spotifyId: r.spotifyTrack.id,
      youtubeId: r.youtubeVideo?.id ?? null,
      youtubeTitle: r.youtubeVideo?.title ?? null,
      youtubeUrl: r.youtubeVideo?.url ?? null,
      confidence: r.confidence,
      matchMethod: r.matchMethod,
    })),
    null,
    2,
  );
}

export function toCSV(state: TransferState): string {
  const header = 'spotify_artist,spotify_track,spotify_id,youtube_id,youtube_title,youtube_url,confidence,match_method';
  const rows = state.results.map((r) => {
    const artist = csvEscape(r.spotifyTrack.artists[0]);
    const track = csvEscape(r.spotifyTrack.name);
    return [
      artist,
      track,
      r.spotifyTrack.id,
      r.youtubeVideo?.id ?? '',
      csvEscape(r.youtubeVideo?.title ?? ''),
      r.youtubeVideo?.url ?? '',
      r.confidence,
      r.matchMethod,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function countByConfidence(state: TransferState): Partial<Record<MatchConfidence, number>> {
  const counts: Partial<Record<MatchConfidence, number>> = {};
  for (const result of state.results) {
    counts[result.confidence] = (counts[result.confidence] ?? 0) + 1;
  }
  return counts;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}
