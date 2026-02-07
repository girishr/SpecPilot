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
    // Validate project name
    if (!name || name.trim() === '') {
      logger.displayError('Invalid Project Name', 'Project name is required and cannot be empty\n\n💡 Usage: specpilot init <project-name>');
      process.exit(1);
    }
    
    const projectName = name.trim();
    
    // Validate project name doesn't contain invalid characters
    if (/[<>:"/\\|?*]/.test(projectName)) {
      logger.displayError('Invalid Project Name', 'Project name contains invalid characters: < > : " / \\ | ? *\n\n💡 Please use only letters, numbers, hyphens, and underscores');
      process.exit(1);
    }
    
    // Validate supported language
    const supportedLanguages = ['typescript', 'javascript', 'python'];
    if (!supportedLanguages.includes(options.lang)) {
      logger.displayError('Unsupported Language', `Language "${options.lang}" is not supported\n\n💡 Supported languages: ${supportedLanguages.join(', ')}`);
      process.exit(1);
    }
    
    // Get framework if not provided and prompts enabled
    let framework = options.framework;
    if (!framework && options.prompts) {
      const frameworks = getFrameworksForLanguage(options.lang);
      if (frameworks.length > 0) {
        // Display logo before framework selection
        const frameworkPromptContent = [
          chalk.blue('🚀 Initializing SDD project...'),
          '',
          chalk.blue.bold('Framework Selection'),
          '',
          chalk.white(`Project: ${projectName}`),
          chalk.white(`Language: ${options.lang}`),
          '',
          chalk.cyan('Please choose a framework for your project:')
        ];
        logger.displayWithLogo(frameworkPromptContent);
        
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
    
    // Get IDE preference for workspace settings
    let ide = 'vscode'; // default
    if (options.prompts) {
      const ideResponse = await inquirer.prompt([{
        type: 'list',
        name: 'ide',
        message: 'Select your AI IDE for SpecPilot context:',
        choices: ['vscode', 'Cursor', 'Windsurf', 'Antigravity', 'Kiro']
      }]);
      ide = ideResponse.ide;
    }
    
    // Create project directory
    const targetDir = join(options.dir, projectName);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    
    // Check for existing .specs folder
    const specsDir = join(targetDir, options.specsName);
    if (existsSync(specsDir)) {
      // Try to read existing project info
      const projectYamlPath = join(specsDir, 'project', 'project.yaml');
      const requirementsMdPath = join(specsDir, 'project', 'requirements.md');
      
      let projectInfo = `Project "${projectName}" already exists at ${targetDir}`;
      
      if (existsSync(projectYamlPath)) {
        try {
          const projectData = yaml.load(readFileSync(projectYamlPath, 'utf8')) as any;
          projectInfo += `\n\n📋 Existing Project Details:`;
          projectInfo += `\n  Name: ${projectData.name || 'Unknown'}`;
          projectInfo += `\n  Version: ${projectData.version || 'Unknown'}`;
          projectInfo += `\n  Language: ${projectData.language || 'Unknown'}`;
          projectInfo += `\n  Framework: ${projectData.framework || 'Unknown'}`;
          projectInfo += `\n  Author: ${projectData.author || 'Unknown'}`;
        } catch (error) {
          projectInfo += '\n\n⚠️ Could not read project.yaml';
        }
      }
      
      if (existsSync(requirementsMdPath)) {
        try {
          const requirementsContent = readFileSync(requirementsMdPath, 'utf8');
          const lines = requirementsContent.split('\n').slice(0, 5); // First 5 lines
          projectInfo += `\n\n📝 Requirements Preview:\n${lines.map(line => `  ${line}`).join('\n')}`;
        } catch (error) {
          projectInfo += '\n\n⚠️ Could not read requirements.md';
        }
      }
      
      const existingProjectContent = [
        chalk.blue('🚀 Initializing SDD project...'),
        '',
        chalk.red.bold('Project Already Exists'),
        '',
        chalk.yellow(projectInfo),
        '',
        chalk.cyan('💡 To continue with this project:'),
        chalk.white(`  cd ${targetDir}`),
        chalk.white('  specpilot validate  # Check current specs'),
        chalk.white(`  # Edit ${options.specsName}/project/requirements.md`)
      ];
      
      logger.displayWithLogo(existingProjectContent);
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
      author: developerName,
      ide
    });
    
    // Show success with logo (includes initialization message and all details)
    logger.displayInitSuccess(projectName, targetDir, join(targetDir, options.specsName));
    
  } catch (error) {
    logger.displayError('Initialization Failed', error instanceof Error ? error.message : 'Unknown error');
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