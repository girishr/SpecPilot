import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import { getFrameworksForLanguage } from '../utils/frameworks';
import { TemplateEngine } from '../utils/templateEngine';
import { SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';

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
    // Validate project name
    if (!name || name.trim() === '') {
      logger.displayError('Invalid Project Name', 'Project name is required and cannot be empty\n\n💡 Usage: specpilot init <project-name>');
      process.exit(1);
    }
    
    const projectName = name.trim();
    
    // Validate project name length (npm limit)
    if (projectName.length > 214) {
      logger.displayError('Invalid Project Name', 'Project name must be 214 characters or fewer');
      process.exit(1);
    }

    // Validate project name with allowlist (prevents filesystem issues and Handlebars template injection)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(projectName)) {
      logger.displayError('Invalid Project Name', 'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores\n\n💡 Example: my-project, app_v2, project.name');
      process.exit(1);
    }
    
    // Validate supported language
    const supportedLanguages = ['typescript', 'javascript', 'python'];
    if (!supportedLanguages.includes(options.lang)) {
      logger.displayError('Unsupported Language', `Language "${options.lang}" is not supported\n\n💡 Supported languages: ${supportedLanguages.join(', ')}`);
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
        join(specsDir, 'development', 'docs.md'),
        join(specsDir, 'development', 'context.md'),
        join(specsDir, 'development', 'prompts.md'),
        join(specsDir, 'security') + '/',
        join(specsDir, 'security', 'threat-model.md'),
        join(specsDir, 'security', 'security-decisions.md'),
        join(targetDir, ideDir) + '/',
        join(targetDir, ideDir, 'settings.json'),
        join(targetDir, ideDir, 'extensions.json'),
        join(targetDir, '.github') + '/',
        join(targetDir, '.github', 'copilot-instructions.md'),
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
    
    // Get short handle for task/prompt ID namespacing (mandatory when prompts enabled)
    const osUsername = os.userInfo().username;
    let developerName = osUsername;
    if (options.prompts) {
      let handle = '';
      while (!handle) {
        const nameResponse = await inquirer.prompt([{
          type: 'input',
          name: 'developerName',
          message: `Your short handle is used as a prefix in task IDs (e.g. CD-jsmith-001) and prompt IDs\n  (e.g. PROMPT-jsmith-001) to avoid collisions when multiple devs share the same spec files.\n  Use your GitHub, GitLab, or Bitbucket username, or any short tag of your choice [${osUsername}]:`,
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
        message: 'Select your AI IDE/Agent for SpecPilot context:',
        choices: ['vscode', 'Cursor', 'Windsurf', 'Antigravity', 'Cowork', 'Codex']
      }]);
      ide = ideResponse.ide;
    }
    
    // Project context questions (helps AI generate better specs)
    const NOT_SPECIFIED = 'Not specified — use your judgment and mark as [ASSUMPTION]';
    let projectContext = {
      whatItDoes: NOT_SPECIFIED,
      targetUsers: NOT_SPECIFIED,
      expectedScale: NOT_SPECIFIED,
      constraints: NOT_SPECIFIED,
    };
    
    if (options.prompts) {
      console.log('');
      console.log(chalk.blue.bold('📋 Project Context') + chalk.gray(' (helps AI generate better specs)'));
      console.log('');
      
      // Mandatory question — re-prompt if empty
      let whatItDoes = '';
      while (!whatItDoes.trim()) {
        const descResponse = await inquirer.prompt([{
          type: 'input',
          name: 'whatItDoes',
          message: 'What does your project do? (required):',
        }]);
        whatItDoes = descResponse.whatItDoes.trim();
        if (!whatItDoes) {
          console.log(chalk.yellow('  This is required — a brief sentence about what the project does.'));
        }
      }
      
      // Optional questions — Enter to skip
      const optionalResponse = await inquirer.prompt([
        {
          type: 'input',
          name: 'targetUsers',
          message: 'Who are the target users? (Enter to skip):',
          default: '',
          filter: (val: string) => val.trim(),
        },
        {
          type: 'input',
          name: 'expectedScale',
          message: 'What\'s the expected scale? (Enter to skip):',
          default: '',
          filter: (val: string) => val.trim(),
        },
        {
          type: 'input',
          name: 'constraints',
          message: 'Any key constraints or requirements? (Enter to skip):',
          default: '',
          filter: (val: string) => val.trim(),
        },
      ]);
      
      projectContext = {
        whatItDoes,
        targetUsers: optionalResponse.targetUsers || NOT_SPECIFIED,
        expectedScale: optionalResponse.expectedScale || NOT_SPECIFIED,
        constraints: optionalResponse.constraints || NOT_SPECIFIED,
      };
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
    await specGenerator.generateSpecs({
      projectName,
      language: options.lang,
      framework,
      targetDir,
      specsName: options.specsName,
      author: developerName,
      ide,
      mode: 'new',
      projectContext,
    });
    
    // Show success with logo (includes initialization message and all details)
    logger.displayInitSuccess(projectName, targetDir, join(targetDir, options.specsName));
    
  } catch (error) {
    logger.displayError('Initialization Failed', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
