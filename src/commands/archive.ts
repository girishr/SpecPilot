import chalk from 'chalk';
import { SpecArchiver } from '../utils/specArchiver';
import { Logger } from '../utils/logger';

export interface ArchiveOptions {
  dryRun: boolean;
}

export async function archiveCommand(options: ArchiveOptions) {
  const logger = new Logger();
  const projectDir = process.cwd();

  try {
    if (options.dryRun) {
      logger.info('🔍 Dry run — previewing archive operations (no files will be changed)...');
    } else {
      logger.info('📦 Archiving oversized .specs/ files...');
    }

    const archiver = new SpecArchiver();
    const result = await archiver.archive(projectDir, { dryRun: options.dryRun });

    if (result.entries.length === 0) {
      logger.success('✅ All .specs/ files are within limits. Nothing to archive.');
      return;
    }

    console.log('');
    if (options.dryRun) {
      console.log(chalk.yellow('📋 Archive preview (--dry-run):'));
    } else {
      console.log(chalk.green('📋 Archive report:'));
    }
    console.log('');

    for (const entry of result.entries) {
      const verb = options.dryRun ? 'Would move' : 'Moved';
      console.log(`  ${chalk.cyan(entry.file)}`);
      console.log(`    ${verb} ${chalk.yellow(String(entry.linesMoved))} lines → ${chalk.cyan(entry.archiveFile)}`);
      console.log('');
    }

    if (!options.dryRun) {
      logger.success(`✅ Archived ${result.entries.length} file(s). Run \`specpilot validate\` to confirm.`);
    } else {
      logger.info('💡 Run without --dry-run to apply these changes.');
    }
  } catch (error) {
    logger.displayError('Archive Failed', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
