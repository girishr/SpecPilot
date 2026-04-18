---
fileID: TASKS-001
lastUpdated: 2026-04-18
version: 4.5
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

1. [BL-009] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects
2. [BL-010] Add security audit, compliance, and scanning features to SpecPilot
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
3. [BL-011] CLI Rule Selector - Core Infrastructure
   - Allow users to choose which development mandates and constraints to include during project initialization
   - Interactive CLI prompts for rule selection
   - Save selections to .specs/project.yaml
   - Support non-interactive mode with config files
4. [BL-012] Code Quality Rules Configuration
   - Make TypeScript strict mode level selectable
   - ESLint enforcement level (off, warn, error)
   - Prettier formatting enforcement
   - Code style standard selection
5. [BL-013] Testing Requirements Configuration
   - Selectable unit test coverage minimum %
   - Test-before-code mandate toggle
   - Integration test requirement levels
   - Testing framework selection
6. [BL-014] Documentation Mandates Configuration
   - JSDoc requirement level selection (none, public-only, all-functions)
   - README and Changelog update mandates
   - Spec file update mandate toggle
   - Spec detail level selection (minimal, standard, comprehensive)
7. [BL-015] Review & Approval Process Configuration
   - Mandatory peer reviews toggle
   - Configurable approvals required
   - Code review criteria selection
   - Hotfix approval bypass option
8. [BL-016] Specification Standards Configuration
   - Dynamic spec file structure based on selections
   - Metadata requirement configuration
   - Spec versioning strategy selection
9. [BL-017] AI Interaction Tracking Configuration
   - Optional AI prompt logging mandate
   - Detail level for prompt documentation (minimal, standard, verbose)
   - Audit trail consolidation options
10. [BL-018] Deploy & Release Controls Configuration
    - Pre-release checklist requirements
    - Version bump strategy enforcement (semver, manual)
    - Release notes mandate
    - Pre-release testing requirements
11. [BL-019] Architecture & Pattern Rules Configuration
    - Design pattern enforcement suggestions
    - Project structure constraint levels
    - Naming conventions enforcement toggle
12. [BL-020] Publish SpecPilot as a Claude Code / Cowork Plugin
    - Create standalone plugin package (separate repo from npm CLI)
    - Scaffold plugin structure: `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/`, `README.md`
    - Design and write skills: `spec-first` (enforce Spec-First review gate), `validate-specs`, `refine-specs`, `spec-init` (guide user through init flow)
    - Optional: `spec-driven-dev` agent with SDD system prompt and tool restrictions
    - Optional: hooks/hooks.json to warn before edits when `.specs/` is stale
    - Host plugin as public GitHub repo for distribution (`claude plugins install github:…`)
    - Submit to official Anthropic plugin directory via claude.ai/settings/plugins/submit
    - Dependency management rules
12. [BL-022] add a short description at the top of each generated specs file that shows what is the purpose of this file. This will help a new dev who is looking thru the specs files to understand what is function of each of this files. This can be along with the front-matter field section.
13. [BL-023] inspired by this linkedin post try to use the CLAUDE.md Stop stuffing everything into CLAUDE.md. Use it as a router. https://www.linkedin.com/posts/alokkumarsunny_stop-stuffing-everything-into-claudemd-activity-7435312701452632064-9vNa . Also we need to look at how to make use of skills.md
14. [BL-024] Add multi-dev git workflow guidance to generated `tasks.md` template — in a multi-dev team, `tasks.md` is shared and committed but the Completed section is a conflict hotspot: (a) CD numbers have no central counter so two devs can independently assign the same number; (b) running `specpilot archive` on separate branches diverges the trim point; add a `## Multi-Dev Notes` section (or callout) to the generated template advising: always pull before appending to Completed; coordinate or claim the next CD number before starting work (e.g. via a PR or team channel); only run `specpilot archive` on the default/shared branch after merging
15. [BL-025] Add Mermaid diagram placeholder to generated `architecture.md` — insert a single `graph TD` starter block in the `## System Architecture` section as a ready-to-fill scaffold; add a comment above it pointing to Mermaid docs; keep it generic (not framework-specific for v1); rendered natively in GitHub, GitLab, VS Code, and most AI IDEs with no extra tooling; change is in `getArchitectureTemplate()` in `templateEngine.ts`; future enhancement (not in this task): branch on `framework` to generate slightly more relevant stubs
16. [BL-026] Generate IDE-native AI rules files for Cursor, Windsurf, and Kiro — currently only `.github/copilot-instructions.md` is generated (read by Copilot + partially by Cursor); each IDE has its own dedicated rules/context file with the **same content** as `copilot-instructions.md`: Cursor → `.cursor/rules/project.mdc` (wrap in YAML front-matter: `description: Project mandates and AI coding rules`, `globs:`, `alwaysApply: true`, then the mandates body), Windsurf → `.windsurfrules` (plain markdown, same content verbatim), Kiro → `.kiro/steering/project.md` (plain markdown, same content verbatim); generated conditionally when user selects that IDE during `specpilot init`; `copilot-instructions.md` continues to be generated unconditionally for all IDEs; implementation in `ideConfigGenerator.ts`

