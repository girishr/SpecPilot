import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
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

Your spec files have been scaffolded with placeholders. An onboarding prompt has been saved to [\`development/onboarding.md\`](development/onboarding.md).

1. Open \`development/onboarding.md\` and copy the prompt inside it.
2. Paste it into your AI agent (VS Code, Cursor, etc.).
3. The AI will draft all spec files based on your project description.
4. Review each file, refine as needed, then **delete \`onboarding.md\`**.

Run \`specpilot validate\` to check consistency at any time.

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

Your spec files have been scaffolded with placeholders. An onboarding prompt has been saved to [\`development/onboarding.md\`](development/onboarding.md).

1. Open \`development/onboarding.md\` and copy the prompt inside it.
2. Paste it into your AI agent (VS Code, Cursor, etc.).
3. The AI will analyze your codebase and populate all spec files.
4. Review each file, refine as needed, then **delete \`onboarding.md\`**.

Run \`specpilot validate\` to check consistency at any time.

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
  async generateAll(specsDir: string, context: TemplateContext): Promise<{ onboardingPrompt: string }> {
    await this.generateReadmeMd(specsDir, context);
    await this.generateProjectYaml(join(specsDir, 'project'), context);
    await this.generateRequirementsMd(join(specsDir, 'project'), context);
    await this.generateArchitectureMd(join(specsDir, 'architecture'), context);
    await this.generateApiYaml(join(specsDir, 'architecture'), context);
    await this.generateTasksMd(join(specsDir, 'planning'), context);
    await this.generateRoadmapMd(join(specsDir, 'planning'), context);
    await this.generateContextMd(join(specsDir, 'development'), context);
    await this.generatePromptsMd(join(specsDir, 'development'), context);
    const onboardingPrompt = await this.generateOnboardingMd(join(specsDir, 'development'), context);
    await this.generateTestsMd(join(specsDir, 'quality'), context);
    const securityDir = join(specsDir, 'security');
    mkdirSync(securityDir, { recursive: true });
    await this.generateThreatModelMd(securityDir, context);
    await this.generateSecurityDecisionsMd(securityDir, context);
    return { onboardingPrompt };
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
description: Functional and non-functional requirements for the project
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
[TODO]

## Assumptions
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'requirements.md'), rendered);
  }

  private async generateApiYaml(specsDir: string, context: TemplateContext): Promise<void> {
    const paradigm = context.apiParadigm ?? 'rest';
    if (paradigm === 'none') return;

    const header = `# .specs/architecture/api.yaml
# meta: project={{projectName}} language={{language}} framework={{framework}} updated={{currentDate}}

project: "{{projectName}}"
version: "1.0.0"
lastUpdated: "{{currentDate}}"
`;

    const sections: Record<string, string> = {
      rest: `
openapi: "3.0.0"
info:
  title: "{{projectName}} API"
  version: "1.0.0"
  description: "[TODO: Describe your API]"

servers:
  - url: "http://localhost:3000"
    description: "Local development"

paths:
  /example:
    get:
      summary: "[TODO: Replace with your first endpoint]"
      responses:
        "200":
          description: "Success"
`,
      cli: `
cli:
  name: "{{projectName}}"
  version: "1.0.0"
  commands:
    - name: "[TODO: first-command]"
      description: "[TODO: What does this command do?]"
      arguments:
        - name: "[TODO: arg]"
          description: "[TODO: argument description]"
          required: true
      options:
        - flag: "--example <value>"
          description: "[TODO: option description]"
`,
      graphql: `
graphql:
  endpoint: "/graphql"
  queries:
    - name: "[TODO: firstQuery]"
      description: "[TODO: What does this query return?]"
  mutations:
    - name: "[TODO: firstMutation]"
      description: "[TODO: What does this mutation do?]"
`,
    };

    const content = header + sections[paradigm];
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'api.yaml'), rendered);
  }

  private async generateTasksMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
fileID: TASKS-001
description: Sprint tracker with backlog, current sprint, and completed work
lastUpdated: {{currentDate}}
version: 1.0
contributors: [{{author}}]
relatedFiles: [roadmap.md, project.yaml, requirements.md]
---

# {{projectName}} — Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-{devPrefix}-###: Completed items (e.g. CD-{{author}}-001)
- PROMPT-{devPrefix}-###: Prompt log entries (e.g. PROMPT-{{author}}-001)

## Backlog

[TODO]

## Current Sprint

[TODO]

## Completed

1. [CD-001] Initialise .specs directory ({{currentDate}})`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tasks.md'), rendered);
  }

  private async generateRoadmapMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Roadmap
description: Release milestones, objectives, and delivery timeline
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} — Development Roadmap

## Milestones
[TODO]

## Objectives
[TODO]

## Goals & Success Criteria
[TODO]

## Risks and Mitigations
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'roadmap.md'), rendered);
  }

  private async generateContextMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Development Context
description: Project memory, decisions, and implementation notes
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Development Context

## Project Memory
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'context.md'), rendered);
  }

  private async generatePromptsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Prompts Log
description: AI interaction log for {{projectName}}
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

## Archive Policy

