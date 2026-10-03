import { join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectDetector } from '../utils/projectDetector';
import { getFrameworksForLanguage } from '../utils/frameworks';
import { CodeAnalyzer } from '../utils/codeAnalyzer';
import { TemplateEngine } from '../utils/templateEngine';
import { keepReport, SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';
import { CODEX_PROMPTS_NOTICE } from '../utils/slashCommandGenerator';
import {
  addSpecsOptions, API_PARADIGM_CHOICES, API_PARADIGM_MESSAGE, detectedLine, FRAMEWORK_MESSAGE, handleMessage, IDE_CHOICES, IDE_MESSAGE,
  PROJECT_TYPE_CHOICES, PROJECT_TYPE_MESSAGE, SUPPORTED_LANGUAGES,
} from '../utils/addSpecsQuestions';

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
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      logger.error(`❌ Language "${language}" is not supported`);
      logger.info(`💡 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
      process.exit(1);
    }
    
    // Get project type (greenfield vs brownfield)
    let projectType: 'greenfield' | 'brownfield' = 'brownfield';
    if (options.prompts) {
      const typeResponse = await inquirer.prompt([{
        type: 'list',
        name: 'projectType',
        message: PROJECT_TYPE_MESSAGE,
        choices: PROJECT_TYPE_CHOICES,
      }]);
      projectType = typeResponse.projectType;
    }

    // Prompt for missing information
    if (!framework && options.prompts) {
      const frameworks = getFrameworksForLanguage(language);
      if (frameworks.length > 0) {
        const response = await inquirer.prompt([{
          type: 'list',
          name: 'framework',
          message: FRAMEWORK_MESSAGE,
          choices: ['none', ...frameworks]
        }]);
        framework = response.framework === 'none' ? undefined : response.framework;
      }
    }
    
    // Get API paradigm
    let apiParadigm: 'rest' | 'cli' | 'graphql' | 'none' | undefined;
    if (options.prompts) {
      const paradigmResponse = await inquirer.prompt([{
        type: 'list',
        name: 'apiParadigm',
        message: API_PARADIGM_MESSAGE,
        choices: API_PARADIGM_CHOICES,
      }]);
      apiParadigm = paradigmResponse.apiParadigm;
    }

    // Get short handle for task/prompt ID namespacing (mandatory when prompts enabled)
    const osUsername = os.userInfo().username;
    let developerName = projectInfo?.author || osUsername;
    if (options.prompts) {
      let handle = '';
      while (!handle) {
        const nameResponse = await inquirer.prompt([{
          type: 'input',
          name: 'developerName',
          message: handleMessage(osUsername),
        }]);
        handle = nameResponse.developerName.trim();
        if (!handle) handle = osUsername;
      }
      developerName = handle;
    }
    
    // Get IDE/Agent preference for context configuration
    let ide = 'vscode'; // default
    if (options.prompts) {
      const ideResponse = await inquirer.prompt([{
        type: 'list',
        name: 'ide',
        message: IDE_MESSAGE,
        choices: IDE_CHOICES,
      }]);
      ide = ideResponse.ide;
    }
    
    // Analyze codebase if requested
    let analysis = null;
    if (!options.noAnalysis) {
      logger.info('📊 Analyzing codebase...');
      const analyzer = new CodeAnalyzer();
      analysis = await analyzer.analyzeCodebase(projectDir);
      
      // Show analysis summary
      if (projectInfo) {
        logger.info(chalk.green(detectedLine(projectInfo)));
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
    
    // Generate .specs directory structure (the options builder is shared with `specpilot serve`, BL-055)
    const result = await specGenerator.generateSpecs(
      addSpecsOptions(projectDir, projectInfo, { language, framework, projectType, apiParadigm, handle: developerName, ide }, analysis),
    );
    const { onboardingPrompt } = result;
    if (ide.toLowerCase() === 'codex') console.log(CODEX_PROMPTS_NOTICE);

    logger.success('✅ .specs folder created successfully!');
    keepReport(result).forEach(line => logger.info(line));
    logger.info(`📁 Location: ${specsDir}`);

    // Show next steps with logo
    logger.displayInitTree(projectInfo?.name || 'Project', projectDir, specsDir);
    logger.displayInitNextSteps();

    // Print onboarding prompt to stdout for immediate use
    console.log('');
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    console.log(chalk.bold.cyan('📋 NEXT STEP: Populate your .specs/ files'));
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    console.log(chalk.white('Paste this prompt into your AI agent:'));
    console.log('');
    console.log(chalk.gray(onboardingPrompt));
    console.log('');
    console.log(chalk.cyan('💡 Also saved to .specs/development/onboarding.md — delete it after first use.'));
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    
  } catch (error) {
    logger.error(`❌ Failed to add specs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}



