import { Logger } from '../utils/logger';

export interface ListOptions {
  lang?: string;
  verbose: boolean;
}

/** Static catalog of supported templates. All produce the same .specs/ file structure. */
const TEMPLATES = [
  // TypeScript
  { name: 'generic',      language: 'typescript', framework: undefined,       description: 'Basic TypeScript project structure',      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'react',        language: 'typescript', framework: 'react',         description: 'React application with modern tooling',    files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'express',      language: 'typescript', framework: 'express',       description: 'REST API server setup',                   files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'next',         language: 'typescript', framework: 'next',          description: 'Next.js full-stack application',           files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'cli',          language: 'typescript', framework: 'cli',           description: 'Command-line tool development',            files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  // Python
  { name: 'generic',      language: 'python',     framework: undefined,       description: 'Basic Python project structure',           files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'fastapi',      language: 'python',     framework: 'fastapi',       description: 'Modern API development',                  files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'django',       language: 'python',     framework: 'django',        description: 'Web application framework',               files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'data-science', language: 'python',     framework: 'data-science',  description: 'Jupyter, pandas, scikit-learn setup',     files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  // JavaScript
  { name: 'generic',      language: 'javascript', framework: undefined,       description: 'Basic JavaScript project structure',      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'react',        language: 'javascript', framework: 'react',         description: 'React application',                       files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  // Java
  { name: 'generic',      language: 'java',       framework: undefined,       description: 'Basic Java project structure',            files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
  { name: 'spring-boot',  language: 'java',       framework: 'spring-boot',   description: 'Spring Boot application',                 files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md'] },
];

export async function listCommand(options: ListOptions) {
  const logger = new Logger();

  try {
    const templates = options.lang
      ? TEMPLATES.filter(t => t.language === options.lang)
      : [...TEMPLATES];

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