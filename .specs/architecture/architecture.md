---
fileID: ARCH-001
lastUpdated: 2026-05-03
version: 2.5
contributors: [girishr]
relatedFiles:
  [
    project.yaml,
    requirements.md,
    api.yaml,
    tasks.md,
    security/threat-model.md,
    security/security-decisions.md,
  ]
---

# System Architecture

## Overview [ARCH-002]

The SpecPilot SDD CLI is a Node.js/TypeScript CLI tool that generates specification-driven development structures for both new and existing projects. It follows a template-based approach with intelligent codebase analysis to create consistent, customizable `.specs/` directories.

## Core Components [ARCH-003]

- **CLI Parser**: Command-line argument processing with Commander.js [ARCH-003.1]
- **Template Engine**: Handlebars helpers and `renderFromString()` utility [ARCH-003.2]
- **Spec Generator**: Thin coordinator that delegates to SpecFileGenerator, IdeConfigGenerator, and AgentConfigGenerator [ARCH-003.3]
- **Spec File Generator**: Generates `.specs/` markdown and YAML files (prompts.md, README, project.yaml, etc.) [ARCH-003.3.1]
- **IDE Config Generator**: Generates workspace settings and IDE-native AI context file based on selected IDE; VSCode/Codex → `.github/copilot-instructions.md`; Cursor → `.cursor/rules/project.mdc`; Windsurf → `.windsurfrules`; Antigravity → `.antigravity/rules.md`; Cowork → `CLAUDE.md` (lean router: mandates inline + pointers to `.specs/` + reference to SKILL.md) via `generateAiContextFile()` → `generateClaudeMd()` [ARCH-003.3.2]
- **Agent Config Generator**: Generates Cowork Skills (`.claude/skills/specpilot-project/SKILL.md`) and Codex Instructions (`CODEX_INSTRUCTIONS.md`); CLAUDE.md itself is in IdeConfigGenerator [ARCH-003.3.3]
- **Validator**: Spec file validation with cross-reference checking [ARCH-003.4]
- **Archiver**: Archives oversized `.specs/` files (`prompts.md` > 100 lines → `prompts-archive.md`; `tasks.md` Completed > 25 lines → `tasks-archive.md`); supports `--dry-run` [ARCH-003.9]
- **Migrator**: Version migration and structure updates [ARCH-003.5]
- **Project Detector**: Auto-detects language/framework from existing files [ARCH-003.6]
- **Code Analyzer**: Scans codebase for TODOs, tests, and architecture with nested folder tree display [ARCH-003.7]
- **Frameworks Utility**: Shared `getFrameworksForLanguage()` function [ARCH-003.8]
- **Spec Tree Printer**: `src/utils/specTreePrinter.ts` — hardcoded `.specs/` file list with one-line descriptions; called by `Logger.displayInitSuccess()` [ARCH-003.10]
- **Spec Backfiller**: `src/utils/specBackfiller.ts` — non-destructively backfills missing SpecPilot mandates into `project.yaml`, `copilot-instructions.md`, and `planning/tasks.md` using fingerprint-based detection and append-only writes; when `team.devPrefix` is absent, prompts for the handle using `contributors[0]` from `project.yaml` as the suggested default (fallback: `os.userInfo().username`); writes `team:\n  devPrefix:` into `project.yaml` before patching `tasks.md`; `--no-prompts` accepts the suggestion silently; used by the `backfill` command with `--dry-run` support [ARCH-003.11]

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
- **Diff Preview**: refine command shows changes and asks for confirmation before writing [ARCH-004.10]
- **Universal Copilot Instructions**: replaced by per-IDE routing (ARCH-004.11 revised) — each IDE gets its native AI context file: VSCode/Codex → `.github/copilot-instructions.md`; Cursor → `.cursor/rules/project.mdc` (YAML front-matter with `alwaysApply: true`); Windsurf → `.windsurfrules`; Antigravity → `.antigravity/rules.md`; `copilot-instructions.md` is **not** generated for Cursor/Windsurf/Antigravity since those IDEs partially or incorrectly parse it [ARCH-004.11]
- **Tiered Rules**: Generated `project.yaml` uses 🔴 critical / 🟡 process / 🟢 preferences tiers to give AI tools clear priority signals [ARCH-004.12]
- **Security Documentation**: `.specs/security/` subfolder with `threat-model.md` (path traversal, template injection, supply chain) and `security-decisions.md` (ADR-style security decision log) [ARCH-004.13]
- **Spec File Archiving**: `specpilot archive` command trims growing `.specs/` files back within tighter active-file limits to keep the working copies easy to scan; archived blocks receive a timestamped header and are appended to the corresponding `-archive.md` file; `--dry-run` flag previews without writing [ARCH-004.14]
- **Post-Init Tree Display**: After `specpilot init` and `specpilot add-specs` success, `Logger.displayInitSuccess()` renders a tree of generated `.specs/` files via the shared `SpecTreePrinter` helper, with hardcoded one-line descriptions [ARCH-004.15]
- **Security Subfolder Generation**: `specpilot init` now generates `security/threat-model.md` and `security/security-decisions.md` starter templates in every new project; both files use YAML front-matter and labelled placeholder sections; `specTreePrinter.ts` includes both in the post-init tree [ARCH-004.16]
- **Spec-First Review Gate**: generated `project.yaml` and `.github/copilot-instructions.md` both include a critical mandate that blocks code or non-spec edits until the AI has read relevant `.specs/` files, updated the affected specs first, produced a Spec Report, and received an explicit developer `yes, proceed` [ARCH-004.17]
- **Non-Destructive Existing-Project Backfills**: `specpilot backfill` (alias `bf`) command detects what the current SpecPilot version would generate vs what the project currently has, and inserts only the missing mandates/instructions/files; for `planning/tasks.md`, reads `team.devPrefix` from `project.yaml` and inserts the `CD-{devPrefix}-###` convention line and `## Multi-Dev Notes` section if absent; append-only writes preserve existing user-authored spec and instruction content; `--dry-run` prints the planned changes without writing [ARCH-004.18]
- **Archive Branch Guard**: before `specpilot archive` runs, `archiveCommand()` calls `git rev-parse --abbrev-ref HEAD`; if the branch is not `main` or `master`, a yellow warning is printed and the user is prompted `[y/N]`; declining aborts without writing files; `--force` flag skips the prompt; branch detection failure (e.g. not a git repo) is silently ignored [ARCH-004.19]
- **CLAUDE.md as Router**: when IDE = Cowork, `generateAiContextFile()` routes to `generateClaudeMd()` which writes a project-root `CLAUDE.md`; file is intentionally lean — critical mandates inline plus ordered list of context pointers (`.specs/project/project.yaml`, `requirements.md`, `architecture.md`, `tasks.md`, `.claude/skills/specpilot-project/SKILL.md`); design follows the "router not a dumping ground" principle (BL-023); existing-file handling mirrors `generateCopilotInstructions()`: `[o]verwrite / [a]ppend / [s]kip` with prompts, auto-skip + yellow warning with `--no-prompts`; closes BL-023 and BL-028 [ARCH-004.23]
- **Migrate Is Legacy-Only**: `specpilot migrate` remains for rare old-structure conversions and should be documented as such; same-structure backfills belong to `specpilot backfill`, not `migrate` [ARCH-004.19]
- **GitHub Username as devPrefix**: `init` and `add-specs` prompt for GitHub username instead of display name; stored as `TemplateContext.author` (used in `contributors: [{{author}}]` front-matter) and written as `team.devPrefix` in generated `project.yaml` to namespace task and prompt IDs (e.g. `CD-{devPrefix}-001`); default obtained via `git config user.name`, falling back to `'your-username'` [ARCH-004.20]
- **Git Merge Strategy for Spec Files**: `specpilot init` and `specpilot add-specs` generate a `.gitattributes` file at project root with `merge=union` for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; if `.gitattributes` already exists, only missing lines are appended; implemented in `IdeConfigGenerator.generateGitAttributes()`, called unconditionally from `SpecGenerator.generateSpecs()` [ARCH-004.21]
- **devPrefix in Generated ID Conventions**: generated `tasks.md` template shows `CD-{{author}}-###` as the Completed ID pattern and includes a `## Multi-Dev Notes` callout with pull-before-append and archive-on-default-branch guidance; generated `prompts.md` template references `PROMPT-{{author}}-###` as the prompt log ID pattern; both use the GitHub username collected at init time via `TemplateContext.author` [ARCH-004.22]

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
4. Prompts for framework and GitHub username (used as `contributors` handle and `devPrefix` for ID namespacing)
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

