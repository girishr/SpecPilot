---
fileID: TASKS-001
lastUpdated: 2026-02-28
version: 1.7
contributors: [girishr]
relatedFiles: [roadmap.md, project.yaml, requirements.md]
---

# Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-###: Completed items

Notes

- IDs are stable; do not change once assigned (even if reordered or moved between sections).
- Reference tasks by ID in commits, prompts, PRs, and discussions.
- When moving an item from Backlog to Current Sprint, retain its original BL ID or create a CS mirror that references the BL ID.

## Backlog

1. [BL-001] Plan v1.1.0 features (additional templates, performance optimizations)
2. [BL-002] Gather user feedback and feature requests
3. [BL-003] Create video tutorials for SDD approach
4. [BL-004] Build community around SpecPilot
5. [BL-005] Monitor NPM download metrics
6. [BL-006] Set up GitHub repository with proper documentation
7. [BL-007] Create issue templates and contribution guidelines
8. [BL-008] Implement automatic enforcement of project mandates (git hooks for spec validation, automatic prompt logging, pre-commit checks)
9. [BL-009] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects
10. [BL-010] Add security audit, compliance, and scanning features to SpecPilot
    - 1. Add Security Spec Files
      - Create .specs/security/ folder with:
        -- security.md: Security requirements, threat model
        -- vulnerabilities.yaml: Known issues tracker
        -- compliance.yaml: Standards compliance (SOC2, GDPR, etc.)
    - 2. Integrate Security Scanning
      - Add commands like:
        -- specpilot audit: Run dependency vulnerability scan
        -- specpilot scan: Static code analysis
        -- specpilot compliance: Check compliance requirements
    - 3. Automated Checks
      - Integrate with npm audit, snyk, or semgrep
      - Add to specpilot validate command
      - CI/CD integration for automated scanning
11. [BL-011] CLI Rule Selector - Core Infrastructure
    - Allow users to choose which development mandates and constraints to include during project initialization
    - Interactive CLI prompts for rule selection
    - Save selections to .specs/project.yaml
    - Support non-interactive mode with config files
12. [BL-012] Code Quality Rules Configuration
    - Make TypeScript strict mode level selectable
    - ESLint enforcement level (off, warn, error)
    - Prettier formatting enforcement
    - Code style standard selection
13. [BL-013] Testing Requirements Configuration
    - Selectable unit test coverage minimum %
    - Test-before-code mandate toggle
    - Integration test requirement levels
    - Testing framework selection
14. [BL-014] Documentation Mandates Configuration
    - JSDoc requirement level selection (none, public-only, all-functions)
    - README and Changelog update mandates
    - Spec file update mandate toggle
    - Spec detail level selection (minimal, standard, comprehensive)
15. [BL-015] Review & Approval Process Configuration
    - Mandatory peer reviews toggle
    - Configurable approvals required
    - Code review criteria selection
    - Hotfix approval bypass option
16. [BL-016] Specification Standards Configuration
    - Dynamic spec file structure based on selections
    - Metadata requirement configuration
    - Spec versioning strategy selection
17. [BL-017] AI Interaction Tracking Configuration
    - Optional AI prompt logging mandate
    - Detail level for prompt documentation (minimal, standard, verbose)
    - Audit trail consolidation options
18. [BL-018] Deploy & Release Controls Configuration
    - Pre-release checklist requirements
    - Version bump strategy enforcement (semver, manual)
    - Release notes mandate
    - Pre-release testing requirements
19. [BL-019] Architecture & Pattern Rules Configuration
    - Design pattern enforcement suggestions
    - Project structure constraint levels
    - Naming conventions enforcement toggle
    - Dependency management rules

## Current Sprint

1. [CS-012] Plan and implement next major features (template enhancements, performance optimizations)
2. [CS-013] Gather community feedback and refine existing features based on user experience

### .specs Folder Fixes

