import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';

export interface SpecGeneratorOptions {
  projectName: string;
  language: string;
  framework?: string;
  targetDir: string;
  specsName: string;
  author?: string;
  description?: string;
  analysis?: {
    todos: Array<{ file: string; line: number; text: string; type: string }>;
    tests: {
      framework?: string;
      testFiles: string[];
      testCount: number;
      hasE2E: boolean;
      hasUnit: boolean;
      hasIntegration: boolean;
    };
    architecture: {
      components: string[];
      directories: string; // Changed from string[]
      fileTypes: Record<string, number>;
    };
  };
}

export class SpecGenerator {
  constructor(private templateEngine: TemplateEngine) {}
  
  async generateSpecs(options: SpecGeneratorOptions): Promise<void> {
    const specsDir = join(options.targetDir, options.specsName);
    
    // Create .specs and subfolders
    mkdirSync(specsDir, { recursive: true });
    const subfolders = ['project', 'architecture', 'planning', 'quality', 'development'];
    subfolders.forEach(sub => mkdirSync(join(specsDir, sub), { recursive: true }));

    const context: TemplateContext = {
      projectName: options.projectName,
      language: options.language,
      framework: options.framework,
      author: options.author || 'Your Name',
      description: options.description || `A ${options.language} project${options.framework ? ` using ${options.framework}` : ''}`,
      lastUpdated: '2025-10-05',
      contributors: [options.author || 'Your Name'],
      architecture: options.analysis?.architecture
    };

    // Write spec files in correct subfolders
    await this.generateProjectYaml(join(specsDir, 'project'), context);
    await this.generateRequirementsMd(join(specsDir, 'project'), context);
    await this.generateArchitectureMd(join(specsDir, 'architecture'), context);
    await this.generateApiYaml(join(specsDir, 'architecture'), context);
    await this.generateTasksMd(join(specsDir, 'planning'), context);
    await this.generateRoadmapMd(join(specsDir, 'planning'), context);
    await this.generateDocsMd(join(specsDir, 'development'), context);
    await this.generateContextMd(join(specsDir, 'development'), context);
  await this.generateProjectPlanMd(join(specsDir, 'project'), context);
    await this.generatePromptsMd(join(specsDir, 'development'), context);
    await this.generateTestsMd(join(specsDir, 'quality'), context);
    await this.generateSpecUpdateTemplateMd(specsDir, context);
  }
  
  private async generateProjectYaml(specsDir: string, context: TemplateContext): Promise<void> {
    const template = this.templateEngine.getBuiltinTemplate(
      context.language, 
      context.framework, 
      'project.yaml'
    );
    const content = this.templateEngine.renderFromString(template, context);
    writeFileSync(join(specsDir, 'project.yaml'), content);
  }
  
  private async generateArchitectureMd(specsDir: string, context: TemplateContext): Promise<void> {
    const template = this.templateEngine.getBuiltinTemplate(
      context.language, 
      context.framework, 
      'architecture.md'
    );
    const content = this.templateEngine.renderFromString(template, context);
    writeFileSync(join(specsDir, 'architecture.md'), content);
  }
  
  private async generateRequirementsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Requirements
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Requirements

## Project Overview
{{description}}

## Functional Requirements
[TODO: Add requirements with proper template]

## Cross-References
- Architecture: ../architecture/architecture.md
- API: ../architecture/api.yaml
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'requirements.md'), rendered);
  }

  private async generateApiYaml(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} API Specification
# meta: project={{projectName}} language={{language}} framework={{framework}} updated={{currentDate}}
openapi: 3.0.3
info:
  title: {{projectName}} API
  description: {{description}}
  version: 1.1.1