## Current Sprint

### Generated Output Improvements

### Multi-Dev Alignment

11. [CS-051] Change "Enter your name" prompt to ask for GitHub username — in `init.ts` and `add-specs.ts`, replace `'Enter your name (for spec file attribution):'` with `'Enter your GitHub username (used in spec file contributors and as your dev prefix for task/prompt IDs):'`; default should attempt `git config user.name` falling back to `'your-username'`; the collected value flows into `TemplateContext.author` and is used in `contributors: [{{author}}]` across all generated spec front-matter; also store as `devPrefix` in generated `project.yaml` under a new `team:` section for ID namespacing (e.g. `CD-girishr-001`)
12. [CS-052] Generate `.gitattributes` with `merge=union` for append-heavy spec files — during `specpilot init` and `specpilot add-specs`, generate a `.gitattributes` file at project root containing `merge=union` rules for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; if `.gitattributes` already exists, append only missing lines; implementation in `specGenerator.ts` or `ideConfigGenerator.ts`
13. [CS-053] Use `devPrefix` (GitHub username) in generated `tasks.md` and `prompts.md` ID conventions — update `tasks.md` template in `templateEngine.ts` to show `CD-{devPrefix}-###` pattern in the ID conventions section; update generated `prompts.md` template in `specFileGenerator.ts` to use `PROMPT-{devPrefix}-###`; add `## Multi-Dev Notes` callout to generated `tasks.md` advising: always pull before appending to Completed; use `CD-{your-prefix}-###` to avoid ID collisions; only run `specpilot archive` on the default branch after merging (subsumes BL-024)
14. [CS-054] Add branch warning to `specpilot archive` — in `specArchiver.ts`, before archiving, detect current branch via `git rev-parse --abbrev-ref HEAD`; if branch is not `main` or `master`, print a yellow warning: `"⚠ You're on branch {name}. Archive is recommended only on the default branch after merging. Continue? [y/N]"`; skip warning if `--force` flag is passed; add `--force` option to archive command in `cli.ts`

## Completed

> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).
> **Line limit**: The Completed section has a 150-line limit. When exceeded, run `specpilot archive` to move older entries to `tasks-archive.md`.

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
35. [CD-074] [CS-017] [SPECS-FIX-11] Tier `project.yaml` rules into 🔴 critical / 🟡 process / 🟢 preferences; replace npm-specific mandate with generic "Never deploy, publish, or release"; deduplicate ai-context; apply to both live `.specs/project/project.yaml` and generated template in `templateEngine.ts`
36. [CD-075] [CS-025] [TOOL-004] Retire — superseded by CD-074; tiering the rules into critical/process/preferences achieved a better outcome than simply reducing to 5 mandates
37. [CD-076] [CS-035] Generate `.github/copilot-instructions.md` during `specpilot init` — new `generateCopilotInstructions()` in `ideConfigGenerator.ts`; called unconditionally from `specGenerator.ts` regardless of IDE choice; contains project name/stack, 5 critical mandates, process mandates, and re-anchor note; adds test coverage in `specGenerator.test.ts`
38. [CD-077] [CS-036] Add `## Re-Anchor Prompt` section to generated `prompts.md` template and to live `.specs/development/prompts.md` — paste prompt re-establishes critical rules for AI agents mid-session when context drifts after long sessions (> 1 hour / > 20 exchanges)
39. [CD-078] [CS-037] Documentation audit — updated 5 files to reflect recent feature additions (CD-076/077): `docs/GUIDE.md` (fixed quality/docs.md tree error, added copilot-instructions.md, test count 72→73), `README.md` (added copilot-instructions.md to IDE section), `CHANGELOG.md` (added Unreleased entries for CD-073/074/076/077), `.specs/project/requirements.md` (v1.2, added REQ-002.12–14), `.specs/architecture/architecture.md` (v1.5, new design decisions ARCH-004.11/12, updated init flow)
40. [CD-079] [BL-000] Fix `.vscode/` folder for SpecPilot project to match new generated pattern — added `settings.json` (AI IDE config, .specs search, markdown/YAML formatting), `extensions.json` (Prettier, YAML, Copilot, TypeScript), fixed `tasks.json` (de-duplicated 4 identical entries, added Build and Build-and-test tasks); also added `.github/copilot-instructions.md`
41. [CD-080] [CS-018] [SPECS-FIX-12] Rewrote `project/requirements.md` (v1.2 → v1.3) — restructured into labelled sub-sections (REQ-002.A–F), added: `specify` command with diff/confirmation [REQ-002.A.6], project context prompts [REQ-002.B.1], `--no-prompts` flag [REQ-002.B.6], IDE settings generation for VSCode/Cursor/Windsurf/Kiro/Antigravity [REQ-002.E.2], cloud agent config for Cowork/Codex [REQ-002.E.3], dual onboarding prompts [REQ-002.F.4], new `## Assumptions [REQ-004]` section (Node ≥16, npm ≥8, offline-first, etc.), path-injection validation NFR [REQ-003.4]
42. [CD-081] [CS-019] [SPECS-FIX-14] Archive SpecPilot's own growing `.specs/` files — manually archived `prompts.md` (447 lines → 56 lines) to new `prompts-archive.md`; added 300-line Archive Policy section to `prompts.md`; added 150-line guidance note to `tasks.md` Completed header; no stub files generated during init
43. [CD-082] [CS-021] [SPECS-FIX-16] Added `## Assumptions [ARCH-007]` section to `architecture/architecture.md` (v1.5 → v1.6) — 7 assumptions: Node.js ≥16 + CommonJS output [ARCH-007.1], cross-platform path.join [ARCH-007.2], no network at runtime [ARCH-007.3], single project root [ARCH-007.4], write access [ARCH-007.5], tsc compilation to dist/ [ARCH-007.6], no global state [ARCH-007.7]
44. [CD-083] [CS-022] [SPECS-FIX-17] Won't do — all `.specs/` files are currently active; adding `status: active` everywhere is noise with no informational value; status field will be used organically when a file is deprecated or archived
45. [CD-084] [CS-030] [TOOL-009] Won't do — generating `status: active` on all files creates ignored boilerplate; the field is only meaningful when non-active; users can add it when needed; BL-022 (file purpose descriptions) is a better use of front-matter real estate
46. [CD-085] [CS-039] [TRUST-001] Add “Read before describe” mandate — added as critical rule #6 to `.github/copilot-instructions.md`; added to live `.specs/project/project.yaml` critical tier; added to generated `project.yaml` template in `templateEngine.ts`; mandate: AI must never describe or quote file contents without first reading via a tool call in the current session
47. [CD-086] [CS-040] [TRUST-002] Add "never implement unless explicitly asked" mandate — added as critical rule #7 to `.github/copilot-instructions.md`; added to live `.specs/project/project.yaml` critical tier; added to generated `project.yaml` template in `templateEngine.ts`; mandate: AI must not write code or make file changes unless developer explicitly asks; if next step seems obvious, ask first
48. [CD-087] [CS-023] [TOOL-002] Generated `api.yaml` rewritten as dual-section template — `generateApiYaml()` in `specFileGenerator.ts` now produces both a `cli:` section and an OpenAPI 3.0.3 `paths:` section, each preceded by a "remove if not applicable" comment; replaced minimal OpenAPI-only stub; Option B chosen over context-aware prompting
49. [CD-088] [TOOL-002] Expand generated `api.yaml` to three-option template — added OPTION C: GraphQL section (`endpoint`, `queries`, `mutations`) alongside OPTION A (REST API / OpenAPI 3.0) and OPTION B (CLI); added top-level `project` and `version` fields; restuctured header with cleaner OPTION A/B/C labelling; `generateApiYaml()` updated in `specFileGenerator.ts`
50. [CD-089] [CS-042] [DOC-001] Fix 4 `README.md` inaccuracies — (a) TypeScript frameworks: added Nest.js, Vue, Angular; removed non-existent CLI; (b) JavaScript: corrected to React + Express only with a note that no framework prompt is shown; (c) Python: replaced `Data Science` with Flask and Streamlit; (d) `specify` command signature changed from `<desc>` to `[desc]` to reflect optional argument
51. [CD-090] Fix welcome screen missing commands — `migrate` and `specify` added to hardcoded Available Commands list in `displayWelcome()` in `logger.ts`; fixed missing space before dash in `add-specs` entry; commands reordered in logical usage order with consistent column alignment
52. [CD-091] Expand README Project Structure tree — all 10 generated files now shown with inline descriptions; redundant `### Key Files` section removed
53. [CD-092] [DOC-001] Cross-document audit for `.github/copilot-instructions.md` coverage and stale framework tables — (a) `docs/GUIDE.md` Project Structure tree updated to match README (alphabetical folders, all 10 files, `copilot-instructions.md` note added); (b) `docs/GUIDE.md` TypeScript/JavaScript/Python framework tables corrected to match `frameworks.ts` ground truth; (c) `.specs/development/docs.md` Pre-Commit Checklist and Protected Structure section updated to reference `copilot-instructions.md`
54. [CD-093] [CS-027] [TOOL-006] Add `## Assumptions` section to generated `requirements.md` — `generateRequirementsMd()` in `specFileGenerator.ts` now includes labelled `## Assumptions` section with 3 reviewer-tagged placeholders; placed before `## Cross-References`
55. [CD-094] [CS-028] [TOOL-007] Add `## Assumptions` section to generated `architecture.md` — `getArchitectureTemplate()` in `templateEngine.ts` now appends labelled `## Assumptions` section with 3 reviewer-tagged placeholders; placed after `## Monitoring and Observability`
56. [CD-095] [CS-020] [SPECS-FIX-15] Add `.specs/security/` folder — created `threat-model.md` (path traversal [SEC-002.1], template injection [SEC-002.2], supply chain [SEC-002.3]) and `security-decisions.md` (4 ADR entries: allowlist regex, no network, Handlebars escaping, minimal deps); updated `architecture.md` (v1.7, ARCH-004.13) and `docs.md` (v1.4, added `security/` to protected structure)
57. [CD-098] [CS-038] [TOOL-016] Add `specpilot archive` command — `src/utils/specArchiver.ts` archives `development/prompts.md` (> 300 lines → `prompts-archive.md`) and `planning/tasks.md` Completed section (> 150 lines → `tasks-archive.md`); archived blocks get a timestamped header; `--dry-run` flag previews without writing; `src/commands/archive.ts` prints a per-file report; `archive` command added to `src/cli.ts` and welcome screen; 14 new tests in `src/__tests__/specArchiver.test.ts`; `architecture.md` updated (v1.8, ARCH-003.9, ARCH-004.14)
58. [CD-099] [CS-031] [TOOL-011] Add archive guidance section to generated `prompts.md` — added `## Archive Policy` section to `generatePromptsMd()` in `specFileGenerator.ts`; instructs users to run `specpilot archive` when file exceeds 300 lines; explains older entries move to `prompts-archive.md` automatically; `--dry-run` flag mentioned; no stub `prompts-archive.md` generated during init
59. [CD-096] [CS-029] [TOOL-008] Add stale-date and line-limit warnings to `specpilot validate` — `validateStaleDates()` warns when any `.md` spec file's `lastUpdated` front-matter is > 90 days old; `validateLineLimits()` warns when `development/prompts.md` exceeds 300 lines or `planning/tasks.md` Completed section exceeds 150 lines (suggests `specpilot archive`); 7 new tests added; Jest `@types/jest` added to `tsconfig.json` types (pre-existing test runner fix)
60. [CD-097] [BUG-001] Fix `specpilot validate` crash on nested `rules` object in `project.yaml` — added `flattenRules()` private helper to `SpecValidator`; flattens `critical`/`process`/`preferences` sub-arrays into a single list before mandate checks; fixes `rules.some is not a function` error and spurious "should have a rules section" warning; `autoFix` updated to push mandates into `rules.process` when rules is a nested object
61. [CD-100] [CS-034] [TOOL-015] Add `--dry-run` flag to `specpilot init` — `initCommand()` in `src/commands/init.ts` now accepts `dryRun?: boolean` in `InitOptions`; when set, skips all interactive prompts and file/directory creation, prints the full list of files that would be created (14 files, 9 directories) via `logger.displayWithLogo()`, and returns without writing anything; `--dry-run` option added to `init` command in `src/cli.ts`
62. [CD-101] [CS-041] [TOOL-017] Display `.specs/` tree after init/add-specs success
63. [CD-102] [CS-043] Rename `specify` command to `refine`
64. [CD-103] [CS-033] [TOOL-013] Generate `security/` subfolder during `specpilot init` — `generateAll()` in `specFileGenerator.ts` creates `security/threat-model.md` and `security/security-decisions.md` with YAML front-matter and ADR-style placeholder sections; `security/` added to `specGenerator.ts` subfolders; dry-run list in `init.ts` updated (+3 entries: security dir + 2 files); `specTreePrinter.ts` updated with 2 new entries; 2 new tests added (94 → 96 total) — `src/commands/specify.ts` renamed to `src/commands/refine.ts`; exported function `specifyCommand` → `refineCommand`; interface `SpecifyOptions` → `RefineOptions`; CLI registration updated: command name `specify` → `refine`, alias `spec` → `ref`, description updated; welcome screen in `logger.ts`, generated `docs.md` template in `specFileGenerator.ts`, `README.md`, `docs/GUIDE.md`, `.specs/architecture/architecture.md`, `.specs/architecture/api.yaml`, `.specs/project/requirements.md`, and `.specs/development/docs.md` all updated to use `refine` — new `src/utils/specTreePrinter.ts` exports `getSpecTreeLines(specsName)` with 11 hardcoded entries (README.md, project/project.yaml, project/requirements.md, architecture/architecture.md, architecture/api.yaml, planning/tasks.md, planning/roadmap.md, quality/tests.md, development/context.md, development/docs.md, development/prompts.md); `Logger.displayInitSuccess()` in `logger.ts` imports and renders the tree between the location info and next-steps block; both `init` and `add-specs` automatically get the tree since they both call `displayInitSuccess()`
65. [CD-104] [CS-044] Document command aliases in README and `docs/GUIDE.md` — added aliases tip blockquote below the Commands table in `README.md` listing all 7 aliases (`init`→`i`, `validate`→`v`, `migrate`→`m`, `list`→`ls`, `refine`→`ref`, `archive`→`ar`, `add-specs`→`add`) with an example; added matching aliases table in `docs/GUIDE.md` after the `## Commands Reference` heading
66. [CD-105] [CS-046] Add aliases to welcome screen and `--help` output — `displayWelcome()` in `logger.ts` now shows an Aliases line (`init→i validate→v migrate→m list→ls refine→ref archive→ar add-specs→add`) and updated tip text; `.addHelpText('after', ...)` added to `cli.ts` printing the same aliases table plus a per-command options note
67. [CD-106] [DOC-002] Add `docs/comparison.md` comparing SpecPilot with GitHub Spec Kit — new dedicated comparison guide covering: philosophy differences, workflow comparison, generated artifacts, and when to choose each tool; `README.md` Documentation section updated to link to `comparison.md`; `docs/GUIDE.md` Table of Contents and new `## Comparison with GitHub Spec Kit` section added pointing to the file
68. [CD-112] [CS-048] Improve `specpilot validate` failure output — after `displayValidationResults(false, ...)` in `src/commands/validate.ts`, if `results.fixable.length > 0` (and `--fix` not used) print a yellow hint: "N issue(s) can be auto-fixed. Run: specpilot validate --fix"; if there are remaining manual-only errors print a dim count message; no change to exit code or existing output structure
69. [CD-107] [BUG-002] Fix `specpilot validate --fix` not writing files — `createMissingFile()` in `specValidator.ts` silently returned early when a subdirectory didn't exist instead of creating it; replaced the early-return stub with `mkdirSync(dir, { recursive: true })`; added `mkdirSync` to the `fs` import
70. [CD-108] Overhaul `specpilot validate` accuracy and UX — (a) add `security/threat-model.md` and `security/security-decisions.md` to `requiredFiles`; (b) fix mandate detection regex from over-strict pattern to `/mandate/i && /prompts/i` to eliminate false positives; (c) remove `add-mandates` from `fixable` (yaml.dump rewrites destroy formatting); replace with `fixPrompts` AI prompt output; (d) downgrade cross-reference errors to warnings + `fixPrompts` entries (filename-presence check too blunt to fail validation); (e) front-matter errors now also generate a `fixPrompts` entry; (f) add `fixPrompts: Array<{issue,prompt}>` to `ValidationResult`; display collected prompts in `validate.ts` via `displayFixPrompts()`; tests updated (101 total)
71. [CD-109] Populate security files on `specpilot validate --fix` with proper starter templates + AI fill-in prompts — `createMissingFile()` in `specValidator.ts` now has dedicated cases for `security/threat-model.md` and `security/security-decisions.md`; both are written with full YAML front-matter, labelled sections (SEC-001.1 through SEC-004, ADR-001/002), and structured [TODO] placeholders matching the `specFileGenerator.ts` templates; missing-file loop also emits `fixPrompts` entries for each security file with step-by-step AI prompts guiding the user to fill in attack surface, threats, mitigations, and ADR decisions based on their actual codebase
72. [CD-110] Improve `specpilot validate` UX — two-phase output eliminates confusion between `--fix` and AI prompts: Phase 1 (missing files present) shows only the `--fix` hint with a note to re-run after; Phase 2 (all files exist, content issues only) shows only AI prompts; the two are never shown simultaneously; `validate --fix` re-validation similarly shows AI prompts only after structure is resolved
73. [CD-110] [CS-047] Handle existing `.github/copilot-instructions.md` during `specpilot add-specs` — `generateCopilotInstructions()` in `ideConfigGenerator.ts` now checks if the file exists; if absent, writes fully as before; if present with `--no-prompts`, auto-skips and prints a warning with the mandates block for manual merging; if present with prompts enabled, asks `[o]verwrite / [a]ppend / [s]kip`; `generateSpecs()` in `specGenerator.ts` accepts new `noPrompts` option forwarded from `add-specs.ts`; 5 new tests added (96 → 101 total)
74. [CD-111] [BUG-003] Fix `specpilot validate` never showing content guidance after `--fix` — when `--fix` created missing files and re-validation passed, the AI fill-in prompts for newly created files were silently discarded; root cause: prompts were generated only in the missing-files loop (Phase 1) and suppressed in the success path; fix in `validate.ts`: capture `results.fixPrompts` as `prefixPrompts` before auto-fix runs, then merge with `reResults.fixPrompts` (deduped by issue label) into `allPrompts`; always show `allPrompts` after `--fix` regardless of whether re-validation passes (labelled "📋 Next step — fill in the newly created files:") or fails (labelled "📋 Next step — content guidance for your AI assistant:")
75. [CD-113] [CS-049] [TRUST-003] Add Spec-First review gate mandate — live `.specs/project/project.yaml`, generated `project.yaml` template in `templateEngine.ts`, live `.github/copilot-instructions.md`, and generated copilot instructions in `ideConfigGenerator.ts` now require AI to read relevant `.specs/` files, update affected specs first, present a **Spec Report**, and wait for explicit developer `yes, proceed` before touching code or non-spec files; tests updated (103 total)
76. [CD-114] [CS-045] Document per-command options in README and `docs/GUIDE.md` — added `### Per-Command Options` table to `README.md` listing all flags for all 7 commands with a `--help` pointer; fixed 6 Options sections in `docs/GUIDE.md`: removed phantom `--prompts, -p` from `init` and `refine`, corrected `--verbose` (no `-v` short form) in `validate` and `list`, added missing `--dir`/`--specs-name` to `init` and `refine`, added missing `--lang`/`--framework`/`--no-prompts` to `add-specs`, added missing **Options:** section to `migrate`
77. [CD-115] [CS-050] Add `specpilot backfill` (alias `bf`) command — new `src/utils/specBackfiller.ts` uses fingerprint-based detection to find missing mandates in `project.yaml` and `copilot-instructions.md`; text-based insertion (not yaml.dump) preserves comments and emoji; `src/commands/backfill.ts` prints per-file results via `logger.displayWithLogo()`; registered in `cli.ts` with `--dir`, `--specs-name`, `--dry-run`; welcome screen and `--help` aliases updated; `migrate` description corrected from “Migrate between spec versions” to “Convert legacy `.project-spec` folder” in `cli.ts`, `logger.ts`, `README.md`, and `docs/GUIDE.md`; `docs/GUIDE.md` backfill section added with when-to-use guidance; `README.md` commands table, aliases, and per-command options table updated
