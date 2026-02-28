import { join } from 'path';
import { writeFileSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';

/**
 * Generates all `.specs/` markdown and YAML files.
 * Responsible only for content inside the specs directory.
 */
export class SpecFileGenerator {
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

  /** Generate all spec files into the pre-created specs directory. */
  async generateAll(specsDir: string, context: TemplateContext): Promise<void> {
    await this.generateReadmeMd(specsDir, context);
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
  }

  private async generateReadmeMd(specsDir: string, context: TemplateContext): Promise<void> {
    const rendered = this.templateEngine.renderFromString(this.SPECS_README_TEMPLATE, context);
    writeFileSync(join(specsDir, 'README.md'), rendered);
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

<!--
  PURPOSE: Sprint-level task tracker — the "what are we doing RIGHT NOW" file.
  Scope: Individual work items for the current and upcoming sprint.
  Update cadence: Daily / per PR / per task status change.

  Boundary guide:
  - tasks.md   → specific work items, assignees, sprint status (this file)
  - roadmap.md → release milestones and quarter-level timeline
  - project-plan.md → project charter: scope, goals, stakeholders
-->

# {{projectName}} — Task Tracker

## Current Sprint

### In Progress
<!-- TASK-XXX: Brief description — assignee, priority: critical|high|medium|low -->
- [ ] TASK-001: Set up project foundation

### Backlog
<!-- Prioritised list of upcoming work items -->
- [ ] TASK-002: Implement core features
- [ ] TASK-003: Write unit tests

### Completed
<!-- Move items here (with completion date) rather than deleting them -->
- [x] TASK-000: Initialise .specs directory ({{currentDate}})

## Blocked
<!-- Tasks that cannot proceed — note the blocker and owner -->
_(none)_

## Cross-References
- Roadmap (milestones): ./roadmap.md
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

<!--
  PURPOSE: Release-level milestone planner — the "when are we shipping what" file.
  Scope: Quarter-level phases, version targets, and feature groupings.
  Update cadence: Per release / per sprint planning session.

  Boundary guide:
  - roadmap.md     → release milestones and quarter-level timeline (this file)
  - tasks.md       → individual work items and sprint status
  - project-plan.md → project charter: scope, goals, stakeholders
-->

# {{projectName}} — Development Roadmap

## v0.1.0 — Foundation _(current)_
**Goal:** Get a working skeleton in place.
- [x] Project initialised
- [ ] Core data model implemented
- [ ] Basic CLI / API working

## v0.2.0 — Core Features
**Goal:** Deliver the primary user-facing functionality.
- [ ] Feature A
- [ ] Feature B
- [ ] Unit test coverage ≥ 80 %

## v1.0.0 — Production Ready
**Goal:** Stable, documented, deployable release.
- [ ] All P0/P1 requirements met
- [ ] Documentation complete
- [ ] CI/CD pipeline green

## Unscheduled / Icebox
- [ ] Nice-to-have feature ideas go here

## Cross-References
- Sprint tasks: ./tasks.md
- Requirements: ../project/requirements.md
- Project charter: ../project/project-plan.md

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

<!--
  PURPOSE: Project charter — the "why we are building this and what success looks like" file.
  Scope: Written once at project start; updated only when goals or constraints fundamentally change.
  Update cadence: Project kick-off, major pivots, or stakeholder reviews.

  Boundary guide:
  - project-plan.md → charter: scope, goals, stakeholders, constraints (this file)
  - roadmap.md      → release milestones and quarter-level timeline
  - tasks.md        → individual work items and sprint status
-->

# {{projectName}} — Project Charter

## Project Scope
{{description}}

**In scope:**
- [Define what this project will deliver]

**Out of scope:**
- [Define explicit exclusions to prevent scope creep]

## Goals & Success Criteria
| Goal | Success Metric | Target |
|------|---------------|--------|
| [Primary goal] | [How we measure it] | [Target value] |

## Stakeholders
| Role | Name | Responsibility |
|------|------|----------------|
| Owner | {{author}} | Final decisions, prioritisation |
| Developer | {{author}} | Implementation |

## Constraints & Assumptions
- **Tech stack:** {{language}}{{#if framework}} / {{framework}}{{/if}}
- **Assumptions:** [List key assumptions the plan depends on]
- **Dependencies:** [External systems, teams, or tools this project relies on]

## Cross-References
- Release milestones: ../planning/roadmap.md
- Sprint tasks: ../planning/tasks.md

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
8. **❌ CRITICAL**: Never modify the .specs folder structure or file names. Only update file CONTENTS. The directory structure is IMMUTABLE.

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
- **🚨 MANDATE**: Never modify the .specs folder structure or file names - only update file contents
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

}
