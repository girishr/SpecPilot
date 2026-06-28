---
fileID: CTX-001
lastUpdated: 2026-06-28
version: 2.0
contributors: [girishr]
relatedFiles: [planning/roadmap.md, project/project.yaml]
---

# Project Context & Memory

## Current State [CTX-002]

- **Phase**: Active Development (v2.0.1)
- **Status**: Production-ready with continuous enhancements
- **Recent Implementations**: Kotlin/Swift language support, conditional api.yaml generation, onboarding.md split from prompts.md, mandatory devPrefix ID conventions, terse spec templates, Code Philosophy + Code Rules in generated AI instruction files (CS-074 pending), Cursor output renamed to `specpilot.mdc`
- **Next Steps**: See tasks.md Current Sprint

## Key Decisions [CTX-003]

- **Structure**: Subfolder-organized `.specs/` with metadata headers [CTX-003.1]
- **Language**: TypeScript with Node.js runtime [CTX-003.2]
- **Approach**: Specification-driven development with developer freedom [CTX-003.3]
- **Templates**: Built-in templates with intelligent defaults [CTX-003.4]
- **Validation**: Integrated with cross-reference checking [CTX-003.5]
- **Developer Control**: Guidelines work better than prescriptions [CTX-003.6]
- **Existing Projects**: add-specs command with codebase analysis [CTX-003.7]
- **Git Mandates**: Require explicit developer prompts for all git operations [CTX-003.8]
- **Folder Structure Display**: Show nested tree instead of flat list in architecture.md [CTX-003.9]
- **AI IDE Integration**: Support for GitHub Copilot, Cursor, Windsurf, Antigravity, Claude Code, and Codex; existing-project updates via non-destructive backfill [CTX-003.10]
- **Visual CLI**: Gemini-style graphical interface with ASCII branding [CTX-003.11]
- **Module Split**: specGenerator.ts split into specFileGenerator, ideConfigGenerator, agentConfigGenerator for maintainability [CTX-003.12]
- **Template Simplification**: Removed TemplateRegistry abstraction; inlined catalog as constant [CTX-003.13]
- **Dual Onboarding**: Separate prompts for new projects (planning-focused) and existing projects (analysis-focused); onboarding.md written separately, deleted after first use [CTX-003.14]
- **Diff Preview**: refine command shows changes before writing, with confirmation prompt [CTX-003.15]
- **IDE Settings**: Fabricated setting keys removed; aspirational keys marked clearly [CTX-003.16]
- **Existing-Project Backfills**: `specpilot backfill` for non-destructive backfills — detects missing mandates and inserts only what's absent; never overwrites user-authored content [CTX-003.17]
- **Migrate Scope**: `specpilot migrate` for legacy structure conversion only; do not position as a general version-update command [CTX-003.18]
- **Aggressive Archive Thresholds**: archive `tasks.md` once `## Completed` exceeds 25 lines; archive `prompts.md` once file exceeds 100 lines [CTX-003.19]
- **IDE-Native Backfill Scope**: `specpilot backfill` inspects IDE files on disk and patches missing mandate blocks without requiring an IDE-selection prompt; SKILL.md reported stale rather than auto-patched [CTX-003.20]
- **Spec File Purpose Metadata**: generated markdown spec files include a one-line `description:` front-matter field; generated `api.yaml` carries a `# Purpose:` header comment [CTX-003.21]
- **Code Philosophy + Code Rules**: all generated AI instruction files include a 7-item YAGNI/minimal-code decision ladder and 7 behavioral coding rules in caveman style; injected at generation time and backfilled into existing files via `specpilot backfill` [CTX-003.22]

## Established Patterns [CTX-004]

- **File Organization**: Subfolder structure under `.specs/` (project/, architecture/, planning/, quality/, development/, security/) [CTX-004.1]
- **Naming Convention**: Consistent kebab-case for files [CTX-004.2]
- **Documentation**: Markdown with YAML front-matter metadata [CTX-004.3]
- **Version Control**: Git with conventional commits [CTX-004.4]
- **Code Style**: TypeScript strict mode with ESLint [CTX-004.5]
- **Stable IDs**: REQ-###, ARCH-###, TASK-### format for traceability [CTX-004.6]
- **Cross-References**: Relative paths between related spec files [CTX-004.7]

## Lessons Learned [CTX-006]

- **Start Simple**: Complex structures lead to maintenance burden [CTX-006.1]
- **Developer Control**: Guidelines work better than prescriptions [CTX-006.2]
- **Existing Projects**: Detecting and analyzing existing codebases provides immediate value [CTX-006.6]
- **Code Review Value**: Systematic code review caught dead code, security gaps, and architecture debt [CTX-006.13]
- **Module Boundaries**: Splitting large files (1,298 → 3 focused modules) reduces merge conflicts and cognitive load [CTX-006.14]
- **Test Investment**: Going from 3 to 188 tests caught real alignment issues [CTX-006.15]
- **Aspirational vs Real**: Marking unconfirmed IDE settings as ASPIRATIONAL prevents user trust erosion [CTX-006.16]
- **Specs Drift**: CLI surface changes should update `architecture/api.yaml`, `planning/roadmap.md`, and `development/context.md` in the same pass so generated-command docs and project memory do not lag behind implementation [CTX-006.17]
