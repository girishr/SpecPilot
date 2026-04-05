---
fileID: CTX-001
lastUpdated: 2026-04-05
version: 1.5
contributors: [girishr]
relatedFiles: [development/docs.md, planning/roadmap.md, project/project.yaml]
---

# Project Context & Memory

## Current State [CTX-002]

- **Phase**: Active Development (v1.4.0)
- **Status**: Production-ready with continuous enhancements
- **Recent Implementations**: 19-fix code review refactoring (FIX-001 through FIX-019), 72 test coverage, module split (specGenerator → specFileGenerator + ideConfigGenerator + agentConfigGenerator), dual onboarding prompts (new/existing), specify diff preview, ESLint integration
- **Next Steps**: See tasks.md Current Sprint (CS-018 through CS-034) — .specs folder fixes and generated output improvements

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
- **AI IDE Integration**: Support for VSCode, Cursor, Windsurf, Kiro, and Antigravity workspace settings; Cowork Skills and Codex instructions for cloud-based AI agents [CTX-003.10]
- **Visual CLI**: Gemini-style graphical interface with ASCII branding [CTX-003.11]
- **Module Split**: specGenerator.ts split into specFileGenerator, ideConfigGenerator, agentConfigGenerator for maintainability (FIX-011) [CTX-003.12]
- **Template Simplification**: Removed TemplateRegistry abstraction; inlined catalog as constant (FIX-013) [CTX-003.13]
- **Dual Onboarding**: Separate prompts for new projects (planning-focused) and existing projects (analysis-focused) with baked-in project context (FIX-018) [CTX-003.14]
- **Diff Preview**: specify command shows changes before writing, with confirmation prompt (FIX-019) [CTX-003.15]
- **IDE Settings**: Fabricated setting keys removed; aspirational keys marked clearly (FIX-017) [CTX-003.16]
- **Existing-Project Backfills**: use a future `specpilot update` command for non-destructive backfills of generated rules/instructions into projects that already have `.specs/`; the command should merge or append missing SpecPilot-managed content rather than overwrite user edits [CTX-003.17]
- **Migrate Scope**: keep `specpilot migrate` for rare legacy structure conversion only; do not position it as a general version-update command in docs/help text [CTX-003.18]

## Established Patterns [CTX-004]

- **File Organization**: Subfolder structure under `.specs/` (project/, architecture/, planning/, quality/, development/) [CTX-004.1]
- **Naming Convention**: Consistent kebab-case for files [CTX-004.2]
- **Documentation**: Markdown with YAML front-matter metadata [CTX-004.3]
- **Version Control**: Git with conventional commits [CTX-004.4]
- **Code Style**: TypeScript strict mode with ESLint [CTX-004.5]
- **Stable IDs**: REQ-###, ARCH-###, TASK-### format for traceability [CTX-004.6]
- **Cross-References**: Relative paths between related spec files [CTX-004.7]

## Known Issues [CTX-005]

- **Template Complexity**: Need to balance flexibility with simplicity [CTX-005.1]
- **Migration Strategy**: Version compatibility across updates [CTX-005.2]
- **Validation Scope**: Determine optimal validation depth [CTX-005.3]
- **Performance**: Ensure fast initialization times [CTX-005.4]

## Lessons Learned [CTX-006]

- **Start Simple**: Complex structures lead to maintenance burden [CTX-006.1]
- **Developer Control**: Guidelines work better than prescriptions [CTX-006.2]
- **AI Integration**: Prompts tracking provides valuable context [CTX-006.3]
- **Iterative Design**: Refine structure based on actual usage [CTX-006.4]
- **Documentation First**: Specs before code improves clarity [CTX-006.5]
- **Existing Projects**: Detecting and analyzing existing codebases provides immediate value [CTX-006.6]
- **Metadata Matters**: YAML front-matter enables powerful validation and cross-referencing [CTX-006.7]
- **TODO Discovery**: Parsing existing TODOs/FIXMEs helps with task prioritization [CTX-006.8]
- **Git Mandates**: Explicit prompts prevent accidental commits and maintain developer control [CTX-006.9]
- **User Experience**: Providing real analysis value exceeds placeholder requirements [CTX-006.10]
- **IDE-Specific Settings**: Multi-IDE support provides flexibility for different AI coding environments [CTX-006.11]
- **Visual Identity**: Branded CLI interface improves professional perception and user engagement [CTX-006.12]
- **Code Review Value**: Systematic code review (19 fixes) caught dead code, security gaps, and architecture debt [CTX-006.13]
- **Module Boundaries**: Splitting large files (1,298 → 3 focused modules) reduces merge conflicts and cognitive load [CTX-006.14]
- **Test Investment**: Going from 3 to 72 tests caught real alignment issues during the review process [CTX-006.15]
- **Aspirational vs Real**: Marking unconfirmed IDE settings as ASPIRATIONAL prevents user trust erosion [CTX-006.16]

## Development Insights [CTX-007]

- **Specification-Driven**: Writing specs first clarifies requirements [CTX-007.1]
- **Prompt Tracking**: Complete audit trail improves continuity [CTX-007.2]
- **Structure Evolution**: Start minimal, expand as needed [CTX-007.3]
- **Tool Purpose**: Helper tool, not replacement for developer expertise [CTX-007.4]
- **Production Focus**: Design for serious development workflows [CTX-007.5]
