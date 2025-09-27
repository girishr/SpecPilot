import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TemplateContext {
  projectName: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  [key: string]: any;
}

export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  
  constructor() {
    this.registerHelpers();
  }
  
  private registerHelpers(): void {
    // Register custom Handlebars helpers
    Handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
    Handlebars.registerHelper('lowercase', (str: string) => str.toLowerCase());
    Handlebars.registerHelper('capitalize', (str: string) => 
      str.charAt(0).toUpperCase() + str.slice(1)
    );
    Handlebars.registerHelper('currentDate', () => new Date().toISOString().split('T')[0]);
    Handlebars.registerHelper('currentYear', () => new Date().getFullYear());
  }
  
  loadTemplate(templatePath: string, name: string): void {
    try {
      const content = readFileSync(templatePath, 'utf-8');
      const compiled = Handlebars.compile(content);
      this.templates.set(name, compiled);
    } catch (error) {
      throw new Error(`Failed to load template ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  render(templateName: string, context: TemplateContext): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    return template(context);
  }
  
  renderFromString(templateString: string, context: TemplateContext): string {
    const template = Handlebars.compile(templateString);
    return template(context);
  }
  
  getBuiltinTemplate(language: string, framework: string | undefined, fileName: string): string {
    const key = framework ? `${language}-${framework}-${fileName}` : `${language}-${fileName}`;
    return this.getBuiltinTemplateContent(key);
  }
  
  private getBuiltinTemplateContent(key: string): string {
    // Built-in template content based on our learnings
    const templates: Record<string, string> = {
      // Project.yaml templates
      'typescript-project.yaml': this.getProjectYamlTemplate('typescript'),
      'python-project.yaml': this.getProjectYamlTemplate('python'),
      'java-project.yaml': this.getProjectYamlTemplate('java'),
      
      // Architecture templates
      'typescript-architecture.md': this.getArchitectureTemplate('typescript'),
      'python-architecture.md': this.getArchitectureTemplate('python'),
      'java-architecture.md': this.getArchitectureTemplate('java'),
      
      // Framework-specific variations
      'typescript-react-project.yaml': this.getProjectYamlTemplate('typescript', 'react'),
      'typescript-express-project.yaml': this.getProjectYamlTemplate('typescript', 'express'),
      'python-django-project.yaml': this.getProjectYamlTemplate('python', 'django'),
      'python-fastapi-project.yaml': this.getProjectYamlTemplate('python', 'fastapi'),
    };
    
    return templates[key] || templates[key.split('-').slice(0, -1).join('-') + '-project.yaml'] || '';
  }
  
  private getProjectYamlTemplate(language: string, framework?: string): string {
    return `# {{projectName}} - SDD Project Configuration
name: {{projectName}}
version: "1.0.0"
language: ${language}
${framework ? `framework: ${framework}` : ''}
description: {{description}}

# Project Rules and AI Context
rules:
  - "Follow ${language} best practices and coding standards"
  - "Write comprehensive tests for all functionality"
  - "Document all public APIs and interfaces"
  - "MANDATE: Update .specs/prompts.md with ALL AI interactions and development prompts by default"
  - "MANDATE: Maintain chronological prompt history for complete development traceability"
  - "Use semantic versioning for releases"
  - "Keep dependencies up to date"

# Development Context for AI
ai_context:
  - "This is a specification-driven development project"
  - "All changes should be documented in appropriate .specs/ files"
  - "Follow the established architecture patterns"
  - "Maintain backwards compatibility when possible"
  
# Team Guidelines
team:
  code_review_required: true
  testing_required: true
  documentation_required: true
  
# Build and Deployment
build:
  ${language === 'typescript' ? 'command: "npm run build"' : ''}
  ${language === 'python' ? 'command: "python -m build"' : ''}
  ${language === 'java' ? 'command: "mvn package"' : ''}

# Dependencies (framework-specific)
${this.getDependencySection(language, framework)}`;
  }
  
  private getDependencySection(language: string, framework?: string): string {
    if (language === 'typescript' && framework === 'react') {
      return `dependencies:
  runtime:
    - "react"
    - "react-dom"
  development:
    - "@types/react"
    - "@types/react-dom"
    - "typescript"
    - "vite"`;
    }
    
    if (language === 'typescript' && framework === 'express') {
      return `dependencies:
  runtime:
    - "express"
    - "cors"
    - "helmet"
  development:
    - "@types/express"
    - "@types/cors"
    - "@types/helmet"
    - "typescript"
    - "ts-node"`;
    }
    
    return `dependencies:
  runtime: []
  development: []`;
  }
  
  private getArchitectureTemplate(language: string): string {
    return `# {{projectName}} Architecture

## Overview
This document outlines the architecture and design decisions for {{projectName}}, a ${language} application.

## Architecture Patterns
- **Language**: ${language}
- **Architecture Style**: [Specify: MVC, Microservices, Layered, etc.]
- **Data Flow**: [Specify: Unidirectional, Event-driven, etc.]

## Core Components

### Application Structure
\`\`\`
src/
├── components/     # Reusable components
├── services/      # Business logic
├── utils/         # Utility functions
├── types/         # Type definitions
└── tests/         # Test files
\`\`\`

## Design Decisions

### Decision 1: [Decision Title]
- **Date**: {{currentDate}}
- **Context**: [Why this decision was needed]
- **Decision**: [What was decided]
- **Consequences**: [Positive and negative impacts]

## Deployment Architecture
[Describe deployment strategy, infrastructure, and environments]

## Security Considerations
[List security measures and considerations]

## Performance Considerations
[Describe performance requirements and optimization strategies]

## Monitoring and Observability
[Describe logging, metrics, and monitoring strategy]

---
*Last updated: {{currentDate}}*`;
  }
}