> **Line limit: 100 lines.** When this file exceeds 100 lines, run:
>
> \`\`\`bash
> specpilot archive
> \`\`\`
>
> This will move older entries from this file into \`development/prompts-archive.md\` automatically, keeping the most recent entries here. A \`--dry-run\` flag is available to preview changes before writing.
>
> No stub \`prompts-archive.md\` file is generated during \`specpilot init\` — it is created on first archive run.

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
| YYYY-MM-DD | @username | Example prompt | Brief context or outcome |`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'prompts.md'), rendered);
  }

  private async generateOnboardingMd(specsDir: string, context: TemplateContext): Promise<string> {
    const isGreenfield = context.projectType !== 'brownfield';
    const pc = context.projectContext;

    const conventions = `**Conventions & Rules:**
1. **IDs**: Use semantic prefixes with zero-padded numbers (e.g., REQ-001, CD-${context.author || '{{author}}'}-001)
2. **Status values**: Must be one of: not-started, in-progress, completed, blocked, deprecated
3. **Priority values**: Must be: critical, high, medium, low
4. **Dates**: Use ISO 8601 format (YYYY-MM-DD)
5. **YAML**: Use proper indentation (2 spaces), include all required fields
6. **Markdown**: Use ATX headers (#), fenced code blocks, consistent formatting
7. **Traceability**: Link requirements to tasks, tasks to tests, architecture to implementation
8. **❌ CRITICAL**: Never modify the .specs folder structure or file names. Only update file CONTENTS.

**File Structure:**
- \`project/project.yaml\`: name, version, description, tech_stack[], dependencies[]
- \`project/requirements.md\`: ## Functional/Non-Functional Requirements, REQ-XXX IDs
- \`architecture/architecture.md\`: ## Overview, Components, Data Flow, Decisions (ADR)
- \`architecture/api.yaml\`: endpoints with methods, paths, descriptions
- \`planning/tasks.md\`: ## Backlog/In Progress/Completed with TASK-XXX IDs
- \`planning/roadmap.md\`: ## Milestones with versions, dates, features, status
- \`quality/tests.md\`: ## Test Strategy, Test Cases (TEST-XXX), Coverage Goals
- \`development/context.md\`: ## Project Context, Key Decisions, Known Issues`;

    let prompt: string;

    if (isGreenfield) {
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

      prompt = `You are the specification co-pilot for a new project called "${context.projectName}".
Tech stack: ${context.language}${context.framework ? ` / ${context.framework}` : ''}

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
For each file, provide the complete content in a fenced code block:
\`\`\`markdown
// filepath: .specs/project/project.yaml
[full file content]
\`\`\`

**Constraints:**
- These specs are a starting point — the developer will review and refine them
- Flag uncertainties and assumptions with [ASSUMPTION] comments
- Keep descriptions clear, concise, and technical
- Ensure all IDs are unique within their domain

After populating all files, provide a summary of: what you understood, assumptions you made, and recommended next steps.

**Final step: delete \`.specs/development/onboarding.md\` — it is a one-time bootstrap file.**

Begin drafting now.`;
    } else {
      prompt = `You are onboarding as the specification co-pilot for this repository. We just initialized the .specs directory using SpecPilot SDD. Your task is to inspect the codebase and populate all .specs files following these strict conventions:

${conventions}

**Your Process:**
1. Analyze the codebase: language, framework, structure, existing tests, dependencies
2. For each .specs file, generate content that:
   - Reflects the actual implementation state
   - Follows the conventions above exactly
   - Maintains internal consistency (cross-references work)
   - Scales appropriately to project size (small = concise, large = comprehensive)
3. Identify gaps: missing tests, undocumented APIs, unclear requirements, architectural debt
4. Propose actionable next steps in planning/tasks.md

**Output Format:**
For each file, provide the complete content in a fenced code block:
\`\`\`markdown
// filepath: .specs/project/project.yaml
[full file content]
\`\`\`

**Constraints:**
- Maintain the exact file paths and names from the .specs structure
- Don't invent features that don't exist in the code
- Flag uncertainties with TODO comments
- Keep descriptions clear, concise, and technical
- Ensure all IDs are unique within their domain

After populating all files, provide a summary of: what was discovered, what's documented vs. implemented, critical gaps, and recommended immediate actions.

**Final step: delete \`.specs/development/onboarding.md\` — it is a one-time bootstrap file.**

Begin your analysis now.`;
    }

    const label = isGreenfield ? 'Greenfield' : 'Brownfield';
    const content = `---
title: Onboarding Prompt (${label})
description: One-time AI prompt to bootstrap .specs/ files — delete after use
project: ${context.projectName}
lastUpdated: ${new Date().toISOString().split('T')[0]}
---

> **One-time file — delete after use.**
> Copy the prompt below and paste it into your AI agent. Once all \`.specs/\` files are populated, your AI will delete this file as its final step. If it doesn't, delete it manually.

---

${prompt}`;

    writeFileSync(join(specsDir, 'onboarding.md'), content);
    return prompt;
  }

  private async generateTestsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
title: Test Strategy
description: Test strategy, coverage goals, and quality approach
project: {{projectName}}
language: {{language}}
framework: {{framework}}
lastUpdated: {{currentDate}}
sourceOfTruth: project/project.yaml
---

# {{projectName}} Test Strategy

## Overview
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tests.md'), rendered);
  }

  private async generateThreatModelMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
fileID: SEC-001
description: Threat model and attack surface analysis
lastUpdated: {{currentDate}}
version: 1.0
contributors: [{{author}}]
relatedFiles: [security/security-decisions.md, architecture/architecture.md, project/requirements.md]
---

# Threat Model

## Overview [SEC-001.1]
[TODO]

## Threat Model [SEC-002]
[TODO]

## Attack Surface Summary [SEC-003]
[TODO]

## Out of Scope [SEC-004]
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'threat-model.md'), rendered);
  }

  private async generateSecurityDecisionsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `---
fileID: SEC-002
description: Security ADR log with decisions, rationale, and trade-offs
lastUpdated: {{currentDate}}
version: 1.0
contributors: [{{author}}]
relatedFiles: [security/threat-model.md, architecture/architecture.md]
---

# Security Decisions

## Decisions [SEC-002.1]
[TODO]`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'security-decisions.md'), rendered);
  }

}
