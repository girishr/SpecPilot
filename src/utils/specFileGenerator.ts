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
[TODO: Add requirements with proper template]

## Assumptions

> Label each assumption with [ASSUMPTION] so it can be reviewed and revised.

- [ASSUMPTION] [e.g. Users have internet access at runtime]
- [ASSUMPTION] [e.g. Single-user deployment, no multi-tenancy required]
- [ASSUMPTION] [e.g. Input data is well-formed; no adversarial input expected]

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

Notes

- IDs are stable; do not change once assigned (even if reordered or moved between sections).
- Reference tasks by ID in commits, prompts, PRs, and discussions.
- When moving an item from Backlog to Current Sprint, retain its original BL ID or create a CS mirror that references the BL ID.
- Archive guidance: when Completed grows large, move older entries to \`tasks-archive.md\` and add a pointer here.

## Multi-Dev Notes

> **ID collisions are the #1 source of merge conflicts in shared spec files.**
> Follow these rules when more than one person commits to this repo:
>
> - Always \`git pull\` before appending to the Completed section.
> - Use your personal prefix in all Completed IDs: \`CD-{your-handle}-###\`
>   so two devs never claim the same number independently.
> - Only run \`specpilot archive\` on the default branch (main/master) **after** merging,
>   never on a feature branch — diverged trim points break the archive history.

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
description: Release milestones, objectives, and delivery timeline
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
[TODO: Add project context and decisions]

## Cross-References
- Roadmap: ../planning/roadmap.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;

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
[TODO: Add testing strategy and approach]

## Cross-References
- Requirements: ../project/requirements.md
- Project config: ../project/project.yaml

---
*Last updated: {{currentDate}}*`;

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

> Describe the attack surface: what the system does, what it reads/writes, and what it does NOT do (e.g., no network calls at runtime).

[TODO: Summarise the system's threat surface — input sources, outputs, and offline/online constraints.]

## Threat Model [SEC-002]

### [Threat Name] [SEC-002.1]

| Field | Detail |
|---|---|
| **Description** | [TODO: Describe the threat] |
| **Impact** | [TODO: High / Medium / Low] |
| **Likelihood** | [TODO: High / Medium / Low / Very low] |
| **Entry point** | [TODO: Where does attacker-controlled data enter?] |
| **Mitigation** | [TODO: What control prevents or limits this threat?] |
| **Residual risk** | [TODO: What risk remains after mitigation?] |

### [Threat Name] [SEC-002.2]

| Field | Detail |
|---|---|
| **Description** | [TODO: Describe the threat] |
| **Impact** | [TODO: High / Medium / Low] |
| **Likelihood** | [TODO: High / Medium / Low / Very low] |
| **Entry point** | [TODO: Where does attacker-controlled data enter?] |
| **Mitigation** | [TODO: What control prevents or limits this threat?] |
| **Residual risk** | [TODO: What risk remains after mitigation?] |

## Attack Surface Summary [SEC-003]

| Entry Point | Data Type | Validated? | Used In |
|---|---|---|---|
| [TODO: entry point] | [TODO: type] | [TODO: ✅ / ⚠️ / ❌] | [TODO: component] |

## Out of Scope [SEC-004]

- [TODO: List threats explicitly out of scope, e.g. OS-level permissions, container isolation]

---

_Last updated: {{currentDate}}_`;

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

> Record security-relevant architectural decisions here in ADR style.
> Each entry should capture: what was decided, why, and any trade-offs.

## Decisions [SEC-002.1]

### [Decision title] [ADR-001]

| Field | Detail |
|---|---|
| **Decision** | [TODO: What was decided?] |
| **Status** | [TODO: Accepted / Proposed / Deprecated] |
| **Context** | [TODO: What problem does this solve?] |
| **Rationale** | [TODO: Why was this approach chosen over alternatives?] |
| **Trade-offs** | [TODO: What are the downsides or limitations?] |
| **Related threat** | [TODO: Which threat in threat-model.md does this address?] |

### [Decision title] [ADR-002]

| Field | Detail |
|---|---|
| **Decision** | [TODO: What was decided?] |
| **Status** | [TODO: Accepted / Proposed / Deprecated] |
| **Context** | [TODO: What problem does this solve?] |
| **Rationale** | [TODO: Why was this approach chosen over alternatives?] |
| **Trade-offs** | [TODO: What are the downsides or limitations?] |
| **Related threat** | [TODO: Which threat in threat-model.md does this address?] |

## Cross-References
- Threat model: ./threat-model.md
- Architecture: ../architecture/architecture.md

---
*Last updated: {{currentDate}}*`;

    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'security-decisions.md'), rendered);
  }

}