3. [CS-014] [SPECS-FIX-7] Archive completed tasks in `planning/tasks.md` — move CD-001 through CD-039 into a `### Completed (Archived)` section or separate `tasks-archive.md`; keep active/upcoming items visible
4. [CS-015] [SPECS-FIX-8] Delete or merge `project/project-plan.md` — merge unique content (milestones, success criteria) into `roadmap.md`, then delete the file
5. [CS-016] [SPECS-FIX-10] Scope down `development/docs.md` — keep only spec conventions and dev procedures; move contributing/troubleshooting/support to README
6. [CS-017] [SPECS-FIX-11] Reduce mandates in `project/project.yaml` — consolidate 15 rules into 5 enforceable mandates to prevent mandate fatigue
7. [CS-018] [SPECS-FIX-12] Update `project/requirements.md` — add missing features (IDE config, Cowork/Codex, `add-specs`, `specify`), add `## Assumptions` section
8. [CS-019] [SPECS-FIX-14] Cap/archive `development/prompts.md` — set rolling window (last 30 days), archive older entries to `prompts-archive.md`
9. [CS-020] [SPECS-FIX-15] Add `.specs/security/` folder — `threat-model.md` (path traversal, template injection, supply chain) and `security-decisions.md`
10. [CS-021] [SPECS-FIX-16] Add `## Assumptions` section to `architecture/architecture.md` (Node.js ≥16, CommonJS, cross-platform paths)
11. [CS-022] [SPECS-FIX-17] Add `status: active` front-matter field to all `.specs/` files

### Generated Output Improvements

12. [CS-023] [TOOL-002] Replace generated OpenAPI `api.yaml` with context-aware spec — ask user "Does your project expose an API?" during `specpilot init`; generate CLI interface YAML or OpenAPI stub accordingly
13. [CS-024] [TOOL-003] Stop generating `project-plan.md` — remove `generateProjectPlanMd()`, merge charter content into `roadmap.md` template, update `specValidator.ts` required files, update tests and docs
14. [CS-025] [TOOL-004] Reduce generated mandates from 10 to 5 in `templateEngine.ts` project.yaml template
15. [CS-026] [TOOL-005] Fix `docs.md` template in `specFileGenerator.ts` — replace old flag-style commands (`--list-templates`, `--validate`) with correct subcommands (`list`, `validate`, `migrate`)
16. [CS-027] [TOOL-006] Add `## Assumptions` section to generated `requirements.md` template in `specFileGenerator.ts`
17. [CS-028] [TOOL-007] Add `## Assumptions` section to generated `architecture.md` template in `templateEngine.ts`
18. [CS-029] [TOOL-008] Add stale-date warning to `specpilot validate` — parse `lastUpdated` front-matter and emit warning if > 90 days old
19. [CS-030] [TOOL-009] Add `status: active` field to YAML front-matter of all generated spec files
20. [CS-031] [TOOL-011] Add archive guidance section to generated `prompts.md` template — instruct users to archive entries > 30 days to `prompts-archive.md`
21. [CS-032] [TOOL-012] Add archive guidance section to generated `tasks.md` template — instruct users to move completed tasks older than 30 days to `tasks-archive.md`
22. [CS-033] [TOOL-013] Generate `security/` subfolder during `specpilot init` — `threat-model.md` and `security-decisions.md` starter templates; update `specValidator.ts` and tests
23. [CS-034] [TOOL-015] Add `--dry-run` flag to `specpilot init` — list files that would be created without writing them

## Completed

