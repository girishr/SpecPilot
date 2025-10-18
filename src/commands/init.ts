import { Command } from 'commander';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
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
    const supportedLanguages = ['typescript', 'javascript', 'python'];
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
    
    // Get developer name for spec attribution
    let developerName = 'Your Name'; // default
    if (options.prompts) {
      const nameResponse = await inquirer.prompt([{
        type: 'input',
        name: 'developerName',
        message: 'Enter your name (for spec file attribution):',
        default: 'Your Name'
      }]);
      developerName = nameResponse.developerName.trim() || 'Your Name';
    }
    
    // Create project directory
    const targetDir = join(options.dir, projectName);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    
    // Check for existing .specs folder
    const specsDir = join(targetDir, options.specsName);
    if (existsSync(specsDir)) {
      logger.error(`❌ Cannot initialize: ${options.specsName} folder already exists in ${targetDir}`);
      
      // Try to read existing project info
      const projectYamlPath = join(specsDir, 'project', 'project.yaml');
      const requirementsMdPath = join(specsDir, 'project', 'requirements.md');
      
      let projectInfo = '';
      if (existsSync(projectYamlPath)) {
        try {
          const projectData = yaml.load(readFileSync(projectYamlPath, 'utf8')) as any;
          projectInfo += `\n📋 Existing Project: ${projectData.name || 'Unknown'}`;
          projectInfo += `\n🔖 Version: ${projectData.version || 'Unknown'}`;
          projectInfo += `\n💻 Language: ${projectData.language || 'Unknown'}`;
          projectInfo += `\n🏗️ Framework: ${projectData.framework || 'Unknown'}`;
          projectInfo += `\n👤 Author: ${projectData.author || 'Unknown'}`;
        } catch (error) {
          projectInfo += '\n⚠️ Could not read project.yaml';
        }
      }
      
      if (existsSync(requirementsMdPath)) {
        try {
          const requirementsContent = readFileSync(requirementsMdPath, 'utf8');
          const lines = requirementsContent.split('\n').slice(0, 5); // First 5 lines
          projectInfo += `\n📝 Requirements Preview:\n${lines.join('\n')}`;
        } catch (error) {
          projectInfo += '\n⚠️ Could not read requirements.md';
        }
      }
      
      logger.info(chalk.yellow(projectInfo));
      logger.info(chalk.cyan('\n💡 To continue with this project:'));
      logger.info(`  cd ${targetDir}`);
      logger.info(`  specpilot validate  # Check current specs`);
      logger.info(`  # Edit ${options.specsName}/project/requirements.md`);
      process.exit(1);
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
      specsName: options.specsName,
      author: developerName
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