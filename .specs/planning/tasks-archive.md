---
fileID: TASKS-ARCHIVE-001
lastUpdated: 2026-02-28
version: 1.0
contributors: [girishr]
relatedFiles: [tasks.md]
---

# Task Archive

Completed items archived from `tasks.md` on 2026-02-28 (CD-001 through CD-039).
IDs are stable — do not reassign.

## Archived Completed Items

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
## Archived on 2026-04-26 07:20:03

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

---

## Archived on 2026-04-26 07:22:04

61. [CD-100] [CS-034] [TOOL-015] Add `--dry-run` flag to `specpilot init` — `initCommand()` in `src/commands/init.ts` now accepts `dryRun?: boolean` in `InitOptions`; when set, skips all interactive prompts and file/directory creation, prints the full list of files that would be created (14 files, 9 directories) via `logger.displayWithLogo()`, and returns without writing anything; `--dry-run` option added to `init` command in `src/cli.ts`

---

## Archived on 2026-04-26 09:05:32

62. [CD-101] [CS-041] [TOOL-017] Display `.specs/` tree after init/add-specs success
63. [CD-102] [CS-043] Rename `specify` command to `refine`

---

## Archived on 2026-05-03 02:24:06

64. [CD-103] [CS-033] [TOOL-013] Generate `security/` subfolder during `specpilot init` — `generateAll()` in `specFileGenerator.ts` creates `security/threat-model.md` and `security/security-decisions.md` with YAML front-matter and ADR-style placeholder sections; `security/` added to `specGenerator.ts` subfolders; dry-run list in `init.ts` updated (+3 entries: security dir + 2 files); `specTreePrinter.ts` updated with 2 new entries; 2 new tests added (94 → 96 total) — `src/commands/specify.ts` renamed to `src/commands/refine.ts`; exported function `specifyCommand` → `refineCommand`; interface `SpecifyOptions` → `RefineOptions`; CLI registration updated: command name `specify` → `refine`, alias `spec` → `ref`, description updated; welcome screen in `logger.ts`, generated `docs.md` template in `specFileGenerator.ts`, `README.md`, `docs/GUIDE.md`, `.specs/architecture/architecture.md`, `.specs/architecture/api.yaml`, `.specs/project/requirements.md`, and `.specs/development/docs.md` all updated to use `refine` — new `src/utils/specTreePrinter.ts` exports `getSpecTreeLines(specsName)` with 11 hardcoded entries (README.md, project/project.yaml, project/requirements.md, architecture/architecture.md, architecture/api.yaml, planning/tasks.md, planning/roadmap.md, quality/tests.md, development/context.md, development/docs.md, development/prompts.md); `Logger.displayInitSuccess()` in `logger.ts` imports and renders the tree between the location info and next-steps block; both `init` and `add-specs` automatically get the tree since they both call `displayInitSuccess()`
65. [CD-104] [CS-044] Document command aliases in README and `docs/GUIDE.md` — added aliases tip blockquote below the Commands table in `README.md` listing all 7 aliases (`init`→`i`, `validate`→`v`, `migrate`→`m`, `list`→`ls`, `refine`→`ref`, `archive`→`ar`, `add-specs`→`add`) with an example; added matching aliases table in `docs/GUIDE.md` after the `## Commands Reference` heading
66. [CD-105] [CS-046] Add aliases to welcome screen and `--help` output — `displayWelcome()` in `logger.ts` now shows an Aliases line (`init→i validate→v migrate→m list→ls refine→ref archive→ar add-specs→add`) and updated tip text; `.addHelpText('after', ...)` added to `cli.ts` printing the same aliases table plus a per-command options note

---

