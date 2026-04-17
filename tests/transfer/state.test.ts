import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createTransferState,
  saveState,
  loadState,
  getLatestInProgressTransfer,
  listTransfers,
} from '../../src/transfer/state.js';

describe('TransferState', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spyt-test-transfers-'));
    process.env.SPYT_STATE_DIR = testDir;
  });

  afterEach(() => {
    delete process.env.SPYT_STATE_DIR;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates a state with correct initial values', () => {
    const state = createTransferState('playlist123', 'My Playlist', 50);

    expect(state.id).toBeTruthy();
    expect(state.spotifyPlaylistId).toBe('playlist123');
    expect(state.spotifyPlaylistName).toBe('My Playlist');
    expect(state.totalTracks).toBe(50);
    expect(state.completedTracks).toBe(0);
    expect(state.results).toEqual([]);
    expect(state.status).toBe('in_progress');
    expect(state.youtubePlaylistId).toBeNull();
  });

  it('saves and loads state round-trip', () => {
    const state = createTransferState('playlist456', 'Test Playlist', 10);
    state.completedTracks = 5;
    state.youtubePlaylistId = 'YT_PL_123';
    saveState(state);

    const loaded = loadState(state.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(state.id);
    expect(loaded!.completedTracks).toBe(5);
    expect(loaded!.youtubePlaylistId).toBe('YT_PL_123');
  });

  it('returns null for non-existent state', () => {
    const loaded = loadState('nonexistent_id_12345');
    expect(loaded).toBeNull();
  });

  it('finds the latest in-progress transfer', () => {
    const state1 = createTransferState('pl1', 'Playlist 1', 10);
    const state2 = createTransferState('pl2', 'Playlist 2', 20);
    state1.status = 'completed';
    saveState(state1);
    saveState(state2);

    const latest = getLatestInProgressTransfer();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(state2.id);

    // Clean up
    state2.status = 'completed';
    saveState(state2);
  });

  it('lists all transfers sorted by date', () => {
    const transfers = listTransfers();
    expect(Array.isArray(transfers)).toBe(true);
    // Should be sorted newest first
    for (let i = 1; i < transfers.length; i++) {
      expect(transfers[i - 1].updatedAt >= transfers[i].updatedAt).toBe(true);
    }
  });
});
