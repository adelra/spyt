import { Command } from 'commander';
import inquirer from 'inquirer';
import { authenticateSpotify } from '../spotify/auth.js';
import { authenticateYTMusic } from '../youtube/auth.js';
import { getSpotifyClientId } from '../utils/config.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authenticate with music services');

  auth
    .command('spotify')
    .description('Authenticate with Spotify')
    .option('--client-id <id>', 'Spotify Application Client ID')
    .action(async (options: { clientId?: string }) => {
      try {
        let clientId = options.clientId ?? getSpotifyClientId();

        if (!clientId) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'clientId',
              message:
                'Enter your Spotify Client ID (create one at https://developer.spotify.com/dashboard):',
              validate: (input: string) =>
                input.length > 0 || 'Client ID is required',
            },
          ]);
          clientId = answers.clientId;
        }

        await authenticateSpotify(clientId!);
        logger.success('Spotify authentication successful!');
      } catch (err) {
        logger.error(
          `Spotify auth failed: ${formatError(err)}`,
        );
        process.exit(1);
      }
    });

  auth
    .command('youtube')
    .description('Authenticate with YouTube Music')
    .option('--headers-file <path>', 'Path to a file containing request headers or cURL command')
    .action(async (options: { headersFile?: string }) => {
      try {
        await authenticateYTMusic(options.headersFile);
        logger.success('YouTube Music authentication successful!');
      } catch (err) {
        logger.error(
          `YouTube Music auth failed: ${formatError(err)}`,
        );
        process.exit(1);
      }
    });
}
