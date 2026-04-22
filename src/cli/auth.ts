import { Command } from 'commander';
import { authenticateYTMusic } from '../youtube/auth.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';
import { ExitCode, classifyError } from '../utils/exit-codes.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authenticate with music services');

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
        const code = classifyError(err);
        process.exit(code === ExitCode.Generic ? ExitCode.Auth : code);
      }
    });
}
