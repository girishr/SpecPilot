import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { SpecValidator } from '../utils/specValidator';
import { Logger } from '../utils/logger';

export interface ValidateOptions {
  dir: string;
  fix: boolean;
  verbose: boolean;
}

export async function validateCommand(options: ValidateOptions) {
  const logger = new Logger();
  
  try {
    logger.info('🔍 Validating project specifications...');
    
    const validator = new SpecValidator();
    const results = await validator.validate(options.dir, {
      fix: options.fix,
      verbose: options.verbose
    });
    
    if (results.isValid) {
      logger.success('✅ All specifications are valid!');
      if (results.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        results.warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
    } else {
      logger.error('❌ Validation failed!');
      console.log(chalk.red('\n🚫 Errors:'));
      results.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
      
      if (options.fix && results.fixable.length > 0) {
        console.log(chalk.blue('\n🔧 Auto-fixing issues...'));
        const fixed = await validator.autoFix(options.dir, results.fixable);
        console.log(chalk.green(`✅ Fixed ${fixed.length} issues`));
      }
      
      process.exit(1);
    }
    
    if (options.verbose) {
      console.log(chalk.blue('\n📊 Validation Summary:'));
      console.log(`  Files checked: ${results.filesChecked}`);
      console.log(`  Errors: ${results.errors.length}`);
      console.log(`  Warnings: ${results.warnings.length}`);
      console.log(`  Mandates verified: ${results.mandatesVerified}`);
    }
    
  } catch (error) {
    logger.error(`❌ Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}