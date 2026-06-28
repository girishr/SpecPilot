---
name: specpilot-project
description: SpecPilot project context, specifications, and development guidelines. Use to understand project architecture, requirements, and AI interaction history.
---

# SpecPilot Project Context

This Skill provides context about the SpecPilot SDD CLI project structure, specifications, and development practices.

## Quick Start

The project uses Specification-Driven Development (SDD). All context lives in the `.specs/` folder:

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

- Update .specs/ files when making changes
- Maintain .specs/ as single source of truth
- Never modify .specs/ folder structure or file names
- Document decisions in context.md
- Update prompts.md with AI interactions
- Follow stable ID conventions (REQ-###, TASK-###, ARCH-###)

## Architecture Overview

- **Project:** SpecPilot SDD CLI
- **Language:** TypeScript
- **Framework:** Node.js / Commander.js
- **Key modules:** `specFileGenerator`, `ideConfigGenerator`, `agentConfigGenerator`, `specBackfiller`, `specArchiver`, `specValidator`

## Development Process

1. Review requirements in .specs/project/requirements.md
2. Check tasks in .specs/planning/tasks.md
3. Reference architecture in .specs/architecture/architecture.md
4. Update specs after major changes
5. Document decisions and context

## AI Onboarding

For full AI onboarding instructions, see **.specs/development/prompts.md**.

## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.
