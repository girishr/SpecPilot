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
  ide?: string;
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

  // Consolidated README template - overview + urgent onboarding steps
  private SPECS_README_TEMPLATE = `# SpecPilot Specifications

This folder contains structured documentation for your codebase.

## 🚀 Quick Start: Populate Your Specs

Your specs are generated but empty. Follow these steps to fill them with AI-assisted details:

### Step 1: Copy the Onboarding Prompt
1. Open [\`development/prompts.md\`](development/prompts.md).
2. Find the "First-Use Onboarding Prompt" section.
3. Copy the entire fenced code block (\`\`\`...\`\`\`).

### Step 2: Paste into Your AI Agent
1. In your IDE (VS Code, Cursor, etc.), open the AI chat.
2. Paste the prompt and run it.
3. The AI will analyze your codebase and populate all spec files.

### Step 3: Review & Iterate
- Check the generated content in each \`.specs\` file.
- Refine as needed (e.g., add missing details).
- Run \`specpilot validate\` to ensure consistency.

## 📁 File Structure
- \`project/\`: Metadata and requirements
- \`architecture/\`: Design and APIs
- \`planning/\`: Tasks and roadmap
- \`quality/\`: Testing
- \`development/\`: Docs and prompts

## 🛠️ Commands
\\\`\\\`\\\`bash
# Validate your specs
specpilot validate

# Update specs after code changes
specpilot add-specs
\\\`\\\`\\\`

For AI guidelines and prompt history, see [\`development/prompts.md\`](development/prompts.md).`;

  private async generateReadmeMd(specsDir: string, context: TemplateContext): Promise<void> {
    const rendered = this.templateEngine.renderFromString(this.SPECS_README_TEMPLATE, context);
    writeFileSync(join(specsDir, 'README.md'), rendered);
  }
  
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
      architecture: options.analysis?.architecture,
      ide: options.ide || 'vscode'
    };

    // Generate README.md first
    await this.generateReadmeMd(specsDir, context);

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
    
    // Generate IDE workspace settings based on selected IDE
    await this.generateIDESettings(options.targetDir, context, options.ide || 'vscode');
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

