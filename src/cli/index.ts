#!/usr/bin/env node

import { Command } from 'commander';
import { registerAuthCommands } from './auth.js';
import { registerTransferCommand } from './transfer.js';
import { registerListCommand } from './list.js';
import { registerReportCommand } from './report.js';
import { setLogLevel } from '../utils/logger.js';

const program = new Command();

program
  .name('spyt')
  .description('Transfer playlists from Spotify to YouTube Music')
  .version('0.1.0')
  .option('--verbose', 'Enable debug logging')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
    }
  });

registerAuthCommands(program);
registerTransferCommand(program);
registerListCommand(program);
registerReportCommand(program);

program.parse();