### Refine Command Flow [ARCH-006.3]

1. User runs `specpilot refine` in project with .specs/
2. Reads current spec files (requirements.md, context.md, prompts.md)
3. Collects all pending changes into a list
4. Shows line-level diff preview (added/removed lines with context)
5. Prompts for confirmation (unless --no-prompts)
6. Writes approved changes to disk

### Backfill Command Flow [ARCH-006.4]

1. User runs `specpilot backfill` in a project that already contains `.specs/`
2. Command reads current `.specs/project/project.yaml` and `.github/copilot-instructions.md`
3. Compares current content against the latest SpecPilot-managed mandate/instruction blocks
4. Computes only missing insertions or append operations; existing user-authored content is preserved
5. In `--dry-run`, prints the planned changes without writing
6. In write mode, applies the minimal merge/appends and prints a summary of updated files and skipped files

## Assumptions [ARCH-007]

- **Node.js runtime**: Node.js >= 16 is required; the output module format is CommonJS (`"module": "commonjs"` in `tsconfig.json`) [ARCH-007.1]
- **File paths**: All file path operations use `path.join()` / `path.resolve()` to ensure cross-platform compatibility (macOS, Linux, Windows) [ARCH-007.2]
- **No network at runtime**: All templates are built-in; no HTTP calls are made during `init`, `add-specs`, or `validate` [ARCH-007.3]
- **Single project root**: The CLI operates on a single root directory; monorepo support is out of scope [ARCH-007.4]
- **Write access**: The user has write permission to the target project directory [ARCH-007.5]
- **TypeScript compilation**: Source is compiled with `tsc` to `dist/`; the published package ships the compiled JS, not the TS source [ARCH-007.6]
- **No global state**: All generator functions are stateless and receive all inputs as parameters — safe for programmatic use [ARCH-007.7]

---

_Last updated: 2026-04-05_
