import chalk from 'chalk';
import { resolve } from 'path';
import { SpecBackfiller, BackfillResult, BackfillFileResult } from '../utils/specBackfiller';
import { Logger } from '../utils/logger';

export interface BackfillOptions {
  dir: string;
  specsName: string;
  dryRun?: boolean;
  noPrompts?: boolean;
}

export async function backfillCommand(options: BackfillOptions): Promise<void> {
  const logger = new Logger();
  const projectDir = resolve(options.dir);

  if (options.dryRun) {
    logger.info('🔍 Dry-run mode — no files will be written.\n');
  }

  const backfiller = new SpecBackfiller();

  try {
    const result = await backfiller.backfill(
      projectDir,
      options.specsName,
      options.dryRun ?? false,
      options.noPrompts ?? false,
    );
    displayResult(result, options.dryRun ?? false, logger);
  } catch (error) {
    logger.error(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function fileResultLines(label: string, r: BackfillFileResult, dryRun: boolean): string[] {
  const lines: string[] = [chalk.cyan(`📄 ${label}`)];

  if (r.action === 'missing') {
    lines.push(chalk.yellow(`  ⚠️  File not found — ${r.reason}`));
  } else if (r.action === 'skipped') {
    if (r.reason) {
      lines.push(chalk.yellow(`  ⚠️  Skipped — ${r.reason}`));
    } else {
      lines.push(chalk.green(`  ✅ All ${r.total} items already present — nothing to backfill`));
    }
  } else if (r.action === 'created') {
    const verb = dryRun ? 'Would create' : 'Created';
    lines.push(chalk.green(`  ✅ ${verb} with all ${r.total} mandates`));
  } else {
    // updated
    lines.push(chalk.green(`  ✅ ${r.found}/${r.total} items already present`));
    const verb = dryRun ? 'Would add' : 'Added';
    lines.push(chalk.white(`  ➕ ${verb} ${r.added.length} missing item(s):`));
    r.added.forEach((label) => lines.push(chalk.white(`     • ${label}`)));
  }

  return lines;
}

function displayResult(result: BackfillResult, dryRun: boolean, logger: Logger): void {
  const allResults = [result.projectYaml, result.copilotInstructions, result.tasksMd];

  const content: string[] = [
    chalk.blue.bold(`Backfill Results${dryRun ? ' (dry-run — no changes written)' : ''}`),
    '',
    ...fileResultLines('.specs/project/project.yaml', result.projectYaml, dryRun),
    '',
    ...fileResultLines('.github/copilot-instructions.md', result.copilotInstructions, dryRun),
    '',
    ...fileResultLines('.specs/planning/tasks.md', result.tasksMd, dryRun),
    '',
  ];

  const updatedCount = allResults.filter((r) => r.action === 'updated' || r.action === 'created').length;
  const skippedCount = allResults.filter((r) => r.action === 'skipped').length;

  if (updatedCount === 0) {
    content.push(chalk.green('✅ Everything is up to date — nothing to backfill.'));
  } else if (dryRun) {
    content.push(
      chalk.yellow(
        `ℹ️  ${updatedCount} file(s) would be updated, ${skippedCount} already up to date. Run without --dry-run to apply.`,
      ),
    );
  } else {
    content.push(chalk.green(`✅ ${updatedCount} file(s) updated, ${skippedCount} already up to date.`));
    content.push('');
    content.push(chalk.cyan('📖 Next steps:'));
    content.push(chalk.white('  specpilot validate  # Verify your specs are complete'));
  }

  logger.displayWithLogo(content);
}
