import * as Handlebars from 'handlebars';

export interface ProjectContext {
  whatItDoes: string;
  targetUsers: string;
  expectedScale: string;
  constraints: string;
}

/** The optional answers of REQ-002.I.4 (BL-032, phase 2); each is rendered only when present. */
export interface OptionalFields {
  platforms?: string[];
  accessControl?: string;
  specialConsiderations?: string[];
  accessibilityNotes?: string;
  systemPattern?: string;
  activeUsers?: string;
  teamSize?: string;
  deploymentTargets?: string[];
  localDatabases?: string[];
  dataSyncStrategy?: string;
  integrations?: Record<string, string[]>;
  otherApis?: string;
  apiResponseTime?: string;
  availability?: string;
  databases?: string[];
  authStrategy?: string;
  realtimeTypes?: string[];
  compliance?: string[];
  cicd?: string[];
  securityConcerns?: string[];
  buildTimeline?: string;
  constraintDescription?: string;
  testingStrategy?: string[];
}

/** The keys of `OptionalFields`, for `render()`'s present-or-absent rule. */
export const OPTIONAL_FIELDS: (keyof OptionalFields)[] = [
  'platforms', 'accessControl', 'specialConsiderations', 'accessibilityNotes', 'systemPattern', 'activeUsers', 'teamSize',
  'deploymentTargets', 'localDatabases', 'dataSyncStrategy', 'integrations', 'otherApis', 'apiResponseTime', 'availability',
  'databases', 'authStrategy', 'realtimeTypes', 'compliance', 'cicd', 'securityConcerns', 'buildTimeline', 'constraintDescription',
  'testingStrategy',
];

export interface TemplateContext extends OptionalFields {
  projectName: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  ide?: string;
  mode?: 'new' | 'existing';
  projectType?: 'greenfield' | 'brownfield';
  apiParadigm?: 'rest' | 'cli' | 'graphql' | 'none';
  projectContext?: ProjectContext;
  /** The date every generated file carries (`YYYY-MM-DD`); set by `render()` (BL-032). */
  lastUpdated?: string;
  architecture?: {
    components: string[];
    directories: string; // Changed from string[]
    fileTypes: Record<string, number>;
  };
  [key: string]: any;
}

/** Present means: a string that is not blank, a list with an item, a map with a key (REQ-002.I.4). */
export function present(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return Boolean(value);
}

// A value YAML 1.2, or js-yaml (the reader `specpilot validate` uses), would not read back as the
// same string when written plain (REQ-002.I.5): the words, every number spelling, and timestamps.
const YAML_WORDS = /^(true|false|null|~|yes|no|on|off)$/i;
const YAML_NUMBER = /^([-+]?(\.[0-9]+|[0-9][0-9_]*(\.[0-9_]*)?)([eE][-+]?[0-9]+)?|[-+]?0[box][0-9a-fA-F_]+|[-+]?\.(inf|Inf|INF)|\.(nan|NaN|NAN))$/;
const YAML_TIMESTAMP = /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}([Tt]|[ \t]+)?([0-9]{1,2}:[0-9]{2}:[0-9]{2}(\.[0-9]*)?([ \t]*(Z|[-+][0-9]{1,2}(:[0-9]{2})?))?)?$/;

