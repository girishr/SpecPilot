#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from './commands/init';
import { validateCommand } from './commands/validate';
import { migrateCommand } from './commands/migrate';
import { listCommand } from './commands/list';
import { specifyCommand } from './commands/specify';

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
  .option('-l, --lang <language>', 'Programming language (typescript, python, java)', 'typescript')
  .option('-f, --framework <framework>', 'Framework (react, express, django, spring, etc.)')
  .option('-d, --dir <directory>', 'Target directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--no-prompts', 'Skip interactive prompts')
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
  .description('Migrate from old project structure')
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

// Specify command
program
  .command('specify')
  .alias('spec')
  .description('Specify project requirements from natural language description')
  .argument('[description]', 'Natural language description of what to build')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--no-prompts', 'Skip interactive prompts')
  .option('-u, --update', 'Regenerate specs with new description')
  .action(specifyCommand);

// Parse command line arguments
program.parse();