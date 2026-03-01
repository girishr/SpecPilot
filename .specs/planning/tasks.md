---
fileID: TASKS-001
lastUpdated: 2026-03-01
version: 2.1
contributors: [girishr]
relatedFiles: [roadmap.md, project.yaml, requirements.md, tasks-archive.md]
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
20. [BL-020] Plan and implement next major features (template enhancements, performance optimizations)
21. [BL-021] Gather community feedback and refine existing features based on user experience

## Current Sprint

### .specs Folder Fixes

1. [CS-017] [SPECS-FIX-11] Reduce mandates in `project/project.yaml` — consolidate 15 rules into 5 enforceable mandates to prevent mandate fatigue
2. [CS-018] [SPECS-FIX-12] Update `project/requirements.md` — add missing features (IDE config, Cowork/Codex, `add-specs`, `specify`), add `## Assumptions` section
3. [CS-019] [SPECS-FIX-14] Cap/archive `development/prompts.md` — set rolling window (last 30 days), archive older entries to `prompts-archive.md`
4. [CS-020] [SPECS-FIX-15] Add `.specs/security/` folder — `threat-model.md` (path traversal, template injection, supply chain) and `security-decisions.md`
5. [CS-021] [SPECS-FIX-16] Add `## Assumptions` section to `architecture/architecture.md` (Node.js ≥16, CommonJS, cross-platform paths)
6. [CS-022] [SPECS-FIX-17] Add `status: active` front-matter field to all `.specs/` files

### Generated Output Improvements

7. [CS-023] [TOOL-002] Replace generated OpenAPI `api.yaml` with context-aware spec — ask user "Does your project expose an API?" during `specpilot init`; generate CLI interface YAML or OpenAPI stub accordingly
8. [CS-025] [TOOL-004] Reduce generated mandates from 10 to 5 in `templateEngine.ts` project.yaml template
9. [CS-027] [TOOL-006] Add `## Assumptions` section to generated `requirements.md` template in `specFileGenerator.ts`
10. [CS-028] [TOOL-007] Add `## Assumptions` section to generated `architecture.md` template in `templateEngine.ts`
11. [CS-029] [TOOL-008] Add stale-date warning to `specpilot validate` — parse `lastUpdated` front-matter and emit warning if > 90 days old
12. [CS-030] [TOOL-009] Add `status: active` field to YAML front-matter of all generated spec files
13. [CS-031] [TOOL-011] Add archive guidance section to generated `prompts.md` template — instruct users to archive entries > 30 days to `prompts-archive.md`
14. [CS-033] [TOOL-013] Generate `security/` subfolder during `specpilot init` — `threat-model.md` and `security-decisions.md` starter templates; update `specValidator.ts` and tests
15. [CS-034] [TOOL-015] Add `--dry-run` flag to `specpilot init` — list files that would be created without writing them

## Completed

> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).

