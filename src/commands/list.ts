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
    logger.info('📋 Available Templates:');
    
    const registry = new TemplateRegistry();
    const templates = await registry.getTemplates(options.lang);
    
    if (templates.length === 0) {
      logger.warn('⚠️  No templates found');
      return;
    }
    
    // Group templates by language
    const grouped = templates.reduce((acc, template) => {
      if (!acc[template.language]) {
        acc[template.language] = [];
      }
      acc[template.language].push(template);
      return acc;
    }, {} as Record<string, typeof templates>);
    
    Object.entries(grouped).forEach(([language, langTemplates]) => {
      console.log(chalk.blue(`\n📦 ${language.toUpperCase()}`));
      
      langTemplates.forEach(template => {
        const name = template.framework ? 
          `${template.name} (${template.framework})` : 
          template.name;
        
        if (options.verbose) {
          console.log(chalk.green(`  ✓ ${name}`));
          console.log(chalk.gray(`    Description: ${template.description}`));
          console.log(chalk.gray(`    Files: ${template.files.join(', ')}`));
        } else {
          console.log(chalk.green(`  ✓ ${name} - ${template.description}`));
        }
      });
    });
    
    console.log(chalk.cyan('\n📖 Usage:'));
    console.log('  sdd-init <project-name> --lang <language> --framework <framework>');
    console.log('  sdd-init my-app --lang typescript --framework react');
    
  } catch (error) {
    logger.error(`❌ Failed to list templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}