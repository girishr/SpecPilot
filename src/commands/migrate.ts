import { Command } from 'commander';
import { join } from 'path';
import { existsSync, renameSync } from 'fs';
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
    
    // Show migration summary
    console.log(chalk.blue('\n📊 Migration Summary:'));
    console.log(`  Files migrated: ${results.filesMigrated}`);
    console.log(`  Files merged: ${results.filesMerged}`);
    console.log(`  Files created: ${results.filesCreated}`);
    
    if (results.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      results.warnings.forEach((warning: string) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }
    
    // Show next steps
    console.log(chalk.cyan('\n📖 Next steps:'));
    console.log('  specpilot validate  # Validate migrated structure');
    console.log('  # Review .specs/ files and update as needed');
    
  } catch (error) {
    logger.error(`❌ Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}