# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-03-17

### Added

- **`security/` subfolder generated during `specpilot init`** (CD-103/CS-033): `generateAll()` in `specFileGenerator.ts` now creates `security/threat-model.md` and `security/security-decisions.md` starter templates with YAML front-matter and ADR-style placeholder sections; `security/` mkdir added to `specGenerator.ts` subfolders; dry-run list in `init.ts` updated (+3 entries); `specTreePrinter.ts` updated with 2 new entries; 2 new tests added (96 total).

## [1.5.1] - 2026-03-16

### Added

- **Rename `specify` command to `refine`** (CD-102/CS-043): `src/commands/specify.ts` renamed to `src/commands/refine.ts`; exported function renamed `specifyCommand` → `refineCommand`; interface `SpecifyOptions` → `RefineOptions`; command registered as `refine` (alias `ref`) in `cli.ts` with updated description; welcome screen, generated `docs.md` template, README, `docs/GUIDE.md`, and all `.specs/` reference files updated to use `refine`.
- **Post-init `.specs/` tree display** (CD-101/CS-041): After `specpilot init` and `specpilot add-specs` success, the generated `.specs/` folder is now displayed as a tree with one-line descriptions for each file. Shared helper `src/utils/specTreePrinter.ts` provides hardcoded `SPEC_ENTRIES` list and `getSpecTreeLines(specsName)` function; called from `Logger.displayInitSuccess()` in `logger.ts`.
- **`specpilot init --dry-run` flag** (CD-100/CS-034): `initCommand()` now accepts `--dry-run`; when set, skips all interactive prompts and file creation — prints the full list of files and directories that would be created (14 files, 9 dirs) and exits cleanly without writing anything. Option registered in `cli.ts`.
- **Archive guidance in generated `prompts.md`** (CD-099/CS-031): `generatePromptsMd()` in `specFileGenerator.ts` now includes a `## Archive Policy` section instructing users to run `specpilot archive` when the file exceeds 300 lines; explains that older entries move to `prompts-archive.md` automatically and `--dry-run` is available; no stub file generated during init.
- **`specpilot archive` command** (CD-098/CS-038): New `SpecArchiver` class (`src/utils/specArchiver.ts`) archives `development/prompts.md` when > 300 lines (moves older entries to `prompts-archive.md`) and `planning/tasks.md` Completed section when > 150 lines (moves to `tasks-archive.md`); archived blocks are appended with a timestamped header; `--dry-run` flag previews changes without writing; command registered in `cli.ts` with alias `ar`; welcome screen updated.
- **`specpilot validate` stale-date warnings** (CD-096/CS-029): `validateStaleDates()` added to `SpecValidator` — warns when any `.md` spec file has a `lastUpdated` front-matter field older than 90 days.
- **`specpilot validate` line-limit warnings** (CD-096/CS-029): `validateLineLimits()` added to `SpecValidator` — warns when `development/prompts.md` exceeds 300 lines or the `## Completed` section of `planning/tasks.md` exceeds 150 lines, with a hint to run `specpilot archive`.
- **Jest types added to `tsconfig.json`** (CD-096): Added `"jest"` to the `types` array so `ts-jest` can resolve `describe`/`it`/`expect` globals in test files.

### Fixed

- **`specpilot validate` crash on nested `rules` in `project.yaml`** (CD-097): `flattenRules()` helper added to `SpecValidator` — flattens nested `critical`/`process`/`preferences` rule sub-arrays into a single list before mandate checks; fixes `rules.some is not a function` error and the spurious "should have a rules section" warning.

- **`## Assumptions` section added to generated `requirements.md`** (CD-093/CS-027): `generateRequirementsMd()` in `specFileGenerator.ts` now includes a labelled `## Assumptions` section with 3 placeholder items and a reviewer note; placed before `## Cross-References`.
- **`## Assumptions` section added to generated `architecture.md`** (CD-094/CS-028): `getArchitectureTemplate()` in `templateEngine.ts` now appends a `## Assumptions` section with 3 placeholder items and a reviewer note; placed after `## Monitoring and Observability`.
- **`.specs/security/` folder added** (CD-095/CS-020): New `threat-model.md` documents 3 threats — path traversal [SEC-002.1], template injection [SEC-002.2], supply chain [SEC-002.3] — with impact/likelihood/mitigation tables. New `security-decisions.md` records 4 ADR-style decisions (allowlist regex, no network calls, Handlebars auto-escaping, minimal dependencies). Updated `architecture.md` (v1.7, ARCH-004.13) and `docs.md` (v1.4, `security/` added to protected structure).

