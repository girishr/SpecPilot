import chalk from 'chalk';
import { execSync } from 'child_process';
import * as readline from 'readline';
import { SpecArchiver } from '../utils/specArchiver';
import { Logger } from '../utils/logger';

export interface ArchiveOptions {
  dryRun: boolean;
  force?: boolean;
}

function getCurrentBranch(): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function askConfirmation(question: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function archiveCommand(options: ArchiveOptions) {
  const logger = new Logger();
  const projectDir = process.cwd();

  try {
    // Branch guard — warn if not on main/master
    if (!options.dryRun && !options.force) {
      const branch = getCurrentBranch();
      if (branch && branch !== 'main' && branch !== 'master') {
        console.log(chalk.yellow(`⚠ You're on branch '${branch}'. Archive is recommended only on the default branch after merging.`));
        const confirmed = await askConfirmation('Continue? [y/N] ');
        if (!confirmed) {
          logger.info('Archive cancelled.');
          return;
        }
      }
    }

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