After generating the \`.specs\` directory, use this prompt to have your AI agent populate all specification files with project-specific details while following established conventions:

~~~
You are onboarding as the specification co-pilot for this repository. We just initialized the .specs directory using SpecPilot SDD. Your task is to inspect the codebase and populate all .specs files following these strict conventions:

**Conventions & Rules:**
1. **IDs**: Use semantic prefixes (REQ-, TASK-, ARCH-, TEST-, etc.) with zero-padded numbers (e.g., REQ-001, TASK-042)
2. **Status values**: Must be one of: not-started, in-progress, completed, blocked, deprecated
3. **Priority values**: Must be: critical, high, medium, low
4. **Dates**: Use ISO 8601 format (YYYY-MM-DD)
5. **YAML**: Use proper indentation (2 spaces), include all required fields
6. **Markdown**: Use ATX headers (#), fenced code blocks, and consistent formatting
7. **Traceability**: Link requirements to tasks, tasks to tests, architecture to implementation

**File Structure Standards:**

- \`project/project.yaml\`: name, version, description, tech_stack[], dependencies[], metadata
- \`project/requirements.md\`: ## Functional/Non-Functional Requirements with REQ-XXX IDs, priority, status
- \`architecture/architecture.md\`: ## Overview, Components, Data Flow, Tech Stack, Decisions (ADR format)
- \`architecture/api.yaml\`: OpenAPI 3.0 spec or endpoints list with methods, paths, descriptions
- \`planning/tasks.md\`: ## Backlog/In Progress/Completed with TASK-XXX, assignee, priority, dependencies
- \`planning/roadmap.md\`: ## Milestones with versions, dates, features, status
- \`quality/tests.md\`: ## Test Strategy, Test Cases (TEST-XXX), Coverage Goals, CI/CD integration
- \`development/docs.md\`: ## Getting Started, Architecture, API, Deployment, Contributing
- \`development/context.md\`: ## Project Context, Key Decisions, Known Issues, Future Considerations

**Your Process:**
1. Analyze the codebase: language, framework, structure, existing tests, dependencies
2. For each .specs file, generate content that:
   - Reflects the actual implementation state
   - Follows the conventions above exactly
   - Maintains internal consistency (cross-references work)
   - Scales appropriately to project size (small projects = concise specs, large = comprehensive)
3. Identify gaps: missing tests, undocumented APIs, unclear requirements, architectural debt
4. Propose actionable next steps in planning/tasks.md

**Output Format:**
For each file, provide the complete content in a markdown code block:
\\\`\\\`\\\`markdown
// filepath: .specs/project/project.yaml
[full file content]
\\\`\\\`\\\`

**Constraints:**
- Maintain the exact file paths and names from the .specs structure
- Don't invent features that don't exist in the code
- Flag uncertainties with TODO comments
- Keep descriptions clear, concise, and technical
- Ensure all IDs are unique within their domain

After populating all files, provide a summary of:
- What was discovered about the project
- What's documented vs. what's implemented
- Critical gaps or risks
- Recommended immediate actions

Begin your analysis now.
~~~

## Prompt History

| Date | User | Prompt Summary | Context |
|------|------|----------------|---------|
| YYYY-MM-DD | @username | Example prompt | Brief context or outcome |

## Common Commands

\\\`\\\`\\\`bash
# Generate specs for new project
specpilot init

# Add specs to existing project
specpilot add-specs

# Validate spec files
specpilot validate
\\\`\\\`\\\`

## AI Agent Guidelines

When working with AI agents on this codebase:
- Always reference relevant .specs files for context
- Update specifications before/after significant changes
- Use the conventions defined in the onboarding prompt
- Link code changes to tasks (TASK-XXX) and requirements (REQ-XXX)
- Keep development/context.md current with architectural decisions
- **🚨 RELEASE MANDATE**: Never commit, push, create tags, publish releases, or publish to npm without explicit user consent and approval

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

  private async generateVSCodeSettings(projectDir: string, context: TemplateContext): Promise<void> {
    const vscodeDir = join(projectDir, '.vscode');
    mkdirSync(vscodeDir, { recursive: true });

    // VSCode workspace settings with Plan agent integration for SpecPilot context
    const settings = {
      // AI agent context settings for Plan mode
      'chat.agent.enabled': true,
      'chat.contextAware': true,
      'chat.includeWorkspaceContext': true,
      
      // Configure AI to understand .specs folder structure
      'prompt.fileContext': ['.specs/**'],
      'search.exclude': {
        '**/.specs/*': false // Ensure .specs is searchable for AI agents
      },

      // Workspace folders configuration
      'workspace.folders': [
        {
          path: '.',
          name: context.projectName
        },
        {
          path: '.specs',
          name: `${context.projectName} - Specifications`
        }
      ],

      // Markdown and spec file settings
      '[markdown]': {
        'editor.wordWrap': 'on',
        'editor.defaultFormatter': 'esbenp.prettier-vscode'
      },
      '[yaml]': {
        'editor.insertSpaces': true,
        'editor.tabSize': 2
      },

      // YAML validation for spec files
      'yaml.validate': true,
      'yaml.schemas': {
        'https://json.schemastore.org/github-workflow.json': '.github/workflows/*.{yml,yaml}',
        '.specs/**/project.yaml': true
      },

      // Files to exclude from general search but include for AI
      'files.exclude': {
        '**/.git': true,
        '**/node_modules': true,
        '**/__pycache__': true
      },

      // AI assistant recommendations
      'extensions.recommendations': [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot'
      ]
    };

    // Add Plan agent-specific comment explaining .specs integration
    const settingsWithComment = `{
  // SpecPilot AI IDE Configuration
  // This file configures VS Code to work effectively with SpecPilot specs
  
  // For Plan agents: The .specs folder structure is configured as a workspace folder
  // and included in AI context. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure AI agent context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for AI agents
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },

  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  // Copy the "First-Use Onboarding Prompt" and paste into your AI agent to populate specs
}`;

    writeFileSync(join(vscodeDir, 'settings.json'), settingsWithComment);

    // Also generate extensions.json with workspace recommendations
    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next'
      ],
      unwantedRecommendations: []
    };

    writeFileSync(
      join(vscodeDir, 'extensions.json'),
      JSON.stringify(extensions, null, 2)
    );
  }

  private async generateIDESettings(projectDir: string, context: TemplateContext, ide: string): Promise<void> {
    switch (ide.toLowerCase()) {
      case 'cursor':
        await this.generateCursorSettings(projectDir, context);
        break;
      case 'windsurf':
        await this.generateWindsurfSettings(projectDir, context);
        break;
      case 'kiro':
        await this.generateKiroSettings(projectDir, context);
        break;
      case 'antigravity':
        await this.generateAntigravitySettings(projectDir, context);
        break;
      case 'cowork':
        await this.generateCoworkSkills(projectDir, context);
        break;
      case 'codex':
        await this.generateCodexInstructions(projectDir, context);
        break;
      case 'vscode':
      default:
        await this.generateVSCodeSettings(projectDir, context);
        break;
    }
  }

  private async generateCursorSettings(projectDir: string, context: TemplateContext): Promise<void> {
    const cursorDir = join(projectDir, '.cursor');
    mkdirSync(cursorDir, { recursive: true });

    // Cursor workspace settings with AI context integration for SpecPilot context
    const settingsWithComment = `{
  // SpecPilot AI IDE Configuration for Cursor
  // This file configures Cursor to work effectively with SpecPilot specs
  
  // For Cursor AI: The .specs folder structure is configured for AI context
  // and included in AI suggestions. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure Cursor AI context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for Cursor AI
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },

  // Cursor-specific AI settings
  "cursor.aiAccess": true,
  "cursor.enableAIContext": true,

  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  // Copy the "First-Use Onboarding Prompt" and paste into Cursor's AI chat to populate specs
}`;

    writeFileSync(join(cursorDir, 'settings.json'), settingsWithComment);

    // Generate extensions.json for Cursor
    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next'
      ],
      unwantedRecommendations: []
    };

    writeFileSync(
      join(cursorDir, 'extensions.json'),
      JSON.stringify(extensions, null, 2)
    );
  }

  private async generateWindsurfSettings(projectDir: string, context: TemplateContext): Promise<void> {
    const windsurfDir = join(projectDir, '.windsurf');
    mkdirSync(windsurfDir, { recursive: true });

    // Windsurf workspace settings with AI context integration for SpecPilot context
    const settingsWithComment = `{
  // SpecPilot AI IDE Configuration for Windsurf
  // This file configures Windsurf to work effectively with SpecPilot specs
  
  // For Windsurf AI: The .specs folder structure is configured for AI context
  // and included in AI suggestions. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure Windsurf AI context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for Windsurf AI
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },

  // Windsurf-specific AI settings
  "windsurf.aiContext.enabled": true,
  "windsurf.specs.integration": true,
  "windsurf.codeCompletion.contextAware": true,

  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  // Copy the "First-Use Onboarding Prompt" and paste into Windsurf's AI chat to populate specs
}`;

    writeFileSync(join(windsurfDir, 'settings.json'), settingsWithComment);

    // Generate extensions.json for Windsurf
    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next'
      ],
      unwantedRecommendations: []
    };

    writeFileSync(
      join(windsurfDir, 'extensions.json'),
      JSON.stringify(extensions, null, 2)
    );
  }

  private async generateKiroSettings(projectDir: string, context: TemplateContext): Promise<void> {
    const kiroDir = join(projectDir, '.kiro');
    mkdirSync(kiroDir, { recursive: true });

    // Kiro workspace settings with AI context integration for SpecPilot context
    const settingsWithComment = `{
  // SpecPilot AI IDE Configuration for Kiro
  // This file configures Kiro to work effectively with SpecPilot specs
  
  // For Kiro AI: The .specs folder structure is configured for AI context
  // and included in AI suggestions. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure Kiro AI context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for Kiro AI
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },

  // Kiro-specific AI settings
  "kiro.ai.contextAware": true,
  "kiro.specs.enabled": true,

  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  // Copy the "First-Use Onboarding Prompt" and paste into Kiro's AI chat to populate specs
}`;

    writeFileSync(join(kiroDir, 'settings.json'), settingsWithComment);

    // Generate extensions.json for Kiro
    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next'
      ],
      unwantedRecommendations: []
    };

    writeFileSync(
      join(kiroDir, 'extensions.json'),
      JSON.stringify(extensions, null, 2)
    );
  }

  private async generateAntigravitySettings(projectDir: string, context: TemplateContext): Promise<void> {
    const antigravityDir = join(projectDir, '.antigravity');
    mkdirSync(antigravityDir, { recursive: true });

    // Antigravity workspace settings with AI context integration for SpecPilot context
    const settingsWithComment = `{
  // SpecPilot AI IDE Configuration for Antigravity
  // This file configures Antigravity to work effectively with SpecPilot specs
  
  // For Antigravity AI: The .specs folder structure is configured for AI context
  // and included in AI suggestions. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure Antigravity AI context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for Antigravity AI
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },

  // Antigravity-specific AI settings
  "antigravity.ai.enabled": true,
  "antigravity.contextual": true,
  "antigravity.specs.integration": true,

  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  // Copy the "First-Use Onboarding Prompt" and paste into Antigravity's AI chat to populate specs
}`;

    writeFileSync(join(antigravityDir, 'settings.json'), settingsWithComment);

    // Generate extensions.json for Antigravity
    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next'
      ],
      unwantedRecommendations: []
    };

    writeFileSync(
      join(antigravityDir, 'extensions.json'),
      JSON.stringify(extensions, null, 2)
    );
  }

  private async generateCoworkSkills(projectDir: string, context: TemplateContext): Promise<void> {
    const skillsDir = join(projectDir, '.claude', 'skills', 'specpilot-project');
    mkdirSync(skillsDir, { recursive: true });

    // Cowork Skills with YAML frontmatter and instructions for context
    const skillContent = `---
