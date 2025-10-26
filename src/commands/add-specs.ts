import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectDetector } from '../utils/projectDetector';
import { CodeAnalyzer } from '../utils/codeAnalyzer';
import { TemplateEngine } from '../utils/templateEngine';
import { SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';

export interface AddSpecsOptions {
  lang?: string;
  framework?: string;
  noAnalysis: boolean;
  deepAnalysis: boolean;
  prompts: boolean;
}

export async function addSpecsCommand(options: AddSpecsOptions) {
  const logger = new Logger();
  
  try {
    logger.info('🔍 Analyzing existing project...');
    
    const projectDir = process.cwd();
    const specsDir = join(projectDir, '.specs');
    
    // Check if .specs already exists
    if (existsSync(specsDir)) {
      logger.error('❌ .specs folder already exists in this directory');
      logger.info('💡 Use `specpilot validate` to check existing specs');
      process.exit(1);
    }
    
    // Detect project information
    const detector = new ProjectDetector();
    let projectInfo = await detector.detectProject(projectDir);
    
    if (!projectInfo && !options.lang) {
      logger.error('❌ Could not auto-detect project type');
      logger.info('💡 Please specify language: --lang typescript or --lang python');
      process.exit(1);
    }
    
    // Use provided options or detected values
    const language = options.lang || projectInfo?.language || 'typescript';
    let framework = options.framework || projectInfo?.framework;
    
    // Validate language
    const supportedLanguages = ['typescript', 'javascript', 'python'];
    if (!supportedLanguages.includes(language)) {
      logger.error(`❌ Language "${language}" is not supported`);
      logger.info(`💡 Supported languages: ${supportedLanguages.join(', ')}`);
      process.exit(1);
    }
    
    // Prompt for missing information
    if (!framework && options.prompts) {
      const frameworks = getFrameworksForLanguage(language);
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
    
    // Get developer name
    let developerName = projectInfo?.author || 'Your Name';
    if (options.prompts) {
      const nameResponse = await inquirer.prompt([{
        type: 'input',
        name: 'developerName',
        message: 'Enter your name (for spec file attribution):',
        default: developerName
      }]);
      developerName = nameResponse.developerName.trim() || developerName;
    }
    
    // Analyze codebase if requested
    let analysis = null;
    if (!options.noAnalysis) {
      logger.info('📊 Analyzing codebase...');
      const analyzer = new CodeAnalyzer();
      analysis = await analyzer.analyzeCodebase(projectDir);
      
      // Show analysis summary
      if (projectInfo) {
        logger.info(chalk.green(`✅ Detected ${projectInfo.language}${projectInfo.framework ? `/${projectInfo.framework}` : ''} project`));
      }
      
      if (analysis.todos.length > 0) {
        logger.info(chalk.yellow(`📝 Found ${analysis.todos.length} TODOs/FIXMEs`));
      }
      
      if (analysis.tests.testCount > 0) {
        logger.info(chalk.cyan(`🧪 Detected ${analysis.tests.framework || 'unknown'} testing framework with ${analysis.tests.testCount} tests`));
      }
      
      if (analysis.architecture.components.length > 0) {
        logger.info(chalk.blue(`🏗️  Extracted ${analysis.architecture.components.length} components`));
      }
    }
    
    // Initialize template engine and spec generator
    const templateEngine = new TemplateEngine();
    const specGenerator = new SpecGenerator(templateEngine);
    
    // Generate .specs directory structure
    const projectName = projectInfo?.name || 'my-project';
    const description = projectInfo?.description || 
      `A ${language} project${framework ? ` using ${framework}` : ''}`;
    
    await specGenerator.generateSpecs({
      projectName,
      language,
      framework,
      targetDir: projectDir,
      specsName: '.specs',
      author: developerName,
      description,
      analysis: (!options.noAnalysis && analysis) ? analysis : undefined
    });
    
    logger.success('✅ .specs folder created successfully!');
    logger.info(`📁 Location: ${specsDir}`);
    
    // Show next steps
    console.log(chalk.cyan(`
🚀 Next steps to populate your specs with AI:
1. Open .specs/README.md for full guidance
2. Copy the onboarding prompt from .specs/development/prompts.md
3. Paste into your AI agent and run it
4. Review the generated spec files

Your project is now ready for AI-assisted development!`));
    
  } catch (error) {
    logger.error(`❌ Failed to add specs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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


