import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';

/**
 * Generates AI agent configuration files:
 * - Cowork Skills (.claude/skills/specpilot-project/SKILL.md)
 * - Codex Instructions (CODEX_INSTRUCTIONS.md at project root)
 */
export class AgentConfigGenerator {
  constructor(private templateEngine: TemplateEngine) {}

  /** Entry point — routes to the correct agent config generator. */
  async generate(projectDir: string, context: TemplateContext, agent: string): Promise<void> {
    switch (agent.toLowerCase()) {
      case 'cowork':
        await this.generateCoworkSkills(projectDir, context);
        break;
      case 'codex':
        await this.generateCodexInstructions(projectDir, context);
        break;
    }
  }

  private async generateCoworkSkills(projectDir: string, context: TemplateContext): Promise<void> {
    const skillsDir = join(projectDir, '.claude', 'skills', 'specpilot-project');
    mkdirSync(skillsDir, { recursive: true });

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
- Never modify .specs/ folder structure or file names
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

    writeFileSync(
      join(skillsDir, 'SKILL.md'),
      skillContent
        .replace(/\{\{projectName\}\}/g, context.projectName)
        .replace(/\{\{language\}\}/g, context.language)
        .replace(/{{#if framework}}/g, context.framework ? '' : '<!-- ')
        .replace(/{{\/if}}/g, context.framework ? '' : ' -->')
    );
  }

  private async generateCodexInstructions(projectDir: string, context: TemplateContext): Promise<void> {
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

### Mandate: Preserve .specs Folder Structure
**The .specs/ folder structure is IMMUTABLE and must never be altered.**
- ❌ Do NOT rename files or folders
- ❌ Do NOT move files between subfolders
- ❌ Do NOT delete files or folders
- ❌ Do NOT change file extensions
- ✅ DO update file CONTENTS and add sections
- ✅ DO add metadata headers and cross-references

The stable structure ensures AI agents can reliably locate specifications and automation tools function correctly.

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