/** `value` as a YAML scalar: plain when YAML reads it back unchanged, else double-quoted and escaped. */
export function yamlScalar(value: string): string {
  const plain =
    value !== '' &&
    !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/[\n\r\t]/.test(value) &&
    !/: | #/.test(value) &&
    !/[:\s]$/.test(value) &&
    !YAML_WORDS.test(value) &&
    !YAML_NUMBER.test(value) &&
    !YAML_TIMESTAMP.test(value);
  if (plain) return value;
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
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
    // One date per render (BL-032): the context's `lastUpdated`, else today, for a bare renderFromString().
    const dateOf = (options: Handlebars.HelperOptions) => options.data?.root?.lastUpdated ?? new Date().toISOString().split('T')[0];
    Handlebars.registerHelper('currentDate', (options: Handlebars.HelperOptions) => dateOf(options));
    Handlebars.registerHelper('currentYear', (options: Handlebars.HelperOptions) => Number(dateOf(options).slice(0, 4)));
    Handlebars.registerHelper('join', (array: string[], separator: string) => 
      Array.isArray(array) ? array.join(separator) : ''
    );
    // BL-032 phase 2: `any` for a section that several optional fields share; `yaml`/`yamlList` for YAML values (REQ-002.I.5).
    Handlebars.registerHelper('any', (...args: unknown[]) => args.slice(0, -1).some(present));
    Handlebars.registerHelper('yaml', (value: unknown) => new Handlebars.SafeString(yamlScalar(String(value ?? ''))));
    Handlebars.registerHelper('yamlList', (items: unknown) =>
      new Handlebars.SafeString(Array.isArray(items) ? items.map(item => `  - ${yamlScalar(String(item))}`).join('\n') : '  []')
    );
    // Without HTML escaping (BL-PM-004b) a free value reaches YAML as typed: a handle typed at the terminal, a
    // project name detected from package.json, --lang or --framework. `dq` keeps one inside the template's double
    // quotes (`\\` and `"` escaped); `fm` quotes a front-matter value through `yamlScalar` only when it holds one of
    // the seven characters HTML escaping used to cover, so every value it never touched keeps its bytes.
    Handlebars.registerHelper('dq', (value: unknown) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
    Handlebars.registerHelper('fm', (value: unknown) => {
      const s = String(value ?? '');
      return /[&<>"'`=]/.test(s) ? yamlScalar(s) : s;
    });
  }
  
  renderFromString(templateString: string, context: TemplateContext): string {
    // No HTML escaping (BL-PM-004b): the output is Markdown and YAML, never HTML, so `< 100ms` is written as
    // typed. Values are data to Handlebars, never template source, so `{{` in an answer stays text (SEC-004.3).
    const template = Handlebars.compile(templateString, { noEscape: true });
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
name: {{yaml projectName}}
version: "1.0.0"
language: ${language}
${framework ? `framework: ${framework}` : ''}
description: {{yaml description}}

# Rules and mandates: see your AI agent configuration file (single source of truth)

# Team Guidelines
team:
  devPrefix: "{{dq author}}"
  code_review_required: true
  testing_required: true
  documentation_required: true
  
{{#if platforms}}
# Platforms
platforms:
{{yamlList platforms}}

{{/if}}
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
project: {{fm projectName}}
language: ${language}
framework: {{fm framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Architecture

## Overview
This document outlines the architecture and design decisions for {{projectName}}, a ${language} application.

## Architecture Patterns
- **Language**: ${language}
- **Architecture Style**: {{#if systemPattern}}{{systemPattern}}{{else}}[Specify: MVC, Microservices, Layered, etc.]{{/if}}
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

{{#if (any activeUsers teamSize)}}
## Scale
{{#if activeUsers}}
- Active users: {{activeUsers}}
{{/if}}
{{#if teamSize}}
- Team size: {{teamSize}}
{{/if}}

{{/if}}
{{#if deploymentTargets}}
## Deployment targets
{{#each deploymentTargets}}
- {{this}}
{{/each}}

{{/if}}
{{#if (any localDatabases dataSyncStrategy)}}
## Data layer
- **Offline support**: Yes
{{#if localDatabases}}
- **Local database(s)**: {{join localDatabases ", "}}
{{/if}}
{{#if dataSyncStrategy}}
- **Data sync strategy**: {{dataSyncStrategy}}
{{/if}}

{{/if}}
{{#if (any integrations otherApis)}}
## Integrations
{{#each integrations}}
- **{{@key}}**: {{join this ", "}}
{{/each}}
{{#if otherApis}}
{{#if integrations}}

{{/if}}
Other: {{otherApis}}
{{/if}}

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
{{#if (any apiResponseTime availability)}}
{{#if apiResponseTime}}
- **API response-time target**: {{apiResponseTime}}
{{/if}}
{{#if availability}}
- **Availability target**: {{availability}}
{{/if}}
{{else}}
[Describe performance requirements and optimization strategies]
{{/if}}

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