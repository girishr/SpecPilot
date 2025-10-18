import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TemplateContext {
  projectName: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  architecture?: {
    components: string[];
    directories: string; // Changed from string[]
    fileTypes: Record<string, number>;
  };
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
    Handlebars.registerHelper('lowercase', (str: string) => str.slice(1));
    Handlebars.registerHelper('capitalize', (str: string) => 
      str.charAt(0).toUpperCase() + str.slice(1)
    );
    Handlebars.registerHelper('currentDate', () => new Date().toISOString().split('T')[0]);
    Handlebars.registerHelper('currentYear', () => new Date().getFullYear());
    Handlebars.registerHelper('join', (array: string[], separator: string) => 
      Array.isArray(array) ? array.join(separator) : ''
    );
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
      'javascript-project.yaml': this.getProjectYamlTemplate('javascript'),
      'python-project.yaml': this.getProjectYamlTemplate('python'),
      
      // Architecture templates
      'typescript-architecture.md': this.getArchitectureTemplate('typescript'),
      'javascript-architecture.md': this.getArchitectureTemplate('javascript'),
      'python-architecture.md': this.getArchitectureTemplate('python'),
      
      // Framework-specific variations
      'typescript-react-project.yaml': this.getProjectYamlTemplate('typescript', 'react'),
      'typescript-express-project.yaml': this.getProjectYamlTemplate('typescript', 'express'),
      'javascript-react-project.yaml': this.getProjectYamlTemplate('javascript', 'react'),
      'javascript-express-project.yaml': this.getProjectYamlTemplate('javascript', 'express'),
      'python-django-project.yaml': this.getProjectYamlTemplate('python', 'django'),
      'python-fastapi-project.yaml': this.getProjectYamlTemplate('python', 'fastapi'),
    };

    if (templates[key]) {
      return templates[key];
    }

    // Fallback: if framework-specific template missing, try language-only template for same file
    const parts = key.split('-');
    if (parts.length >= 3) {
      const altKey = `${parts[0]}-${parts.slice(2).join('-')}`; // drop framework
      if (templates[altKey]) {
        return templates[altKey];
      }
    }

    return '';
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
  - "MANDATE: Update .specs/ folder files with every development milestone and code change"
  - "MANDATE: Maintain .specs/ as single source of truth for all project specifications"
  - "MANDATE: Review and update relevant .specs/ files before each commit"
  - "MANDATE: Document decisions, lessons learned, and context in .specs/context.md"
  - "MANDATE: Update .specs/prompts.md with ALL AI interactions and development prompts by default"
  - "MANDATE: Maintain chronological prompt history for complete development traceability"
  - "MANDATE: Keep file metadata and footer sections current (dates, counts, status summaries)"
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
  ${language === 'javascript' ? 'command: "npm start"' : ''}
  ${language === 'python' ? 'command: "python -m build"' : ''}

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
    
    if (language === 'javascript' && framework === 'react') {
      return `dependencies:
  runtime:
    - "react"
    - "react-dom"
  development:
    - "vite"`;
    }
    
    if (language === 'javascript' && framework === 'express') {
      return `dependencies:
  runtime:
    - "express"
    - "cors"
    - "helmet"
  development:
    - "nodemon"`;
    }
    
    return `dependencies:
  runtime: []
  development: []`;
  }
  
  private getArchitectureTemplate(language: string): string {
    return `---
title: Architecture
project: {{projectName}}
language: ${language}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Architecture

## Overview
This document outlines the architecture and design decisions for {{projectName}}, a ${language} application.

## Architecture Patterns
- **Language**: ${language}
- **Architecture Style**: [Specify: MVC, Microservices, Layered, etc.]
- **Data Flow**: [Specify: Unidirectional, Event-driven, etc.]

## Core Components

### Application Structure
{{#if architecture}}
{{#if architecture.directories}}
Based on analysis of the project structure:
\`\`\`
{{architecture.directories}}
\`\`\`

{{#if architecture.components}}
**Components found**: {{join architecture.components ", "}}
{{/if}}

{{#if architecture.fileTypes}}
**File types in project**:
{{#each architecture.fileTypes}}
- {{@key}}: {{this}} files
{{/each}}
{{/if}}
{{else}}
*Project structure analysis not available. Replace the placeholder below with your actual application structure.*

\`\`\`text
[ADD YOUR APPLICATION STRUCTURE TREE HERE]
\`\`\`
{{/if}}
{{else}}
*No architecture analysis available. This template was generated without project analysis.*

**Application structure placeholder:**
\`\`\`text
[ADD YOUR APPLICATION STRUCTURE TREE HERE]
\`\`\`

*Replace the placeholder with the directories and files that represent your real application structure. Include annotations for responsibilities when helpful.*
{{/if}}

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