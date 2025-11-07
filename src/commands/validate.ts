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
      if (results.warnings.length > 0) {
        logger.displayValidationResults(true, [], results.warnings, options.verbose ? {
          filesChecked: results.filesChecked,
          errors: results.errors.length,
          warnings: results.warnings.length,
          mandatesVerified: results.mandatesVerified
        } : undefined);
      } else {
        logger.displayValidationResults(true, [], [], options.verbose ? {
          filesChecked: results.filesChecked,
          errors: results.errors.length,
          warnings: results.warnings.length,
          mandatesVerified: results.mandatesVerified
        } : undefined);
      }
    } else {
      if (options.fix && results.fixable.length > 0) {
        console.log(chalk.blue('\n🔧 Auto-fixing issues...'));
        const fixed = await validator.autoFix(options.dir, results.fixable);
        console.log(chalk.green(`✅ Fixed ${fixed.length} issues`));
        
        // Re-validate after fixing
        const reResults = await validator.validate(options.dir, {
          fix: false,
          verbose: options.verbose
        });
        
        logger.displayValidationResults(reResults.isValid, reResults.errors, reResults.warnings, options.verbose ? {
          filesChecked: reResults.filesChecked,
          errors: reResults.errors.length,
          warnings: reResults.warnings.length,
          mandatesVerified: reResults.mandatesVerified
        } : undefined);
      } else {
        logger.displayValidationResults(false, results.errors, results.warnings, options.verbose ? {
          filesChecked: results.filesChecked,
          errors: results.errors.length,
          warnings: results.warnings.length,
          mandatesVerified: results.mandatesVerified
        } : undefined);
        process.exit(1);
      }
    }
    
  } catch (error) {
    logger.displayError('Validation Failed', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}