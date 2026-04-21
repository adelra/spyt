import ora from 'ora';
import { matchTrack } from '../matching/engine.js';
import { createPlaylist, addVideoToPlaylist } from '../youtube/client.js';
import { getPlaylist, getPlaylistTracks } from '../spotify/client.js';
import {
  createTransferState,
  saveState,
  type TransferState,
} from './state.js';
import { formatReport } from './report.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';
import type { SpotifyTrack } from '../spotify/types.js';

const BATCH_SIZE = 10;

export interface TransferOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export async function transferPlaylist(
  playlistId: string,
  options: TransferOptions = {},
): Promise<TransferState> {
  const spinner = ora('Connecting to Spotify...').start();

  // 1. Get playlist info and tracks from Spotify
  const playlist = await getPlaylist(playlistId);
  spinner.succeed(`Found playlist: "${playlist.name}" (${playlist.trackCount} tracks)`);

  spinner.start(`Fetching tracks (0/${playlist.trackCount})...`);
  const tracks = await getPlaylistTracks(playlistId, (fetched, total) => {
    spinner.text = `Fetching tracks (${fetched}/${total})...`;
  });
  spinner.succeed(`Loaded ${tracks.length} tracks from "${playlist.name}"`);

  // 2. Create transfer state
  const state = createTransferState(playlistId, playlist.name, tracks.length);

  // 3. Match tracks
  spinner.start('Matching tracks...');
  await matchAllTracks(state, tracks, spinner);
  spinner.succeed('Matching complete');

  // 4. If dry run, stop here
  if (options.dryRun) {
    state.status = 'completed';
    saveState(state);
    console.log(formatReport(state));
    return state;
  }

  // 5. Create YouTube playlist and add matched tracks
  const matchedResults = state.results.filter((r) => r.youtubeVideo !== null);
  if (matchedResults.length === 0) {
    logger.warn('No tracks matched. Nothing to create on YouTube Music.');
    state.status = 'completed';
    saveState(state);
    return state;
  }

  spinner.start(`Creating YouTube playlist "${playlist.name}"...`);
  const ytPlaylist = await createPlaylist(
    playlist.name,
    `Transferred from Spotify: ${playlist.url}`,
  );
  state.youtubePlaylistId = ytPlaylist.id;
  saveState(state);
  spinner.succeed(`Created playlist: ${ytPlaylist.url}`);

  // 6. Add tracks in batches
  spinner.start('Adding tracks to YouTube playlist...');
  let added = 0;
  for (const result of matchedResults) {
    const videoId = result.youtubeVideo!.id;
    try {
      await addVideoToPlaylist(ytPlaylist.id, videoId);
      state.addedYoutubeVideoIds.push(videoId);
      added++;
      spinner.text = `Adding tracks... (${added}/${matchedResults.length})`;
    } catch (err) {
      logger.warn(
        `Failed to add "${result.spotifyTrack.name}": ${formatError(err)}`,
      );
    }

    // Save state every batch
    if (added % BATCH_SIZE === 0) {
      saveState(state);
    }
  }

  state.status = 'completed';
  saveState(state);
  spinner.succeed(`Added ${added}/${matchedResults.length} tracks`);

  console.log(formatReport(state));
  logger.success(`Playlist available at: ${ytPlaylist.url}`);

  return state;
}

export async function resumeTransfer(state: TransferState): Promise<TransferState> {
  const spinner = ora('Resuming transfer...').start();

  // Re-fetch tracks that haven't been processed yet
  const tracks = await getPlaylistTracks(state.spotifyPlaylistId);
  const processedIds = new Set(state.results.map((r) => r.spotifyTrack.id));
  const remaining = tracks.filter((t) => !processedIds.has(t.id));

  if (remaining.length === 0) {
    spinner.info('All tracks already processed');
  } else {
    spinner.text = `Matching ${remaining.length} remaining tracks...`;
    await matchAllTracks(state, remaining, spinner);
    spinner.succeed('Matching complete');
  }

  // Create playlist if needed
  if (!state.youtubePlaylistId) {
    spinner.start('Creating YouTube playlist...');
    const ytPlaylist = await createPlaylist(state.spotifyPlaylistName);
    state.youtubePlaylistId = ytPlaylist.id;
    saveState(state);
    spinner.succeed(`Created playlist: ${ytPlaylist.url}`);
  }

  // Add unprocessed matched tracks (skip any already added on a prior run)
  const alreadyAdded = new Set(state.addedYoutubeVideoIds);
  const pending = state.results.filter(
    (r) => r.youtubeVideo !== null && !alreadyAdded.has(r.youtubeVideo.id),
  );
  spinner.start(`Adding ${pending.length} remaining tracks...`);
  let added = 0;
  for (const result of pending) {
    const videoId = result.youtubeVideo!.id;
    try {
      await addVideoToPlaylist(state.youtubePlaylistId, videoId);
      state.addedYoutubeVideoIds.push(videoId);
      added++;
      spinner.text = `Adding tracks... (${added}/${pending.length})`;
    } catch (err) {
      logger.warn(
        `Failed to add "${result.spotifyTrack.name}": ${formatError(err)}`,
      );
    }

    if (added % BATCH_SIZE === 0) {
      saveState(state);
    }
  }

  state.status = 'completed';
  saveState(state);
  spinner.succeed(`Transfer complete. ${added} tracks added.`);
  console.log(formatReport(state));

  return state;
}

async function matchAllTracks(
  state: TransferState,
  tracks: SpotifyTrack[],
  spinner: ReturnType<typeof ora>,
): Promise<void> {
  for (let i = 0; i < tracks.length; i++) {
    spinner.text = `Matching tracks... (${i + 1}/${tracks.length}) ${tracks[i].artists[0]} - ${tracks[i].name}`;
    const result = await matchTrack(tracks[i]);
    state.results.push(result);
    state.completedTracks = state.results.length;

    // Save every batch for resume support
    if ((i + 1) % BATCH_SIZE === 0) {
      saveState(state);
    }
  }

  saveState(state);
}
