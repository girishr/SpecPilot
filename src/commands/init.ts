import { Command } from 'commander';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TemplateEngine } from '../utils/templateEngine';
import { SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';

export interface InitOptions {
  lang: string;
  framework?: string;
  dir: string;
  specsName: string;
  prompts: boolean;
}

export async function initCommand(name: string, options: InitOptions) {
  const logger = new Logger();
  
  try {
    logger.info('🚀 Initializing SDD project...');
    
    // Validate project name
    if (!name || name.trim() === '') {
      logger.error('❌ Project name is required and cannot be empty');
      logger.info('💡 Usage: specpilot init <project-name>');
      process.exit(1);
    }
    
    const projectName = name.trim();
    
    // Validate project name doesn't contain invalid characters
    if (/[<>:"/\\|?*]/.test(projectName)) {
      logger.error('❌ Project name contains invalid characters: < > : " / \\ | ? *');
      logger.info('💡 Please use only letters, numbers, hyphens, and underscores');
      process.exit(1);
    }
    
    // Validate supported language
    const supportedLanguages = ['typescript', 'python'];
    if (!supportedLanguages.includes(options.lang)) {
      logger.error(`❌ Language "${options.lang}" is not supported`);
      logger.info(`💡 Supported languages: ${supportedLanguages.join(', ')}`);
      process.exit(1);
    }
    
    // Get framework if not provided and prompts enabled
    let framework = options.framework;
    if (!framework && options.prompts) {
      const frameworks = getFrameworksForLanguage(options.lang);
      if (frameworks.length > 0) {
        const response = await inquirer.prompt([{
          type: 'list',
          name: 'framework',
          message: 'Choose a framework:',
          choices: ['none', ...frameworks]
        }]);
        framework = response.framework === 'none' ? undefined : response.framework;
      }
    }
    
    // Create project directory
    const targetDir = join(options.dir, projectName);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    
    // Initialize template engine and spec generator
    const templateEngine = new TemplateEngine();
    const specGenerator = new SpecGenerator(templateEngine);
    
    // Generate .specs directory structure
    await specGenerator.generateSpecs({
      projectName,
      language: options.lang,
      framework,
      targetDir,
      specsName: options.specsName
    });
    
    logger.success(`✅ Project "${projectName}" initialized successfully!`);
    logger.info(`📁 Location: ${targetDir}`);
    logger.info(`📋 Specs: ${join(targetDir, options.specsName)}`);
    
    // Show next steps
    console.log(chalk.cyan('\n📖 Next steps:'));
    console.log(`  cd ${projectName}`);
    console.log(`  # Edit ${options.specsName}/requirements.md to define your project`);
    console.log(`  # Update ${options.specsName}/project.yaml with your configuration`);
    console.log(`  specpilot validate  # Validate your specifications`);
    
  } catch (error) {
    logger.error(`❌ Failed to initialize project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function getFrameworksForLanguage(language: string): string[] {
  const frameworks: Record<string, string[]> = {
    typescript: ['react', 'express', 'next', 'nest', 'vue', 'angular'],
    python: ['fastapi', 'django', 'flask', 'streamlit']
  };
  
  return frameworks[language] || [];
}