### Fixed

(CD-089/CS-042): TypeScript frameworks now lists React, Express, Next.js, Nest.js, Vue, Angular (removed non-existent CLI entry); JavaScript section corrected to React + Express only with a note that no framework prompt is shown; Python section corrected to FastAPI, Django, Flask, Streamlit (removed `Data Science` which was not a valid framework value); `specify` command signature changed from `<desc>` to `[desc]` to reflect optional argument.

- **Welcome screen missing commands fixed** (CD-090): `migrate` and `specify` added to hardcoded Available Commands list in `displayWelcome()` in `logger.ts`; fixed missing space in `add-specs` entry; commands now listed in logical usage order with consistent column alignment.
- **README Project Structure expanded** (CD-091): Tree now shows all 10 generated files with inline descriptions; redundant `### Key Files` bullet list removed.
- **Cross-document doc audit** (CD-092): `docs/GUIDE.md` Project Structure tree updated to match README (alphabetical folders, all 10 files, `copilot-instructions.md` note added); `docs/GUIDE.md` framework tables corrected (TypeScript: added Nest.js/Vue/Angular, removed CLI; JavaScript: React+Express only with note; Python: replaced `Data Science` with Flask and Streamlit); `.specs/development/docs.md` pre-commit checklist and Protected Structure section now reference `.github/copilot-instructions.md`.

## [1.5.0] - 2026-03-08

### Changed

- **`project/requirements.md` rewritten to v1.3** (CD-080): Restructured into sub-sections (REQ-002.A–F). Added `specify` command with diff/confirmation [REQ-002.A.6], project context prompts during `init` [REQ-002.B.1], `--no-prompts` flag [REQ-002.B.6], IDE settings generation for VSCode/Cursor/Windsurf/Kiro/Antigravity [REQ-002.E.2], cloud agent config for Cowork/Codex [REQ-002.E.3], dual onboarding prompts [REQ-002.F.4], new `## Assumptions [REQ-004]` section, path-injection NFR [REQ-003.4].
- **`prompts.md` archived and trimmed** (CD-081): Manually archived `prompts.md` (447 lines) to new `prompts-archive.md`; active file trimmed to 56 lines; 300-line Archive Policy section added; `tasks.md` Completed header updated with 150-line limit guidance.
- **`architecture.md` Assumptions section added** (CD-082): New `## Assumptions [ARCH-007]` section (v1.5 → v1.6) — Node.js ≥16 + CommonJS [ARCH-007.1], cross-platform paths [ARCH-007.2], offline-only [ARCH-007.3], single root [ARCH-007.4], write access [ARCH-007.5], tsc to dist/ [ARCH-007.6], no global state [ARCH-007.7].
- **CS-022 and CS-030 closed as won't do** (CD-083/084): `status: active` on all files adds no value since all files are currently active; field will be used organically when files become deprecated or archived.
- **“Read before describe” mandate added** (CD-085/CS-039): Added critical mandate to `copilot-instructions.md`, live `project.yaml`, and generated `project.yaml` template in `templateEngine.ts` — AI must never describe or quote file contents without first reading the file via a tool call; if not read, must say so explicitly.
- **"Never implement unless asked" mandate added** (CD-086/CS-040): Added as critical rule #7 to `copilot-instructions.md`, live `project.yaml`, and generated `project.yaml` template in `templateEngine.ts` — AI must not write code or make file changes unless developer explicitly asks; if next step seems obvious, ask first.
- **Generated `api.yaml` is now a dual-section template** (CD-087/CS-023): `generateApiYaml()` in `specFileGenerator.ts` rewritten to produce a generic spec with both a `cli:` section and an OpenAPI 3.0.3 `paths:` section; each section is preceded by a comment instructing the user to remove whichever does not apply; replaces the previous minimal OpenAPI-only stub.
- **Generated `api.yaml` expanded to three-option template** (CD-088): Added OPTION C (GraphQL) with `endpoint`, `queries`, and `mutations` stubs; added top-level `project` and `version` fields; OPTION A (REST API), OPTION B (CLI), OPTION C (GraphQL) — each labelled and independently removable.

### Added

- **`.github/copilot-instructions.md` generation** (CD-076): New `generateCopilotInstructions()` in `ideConfigGenerator.ts`; called from `specGenerator.ts` unconditionally for every `specpilot init` regardless of IDE choice; contains project name/stack, 5 critical mandates, process mandates, and a Re-Anchor note; 1 new test added (73 total)
- **Re-Anchor Prompt in generated `prompts.md`** (CD-077): `## Re-Anchor Prompt` section added to `generatePromptsMd()` template — a ready-to-paste prompt that re-establishes all critical rules for AI agents mid-session (triggered when session > 1 hour / > 20 exchanges)

