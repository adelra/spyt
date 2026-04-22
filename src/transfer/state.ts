import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { MatchResult } from '../matching/types.js';

export interface TransferState {
  id: string;
  spotifyPlaylistId: string;
  spotifyPlaylistName: string;
  youtubePlaylistId: string | null;
  totalTracks: number;
  completedTracks: number;
  results: MatchResult[];
  addedYoutubeVideoIds: string[];
  status: 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

function getStateDir(): string {
  const dir =
    process.env.SPYT_STATE_DIR ?? path.join(os.homedir(), '.config', 'spyt', 'transfers');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statePath(id: string): string {
  return path.join(getStateDir(), `${id}.json`);
}

export function createTransferState(
  spotifyPlaylistId: string,
  spotifyPlaylistName: string,
  totalTracks: number,
): TransferState {
  const state: TransferState = {
    id: crypto.randomBytes(8).toString('hex'),
    spotifyPlaylistId,
    spotifyPlaylistName,
    youtubePlaylistId: null,
    totalTracks,
    completedTracks: 0,
    results: [],
    addedYoutubeVideoIds: [],
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveState(state);
  return state;
}

export function saveState(state: TransferState): void {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath(state.id), JSON.stringify(state, null, 2));
}

export function loadState(id: string): TransferState | null {
  const file = statePath(id);
  if (!fs.existsSync(file)) return null;
  return normalizeState(JSON.parse(fs.readFileSync(file, 'utf-8')) as TransferState);
}

function normalizeState(state: TransferState): TransferState {
  state.addedYoutubeVideoIds ??= [];
  return state;
}

export function getLatestInProgressTransfer(): TransferState | null {
  const dir = getStateDir();
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let latest: TransferState | null = null;

  for (const file of files) {
    const state = normalizeState(
      JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as TransferState,
    );
    if (state.status !== 'in_progress') continue;
    if (!latest || state.updatedAt > latest.updatedAt) {
      latest = state;
    }
  }

  return latest;
}

export function listTransfers(): TransferState[] {
  const dir = getStateDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) =>
      normalizeState(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as TransferState),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
