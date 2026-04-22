import { Command } from 'commander';
import fs from 'node:fs';
import { loadState, listTransfers } from '../transfer/state.js';
import { formatReport, toJSON, toCSV } from '../transfer/report.js';
import * as logger from '../utils/logger.js';
import { formatError } from '../utils/logger.js';
import { ExitCode, classifyError } from '../utils/exit-codes.js';

export function registerReportCommand(program: Command): void {
  program
    .command('report [transfer-id]')
    .description('Show match report for a past transfer')
    .option('--json', 'Output as JSON')
    .option('--csv', 'Output as CSV')
    .option('-o, --output <file>', 'Write report to file')
    .option('--list', 'List all past transfers')
    .action(
      async (
        transferId: string | undefined,
        options: { json?: boolean; csv?: boolean; output?: string; list?: boolean },
      ) => {
        try {
          if (options.list || !transferId) {
            const transfers = listTransfers();
            if (transfers.length === 0) {
              logger.info('No transfers found.');
              return;
            }

            console.log('\nPast transfers:\n');
            for (const t of transfers) {
              const matched = t.results.filter((r) => r.youtubeVideo !== null).length;
              console.log(
                `  ${t.id}  ${t.spotifyPlaylistName.padEnd(40)} ${matched}/${t.totalTracks} matched  ${t.status}  ${t.createdAt.split('T')[0]}`,
              );
            }
            console.log('');
            return;
          }

          const state = loadState(transferId);
          if (!state) {
            logger.error(`Transfer "${transferId}" not found.`);
            process.exit(ExitCode.InvalidInput);
          }

          let output: string;
          if (options.json) {
            output = toJSON(state);
          } else if (options.csv) {
            output = toCSV(state);
          } else {
            output = formatReport(state);
          }

          if (options.output) {
            fs.writeFileSync(options.output, output);
            logger.success(`Report written to ${options.output}`);
          } else {
            console.log(output);
          }
        } catch (err) {
          logger.error(
            `Report failed: ${formatError(err)}`,
          );
          process.exit(classifyError(err));
        }
      },
    );
}
