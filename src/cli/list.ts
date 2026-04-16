import { Command } from 'commander';
import inquirer from 'inquirer';
import { getUserPlaylists } from '../spotify/client.js';
import { transferPlaylist } from '../transfer/runner.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('Browse and select Spotify playlists interactively')
    .option('--dry-run', 'Preview matches without creating a YouTube playlist')
    .action(async (options: { dryRun?: boolean }) => {
      try {
        const playlists = await getUserPlaylists();

        if (playlists.length === 0) {
          logger.info('No playlists found in your Spotify library.');
          return;
        }

        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: 'Select playlists to transfer:',
            choices: playlists.map((p) => ({
              name: `${p.name} (${p.trackCount} tracks) — ${p.owner}`,
              value: p.id,
            })),
          },
        ]);

        if (selected.length === 0) {
          logger.info('No playlists selected.');
          return;
        }

        for (const playlistId of selected as string[]) {
          const playlist = playlists.find((p) => p.id === playlistId)!;
          logger.info(`\nTransferring "${playlist.name}"...`);
          await transferPlaylist(playlistId, {
            dryRun: options.dryRun,
            yes: true,
          });
        }
      } catch (err) {
        logger.error(
          `Failed: ${formatError(err)}`,
        );
        process.exit(1);
      }
    });
}