`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'api.yaml'), rendered);
  }

  private async generateTasksMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Tasks
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Task Management

## Project Status: 🟡 In Progress

## Current Sprint
- [ ] Setup project foundation
- [ ] Implement core features

## Cross-References
- Roadmap: ./roadmap.md
- Requirements: ../project/requirements.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tasks.md'), rendered);
  }

  private async generateRoadmapMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Roadmap
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Development Roadmap

## Project Phases

### Phase 1: Foundation
- [x] Project initialization
- [ ] Core development

## Cross-References
- Tasks: ./tasks.md
- Requirements: ../project/requirements.md

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'roadmap.md'), rendered);
  }

  private async generateDocsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Development Docs
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Development Documentation

## Getting Started
[TODO: Add development setup instructions]

## Cross-References
- Context: ./context.md
- Roadmap: ../planning/roadmap.md
- Tasks: ../planning/tasks.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'docs.md'), rendered);
  }

  private async generateContextMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Development Context
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Development Context

## Project Memory
[TODO: Add project context and decisions]

## Cross-References
- Docs: ./docs.md
- Roadmap: ../planning/roadmap.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'context.md'), rendered);
  }

  private async generateProjectPlanMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Project Plan
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Project Plan

## Project Overview
[TODO: Add project planning details]

## Cross-References
- Roadmap: ../planning/roadmap.md
- Tasks: ../planning/tasks.md

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'project-plan.md'), rendered);
  }

  private async generatePromptsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Prompts Log
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# Development Prompts Log

## Overview
This file (prompts.md) contains ALL AI interactions for {{projectName}}. Update .specs/prompts.md with every AI interaction.

**🚨 MANDATE**: Update with every AI interaction.

## First-Use Onboarding Prompt
Use the following prompt the very first time you partner with an AI agent after generating the .specs folder:

~~~
Act as the specification-driven co-pilot for this repository. We just generated the \`.specs/\` directory with SpecPilot SDD. Your job is to inspect the current codebase and fill in every \`.specs\` file with high-signal, implementation-aware details.
- First, map the project's language, framework, major modules, and any existing tests.
- Then propose or refine the entries for: \`project/project.yaml\`, \`project/requirements.md\`, \`architecture/architecture.md\`, \`architecture/api.yaml\`, \`planning/tasks.md\`, \`planning/roadmap.md\`, \`quality/tests.md\`, \`development/docs.md\`, \`development/context.md\`, and \`development/prompts.md\`.
- Capture requirements, architecture decisions, API surface, test strategy, and development context so another engineer (or AI) could continue the project confidently.
- Highlight any gaps or risks you uncover in the code.
Use markdown where appropriate, keep IDs stable (e.g., \`REQ-001\`, \`TASK-001\`), and make sure everything is internally consistent. When you're done, summarize what changed and call out anything that needs human follow-up.
~~~

## Cross-References
- Context: ./context.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'prompts.md'), rendered);
  }

  private async generateTestsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Test Strategy
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Test Strategy

## Overview
[TODO: Add testing strategy and approach]

## Cross-References
- Requirements: ../project/requirements.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tests.md'), rendered);
  }

  private async generateSpecUpdateTemplateMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
fileID: spec-update-template
lastUpdated: {{currentDate}}
version: 1.1.1
contributors: ["SpecPilot"]
relatedFiles:
  - "project/project.yaml"
  - "development/prompts.md"
---

# Spec Update Template

## Purpose
This template provides a standardized format for updating specification files within the .specs folder structure.

## Instructions

### 1. Update Front-matter
- Update \`lastUpdated\` field with current timestamp
- Increment \`version\` following semantic versioning
- Add your name to \`contributors\` array
- Update \`relatedFiles\` if dependencies change

### 2. Document Changes
- Clearly describe what was modified and why
- Reference related tasks or issues
- Update cross-references to maintain consistency

### 3. Validation
- Ensure YAML front-matter is valid
- Verify all cross-references use correct subfolder paths
- Check that version numbers are consistent across related files

## Subfolder Structure
- \`project/\` - Core project configuration and requirements
- \`architecture/\` - System design and API specifications
- \`planning/\` - Development planning and roadmaps
- \`quality/\` - Testing strategies and quality assurance
- \`development/\` - Development logs and task tracking

---
*Generated by SpecPilot on {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'spec-update-template.md'), rendered);
  }
}
