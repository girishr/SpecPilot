import * as Handlebars from 'handlebars';

export interface ProjectContext {
  whatItDoes: string;
  targetUsers: string;
  expectedScale: string;
  constraints: string;
}

export interface TemplateContext {
  projectName: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  ide?: string;
  mode?: 'new' | 'existing';
  projectType?: 'greenfield' | 'brownfield';
  projectContext?: ProjectContext;
  architecture?: {
    components: string[];
    directories: string; // Changed from string[]
    fileTypes: Record<string, number>;
  };
  [key: string]: any;
}

export class TemplateEngine {
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
    Handlebars.registerHelper('join', (array: string[], separator: string) => 
      Array.isArray(array) ? array.join(separator) : ''
    );
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
      'kotlin-project.yaml': this.getProjectYamlTemplate('kotlin'),
      'swift-project.yaml': this.getProjectYamlTemplate('swift'),
      
      // Architecture templates
      'typescript-architecture.md': this.getArchitectureTemplate('typescript'),
      'javascript-architecture.md': this.getArchitectureTemplate('javascript'),
      'python-architecture.md': this.getArchitectureTemplate('python'),
      'kotlin-architecture.md': this.getArchitectureTemplate('kotlin'),
      'swift-architecture.md': this.getArchitectureTemplate('swift'),
      
      // Framework-specific variations
      'typescript-react-project.yaml': this.getProjectYamlTemplate('typescript', 'react'),
      'typescript-express-project.yaml': this.getProjectYamlTemplate('typescript', 'express'),
      'javascript-react-project.yaml': this.getProjectYamlTemplate('javascript', 'react'),
      'javascript-express-project.yaml': this.getProjectYamlTemplate('javascript', 'express'),
      'python-django-project.yaml': this.getProjectYamlTemplate('python', 'django'),
      'python-fastapi-project.yaml': this.getProjectYamlTemplate('python', 'fastapi'),
      'kotlin-android-project.yaml': this.getProjectYamlTemplate('kotlin', 'android'),
      'kotlin-spring-project.yaml': this.getProjectYamlTemplate('kotlin', 'spring'),
      'kotlin-ktor-project.yaml': this.getProjectYamlTemplate('kotlin', 'ktor'),
      'kotlin-compose-project.yaml': this.getProjectYamlTemplate('kotlin', 'compose'),
      'swift-ios-project.yaml': this.getProjectYamlTemplate('swift', 'ios'),
      'swift-swiftui-project.yaml': this.getProjectYamlTemplate('swift', 'swiftui'),
      'swift-vapor-project.yaml': this.getProjectYamlTemplate('swift', 'vapor'),
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

# Rules and mandates: see your AI agent configuration file (single source of truth)

# Team Guidelines
team:
  devPrefix: "{{author}}"
  code_review_required: true
  testing_required: true
  documentation_required: true
  
# Build and Deployment
build:
  ${language === 'typescript' ? 'command: "npm run build"' : ''}
  ${language === 'javascript' ? 'command: "npm start"' : ''}
  ${language === 'python' ? 'command: "python -m build"' : ''}
  ${language === 'kotlin' ? 'command: "./gradlew build"' : ''}
  ${language === 'swift' ? 'command: "swift build"' : ''}

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

    if (language === 'kotlin' && framework === 'android') {
      return `dependencies:
  runtime:
    - "androidx.core:core-ktx"
    - "androidx.appcompat:appcompat"
    - "com.google.android.material:material"
  development:
    - "junit:junit"
    - "androidx.test.ext:junit"`;
    }

    if (language === 'kotlin' && framework === 'spring') {
      return `dependencies:
  runtime:
    - "org.springframework.boot:spring-boot-starter-web"
    - "org.springframework.boot:spring-boot-starter-data-jpa"
    - "com.fasterxml.jackson.module:jackson-module-kotlin"
  development:
    - "org.springframework.boot:spring-boot-starter-test"`;
    }

    if (language === 'kotlin' && framework === 'ktor') {
      return `dependencies:
  runtime:
    - "io.ktor:ktor-server-core"
    - "io.ktor:ktor-server-netty"
    - "io.ktor:ktor-server-content-negotiation"
  development:
    - "io.ktor:ktor-server-test-host"
    - "org.jetbrains.kotlin:kotlin-test-junit"`;
    }

    if (language === 'kotlin' && framework === 'compose') {
      return `dependencies:
  runtime:
    - "androidx.compose.ui:ui"
    - "androidx.compose.material3:material3"
    - "androidx.activity:activity-compose"
  development:
    - "androidx.compose.ui:ui-test-junit4"`;
    }

    if (language === 'swift' && framework === 'vapor') {
      return `dependencies:
  runtime:
    - "vapor/vapor"
    - "vapor/fluent"
    - "vapor/fluent-sqlite-driver"
  development: []`;
    }

    if (language === 'swift') {
      return `dependencies:
  runtime: []
  development: []`;
    }
    
    return `dependencies:
  runtime: []
  development: []`;
  }
  
  private getArchitectureTemplate(language: string): string {
    return `---
title: Architecture
description: System design, components, data flow, and architecture decisions
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

## Assumptions

> Label each assumption with [ASSUMPTION] so it can be reviewed and revised.

- [ASSUMPTION] [e.g. Single-region deployment; no multi-region failover required]
- [ASSUMPTION] [e.g. No backward-compatibility constraints with legacy systems]
- [ASSUMPTION] [e.g. Runtime environment is controlled; no adversarial input at infrastructure level]

---
*Last updated: {{currentDate}}*`;
  }
}