name: specpilot-project
description: SpecPilot project context, specifications, and development guidelines. Use to understand project architecture, requirements, and AI interaction history.
---

# SpecPilot Project Context

This Skill provides context about the {{projectName}} project structure, specifications, and development practices.

## Quick Start

The project uses Specification-Driven Development (SDD). All context lives in the \`.specs/\` folder:

- **.specs/project/** - Project metadata and requirements
- **.specs/architecture/** - System design and API specifications
- **.specs/planning/** - Tasks, roadmap, and project management
- **.specs/quality/** - Testing strategies and quality guidelines
- **.specs/development/** - AI prompts, context, and development logs

## Key Files to Reference

1. **.specs/project/project.yaml** - Project configuration, rules, and tech stack
2. **.specs/project/requirements.md** - Functional and non-functional requirements
3. **.specs/architecture/architecture.md** - System architecture and design decisions
4. **.specs/planning/tasks.md** - Current tasks, sprints, and priorities
5. **.specs/development/prompts.md** - AI interaction history and onboarding guide

## Project Rules

\`\`\`bash
# Always follow these mandates:
- Update .specs/ files when making changes
- Maintain .specs/ as single source of truth
- Document decisions in context.md
- Update prompts.md with AI interactions
- Follow stable ID conventions (REQ-###, TASK-###, ARCH-###)
\`\`\`

## Architecture Overview

Project: {{projectName}}
Language: {{language}}
{{#if framework}}
Framework: {{framework}}
{{/if}}

## Development Process

1. Review requirements in .specs/project/requirements.md
2. Check tasks in .specs/planning/tasks.md
3. Reference architecture in .specs/architecture/architecture.md
4. Update specs after major changes
5. Document decisions and context

## AI Onboarding

For full AI onboarding instructions, see **.specs/development/prompts.md**.
This includes a comprehensive first-use prompt for populating all specs.

## Cross-References

All spec files link to each other for easy navigation. Follow the links in relative paths like:
- ../project/project.yaml
- ../architecture/architecture.md
- ../planning/tasks.md
`;

    writeFileSync(join(skillsDir, 'SKILL.md'), skillContent.replace(/\{\{projectName\}\}/g, context.projectName)
      .replace(/\{\{language\}\}/g, context.language)
      .replace(/{{#if framework}}/g, context.framework ? '' : '<!-- ')
      .replace(/{{\/if}}/g, context.framework ? '' : ' -->'));
  }

  private async generateCodexInstructions(projectDir: string, context: TemplateContext): Promise<void> {
    // Generate CODEX_INSTRUCTIONS.md at project root for OpenAI Codex
    const codexInstructions = `# OpenAI Codex Instructions for {{projectName}}

This file provides context and guidelines for OpenAI Codex when working on {{projectName}}.

## Project Overview

- **Project**: {{projectName}}
- **Language**: {{language}}
{{#if framework}}
- **Framework**: {{framework}}
{{/if}}
- **Author**: {{author}}
- **Description**: {{description}}

## Specification-Driven Development

This project follows **Specification-Driven Development (SDD)** where specifications come first.

### Specification Folder Structure

All project specifications live in the \`.specs/\` folder:

\`\`\`
.specs/
├── project/           # Project configuration and requirements
│   ├── project.yaml   # Project metadata, rules, tech stack
│   └── requirements.md # Functional/non-functional requirements
├── architecture/      # System design and APIs
│   ├── architecture.md # Architecture decisions and design
│   └── api.yaml       # API specifications
├── planning/          # Development planning
│   ├── tasks.md       # Task tracking (backlog, sprint, completed)
│   └── roadmap.md     # Project roadmap and milestones
├── quality/           # Quality assurance
│   └── tests.md       # Test strategy and coverage
└── development/       # Development context
    ├── prompts.md     # AI interaction history and prompts
    ├── context.md     # Project context and decisions
    └── docs.md        # Development documentation
\`\`\`

## Key Rules for Development

### Mandate: Spec Updates
**Always update .specs/ files when making significant changes:**
- Update relevant spec files BEFORE committing code
- Update metadata (lastUpdated, version, contributors)
- Maintain cross-references between specs
- Document architectural decisions in context.md

### Mandate: Stable IDs
Use stable ID conventions for traceability:
- **REQ-###**: Requirements
- **TASK-###**: Tasks
- **ARCH-###**: Architecture components
- **TEST-###**: Test cases

Zero-pad numbers: REQ-001, REQ-042, etc.

### Mandate: No Git Operations Without Approval
**Never commit, push, or publish without explicit user approval.**
Always ask before:
- Committing code
- Pushing to remote
- Creating tags or releases
- Publishing to NPM

## Important Files to Review

1. **.specs/project/project.yaml** - Read first for project rules and tech stack
2. **.specs/project/requirements.md** - Requirements and constraints
3. **.specs/architecture/architecture.md** - System design patterns
4. **.specs/planning/tasks.md** - Current priorities and tasks

## When Starting Work

1. Read .specs/project/requirements.md for scope
2. Check .specs/planning/tasks.md for current sprint
3. Reference .specs/architecture/architecture.md for design guidelines
4. Read relevant sections in .specs/development/context.md

## When Finishing Work

1. Update .specs/ files that were affected
2. Update lastUpdated timestamps
3. Increment version numbers (semantic versioning)
4. Document decisions in .specs/development/context.md
5. Update task status in .specs/planning/tasks.md

## AI Interaction Best Practices

- Copy the first-use prompt from .specs/development/prompts.md for onboarding
- Log all significant interactions in .specs/development/prompts.md
- Reference spec IDs (REQ-001, TASK-###) in commit messages
- Keep .specs/development/context.md current with project state

## Testing and Validation

Run \`specpilot validate\` to check:
- Metadata consistency
- Cross-reference validity
- Spec file structure compliance

## Reference Documentation

- Full guide: See .specs/README.md for comprehensive documentation
- API spec: See .specs/architecture/api.yaml
- Project plan: See .specs/project/project-plan.md
- Context history: See .specs/development/context.md

---

*Last Generated: {{currentDate}}*
*For more details, see .specs/development/prompts.md*
`;

    const rendered = this.templateEngine.renderFromString(codexInstructions, context);
    writeFileSync(join(projectDir, 'CODEX_INSTRUCTIONS.md'), rendered);
  }
}