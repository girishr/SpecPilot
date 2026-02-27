import chalk from 'chalk';
import { ProjectMigrator } from '../utils/projectMigrator';
import { Logger } from '../utils/logger';

export interface MigrateOptions {
  dir: string;
  from: string;
  to: string;
  backup: boolean;
}

export async function migrateCommand(options: MigrateOptions) {
  const logger = new Logger();
  
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
        summaryContent.push(chalk.yellow(`  • ${warning}`));
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