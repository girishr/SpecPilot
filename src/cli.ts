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
import { compactCommand } from './commands/compact';
import { COMPLETED_LINE_LIMIT, PROMPTS_LINE_LIMIT } from './utils/specArchiver';
import { serveCommand } from './commands/serve';
import { Logger } from './utils/logger';
import { printNodeNotice } from './utils/nodeCheck';

const packageJson = require('../package.json');

program
  .name('specpilot')
  .description('Spec-driven development CLI for AI coding agents, with a local command center (specpilot serve)')
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
  .option('--ide <name>', 'AI IDE to set up for (claude-code, cursor, vscode, windsurf (Devin Desktop), antigravity, codex); skips the IDE question')
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
  .option('--cursor-rules', "Only rename SpecPilot's old .cursor/rules/project.mdc (before v2.1.0) to specpilot.mdc")
  .option('--remove-old', 'With --cursor-rules and both files present, remove the old project.mdc')
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
  .option('-u, --update', 'Replace the overview and create missing spec and IDE files')
  .action(refineCommand);

// Archive command
program
  .command('archive')
  .alias('ar')
  .description(`Archive oversized .specs/ files (prompts.md > ${PROMPTS_LINE_LIMIT} lines, tasks.md Completed > ${COMPLETED_LINE_LIMIT} lines)`)
  .option('--dry-run', 'Preview what would be archived without writing any files')
  .option('--force', 'Skip branch warning and archive without confirmation')
  .action(archiveCommand);

// Compact command (BL-202): an agent's plan picks the context.md entries, this moves them
program
  .command('compact')
  .description('List development/context.md entries for /specpilot-compact to judge; with --apply, move the entries its plan picks to context-archive.md')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--apply', 'Move the archive rows of .specs/development/compact-plan.md, leaving a marker line for each')
  .option('--dry-run', 'With --apply, show what would move without writing any files')
  .option('--force', 'With --apply, skip the branch warning')
  .action(compactCommand);

// Add-specs command
program
  .command('add-specs')
  .alias('add')
  .description('Add .specs folder to an existing project')
  .option('-l, --lang <language>', 'Programming language (typescript, python)')
  .option('-f, --framework <framework>', 'Framework (react, express, django, etc.)')
  .option('--no-analysis', 'Skip codebase analysis')
  .option('--no-prompts', 'Skip interactive prompts')
  .option('--ide <name>', 'AI IDE to set up for (claude-code, cursor, vscode, windsurf (Devin Desktop), antigravity, codex); skips the IDE question')
  .action(addSpecsCommand);

// Backfill command
program
  .command('backfill')
  .alias('bf')
  .description('Backfill missing SpecPilot mandates into project.yaml and existing IDE instruction files, and commands for those IDEs; creates no instruction file')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--specs-name <name>', 'Name for specs folder', '.specs')
  .option('--dry-run', 'Preview changes without writing any files')
  .option('--no-prompts', 'Accept suggested devPrefix silently when team.devPrefix is missing')
  .action(backfillCommand);

// Serve command
program
  .command('serve')
  .description('Serve a local web UI over the .specs/ of this project, or of each folder named (127.0.0.1 only; task moves, and setup of a folder without .specs/ through your AI IDE, unless --read-only)')
  .argument('[folders...]', 'Project folders to serve, in this order (default: the current directory)')
  .option('-p, --port <number>', 'Port to listen on', '4321')
  .option('--poll <ms>', 'How often to check spec files for changes, in ms (minimum 250)', '1000')
  .option('--read-only', 'Turn off task moves and guided setup: the page only reads')
  .option('--open', 'Open the UI in your default browser')
  .option('--mcp', 'Serve the local MCP endpoint at /mcp for your AI IDE (the default; SPECPILOT_MCP_TOKEN sets its token)')
  .option('--no-mcp', 'Do not serve the local MCP endpoint')
  .option('--stop', 'Stop the SpecPilot server running on this machine (on --port; a --read-only one stops with Ctrl+C)')
  .action(serveCommand);

program.addHelpText('after', `
Aliases:
  init → i    validate → v    migrate → m    list → ls
  refine → ref    archive → ar    add-specs → add    backfill → bf

Per-command options: specpilot <command> --help
`);

// Parse command line arguments
const args = process.argv.slice(2);
printNodeNotice(args, process.stderr); // BL-189: before any output of the command's own

// If no arguments provided, show welcome message
if (args.length === 0) {
  const logger = new Logger();
  logger.displayWelcome();
  console.log('\n' + chalk.gray('Use --help to see all available commands'));
  process.exit(0);
}

program.parse();