import chalk from 'chalk';
import { RENAME_HEADING_PREFIX, SpecValidator, ValidationResult } from '../utils/specValidator';
import { Logger } from '../utils/logger';

export interface ValidateOptions {
  dir: string;
  fix: boolean;
  verbose: boolean;
}

function displayFixPrompts(results: ValidationResult): void {
  if (results.fixPrompts.length === 0) return;
  console.log(chalk.cyan('\n📋 AI Fix Prompts — copy these to your AI assistant:'));
  console.log(chalk.dim('─'.repeat(60)));
  for (const { issue, prompt } of results.fixPrompts) {
    console.log(chalk.white(`\n▸ ${issue}`));
    const indented = prompt.split('\n').map(l => `  ${l}`).join('\n');
    console.log(chalk.gray(indented));
  }
  console.log(chalk.dim('─'.repeat(60)));
}

function fixLabel(fix: string): string {
  if (fix.startsWith('create-')) return `Created missing file: ${fix.replace('create-', '')}`;
  if (fix.startsWith(RENAME_HEADING_PREFIX)) {
    const [found, expected] = fix.slice(RENAME_HEADING_PREFIX.length).split(':');
    return `Renamed heading: ${found} → ${expected} in planning/tasks.md`;
  }
  return fix;
}

export async function validateCommand(options: ValidateOptions) {
  const logger = new Logger();
  const summaryOf = (r: ValidationResult) => options.verbose ? {
    filesChecked: r.filesChecked,
    errors: r.errors.length,
    warnings: r.warnings.length,
    mandatesVerified: r.mandatesVerified
  } : undefined;

  try {
    logger.info('🔍 Validating project specifications...');

    const validator = new SpecValidator();
    const results = await validator.validate(options.dir, {
      fix: options.fix,
      verbose: options.verbose
    });

    // --fix runs on anything fixable, warnings included (BL-111), not only after a failed validation
    if (options.fix && results.fixable.length > 0) {
      // Capture pre-fix prompts (e.g. "fill in newly created security files")
      const prefixPrompts = results.fixPrompts;

      console.log(chalk.blue('\n🔧 Auto-fixing issues...'));
      const fixed = await validator.autoFix(options.dir, results.fixable);
      console.log(chalk.green(`✅ Fixed ${fixed.length} issue(s):`));
      for (const fix of fixed) {
        console.log(chalk.green(`   • ${fixLabel(fix)}`));
      }

      // Re-validate after fixing
      const reResults = await validator.validate(options.dir, {
        fix: false,
        verbose: options.verbose
      });

      logger.displayValidationResults(reResults.isValid, reResults.errors, reResults.warnings, summaryOf(reResults));

      // Combine: re-validation prompts + any prompts from the files just created
      const allPrompts = [
        ...reResults.fixPrompts,
        ...prefixPrompts.filter(p => !reResults.fixPrompts.some(r => r.issue === p.issue))
      ];

      if (!reResults.isValid) {
        // Phase 2: structure is fixed — only content issues remain, show AI prompts
        if (allPrompts.length > 0) {
          console.log(chalk.cyan('\n📋 Next step — content guidance for your AI assistant:'));
          displayFixPrompts({ ...reResults, fixPrompts: allPrompts });
        }
        process.exit(1);
      }

      // Re-validation passed — still show fill-in prompts for newly created files
      if (allPrompts.length > 0) {
        console.log(chalk.cyan('\n📋 Next step — fill in the newly created files:'));
        displayFixPrompts({ ...reResults, fixPrompts: allPrompts });
      }
      return;
    }

    logger.displayValidationResults(results.isValid, results.errors, results.warnings, summaryOf(results));

    if (results.fixable.length > 0) {
      // Phase 1: fixable issues — direct to --fix, suppress AI prompts to avoid confusion
      console.log(chalk.yellow(`\n💡 ${results.fixable.length} issue(s) can be auto-fixed.`));
      console.log(chalk.yellow(`   Run: specpilot validate --fix`));
      if (results.fixable.some(f => f.startsWith('create-'))) {
        console.log(chalk.dim(`   Once all files are created, re-run validate for content guidance.`));
      }
    } else if (results.fixPrompts.length > 0) {
      // Phase 2: all files exist — only content issues remain, show AI prompts
      displayFixPrompts(results);
    }

    if (!results.isValid) process.exit(1);

  } catch (error) {
    logger.displayError('Validation Failed', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
