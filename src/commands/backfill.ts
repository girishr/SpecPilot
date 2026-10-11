import chalk from 'chalk';
import { resolve } from 'path';
import {
  SpecBackfiller,
  BackfillResult,
  BackfillFileResult,
  IdeFileBackfillResult,
  SlashCommandBackfillResult,
} from '../utils/specBackfiller';
import { SkillRefresh } from '../utils/slashCommandGenerator';
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
      lines.push(chalk.green(`  ✅ All ${r.total} item${r.total === 1 ? '' : 's'} already present — nothing to backfill`));
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

function ideFileResultLines(r: IdeFileBackfillResult, dryRun: boolean): string[] {
  const lines: string[] = [chalk.cyan(`📄 ${r.path}`)];

  if (r.action === 'warn') {
    lines.push(chalk.yellow(`  ⚠️  ${r.reason}`));
  } else {
    const fileResult: BackfillFileResult = {
      action: r.action,
      found: r.found,
      total: r.total,
      added: r.added,
      reason: r.reason,
    };
    lines.push(...fileResultLines(r.path, fileResult, dryRun).slice(1));
  }

  return lines;
}

/** The Claude Code skill's line (BL-PM-012): refreshed from project.yaml, or kept with the reason. */
function skillResultLines(r: SkillRefresh, dryRun: boolean): string[] {
  const done = {
    added: dryRun ? 'Would add it from project.yaml' : 'Added from project.yaml',
    updated: dryRun ? "Would update it from project.yaml (it is SpecPilot's own render)" : "Updated from project.yaml (it was SpecPilot's own render)",
    current: 'Current — nothing to do',
  };
  return [
    chalk.blue.bold('Claude Code skill'),
    '',
    chalk.cyan(`📄 ${r.path}`),
    r.action === 'kept' ? chalk.yellow(`  ⚠️  Kept as it was (${r.reason})`) : chalk.green(`  ✅ ${done[r.action]}`),
    '',
  ];
}

function slashCommandResultLines(r: SlashCommandBackfillResult, dryRun: boolean): string[] {
  const lines: string[] = [chalk.cyan(`📄 ${r.ide} slash commands`)];
  if (r.added.length === 0 && r.updated.length === 0 && r.kept.length === 0) {
    lines.push(chalk.green('  ✅ All commands up to date — nothing to backfill'));
  }
  if (r.added.length > 0) {
    lines.push(chalk.white(`  ➕ ${dryRun ? 'Would add' : 'Added'} ${r.added.length} missing command(s):`));
    r.added.forEach((name) => lines.push(chalk.white(`     • specpilot-${name}`)));
  }
  if (r.updated.length > 0) {
    lines.push(chalk.white(`  🔄 ${dryRun ? 'Would update' : 'Updated'} ${r.updated.length} command(s) to the current version:`));
    r.updated.forEach((name) => lines.push(chalk.white(`     • specpilot-${name}`)));
  }
  for (const k of r.kept) {
    lines.push(chalk.yellow(`  ⚠️  kept: ${k.reason}  ${k.path}`));
    if (k.reason === 'modified') {
      lines.push(chalk.yellow('      delete it and re-run specpilot backfill to get the latest version'));
    }
  }
  if (r.ide === 'codex' && (r.added.length > 0 || r.updated.length > 0)) {
    lines.push(chalk.white('  ℹ️  Codex only reads ~/.codex/prompts/; copy them there manually:'));
    lines.push(chalk.white('     cp .codex/prompts/specpilot-*.md ~/.codex/prompts/'));
  }
  return lines;
}

function displayResult(result: BackfillResult, dryRun: boolean, logger: Logger): void {
  const allResults = [result.projectYaml, result.copilotInstructions, result.tasksMd, ...result.ideFiles];
  const ideLines =
    result.ideFiles.length > 0
      ? [
          chalk.blue.bold('IDE-native AI context files'),
          '',
          ...result.ideFiles.flatMap((r) => [...ideFileResultLines(r, dryRun), '']),
        ]
      : [];
  const slashLines =
    result.slashCommands.length > 0
      ? [
          chalk.blue.bold('Slash commands'),
          '',
          ...result.slashCommands.flatMap((r) => [...slashCommandResultLines(r, dryRun), '']),
        ]
      : [];

  const content: string[] = [
    chalk.blue.bold(`Backfill Results${dryRun ? ' (dry-run — no changes written)' : ''}`),
    '',
    ...fileResultLines('.specs/project/project.yaml', result.projectYaml, dryRun),
    '',
    ...fileResultLines('.github/copilot-instructions.md', result.copilotInstructions, dryRun),
    '',
    ...fileResultLines('.specs/planning/tasks.md', result.tasksMd, dryRun),
    '',
    ...ideLines,
    ...slashLines,
    ...(result.skill ? skillResultLines(result.skill, dryRun) : []),
  ];

  const updatedCount =
    allResults.filter((r) => r.action === 'updated' || r.action === 'created').length +
    result.slashCommands.filter((r) => r.added.length > 0 || r.updated.length > 0).length +
    (result.skill?.action === 'added' || result.skill?.action === 'updated' ? 1 : 0);
  const skippedCount =
    allResults.filter((r) => r.action === 'skipped').length +
    result.slashCommands.filter((r) => r.added.length === 0 && r.updated.length === 0).length +
    (result.skill?.action === 'current' ? 1 : 0);
  const keptCount = result.skill?.action === 'kept' ? 1 : 0;

  if (updatedCount === 0 && keptCount === 0) {
    content.push(chalk.green('✅ Everything is up to date — nothing to backfill.'));
  } else if (dryRun) {
    content.push(
      chalk.yellow(
        `ℹ️  ${updatedCount} file(s) would be updated, ${skippedCount} already up to date, ${keptCount} kept. Run without --dry-run to apply.`,
      ),
    );
  } else {
    content.push(
      chalk.green(
        `✅ ${updatedCount} file(s) updated, ${skippedCount} already up to date, ${keptCount} kept.`,
      ),
    );
    content.push('');
    content.push(chalk.cyan('📖 Next steps:'));
    content.push(chalk.white('  specpilot validate  # Verify your specs are complete'));
  }

  logger.displayWithLogo(content);
}