### Changed

- **Tiered `project.yaml` rules** (CD-074): Generated `project.yaml` rules restructured from flat list into three tiers: 🔴 critical (git/deploy gates, .specs immutability, proactive spec-update), 🟡 process (spec-first, context, tracking, prompts), 🟢 preferences (best practices, TDD, semver). npm-specific deploy mandate replaced with generic "Never deploy, publish, or release."
- **`docs.md` template corrected** (CD-073): `generateDocsMd()` rewritten with correct front-matter schema and CLI subcommands (`list`, `validate`, `migrate`, `specify`)

### Removed

- **`project/project-plan.md` removed from generated `.specs/` structure** (CS-024):
  - `generateProjectPlanMd()` removed from `specFileGenerator.ts`
  - File no longer generated during `specpilot init` or `specpilot add-specs`
  - Removed from `specValidator.ts` required files list (9 required files, down from 10)
  - Removed cross-reference validation rule for `project-plan.md`
- **`blessed` dependency removed** (FIX-001): Unused terminal UI library removed from `package.json`
- **`TemplateRegistry` class removed** (FIX-013): Template catalog inlined as static `TEMPLATES` constant in `list.ts`; empty `src/templates/` directory deleted
- **`spec-update-template.md` generation removed** (FIX-015): Removed `generateSpecUpdateTemplateMd()` and its call from `specFileGenerator.ts`

### Added

- **ESLint linting** (FIX-010): Added `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`; created `.eslintrc.json`; updated `lint` script in `package.json`
- **72 tests across 5 suites** (FIX-014): Added `specValidator.test.ts` (17), `projectMigrator.test.ts` (11), `projectDetector.test.ts` (17), `templateEngine.test.ts` (24); total now 72
- **Diff preview and confirmation for `specify` command** (FIX-019): Collects all pending changes, shows line-level diff, prompts for confirmation before writing; `--no-prompts` flag skips confirmation
- **Dual onboarding prompts** (FIX-018): `init` (new project) bakes 4 context-question answers into a planning-focused prompt; `add-specs` (existing project) uses a codebase-analysis prompt
- **`src/utils/frameworks.ts`** (FIX-006): Extracted shared `getFrameworksForLanguage()` utility from duplicated code across `init.ts` and `add-specs.ts`

### Changed

- **`roadmap.md` template expanded** (CS-024): Merged charter content (objectives, success criteria, risks) from removed `project-plan.md` into `roadmap.md`
- **`agentConfigGenerator.ts`** (CS-024): Codex Instructions template updated to reference `planning/roadmap.md` instead of `project/project-plan.md`
- **`specGenerator.ts` refactored into 4 files** (FIX-011): Split 1,298-line file into `specFileGenerator.ts` (642 lines), `ideConfigGenerator.ts` (137 lines), `agentConfigGenerator.ts` (238 lines); `specGenerator.ts` is now an 81-line coordinator
- **IDE settings deduplicated** (FIX-012): Single `getBaseSettings()` + per-IDE `IDE_OVERRIDES` map in `ideConfigGenerator.ts`; all IDE-specific override keys marked `// ASPIRATIONAL`
- **`tasks.md` template updated** (CS-032): Generated file now uses `BL-###` / `CS-###` / `CD-###` ID convention with numbered list format, ID stability notes, and archive guidance

### Fixed

