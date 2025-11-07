import { Command } from 'commander';
import chalk from 'chalk';
import { TemplateRegistry } from '../utils/templateRegistry';
import { Logger } from '../utils/logger';

export interface ListOptions {
  lang?: string;
  verbose: boolean;
}

export async function listCommand(options: ListOptions) {
  const logger = new Logger();
  
  try {
    const registry = new TemplateRegistry();
    const templates = await registry.getTemplates(options.lang);
    
    if (templates.length === 0) {
      logger.displayInfo('No Templates Found', '⚠️  No templates found matching your criteria');
      return;
    }
    
    logger.displayTemplates(templates, options.verbose);
    
  } catch (error) {
    logger.displayError('Failed to List Templates', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}