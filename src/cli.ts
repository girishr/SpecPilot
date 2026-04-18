#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { validateCommand } from './commands/validate';
import { migrateCommand } from './commands/migrate';
import { listCommand } from './commands/list';
import { refineCommand } from './commands/refine';
import { addSpecsCommand } from './commands/add-specs';
import { archiveCommand } from './commands/archive';
import { backfillCommand } from './commands/backfill';
import { Logger } from './utils/logger';

const packageJson = require('../package.json');

program
  .name('specpilot')
  .description('CLI tool for initializing specification-driven development projects')
  .version(packageJson.version);

// Initialize command
program
  .command('init')
  .alias('i')
  .description('Initialize a new SDD project')
  .argument('<name>', 'Project name (required)')
  .option('-l, --lang <language>', 'Programming language (typescript, python)', 'typescript')
  .option('-f, --framework <framework>', 'Framework (react, express, django, spring, etc.)')
  .option('-d, --dir <directory>', 'Target directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--no-prompts', 'Skip interactive prompts')
  .option('--dry-run', 'List files that would be created without writing them')
  .action(initCommand);

// Validate command
program
  .command('validate')
  .alias('v')
  .description('Validate project specifications')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--fix', 'Auto-fix common issues')
  .option('--verbose', 'Show detailed validation results')
  .action(validateCommand);

// Migrate command
program
  .command('migrate')
  .alias('m')
  .description('Convert legacy .project-spec folder to current .specs/ structure (rarely needed)')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--from <structure>', 'Source structure (complex, project-spec)', 'complex')
  .option('--to <structure>', 'Target structure (simple)', 'simple')
  .option('--backup', 'Create backup before migration')
  .action(migrateCommand);

// List templates command
program
  .command('list')
  .alias('ls')
  .description('List available templates')
  .option('--lang <language>', 'Filter by language')
  .option('--verbose', 'Show template details')
  .action(listCommand);

// Refine command
program
  .command('refine')
  .alias('ref')
  .description('Refine project specifications from natural language description')
  .argument('[description]', 'Natural language description of changes to apply')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--no-prompts', 'Skip interactive prompts')
  .option('-u, --update', 'Regenerate specs with new description')
  .action(refineCommand);

// Archive command
program
  .command('archive')
  .alias('ar')
  .description('Archive oversized .specs/ files (prompts.md > 300 lines, tasks.md Completed > 150 lines)')
  .option('--dry-run', 'Preview what would be archived without writing any files')
  .action(archiveCommand);

// Add-specs command
program
  .command('add-specs')
  .alias('add')
  .description('Add .specs folder to an existing project')
  .option('-l, --lang <language>', 'Programming language (typescript, python)')
  .option('-f, --framework <framework>', 'Framework (react, express, django, etc.)')
  .option('--no-analysis', 'Skip codebase analysis')
  .option('--deep-analysis', 'Perform thorough codebase analysis')
  .option('--no-prompts', 'Skip interactive prompts')
  .action(addSpecsCommand);

// Backfill command
program
  .command('backfill')
  .alias('bf')
  .description('Backfill missing SpecPilot mandates into existing project.yaml and copilot-instructions.md')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--dry-run', 'Preview changes without writing any files')
  .action(backfillCommand);

program.addHelpText('after', `
Aliases:
  init → i    validate → v    migrate → m    list → ls
  refine → ref    archive → ar    add-specs → add    backfill → bf

Per-command options: specpilot <command> --help
`);

// Parse command line arguments
const args = process.argv.slice(2);

// If no arguments provided, show welcome message
if (args.length === 0) {
  const logger = new Logger();
  logger.displayWelcome();
  console.log('\n' + chalk.gray('Use --help to see all available commands'));
  process.exit(0);
}

program.parse();