1. [CD-040] [FIX-001] Remove unused `blessed` dependency from package.json - `npm uninstall blessed`
2. [CD-041] [FIX-002] Fix broken `lowercase` Handlebars helper — was calling `str.slice(1)` instead of `str.toLowerCase()`
3. [CD-042] [FIX-003] Fix hardcoded version string in `logger.ts` welcome screen — now reads version dynamically from package.json
4. [CD-043] [FIX-004] Fix hardcoded date in spec generator — `lastUpdated` now uses `new Date().toISOString().split('T')[0]`
5. [CD-044] [FIX-005] Remove unused `Command` imports from all 6 command files (`init.ts`, `validate.ts`, `migrate.ts`, `list.ts`, `specify.ts`, `add-specs.ts`)
6. [CD-045] [FIX-006] Extract duplicated `getFrameworksForLanguage()` into shared `src/utils/frameworks.ts` utility
7. [CD-046] [FIX-007] Replace project name denylist validation with allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` to prevent Handlebars template injection
8. [CD-047] [FIX-008] Fix migration file mapping in `projectMigrator.ts` to use correct subfolder paths (`architecture/architecture.md`, `project/requirements.md`, etc.)
9. [CD-048] [FIX-009] Merge duplicate `[1.2.2]` entries in `CHANGELOG.md`
10. [CD-049] [FIX-010] Add real ESLint linter — installed `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`, created `.eslintrc.json`, updated `lint` script
11. [CD-050] [FIX-011] Split `specGenerator.ts` (1,298 lines) into `specFileGenerator.ts` (642 lines), `ideConfigGenerator.ts` (137 lines), `agentConfigGenerator.ts` (238 lines); `specGenerator.ts` is now an 81-line coordinator
12. [CD-051] [FIX-012] Deduplicate IDE settings generation — single `getBaseSettings()` + per-IDE `IDE_OVERRIDES` map in `ideConfigGenerator.ts`
13. [CD-052] [FIX-013] Remove `TemplateRegistry` abstraction and empty `src/templates/` directory; inlined catalog as static `TEMPLATES` constant in `list.ts`
14. [CD-053] [FIX-014] Add 4 new test suites (69 tests): `specValidator.test.ts` (17), `projectMigrator.test.ts` (11), `projectDetector.test.ts` (17), `templateEngine.test.ts` (24) — total 72 tests
15. [CD-054] [FIX-015] Remove `generateSpecUpdateTemplateMd()` and its call from `specFileGenerator.ts`; deleted `.specs/spec-update-template.md`
16. [CD-055] [FIX-016] Give each planning file a distinct documented purpose: `project-plan.md` = charter, `roadmap.md` = release milestones, `tasks.md` = sprint tracker
17. [CD-056] [FIX-017] Remove fabricated IDE setting keys from `ideConfigGenerator.ts`; mark all IDE-specific override keys as `// ASPIRATIONAL`
18. [CD-057] [FIX-018] Implement dual onboarding prompt system: `init` (new project) bakes answers to 4 context questions into a planning-focused prompt; `add-specs` (existing project) uses codebase-analysis prompt
19. [CD-058] [FIX-019] Add diff preview and confirmation to `specify` command — collects changes, shows line-level diff, prompts before writing; `--no-prompts` skips confirmation
20. [CD-059] [SPECS-FIX-1] Delete corrupted `.specs/spec-update-template.md` — two copies were interleaved line-by-line; file deleted and generation removed (see also CD-054)
21. [CD-060] [SPECS-FIX-2] Replace `.specs/architecture/api.yaml` — removed fabricated OpenAPI 3.0 REST spec; replaced with CLI interface YAML documenting all 6 commands, flags, arguments, and exit codes
22. [CD-061] [SPECS-FIX-3] Fix wrong CLI commands in `.specs/development/docs.md` — replaced `--list-templates`, `--validate`, `--migrate` flags with correct subcommands; removed non-existent `analysis/` subfolder reference
23. [CD-062] [SPECS-FIX-4] Update stale `lastUpdated` dates across 7 `.specs/` files — `requirements.md`, `project-plan.md`, `tests.md`, `prompts.md`, `docs.md`, `context.md`, `project.yaml`, `roadmap.md` all updated to 2026-02-28
24. [CD-063] [SPECS-FIX-5] Fix duplicate PROMPT IDs in `.specs/development/prompts.md` — re-numbered 6 colliding entries to unique IDs (PROMPT-002.0.4 through 002.1.1, 003.2 through 003.5)
25. [CD-064] [SPECS-FIX-6] Remove duplicate roadmap entry in `.specs/planning/roadmap.md` — "Cloud-based AI agent integration" line appeared twice consecutively
26. [CD-065] [SPECS-FIX-9] Remove trailing bare `-` from `.specs/project/project.yaml` rules list (empty list item after last MANDATE rule)
27. [CD-066] [SPECS-FIX-13] Update `.specs/quality/tests.md` — documented 5 test suites and 72 tests, checked off applicable acceptance criteria, updated date and version
28. [CD-067] [CS-014] Archive CD-001–CD-039 to `tasks-archive.md`; replace with pointer in tasks.md; renumber Completed list from CD-040
29. [CD-068] [CS-015] [SPECS-FIX-8] Delete `project/project-plan.md` — merged Objectives and Risks sections into `planning/roadmap.md` (v1.5), deleted the file
30. [CD-069] [CS-024] [TOOL-003] Stop generating `project-plan.md` — removed `generateProjectPlanMd()` and its call from `specFileGenerator.ts`; merged charter sections (Objectives, Goals & Success Criteria, Risks) into roadmap template; removed from `specValidator.ts` required files and cross-ref checks; updated `agentConfigGenerator.ts`; updated tests (72 passing)
31. [CD-070] [CS-032] [TOOL-012] Update generated `tasks.md` template to use `BL-###` / `CS-###` / `CD-###` ID convention with numbered list format, ID stability notes, and archive guidance
32. [CD-071] Add explicit AI spec-update mandate to both `.specs/project/project.yaml` and generated `project.yaml` template (`templateEngine.ts`): after every code change, proactively update all affected .specs/ files (architecture.md, requirements.md, tests.md, tasks.md, CHANGELOG.md) without being asked
33. [CD-072] Move CS-012 and CS-013 from Current Sprint to Backlog as BL-020 and BL-021; renumber remaining Current Sprint items
34. [CD-073] [CS-016] [SPECS-FIX-10] [TOOL-005] Scope down live `development/docs.md` (remove Troubleshooting, Contributing, Support — redirected to README; v1.2); update generated `docs.md` template with correct front-matter schema, proper CLI subcommands (`list`, `validate`, `migrate`), spec conventions, and dev checklist