- **`lowercase` Handlebars helper** (FIX-002): Was calling `str.slice(1)` instead of `str.toLowerCase()`
- **Hardcoded version string in `logger.ts`** (FIX-003): Welcome screen now reads version dynamically from `package.json`
- **Hardcoded `lastUpdated` date in spec generator** (FIX-004): Now uses `new Date().toISOString().split('T')[0]` instead of a static date
- **Unused `Command` imports** (FIX-005): Removed from all 6 command files (`init.ts`, `validate.ts`, `migrate.ts`, `list.ts`, `specify.ts`, `add-specs.ts`)
- **Project name validation** (FIX-007): Replaced denylist with allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` to prevent Handlebars template injection
- **Migration file paths** (FIX-008): Corrected subfolder paths in `projectMigrator.ts` (e.g. `architecture/architecture.md`, `project/requirements.md`)
- **Duplicate `[1.2.2]` CHANGELOG entries** (FIX-009): Merged into single entry

## [1.4.0] - 2026-02-07

### Added

- **IDE Workspace Settings Generation** (CS-008): Complete support for 5 AI-first code editors
  - VSCode configuration with Copilot integration settings
  - Cursor IDE settings with cursor-specific AI context configuration
  - Windsurf IDE workspace settings with windsurf-specific AI features
  - Kiro IDE configuration with kiro-specific context awareness
  - Antigravity IDE settings with antigravity-specific AI integration
  - IDE selection prompt during project initialization
  - Automatic generation of IDE-specific workspace folders for code and .specs
  - IDE-specific `extensions.json` with workspace recommendations
  - Workspace folder configuration for seamless .specs integration in AI context

### Changed

- Enhanced project initialization to prompt user for preferred AI IDE
- Improved spec generator with IDE-specific configuration routing

## [1.3.0] - 2025-11-07

### Added

- **Gemini-Style Graphical CLI Interface**: Complete visual overhaul with ASCII art logos
  - Added `blessed` dependency for advanced terminal UI capabilities
  - Implemented comprehensive logo display system in `logger.ts`
  - Added ASCII art SpecPilot logo with vertical layout for professional presentation
  - Integrated logos across all CLI commands (init, validate, list, migrate, specify, add-specs)
  - Strategic logo placement before prompts and results for enhanced user experience

### Changed

- **CLI User Experience**: Upgraded from basic text output to branded, graphical interface
  - All commands now display SpecPilot logo before key interactions
  - Improved visual consistency across the entire CLI application
  - Enhanced professional appearance similar to Gemini Code interface

### Fixed

- **Package.json Formatting**: Added missing newline at end of file for proper formatting

## [1.2.2] - 2025-10-27

### Added

- Initial release of SpecPilot SDD CLI
- **Core Commands**:
  - `specpilot <project>` - Initialize new SDD projects
  - `specpilot validate` - Validate specifications and mandates
  - `specpilot migrate` - Migrate from complex to simplified structure
  - `specpilot list` - Show available templates
- **Template System**:
  - TypeScript templates (Generic, React, Express, Next.js, CLI)
  - Python templates (Generic, FastAPI, Django, Data Science)
  - Java templates (Generic, Spring Boot)
  - Framework-specific content generation

- **Specification Files Generation**:
  - Simplified 8-file `.specs/` structure
  - `project.yaml` - Configuration + rules + AI context
  - `architecture.md` - Architecture decisions + patterns
  - `requirements.md` - Functional/non-functional requirements
  - `api.yaml` - OpenAPI specifications
  - `tests.md` - Test strategy + coverage plans
  - `tasks.md` - Task tracking (backlog/sprint/completed)
  - `context.md` - Development memory + learnings
  - `prompts.md` - **MANDATED** AI interaction tracking
  - `docs.md` - Development guidelines + deployment

- **Key Features**:
  - Automatic prompt tracking mandate enforcement
  - Migration from complex to simplified structures
  - Validation with auto-fix capabilities
  - Comprehensive template system
  - Production-ready project initialization

### Technical Details

- Built with TypeScript and Node.js
- Uses Commander.js for CLI functionality
- Handlebars for templating
- Comprehensive test suite with Jest
- NPM-ready packaging

### Breaking Changes

- None (initial release)

### Fixed

- **Specify Command**: Fixed file path references to use correct subfolder structure
  - Updated project.yaml path from `.specs/project.yaml` to `.specs/project/project.yaml`
  - Updated requirements.md path to `.specs/project/requirements.md`
  - Updated context.md path to `.specs/development/context.md`
  - Updated prompts.md path to `.specs/development/prompts.md`
  - Resolves "project.yaml not found" error when running specify in valid projects
- **CS-012**: Enhanced migrate command with better error messages and guidance
  - Added migration necessity detection to prevent confusion
  - Provides helpful suggestions when migrate is used incorrectly
  - Detects when target structure already exists
  - Clear documentation on when to use init vs add-specs vs migrate

### Changed

- **Documentation**: Updated CHANGELOG.md with missing version entries (1.2.1, 1.2.0, 1.1.4)
- **README**: Fixed unclosed code block causing rendering issues in documentation

## [1.1.1] - 2025-10-11

### Added

- **CS-009**: Comprehensive metadata conventions and stable ID system
- YAML front-matter metadata headers for all spec files
- Stable ID format for sections and items (REQ-001, ARCH-002, etc.)
- Enhanced spec validation with cross-reference checking
- Complete `.specs/` subfolder structure (project/, architecture/, planning/, quality/, development/)
- Comprehensive documentation in `.specs/development/docs.md`

### Changed

- **README**: Added table of contents, prerequisites, and improved examples
- **Validator**: Updated to handle subfolder structure and validate metadata
- **Templates**: Aligned with current TypeScript/Python support
- **Documentation**: Removed references to unsupported features

### Fixed

- Cross-references now use correct subfolder paths
- Validation properly detects missing files in subfolder structure
- Command examples updated to match actual CLI interface

## [1.1.2] - 2025-10-12

### Added

- **CS-004**: Existing .specs folder detection - Prevents duplicate project initialization with informative error messages
- **CS-005**: Developer name prompting - Prompts for developer name during init and replaces "Your Name" placeholders in generated specs
- **CS-009**: Enhanced `add-specs` command - Adds .specs folder to existing projects with intelligent codebase analysis
- **Project Detector**: Auto-detects language/framework from package.json, requirements.txt, setup.py, pyproject.toml
- **Code Analyzer**: Scans codebase for TODOs/FIXMEs, analyzes tests, extracts architecture information
- **Codebase Analysis**: Automatic TODO/FIXME parsing with line numbers and file locations
- **Test Detection**: Identifies test frameworks (Jest, Pytest, Mocha, etc.) and counts test cases
- **Architecture Extraction**: Analyzes project structure, components, and file types

### Changed

- **Git Mandates**: Added project rules requiring developer prompts for all git commit/push operations
- **Init Command**: Now prompts for developer name and displays existing project info if .specs already exists
- **CLI Commands**: Added `add-specs` command (alias: `add`) with options for --no-analysis and --deep-analysis
- **Project Detection**: Defaults to TypeScript for Node.js projects when language cannot be explicitly determined

### Fixed

- Existing project initialization now provides helpful next steps instead of silently failing
- Developer attribution in generated spec files now uses actual developer name
- Language detection improved for JavaScript/TypeScript projects

### Technical Details

- New utilities: `projectDetector.ts`, `codeAnalyzer.ts`
- New command: `src/commands/add-specs.ts`
- Analysis features: TODO parsing, test framework detection, component extraction
- Smart directory exclusion: node_modules, dist, .git, **pycache**, venv

## [1.1.3] - 2025-10-12

### Added

- **CS-010**: JavaScript language support - Added JavaScript templates and detection for Node.js projects
- **AI Onboarding**: Added AI onboarding prompt to prompts.md for new projects
- **CS-011**: Enhanced folder structure display - Architecture.md now shows nested directory trees instead of flat lists

### Changed

- **Project Detection**: Improved language detection to distinguish between TypeScript and JavaScript projects
- **Template Engine**: Added JavaScript-specific templates alongside existing TypeScript templates

### Fixed

- **Architecture Display**: Folder structures now display as proper nested trees with indentation
- **Language Support**: JavaScript projects are now properly detected and templated

## [1.2.1] - 2025-10-26

### Added

- **AI Onboarding Enhancement**: Comprehensive AI onboarding prompt in generated `.specs/prompts.md`
- **Project Documentation**: Added `.specs/README.md` with detailed onboarding guidance for AI assistants
- **Enhanced CLI Messages**: Improved success messages with detailed next steps and project information

### Changed

- **Onboarding Experience**: CLI now provides comprehensive guidance for new users and AI assistants
- **Documentation**: Enhanced project specs with operational mandates and AI interaction guidelines

### Fixed

- **README.md Rendering**: Fixed unclosed code block causing rendering issues in documentation

## [1.2.0] - 2025-10-26

### Added

- **AI Onboarding Prompt**: Standardized AI onboarding prompt added to all generated `.specs/prompts.md` files
- **Enhanced Project Guidance**: Improved CLI success messages with detailed next steps for specification-driven development

### Changed

- **Onboarding Process**: Streamlined first-time user experience with comprehensive AI assistant guidance
- **Documentation Standards**: Updated all generated specs to include AI interaction best practices

## [1.1.4] - 2025-10-25

### Added

- **Project Onboarding Documentation**: Added `.specs/README.md` with comprehensive AI prompt guidance
- **Enhanced AI Integration**: Improved prompts.md with standardized onboarding content for AI assistants

### Changed

- **CLI Success Messages**: Enhanced with detailed next steps and project structure guidance
- **Documentation**: Improved AI assistant integration documentation

## [1.1.3] - 2025-10-12
