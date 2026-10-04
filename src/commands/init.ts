import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import { getFrameworksForLanguage } from '../utils/frameworks';
import { TemplateEngine } from '../utils/templateEngine';
import { keepReport, SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';
import { CODEX_PROMPTS_NOTICE } from '../utils/slashCommandGenerator';
import {
  API_PARADIGM_CHOICES, API_PARADIGM_MESSAGE, FRAMEWORK_MESSAGE, handleMessage, IDE_CHOICES, IDE_MESSAGE, PROJECT_TYPE_MESSAGE, SUPPORTED_LANGUAGES,
} from '../utils/addSpecsQuestions';
import { CONTEXT_QUESTIONS, INIT_PROJECT_TYPE_CHOICES, initOptions, projectNameError } from '../utils/initQuestions';

export interface InitOptions {
  lang: string;
  framework?: string;
  dir: string;
  specsName: string;
  prompts: boolean;
  dryRun?: boolean;
}

export async function initCommand(name: string, options: InitOptions) {
  const logger = new Logger();
  
  try {
    // Validate project name (required, npm's length limit, allowlist: the shared rule, BL-075)
    const projectName = (name || '').trim();
    const nameProblem = projectNameError(projectName);
    if (nameProblem) {
      logger.displayError('Invalid Project Name', nameProblem.message + (nameProblem.hint ? `\n\n${nameProblem.hint}` : ''));
      process.exit(1);
    }

    // Validate supported language
    if (!SUPPORTED_LANGUAGES.includes(options.lang)) {
      logger.displayError('Unsupported Language', `Language "${options.lang}" is not supported\n\n💡 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
      process.exit(1);
    }
    
    // Dry-run: list files that would be created without writing them
    if (options.dryRun) {
      const targetDir = resolve(options.dir, projectName);
      const specsName = options.specsName;
      const specsDir = join(targetDir, specsName);
      const ideDir = '.vscode'; // default for dry-run (IDE is chosen interactively)

      const entries: string[] = [
        targetDir + '/',
        specsDir + '/',
        join(specsDir, 'README.md'),
        join(specsDir, 'project') + '/',
        join(specsDir, 'project', 'project.yaml'),
        join(specsDir, 'project', 'requirements.md'),
        join(specsDir, 'architecture') + '/',
        join(specsDir, 'architecture', 'architecture.md'),
        join(specsDir, 'architecture', 'api.yaml'),
        join(specsDir, 'planning') + '/',
        join(specsDir, 'planning', 'tasks.md'),
        join(specsDir, 'planning', 'roadmap.md'),
        join(specsDir, 'quality') + '/',
        join(specsDir, 'quality', 'tests.md'),
        join(specsDir, 'development') + '/',
        join(specsDir, 'development', 'context.md'),
        join(specsDir, 'development', 'prompts.md'),
        join(specsDir, 'development', 'onboarding.md'),
        join(specsDir, 'security') + '/',
        join(specsDir, 'security', 'threat-model.md'),
        join(specsDir, 'security', 'security-decisions.md'),
        join(targetDir, ideDir) + '/',
        join(targetDir, ideDir, 'settings.json'),
        join(targetDir, ideDir, 'extensions.json'),
        join(targetDir, '.github') + '/',
        join(targetDir, '.github', 'copilot-instructions.md') + '  (or IDE-native equivalent)',
      ];

      const content = [
        chalk.blue('🚀 Dry run — no files will be written'),
        '',
        chalk.blue.bold('Files that would be created:'),
        '',
        ...entries.map(e => chalk.white('  ' + e)),
        '',
        chalk.gray(`(${entries.filter(e => !e.endsWith('/')).length} files, ${entries.filter(e => e.endsWith('/')).length} directories)`),
        '',
        chalk.cyan(`💡 Run without --dry-run to create these files.`),
      ];
      logger.displayWithLogo(content);
      return;
    }

    // Print a simple header before interactive prompts (logo appears once at end via displayInitTree)
    if (options.prompts) {
      console.log('');
      console.log(chalk.blue.bold('🚀 Initializing SDD project...'));
      console.log(chalk.white(`   Project: ${projectName}  ·  Language: ${options.lang}`));
      console.log('');
    }

    // Get project type (greenfield vs brownfield)
    let projectType: 'greenfield' | 'brownfield' = 'greenfield';
    if (options.prompts) {
      const typeResponse = await inquirer.prompt([{
        type: 'list',
        name: 'projectType',
        message: PROJECT_TYPE_MESSAGE,
        choices: INIT_PROJECT_TYPE_CHOICES,
      }]);
      projectType = typeResponse.projectType;
    }

    // Get framework if not provided and prompts enabled
    let framework = options.framework;
    if (!framework && options.prompts) {
      const frameworks = getFrameworksForLanguage(options.lang);
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
    let developerName = osUsername;
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
    
    // Project context questions (helps AI generate better specs); an empty answer becomes NOT_SPECIFIED in initOptions()
    let projectContext = { whatItDoes: '', targetUsers: '', expectedScale: '', constraints: '' };

    if (options.prompts) {
      console.log('');
      console.log(chalk.blue.bold('📋 Project Context') + chalk.gray(' (helps AI generate better specs)'));
      console.log('');

      // Mandatory question — re-prompt if empty
      const [required, ...optional] = CONTEXT_QUESTIONS;
      let whatItDoes = '';
      while (!whatItDoes.trim()) {
        const descResponse = await inquirer.prompt([{
          type: 'input',
          name: required.key,
          message: required.message,
        }]);
        whatItDoes = descResponse.whatItDoes.trim();
        if (!whatItDoes) {
          console.log(chalk.yellow('  This is required — a brief sentence about what the project does.'));
        }
      }

      // Optional questions — Enter to skip
      const optionalResponse = await inquirer.prompt(optional.map(q => ({
        type: 'input' as const,
        name: q.key,
        message: q.message,
        default: '',
        filter: (val: string) => val.trim(),
      })));

      projectContext = { whatItDoes, targetUsers: optionalResponse.targetUsers, expectedScale: optionalResponse.expectedScale, constraints: optionalResponse.constraints };
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
        } catch {
          projectInfo += '\n\n⚠️ Could not read project.yaml';
        }
      }
      
      if (existsSync(requirementsMdPath)) {
        try {
          const requirementsContent = readFileSync(requirementsMdPath, 'utf8');
          const lines = requirementsContent.split('\n').slice(0, 5); // First 5 lines
          projectInfo += `\n\n📝 Requirements Preview:\n${lines.map(line => `  ${line}`).join('\n')}`;
        } catch {
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
    const result = await specGenerator.generateSpecs(
      initOptions(targetDir, projectName, { language: options.lang, framework, projectType, apiParadigm, handle: developerName, ide, ...projectContext }, options.specsName),
    );
    const { onboardingPrompt } = result;
    if (ide.toLowerCase() === 'codex') console.log(CODEX_PROMPTS_NOTICE);

    // Show success with logo (includes initialization message and generated file tree)
    logger.displayInitTree(projectName, targetDir, join(targetDir, options.specsName));
    keepReport(result).forEach(line => logger.info(line));

    // Pause so the file tree isn't scrolled away instantly by the next-steps text
    if (options.prompts) {
      console.log('');
      await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: chalk.gray('Press Enter to continue...'),
      }]);
    }

    logger.displayInitNextSteps();

    // Pause so the success screen isn't scrolled away instantly by the onboarding dump
    if (options.prompts) {
      console.log('');
      await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: chalk.gray('Press Enter to see your onboarding prompt...'),
      }]);
    }

    // Print onboarding prompt to stdout for immediate use
    const specsRelPath = join(options.specsName, 'development', 'onboarding.md');
    console.log('');
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    console.log(chalk.bold.cyan('📋 NEXT STEP: Populate your .specs/ files'));
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    console.log(chalk.white('Paste this prompt into your AI agent:'));
    console.log('');
    console.log(chalk.gray(onboardingPrompt));
    console.log('');
    console.log(chalk.cyan(`💡 Also saved to ${specsRelPath} — delete it after first use.`));
    console.log(chalk.bold.cyan('──────────────────────────────────────────────────'));
    
  } catch (error) {
    logger.displayError('Initialization Failed', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
