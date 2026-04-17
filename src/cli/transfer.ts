import { Command } from 'commander';
import inquirer from 'inquirer';
import { parseSpotifyUrl } from '../spotify/client.js';
import { transferPlaylist, resumeTransfer } from '../transfer/runner.js';
import { getLatestInProgressTransfer } from '../transfer/state.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';

export function registerTransferCommand(program: Command): void {
  program
    .command('transfer <spotify-url>')
    .description('Transfer a Spotify playlist to YouTube Music')
    .option('--dry-run', 'Preview matches without creating a YouTube playlist')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(
      async (
        spotifyUrl: string,
        options: { dryRun?: boolean; yes?: boolean },
      ) => {
        try {
          const parsed = parseSpotifyUrl(spotifyUrl);
          if (!parsed) {
            logger.error('Invalid Spotify playlist URL');
            process.exit(1);
          }

          if (!options.yes && !options.dryRun) {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: 'This will create a new playlist on YouTube Music. Continue?',
                default: true,
              },
            ]);
            if (!confirm) return;
          }

          await transferPlaylist(parsed.id, {
            dryRun: options.dryRun,
            yes: options.yes,
          });
        } catch (err) {
          logger.error(
            `Transfer failed: ${formatError(err)}`,
          );
          process.exit(1);
        }
      },
    );

  program
    .command('resume')
    .description('Resume the last interrupted transfer')
    .action(async () => {
      try {
        const state = getLatestInProgressTransfer();
        if (!state) {
          logger.info('No interrupted transfers found.');
          return;
        }

        logger.info(
          `Resuming transfer of "${state.spotifyPlaylistName}" (${state.completedTracks}/${state.totalTracks} tracks done)`,
        );

        await resumeTransfer(state);
      } catch (err) {
        logger.error(
          `Resume failed: ${formatError(err)}`,
        );
        process.exit(1);
      }
    });
}
