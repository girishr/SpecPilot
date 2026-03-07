---
fileID: ARCH-001
lastUpdated: 2026-03-07
version: 1.6
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, api.yaml, tasks.md]
---

# System Architecture

## Overview [ARCH-002]

The SpecPilot SDD CLI is a Node.js/TypeScript CLI tool that generates specification-driven development structures for both new and existing projects. It follows a template-based approach with intelligent codebase analysis to create consistent, customizable `.specs/` directories.

## Core Components [ARCH-003]

- **CLI Parser**: Command-line argument processing with Commander.js [ARCH-003.1]
- **Template Engine**: Handlebars helpers and `renderFromString()` utility [ARCH-003.2]
- **Spec Generator**: Thin coordinator that delegates to SpecFileGenerator, IdeConfigGenerator, and AgentConfigGenerator [ARCH-003.3]
- **Spec File Generator**: Generates `.specs/` markdown and YAML files (prompts.md, README, project.yaml, etc.) [ARCH-003.3.1]
- **IDE Config Generator**: Generates workspace settings for VSCode, Cursor, Windsurf, Kiro, Antigravity; always generates `.github/copilot-instructions.md` regardless of IDE choice [ARCH-003.3.2]
- **Agent Config Generator**: Generates Cowork Skills and Codex Instructions [ARCH-003.3.3]
- **Validator**: Spec file validation with cross-reference checking [ARCH-003.4]
- **Migrator**: Version migration and structure updates [ARCH-003.5]
- **Project Detector**: Auto-detects language/framework from existing files [ARCH-003.6]
- **Code Analyzer**: Scans codebase for TODOs, tests, and architecture with nested folder tree display [ARCH-003.7]
- **Frameworks Utility**: Shared `getFrameworksForLanguage()` function [ARCH-003.8]

## Design Decisions [ARCH-004]

- **Template Storage**: Built-in inline templates (no external template files) [ARCH-004.1]
- **Structure Flexibility**: Customizable spec folder names [ARCH-004.2]
- **Language Support**: TypeScript, JavaScript, and Python with framework detection [ARCH-004.3]
- **Developer Control**: Guidelines, not prescriptions [ARCH-004.4]
- **Existing Projects**: add-specs command with intelligent analysis [ARCH-004.5]
- **Folder Structure Display**: Nested tree visualization instead of flat lists [ARCH-004.5.1]
- **Metadata First**: YAML front-matter for all spec files [ARCH-004.6]
- **Git Mandates**: Explicit prompts required for all git operations [ARCH-004.7]
- **Module Split**: specGenerator.ts split into 3 focused modules (FIX-011) [ARCH-004.8]
- **Dual Onboarding**: Separate prompts for new projects (planning-first) and existing projects (codebase-analysis) [ARCH-004.9]
- **Diff Preview**: specify command shows changes and asks for confirmation before writing [ARCH-004.10]
- **Universal Copilot Instructions**: `.github/copilot-instructions.md` always generated regardless of IDE — re-injects critical mandates into every AI request to prevent context drift in long sessions [ARCH-004.11]
- **Tiered Rules**: Generated `project.yaml` uses 🔴 critical / 🟡 process / 🟢 preferences tiers to give AI tools clear priority signals [ARCH-004.12]

## Technology Stack [ARCH-005]

- **Runtime**: Node.js [ARCH-005.1]
- **Language**: TypeScript [ARCH-005.2]
- **CLI Framework**: Commander.js [ARCH-005.3]
- **Template Engine**: Handlebars [ARCH-005.4]
- **Package Manager**: NPM [ARCH-005.5]

## Data Flow [ARCH-006]

### Init Command Flow [ARCH-006.1]

1. User runs `specpilot init <project-name>` with parameters
2. CLI parses arguments and validates project name (allowlist regex)
3. Checks for existing .specs folder (CS-004)
4. Prompts for framework and developer name (CS-005)
5. Prompts for IDE/agent selection
6. Asks 4 project context questions (1 mandatory, 3 optional)
7. Spec File Generator creates subfolder structure with mode-aware prompts
8. IDE/Agent configs generated based on selection
9. `.github/copilot-instructions.md` generated unconditionally
10. Validator confirms structure integrity

### Add-Specs Command Flow [ARCH-006.2]

1. User runs `specpilot add-specs` in existing project
2. Project Detector scans for package.json, requirements.txt, etc.
3. Auto-detects language, framework, dependencies
4. Code Analyzer scans for TODOs, tests, components (unless --no-analysis)
5. Prompts for missing information
6. Spec Generator creates .specs with analysis data (mode: existing)
7. Reports discovered items (TODOs, tests, components)

### Specify Command Flow [ARCH-006.3]

1. User runs `specpilot specify` in project with .specs/
2. Reads current spec files (requirements.md, context.md, prompts.md)
3. Collects all pending changes into a list
4. Shows line-level diff preview (added/removed lines with context)
5. Prompts for confirmation (unless --no-prompts)
6. Writes approved changes to disk

## Assumptions [ARCH-007]

- **Node.js runtime**: Node.js >= 16 is required; the output module format is CommonJS (`"module": "commonjs"` in `tsconfig.json`) [ARCH-007.1]
- **File paths**: All file path operations use `path.join()` / `path.resolve()` to ensure cross-platform compatibility (macOS, Linux, Windows) [ARCH-007.2]
- **No network at runtime**: All templates are built-in; no HTTP calls are made during `init`, `add-specs`, or `validate` [ARCH-007.3]
- **Single project root**: The CLI operates on a single root directory; monorepo support is out of scope [ARCH-007.4]
- **Write access**: The user has write permission to the target project directory [ARCH-007.5]
- **TypeScript compilation**: Source is compiled with `tsc` to `dist/`; the published package ships the compiled JS, not the TS source [ARCH-007.6]
- **No global state**: All generator functions are stateless and receive all inputs as parameters — safe for programmatic use [ARCH-007.7]

---

_Last updated: 2026-03-07_
