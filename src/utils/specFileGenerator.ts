import { join } from 'path';
import { writeFileSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';

/**
 * Generates all `.specs/` markdown and YAML files.
 * Responsible only for content inside the specs directory.
 */
export class SpecFileGenerator {
  constructor(private templateEngine: TemplateEngine) {}

  // ── README templates ────────────────────────────────────────────

  private NEW_PROJECT_README = `# SpecPilot Specifications

This folder contains structured documentation for your project.

## 🚀 Quick Start: Generate Your Specs with AI

Your specs files have been scaffolded with placeholders. Use your AI agent to draft them based on the project description you provided during \`specpilot init\`.

### Step 1: Copy the Onboarding Prompt
1. Open [\`development/prompts.md\`](development/prompts.md).
2. Find the **"New Project Onboarding Prompt"** section.
3. Copy the entire fenced code block (\`\`\`...\`\`\`).

### Step 2: Paste into Your AI Agent
1. In your IDE (VS Code, Cursor, etc.), open the AI chat.
2. Paste the prompt and run it.
3. The AI will draft all spec files based on your project description.

### Step 3: Review & Refine
- The generated specs are a **starting point** based on the AI's understanding.
- Review each file — change, add, or remove anything as your project evolves.
- Add details the AI couldn't know before you start coding.
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

# Add specs to an existing project later
specpilot add-specs
\\\`\\\`\\\`

For AI guidelines and prompt history, see [\`development/prompts.md\`](development/prompts.md).`;

  private EXISTING_PROJECT_README = `# SpecPilot Specifications

This folder contains structured documentation for your codebase.

## 🚀 Quick Start: Populate Your Specs

Your specs files have been scaffolded with placeholders. Use your AI agent to populate them by analyzing your existing codebase.

### Step 1: Copy the Onboarding Prompt
1. Open [\`development/prompts.md\`](development/prompts.md).
2. Find the **"Existing Project Onboarding Prompt"** section.
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
    await this.generatePromptsMd(join(specsDir, 'development'), context);
    await this.generateTestsMd(join(specsDir, 'quality'), context);
  }

  private async generateReadmeMd(specsDir: string, context: TemplateContext): Promise<void> {
    const template = context.mode === 'existing' ? this.EXISTING_PROJECT_README : this.NEW_PROJECT_README;
    const rendered = this.templateEngine.renderFromString(template, context);
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
fileID: TASKS-001
lastUpdated: {{currentDate}}
version: 1.0
contributors: [{{author}}]
relatedFiles: [roadmap.md, project.yaml, requirements.md]
---

# {{projectName}} — Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-###: Completed items

Notes

- IDs are stable; do not change once assigned (even if reordered or moved between sections).
- Reference tasks by ID in commits, prompts, PRs, and discussions.
- When moving an item from Backlog to Current Sprint, retain its original BL ID or create a CS mirror that references the BL ID.
- Archive guidance: when Completed grows large, move older entries to \`tasks-archive.md\` and add a pointer here.

## Backlog

1. [BL-001] Plan initial feature set
2. [BL-002] Gather user feedback and feature requests
3. [BL-003] Write documentation and usage guide

## Current Sprint

1. [CS-001] Set up project foundation and tooling
2. [CS-002] Implement core features
3. [CS-003] Write unit tests

## Completed

1. [CD-001] Initialise .specs directory ({{currentDate}})

## Cross-References

- Roadmap (milestones): ./roadmap.md
- Requirements: ../project/requirements.md
- Project config: ../project/project.yaml`;

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
  Scope: Quarter-level phases, version targets, feature groupings, goals, and risks.
  Update cadence: Per release / per sprint planning session.

  Boundary guide:
  - roadmap.md → release milestones, timeline, objectives, and risks (this file)
  - tasks.md   → individual work items and sprint status
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

## Objectives
- [Primary goal for this project]
- [Secondary goal]

## Goals & Success Criteria
| Goal | Success Metric | Target |
|------|----------------|--------|
| [Primary goal] | [How we measure it] | [Target value] |

## Risks and Mitigations
- [Risk 1]: [Mitigation]
- [Risk 2]: [Mitigation]

## Cross-References
- Sprint tasks: ./tasks.md
- Requirements: ../project/requirements.md

---
*Last updated: {{currentDate}}*`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'roadmap.md'), rendered);
  }

  private async generateDocsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
fileID: DOC-001
lastUpdated: {{currentDate}}
version: 1.0
contributors: []
relatedFiles: [project/project.yaml, development/context.md, planning/roadmap.md, planning/tasks.md]
---

# {{projectName}} \u2014 Development Documentation

## Spec File Conventions

All \`.specs/\` files must include a YAML front-matter header with:
- \`fileID\`: Unique identifier (e.g., \`REQ-001\`, \`ARCH-001\`)
- \`lastUpdated\`: Date in YYYY-MM-DD format
- \`version\`: Semantic version (e.g., \`1.0\`)
- \`contributors\`: Array of contributor handles
- \`relatedFiles\`: Array of related spec file paths

Section IDs use the format \`[PREFIX-NNN.S]\` (e.g., \`[REQ-001.1]\`) and must be stable — do not change once assigned.

## Development Procedures

### Workflow

1. Update relevant \`.specs/\` files before committing
2. Write tests before implementation
3. Use small, focused commits with conventional commit messages (\`type(scope): description\`)
4. Log all AI interactions in \`development/prompts.md\`

### Spec Update Checklist (before each commit)

- [ ] \`tasks.md\` \u2014 task status updated
- [ ] \`context.md\` \u2014 decisions and lessons logged
- [ ] \`requirements.md\` \u2014 updated if features changed
- [ ] \`architecture.md\` \u2014 updated if structure changed
- [ ] \`api.yaml\` \u2014 updated if CLI interface changed
- [ ] \`tests.md\` \u2014 updated if test strategy changed

## CLI Commands Reference

\\\`\\\`\\\`bash
# Initialize a new project
specpilot init <project-name> [--lang <language>] [--framework <framework>] [--no-prompts]

# Add .specs/ to an existing project
specpilot add-specs

# List available templates
specpilot list

# Validate spec files
specpilot validate [--fix]

# Migrate to newer spec structure
specpilot migrate

# Update specs with current project context (shows diff + confirmation)
specpilot specify
\\\`\\\`\\\`

## Cross-References
- Context: ./context.md
- Roadmap: ../planning/roadmap.md
- Tasks: ../planning/tasks.md
- Project config: ../project/project.yaml

> For contributing guidelines, troubleshooting, and support, see README.md.

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

  private async generatePromptsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const isNew = context.mode !== 'existing';
    const pc = context.projectContext;

    // ── Shared conventions block (used by both prompts) ──────────
    const conventions = `**Conventions & Rules:**
1. **IDs**: Use semantic prefixes (REQ-, TASK-, ARCH-, TEST-, etc.) with zero-padded numbers (e.g., REQ-001, TASK-042)
2. **Status values**: Must be one of: not-started, in-progress, completed, blocked, deprecated
3. **Priority values**: Must be: critical, high, medium, low
4. **Dates**: Use ISO 8601 format (YYYY-MM-DD)
5. **YAML**: Use proper indentation (2 spaces), include all required fields
6. **Markdown**: Use ATX headers (#), fenced code blocks, and consistent formatting
7. **Traceability**: Link requirements to tasks, tasks to tests, architecture to implementation
8. **❌ CRITICAL**: Never modify the .specs folder structure or file names. Only update file CONTENTS. The directory structure is IMMUTABLE.

**File Structure Standards:**

- \\\`project/project.yaml\\\`: name, version, description, tech_stack[], dependencies[], metadata
- \\\`project/requirements.md\\\`: ## Functional/Non-Functional Requirements with REQ-XXX IDs, priority, status
- \\\`architecture/architecture.md\\\`: ## Overview, Components, Data Flow, Tech Stack, Decisions (ADR format)
- \\\`architecture/api.yaml\\\`: OpenAPI 3.0 spec or endpoints list with methods, paths, descriptions
- \\\`planning/tasks.md\\\`: ## Backlog/In Progress/Completed with TASK-XXX, assignee, priority, dependencies
- \\\`planning/roadmap.md\\\`: ## Milestones with versions, dates, features, status
- \\\`quality/tests.md\\\`: ## Test Strategy, Test Cases (TEST-XXX), Coverage Goals, CI/CD integration
- \\\`development/docs.md\\\`: ## Getting Started, Architecture, API, Deployment, Contributing
- \\\`development/context.md\\\`: ## Project Context, Key Decisions, Known Issues, Future Considerations`;

    // ── New-project prompt ────────────────────────────────────────
    const projectContextBlock = pc
      ? `**Project context (provided by the developer):**
- **What it does:** ${pc.whatItDoes}
- **Target users:** ${pc.targetUsers}
- **Expected scale:** ${pc.expectedScale}
- **Key constraints:** ${pc.constraints}`
      : `**Project context:**
- **What it does:** [DESCRIBE YOUR PROJECT HERE]
- **Target users:** Not specified — use your judgment and mark as [ASSUMPTION]
- **Expected scale:** Not specified — use your judgment and mark as [ASSUMPTION]
- **Key constraints:** Not specified — use your judgment and mark as [ASSUMPTION]`;

    const newProjectPrompt = `You are the specification co-pilot for a new project called "{{projectName}}".
Tech stack: {{language}}{{#if framework}} / {{framework}}{{/if}}

${projectContextBlock}

**For any areas not covered above, make reasonable assumptions. Clearly label ALL assumptions with [ASSUMPTION] so the developer can review and revise them.**

Based on this context, populate all .specs files following these strict conventions:

${conventions}

**Your Process:**
1. Read the project context above carefully
2. For each .specs file, generate content that:
   - Derives requirements, architecture, and tasks from the project description
   - Follows the conventions above exactly
   - Maintains internal consistency (cross-references work)
   - Scales appropriately to project ambition (prototype = concise, production = comprehensive)
3. Propose a realistic roadmap with milestones
4. Draft a test strategy appropriate for the project type

**Output Format:**
For each file, provide the complete content in a markdown code block:
\\\\\`\\\\\`\\\\\`markdown
// filepath: .specs/project/project.yaml
[full file content]
\\\\\`\\\\\`\\\\\`

**Constraints:**
- These specs are a starting point — the developer will review and refine them
- Flag uncertainties and assumptions with [ASSUMPTION] comments
- Keep descriptions clear, concise, and technical
- Ensure all IDs are unique within their domain

After populating all files, provide a summary of:
- What you understood about the project
- Assumptions you made and why
- Recommended next steps before the developer starts coding

**Important:** These specifications are generated based on the AI's understanding of the project description. They are a draft — the developer should review, change, add, or remove anything as the project evolves. Add more detail into the spec files before starting AI-assisted coding.

Begin drafting now.`;

    // ── Existing-project prompt ──────────────────────────────────
    const existingProjectPrompt = `You are onboarding as the specification co-pilot for this repository. We just initialized the .specs directory using SpecPilot SDD. Your task is to inspect the codebase and populate all .specs files following these strict conventions:

${conventions}

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
\\\\\`\\\\\`\\\\\`markdown
// filepath: .specs/project/project.yaml
[full file content]
\\\\\`\\\\\`\\\\\`

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

Begin your analysis now.`;

    // ── Assemble the full prompts.md ─────────────────────────────
    const primaryLabel = isNew ? 'New Project' : 'Existing Project';
    const secondaryLabel = isNew ? 'Existing Project' : 'New Project';
    const primaryPrompt = isNew ? newProjectPrompt : existingProjectPrompt;
    const secondaryPrompt = isNew ? existingProjectPrompt : newProjectPrompt;
    const primaryNote = isNew
      ? 'Use this prompt to have your AI agent draft all specification files based on your project description.'
      : 'Use this prompt to have your AI agent analyze your codebase and populate all specification files.';
    const secondaryNote = isNew
      ? 'If you later need to re-generate specs from an existing codebase (e.g., after significant implementation), use this prompt instead.'
      : 'If you start a fresh module or sub-project and want to plan specs before writing code, use this prompt instead.';

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

## ${primaryLabel} Onboarding Prompt

${primaryNote}

~~~
${primaryPrompt}
~~~

---

## ${secondaryLabel} Onboarding Prompt (Reference)

${secondaryNote}

~~~
${secondaryPrompt}
~~~

---

## Re-Anchor Prompt

> Paste this into your AI agent when: the session has been running > 1 hour, you've made > 20 exchanges, or the AI seems to have forgotten project rules.

~~~
You are working on {{projectName}} ({{language}}{{#if framework}} / {{framework}}{{/if}}).

CRITICAL RULES — re-read these before continuing:
1. NEVER commit, push, or deploy unless I explicitly ask you to.
2. NEVER modify .specs/ folder structure or file names — only update file contents.
3. After EVERY code change, proactively update all affected .specs/ files without being asked.
4. Spec-First Development — update .specs/ before writing code.
5. Log this and all AI interactions in .specs/development/prompts.md.

For full project context, read .specs/project/project.yaml.
~~~

---

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
