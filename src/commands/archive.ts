import chalk from 'chalk';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import * as readline from 'readline';
import { SpecArchiver } from '../utils/specArchiver';
import { Logger } from '../utils/logger';
import { readBranch } from '../utils/specServer';

export interface ArchiveOptions {
  dryRun: boolean;
  force?: boolean;
}

/**
 * The branch of the repository holding `start`: `readBranch()` on the nearest folder up that has `.git`, so no
 * program is started from the project folder (BL-132; `git` there could be the repository's own `git.bat`).
 */
export function currentBranch(start: string): string | null {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return readBranch(dir);
    if (dirname(dir) === dir) return null;
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
      const branch = currentBranch(projectDir);
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

    for (const r of result.refused) {
      logger.warn(`⚠ ${r.file} was not archived: ${r.reason}`);
    }

    if (result.entries.length === 0) {
      if (!result.refused.length) logger.success('✅ All .specs/ files are within limits. Nothing to archive.');
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
