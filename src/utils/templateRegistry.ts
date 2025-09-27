export interface Template {
  name: string;
  language: string;
  framework?: string;
  description: string;
  files: string[];
}

export class TemplateRegistry {
  private templates: Template[] = [
    // TypeScript Templates
    {
      name: 'generic',
      language: 'typescript',
      description: 'Basic TypeScript project structure',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'react',
      language: 'typescript',
      framework: 'react',
      description: 'React application with modern tooling',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'express',
      language: 'typescript',
      framework: 'express',
      description: 'REST API server setup',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'next',
      language: 'typescript',
      framework: 'next',
      description: 'Next.js full-stack application',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'cli',
      language: 'typescript',
      framework: 'cli',
      description: 'Command-line tool development',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    
    // Python Templates
    {
      name: 'generic',
      language: 'python',
      description: 'Basic Python project structure',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'fastapi',
      language: 'python',
      framework: 'fastapi',
      description: 'Modern API development',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'django',
      language: 'python',
      framework: 'django',
      description: 'Web application framework',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'data-science',
      language: 'python',
      framework: 'data-science',
      description: 'Jupyter, pandas, scikit-learn setup',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    
    // Java Templates
    {
      name: 'generic',
      language: 'java',
      description: 'Maven/Gradle project structure',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    },
    {
      name: 'spring-boot',
      language: 'java',
      framework: 'spring-boot',
      description: 'Microservices development',
      files: ['project.yaml', 'architecture.md', 'requirements.md', 'api.yaml', 'tests.md', 'tasks.md', 'context.md', 'prompts.md', 'docs.md']
    }
  ];
  
  async getTemplates(language?: string): Promise<Template[]> {
    if (language) {
      return this.templates.filter(t => t.language === language);
    }
    return this.templates;
  }
  
  async getTemplate(language: string, framework?: string): Promise<Template | undefined> {
    return this.templates.find(t => 
      t.language === language && 
      (framework ? t.framework === framework : !t.framework || t.name === 'generic')
    );
  }
  
  async addTemplate(template: Template): Promise<void> {
    this.templates.push(template);
  }
}