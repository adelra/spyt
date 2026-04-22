import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import * as logger from '../utils/logger.js';
import type { MatchResult } from '../matching/types.js';

export const STATE_SCHEMA_VERSION = 1;

export interface TransferState {
  schemaVersion: number;
  id: string;
  spotifyPlaylistId: string;
  spotifyPlaylistName: string;
  youtubePlaylistId: string | null;
  totalTracks: number;
  completedTracks: number;
  results: MatchResult[];
  status: 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export class CorruptStateFileError extends Error {
  constructor(file: string, reason: string) {
    super(`State file ${file} is corrupt: ${reason}`);
    this.name = 'CorruptStateFileError';
  }
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

function parseStateOrNull(file: string): TransferState | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.debug(`Skipping invalid JSON state file: ${file}`);
    return null;
  }

  if (!isValidState(parsed)) {
    logger.debug(`Skipping state file with unknown schema: ${file}`);
    return null;
  }

  return parsed;
}

function isValidState(value: unknown): value is TransferState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === STATE_SCHEMA_VERSION &&
    typeof v.id === 'string' &&
    typeof v.spotifyPlaylistId === 'string' &&
    Array.isArray(v.results) &&
    typeof v.status === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

export function createTransferState(
  spotifyPlaylistId: string,
  spotifyPlaylistName: string,
  totalTracks: number,
): TransferState {
  const state: TransferState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    id: crypto.randomBytes(8).toString('hex'),
    spotifyPlaylistId,
    spotifyPlaylistName,
    youtubePlaylistId: null,
    totalTracks,
    completedTracks: 0,
    results: [],
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

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CorruptStateFileError(file, `invalid JSON (${(err as Error).message})`);
  }

  if (!isValidState(parsed)) {
    const version =
      typeof parsed === 'object' && parsed !== null
        ? String((parsed as Record<string, unknown>).schemaVersion ?? 'missing')
        : 'missing';
    throw new CorruptStateFileError(
      file,
      `unknown schema version (got ${version}, expected ${STATE_SCHEMA_VERSION})`,
    );
  }

  return parsed;
}

export function getLatestInProgressTransfer(): TransferState | null {
  const dir = getStateDir();
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let latest: TransferState | null = null;

  for (const file of files) {
    const state = parseStateOrNull(path.join(dir, file));
    if (!state) continue;
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
    .map((f) => parseStateOrNull(path.join(dir, f)))
    .filter((s): s is TransferState => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
