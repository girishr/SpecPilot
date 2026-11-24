import chalk from 'chalk';
import { ProjectMigrator } from '../utils/projectMigrator';
import { Logger, terminalText } from '../utils/logger';
import { cursorLegacy, removeOldCursorRules, renameCursorRules } from '../utils/cursorLegacy';

export interface MigrateOptions {
  dir: string;
  from: string;
  to: string;
  backup: boolean;
  cursorRules?: boolean;
  removeOld?: boolean;
}

/**
 * `specpilot migrate --cursor-rules` (BL-194, REQ-002.A.18): rename SpecPilot's old `.cursor/rules/project.mdc`,
 * or with both files and `--remove-old` remove it. `--from`, `--to` and `--backup` are not read; the keep list is not.
 */
function migrateCursorRules(options: MigrateOptions): void {
  const s = cursorLegacy(options.dir, null);
  const both = s.state === 'duplicate' || s.state === 'edited';
  if (s.state === 'edited') {
    console.log(`It has ${s.onlyOldCount} lines that specpilot.mdc does not have:`);
    for (const line of s.onlyOld) console.log(`  ${terminalText(line)}`);
    if (s.onlyOldCount > s.onlyOld.length) console.log(`  and ${s.onlyOldCount - s.onlyOld.length} more`);
  }
  const out = both && options.removeOld ? removeOldCursorRules(options.dir) : renameCursorRules(options.dir);
  if (out.ok) {
    console.log(out.message);
    return;
  }
  if (s.state === 'none' && !s.yours && !s.refused) {
    console.log(out.error); // nothing to do
    return;
  }
  console.error(terminalText(out.error));
  process.exit(1);
}

export async function migrateCommand(options: MigrateOptions) {
  const logger = new Logger();
  if (options.cursorRules) return migrateCursorRules(options);

  try {
    logger.info('🔄 Starting project migration...');
    
    const migrator = new ProjectMigrator();
    
    // Check if migration is actually needed
    const migrationNeeded = await migrator.checkMigrationNeeded(options.dir, options.from, options.to);
    
    if (!migrationNeeded.needed) {
      if (migrationNeeded.reason === 'no_source') {
        logger.error(`❌ Source structure "${options.from}" not found in ${options.dir}`);
        console.log(chalk.yellow('\n💡 When to use migrate:'));
        console.log('  • Upgrading from old .project-spec to new .specs structure');
        console.log('  • Converting between different specification formats\n');
        console.log(chalk.cyan('🚀 For new projects, use:'));
        console.log(chalk.white('  specpilot init my-project'));
        console.log(chalk.cyan('\n📦 For existing codebases without specs:'));
        console.log(chalk.white('  specpilot add-specs'));
        console.log(chalk.cyan('\n📖 For help:'));
        console.log(chalk.white('  specpilot migrate --help'));
        process.exit(1);
      } else if (migrationNeeded.reason === 'already_migrated') {
        logger.info('✅ Project is already using the target structure.');
        console.log(chalk.yellow(`\n⚠️  The "${options.to}" structure already exists.`));
        console.log(chalk.cyan('\nNext steps:'));
        console.log('  specpilot validate  # Validate your specs');
        process.exit(0);
      }
    }
    
    // Validate source structure exists
    const sourceExists = await migrator.validateSource(options.dir, options.from);
    if (!sourceExists) {
      logger.error(`❌ Source structure "${options.from}" not found in ${options.dir}`);
      process.exit(1);
    }
    
    // Create backup if requested
    if (options.backup) {
      logger.info('📦 Creating backup...');
      await migrator.createBackup(options.dir);
      logger.success('✅ Backup created');
    }
    
    // Perform migration
    logger.info(`🔄 Migrating from "${options.from}" to "${options.to}"...`);
    const results = await migrator.migrate(options.dir, {
      from: options.from,
      to: options.to
    });
    
    logger.success('✅ Migration completed successfully!');
    
    // Show migration summary with logo
    const summaryContent = [
      chalk.blue.bold('Migration Summary'),
      '',
      chalk.white(`Files migrated: ${results.filesMigrated}`),
      chalk.white(`Files merged: ${results.filesMerged}`),
      chalk.white(`Files created: ${results.filesCreated}`)
    ];

    if (results.warnings.length > 0) {
      summaryContent.push('');
      summaryContent.push(chalk.yellow('⚠️  Warnings:'));
      results.warnings.forEach((warning: string) => {
        summaryContent.push(chalk.yellow(`  • ${terminalText(warning)}`));
      });
    }

    summaryContent.push('');
    summaryContent.push(chalk.cyan('📖 Next steps:'));
    summaryContent.push(chalk.white('  specpilot validate  # Validate migrated structure'));
    summaryContent.push(chalk.white('  # Review .specs/ files and update as needed'));

    logger.displayWithLogo(summaryContent);
    
  } catch (error) {
    logger.error(`❌ Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}