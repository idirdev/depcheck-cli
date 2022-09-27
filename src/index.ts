#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { auditCommand } from './commands/audit';
import { outdatedCommand } from './commands/outdated';
import { licensesCommand } from './commands/licenses';
import { unusedCommand } from './commands/unused';

const program = new Command();

program
  .name('depcheck')
  .description(chalk.bold('Dependency audit and analysis tool'))
  .version('1.0.0', '-v, --version', 'Display the current version')
  .option('-p, --path <path>', 'Path to the project directory', '.')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.path && opts.path !== '.') {
      process.chdir(opts.path);
    }
  });

program
  .command('audit')
  .description('Run a security vulnerability audit on dependencies')
  .option('--severity <level>', 'Minimum severity: low, moderate, high, critical', 'low')
  .option('--dev', 'Include devDependencies in the audit')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await auditCommand(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('outdated')
  .description('Check for outdated dependencies with version comparison')
  .option('--major', 'Only show major version updates')
  .option('--minor', 'Only show minor version updates')
  .option('--dev', 'Include devDependencies')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await outdatedCommand(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('licenses')
  .description('Detect and report licenses for all dependencies')
  .option('--allow <licenses>', 'Comma-separated list of allowed licenses', 'MIT,ISC,BSD-2-Clause,BSD-3-Clause,Apache-2.0')
  .option('--fail', 'Exit with code 1 if disallowed licenses are found')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await licensesCommand(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('unused')
  .description('Detect potentially unused dependencies')
  .option('--ignore <packages>', 'Comma-separated list of packages to ignore')
  .option('--scan-dirs <dirs>', 'Comma-separated directories to scan', 'src,lib,app,pages,components')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await unusedCommand(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.addHelpText('after', `
${chalk.dim('Examples:')}
  ${chalk.cyan('$ depcheck audit')}                         Security vulnerability scan
  ${chalk.cyan('$ depcheck audit --severity high')}          Only high/critical issues
  ${chalk.cyan('$ depcheck outdated')}                       Check for updates
  ${chalk.cyan('$ depcheck outdated --major')}               Only major version bumps
  ${chalk.cyan('$ depcheck licenses --fail')}                Fail on disallowed licenses
  ${chalk.cyan('$ depcheck unused')}                         Find unused dependencies
  ${chalk.cyan('$ depcheck -p /path/to/project audit')}     Analyze a different project
`);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