1. [CD-001] Define project requirements
2. [CD-002] Design CLI command structure
3. [CD-003] Create initial folder structure
4. [CD-004] Write project README
5. [CD-005] Consolidate development prompts
6. [CD-006] Simplify directory structure
7. [CD-007] Set up TypeScript project structure
8. [CD-008] Implement CLI argument parsing
9. [CD-009] Create basic template generation
10. [CD-010] Add error handling
11. [CD-011] Write unit tests for core functions
12. [CD-012] Implement basic CLI commands
13. [CD-013] Create template system
14. [CD-014] Add validation features
15. [CD-015] Build migration system
16. [CD-016] Write comprehensive tests
17. [CD-017] Create documentation
18. [CD-018] Publish to NPM
19. [CD-019] Add spec update mandate to SpecPilot templates
20. [CD-020] Add metadata update mandate to SpecPilot templates
21. [CD-021] Publish SpecPilot v1.1.0 to NPM
22. [CD-022] Fix CLI list command to display templates correctly
23. [CD-023] Fix issue with command specpilot validate ⚠️ Warnings: • architecture.md missing sections: Overview, Components, Decisions
24. [CD-024] Force user to input a project name
25. [CD-025] Remove Java support from codebase and limit to TypeScript/Python only
26. [CD-026] Optimize .specs structure: introduce subfolders (project/, architecture/, planning/, quality/, development/), add YAML front-matter metadata and cross-references to all generated specs, update validator for new structure and metadata validation, update tests for subfolder structure - CS-008 completed
27. [CD-027] Update all .specs file templates and generator logic so every generated spec file includes: A metadata header (e.g., fileID, lastUpdated, version, contributors, relatedFiles), Numbered, stable IDs for all major sections/items (e.g., REQ-001, ARCH-002, DOC-003.1), Document this convention in .specs/docs.md and validate output - CS-009 completed
28. [CD-028] Create project-plan.md file in .specs folder with project timeline, milestones, and task execution dates - CS-007 completed
29. [CD-029] Add existing .specs folder detection - prevent creating new project if folder already contains .specs; alert user with project info from existing .specs files (project.yaml, requirements.md) - CS-004 completed
30. [CD-030] Prompt for developer's name so that wherever "Your Name" appears in spec files, it will be replaced with the developer's name - CS-005 completed
31. [CD-031] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects - CS-009 completed
32. [CD-032] Fix generator to use placeholder for application structure in architecture.md output - CS-011 completed
33. [CD-033] Add JavaScript language support with auto-detection and templates - CS-010 completed
34. [CD-034] Create comprehensive AI onboarding prompt in .specs/development/prompts.md to help AI assistants understand the .specs folder structure and usage - CS-007 completed via enhanced prompts.md onboarding
35. [CD-035] [CS-008] Add workspace settings (.vscode/settings.json) to configure AI IDEs for .specs context. Prompt the user to select his IDE and then generate the workspace setting based on it. The current IDEs to include are vscode, Cursor, Windsurf, Antigravity and Kiro. ✅ VSCode implementation completed | ✅ Cursor implementation completed | ✅ Windsurf implementation completed | ✅ Antigravity implementation completed | ✅ Kiro implementation completed
36. [CD-036] Implement Gemini-style graphical CLI interface with ASCII art logos - v1.3.0 completed
37. [CD-038] Complete multi-IDE workspace settings generation (VSCode, Cursor, Windsurf, Kiro, Antigravity) - v1.4.0 completed
38. [CD-039] [CS-009] Add cloud-based AI agent integration for Cowork (Claude) and Codex (OpenAI). Generate `.claude/skills/specpilot-project/SKILL.md` for Cowork with project context and development guidelines. Generate `CODEX_INSTRUCTIONS.md` at project root for Codex with architecture overview and development mandates. Add Cowork and Codex as IDE/agent options during `specpilot init` - v1.4.0 completed
39. [CD-040] [FIX-001] Remove unused `blessed` dependency from package.json - `npm uninstall blessed`
40. [CD-041] [FIX-002] Fix broken `lowercase` Handlebars helper — was calling `str.slice(1)` instead of `str.toLowerCase()`
41. [CD-042] [FIX-003] Fix hardcoded version string in `logger.ts` welcome screen — now reads version dynamically from package.json
42. [CD-043] [FIX-004] Fix hardcoded date in spec generator — `lastUpdated` now uses `new Date().toISOString().split('T')[0]`
43. [CD-044] [FIX-005] Remove unused `Command` imports from all 6 command files (`init.ts`, `validate.ts`, `migrate.ts`, `list.ts`, `specify.ts`, `add-specs.ts`)
44. [CD-045] [FIX-006] Extract duplicated `getFrameworksForLanguage()` into shared `src/utils/frameworks.ts` utility
45. [CD-046] [FIX-007] Replace project name denylist validation with allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` to prevent Handlebars template injection
46. [CD-047] [FIX-008] Fix migration file mapping in `projectMigrator.ts` to use correct subfolder paths (`architecture/architecture.md`, `project/requirements.md`, etc.)
47. [CD-048] [FIX-009] Merge duplicate `[1.2.2]` entries in `CHANGELOG.md`
48. [CD-049] [FIX-010] Add real ESLint linter — installed `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`, created `.eslintrc.json`, updated `lint` script
49. [CD-050] [FIX-011] Split `specGenerator.ts` (1,298 lines) into `specFileGenerator.ts` (642 lines), `ideConfigGenerator.ts` (137 lines), `agentConfigGenerator.ts` (238 lines); `specGenerator.ts` is now an 81-line coordinator
50. [CD-051] [FIX-012] Deduplicate IDE settings generation — single `getBaseSettings()` + per-IDE `IDE_OVERRIDES` map in `ideConfigGenerator.ts`
51. [CD-052] [FIX-013] Remove `TemplateRegistry` abstraction and empty `src/templates/` directory; inlined catalog as static `TEMPLATES` constant in `list.ts`
52. [CD-053] [FIX-014] Add 4 new test suites (69 tests): `specValidator.test.ts` (17), `projectMigrator.test.ts` (11), `projectDetector.test.ts` (17), `templateEngine.test.ts` (24) — total 72 tests
53. [CD-054] [FIX-015] Remove `generateSpecUpdateTemplateMd()` and its call from `specFileGenerator.ts`; deleted `.specs/spec-update-template.md`
54. [CD-055] [FIX-016] Give each planning file a distinct documented purpose: `project-plan.md` = charter, `roadmap.md` = release milestones, `tasks.md` = sprint tracker
55. [CD-056] [FIX-017] Remove fabricated IDE setting keys from `ideConfigGenerator.ts`; mark all IDE-specific override keys as `// ASPIRATIONAL`
56. [CD-057] [FIX-018] Implement dual onboarding prompt system: `init` (new project) bakes answers to 4 context questions into a planning-focused prompt; `add-specs` (existing project) uses codebase-analysis prompt
57. [CD-058] [FIX-019] Add diff preview and confirmation to `specify` command — collects changes, shows line-level diff, prompts before writing; `--no-prompts` skips confirmation
58. [CD-059] [SPECS-FIX-1] Delete corrupted `.specs/spec-update-template.md` — two copies were interleaved line-by-line; file deleted and generation removed (see also CD-054)
59. [CD-060] [SPECS-FIX-2] Replace `.specs/architecture/api.yaml` — removed fabricated OpenAPI 3.0 REST spec; replaced with CLI interface YAML documenting all 6 commands, flags, arguments, and exit codes
60. [CD-061] [SPECS-FIX-3] Fix wrong CLI commands in `.specs/development/docs.md` — replaced `--list-templates`, `--validate`, `--migrate` flags with correct subcommands; removed non-existent `analysis/` subfolder reference
61. [CD-062] [SPECS-FIX-4] Update stale `lastUpdated` dates across 7 `.specs/` files — `requirements.md`, `project-plan.md`, `tests.md`, `prompts.md`, `docs.md`, `context.md`, `project.yaml`, `roadmap.md` all updated to 2026-02-28
62. [CD-063] [SPECS-FIX-5] Fix duplicate PROMPT IDs in `.specs/development/prompts.md` — re-numbered 6 colliding entries to unique IDs (PROMPT-002.0.4 through 002.1.1, 003.2 through 003.5)
63. [CD-064] [SPECS-FIX-6] Remove duplicate roadmap entry in `.specs/planning/roadmap.md` — "Cloud-based AI agent integration" line appeared twice consecutively
64. [CD-065] [SPECS-FIX-9] Remove trailing bare `-` from `.specs/project/project.yaml` rules list (empty list item after last MANDATE rule)
65. [CD-066] [SPECS-FIX-13] Update `.specs/quality/tests.md` — documented 5 test suites and 72 tests, checked off applicable acceptance criteria, updated date and version
