---
fileID: TASKS-001
lastUpdated: 2026-07-05
version: 5.31
contributors: [girishr]
relatedFiles: [roadmap.md, project.yaml, requirements.md, tasks-archive.md]
---

# Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-girishr-###: Completed items (e.g. CD-girishr-001)
- CD-###: Completed items

Notes

- IDs are stable; do not change once assigned (even if reordered or moved between sections).
- Reference tasks by ID in commits, prompts, PRs, and discussions.
- When moving an item from Backlog to Current Sprint, retain its original BL ID or create a CS mirror that references the BL ID.

## Backlog

1. [BL-009] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects
2. [BL-010] Add security audit, scanning, and compliance workflow to SpecPilot
    - Add security commands for dependency audit, static analysis, and compliance checks
    - Integrate with `npm audit`, `snyk`, or `semgrep`
    - Surface security findings through `specpilot validate` where appropriate
    - Add optional CI/CD integration for automated security checks
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
12. [BL-025] Add Mermaid diagram placeholder to generated `architecture.md` — insert a single `graph TD` starter block in the `## System Architecture` section as a ready-to-fill scaffold; add a comment above it pointing to Mermaid docs; keep it generic (not framework-specific for v1); rendered natively in GitHub, GitLab, VS Code, and most AI IDEs with no extra tooling; change is in `getArchitectureTemplate()` in `templateEngine.ts`; future enhancement (not in this task): branch on `framework` to generate slightly more relevant stubs
14. [BL-031] Add `AGENTS.md` support for cross-agent mandates


## Current Sprint

1. [CS-078] Force AI to write tests for every feature — two-part enforcement, not text-only:
   - Mandate: add a new critical mandate line (e.g. "Every feature ships with tests. No exceptions.") to `buildCriticalMandatesMarkdown()` in `ideConfigGenerator.ts` — single shared source, so it propagates to every generated AI instruction file (`CLAUDE.md`, `.github/copilot-instructions.md`, Cursor `.mdc`, `.windsurfrules`, `.antigravity/rules.md`, Cowork)
   - Backstop: new generator (parallel to `generateIDESettings`) that scaffolds a git hook or GitHub Actions workflow into initialized projects to run `npm test`/coverage automatically, so the mandate has a mechanical gate behind it
   - `specBackfiller.ts`: extend fingerprint checks so existing projects get the new mandate line + hook/CI file via `specpilot backfill`
   - Spec sync required once implemented: `project/requirements.md` (new mandate/feature), `architecture/architecture.md` (new generator + hook/CI scaffolding), `quality/tests.md` (new tests for the added generator logic)
2. [CS-079] [BL-038] Slash Command Generator — Core Infrastructure
   - New module `src/utils/slashCommandGenerator.ts`, parallel to `ideConfigGenerator.ts`; each command defined once as `{ name, description, body }` and rendered per IDE
   - Per-IDE routing (file path differs, some also differ in frontmatter format):
     - Claude Code → `.claude/commands/specpilot-<name>.md`
     - Cursor → `.cursor/commands/specpilot-<name>.md`
     - Windsurf → `.windsurf/workflows/specpilot-<name>.md`
     - Antigravity → `.agent/workflows/specpilot-<name>.md` (note: **not** `.antigravity/` — different from the existing `.antigravity/rules.md` path)
     - GitHub Copilot (vscode) → `.github/prompts/specpilot-<name>.prompt.md` (note the `.prompt.md` extension, not `.md`)
     - Codex → **no repo-level support**; custom prompts only load from `~/.codex/prompts/` (user home, not project); still write `.codex/prompts/specpilot-<name>.md` in-repo as a reference copy, and print a one-time instruction telling the user to copy it to `~/.codex/prompts/` manually; do not claim auto-discovery for Codex
   - Called from `SpecGenerator.generateSpecs()` after IDE config generation, using the same IDE selection already collected for rules/mandates
   - Command bodies come in two styles depending on the task (decide per command, see CS-080–087): natural-language instructions for judgment-heavy commands, or an embedded literal script (bash/node) for anything mechanical/threshold-based — do not let the model eyeball line counts or fingerprint checks that a script can get exactly right
3. [CS-080] [BL-039] `specpilot-status` slash command — natural-language only, no script. Body: read `.specs/planning/tasks.md` Current Sprint section and `.specs/planning/roadmap.md` Milestones/Timeline; produce a one-screen summary of in-progress sprint items and next milestone
4. [CS-081] [BL-040] `specpilot-reanchor` slash command — natural-language only, near-static. Body: read `.specs/project/project.yaml` and the `## Re-Anchor Prompt` section of `.specs/development/prompts.md` verbatim, restate as current operating context. Formalizes the `## Re-Anchor` mandate already in `CLAUDE.md`/`copilot-instructions.md` as a one-keystroke action
5. [CS-082] [BL-041] `specpilot-report` slash command — natural-language only, formalizes the Spec-First gate (CLAUDE.md mandate 8). Body: classify the pending change (trivial/feature/architectural), read the relevant `.specs/` files per the Context routing table, update affected specs first, present a Spec Report (files touched, what changed, what specs now say), and explicitly wait for the user's `yes, proceed` before writing any code
6. [CS-083] [BL-042] `specpilot-sync` slash command — natural-language only (comparison/judgment, not scriptable). Body: read `.specs/architecture/architecture.md`, `.specs/project/requirements.md`, `.specs/quality/tests.md`; compare against actual `src/` structure and `package.json`; list discrepancies (stale versions, renamed/removed files, undocumented modules, stale command lists); propose per-file edits; wait for confirmation before writing. Formalizes the manual drift-fix work done for SpecPilot's own `.specs/` in this session
7. [CS-084] [BL-043] `specpilot-refine <description>` slash command — natural-language, argument-taking (`argument-hint: <description>`, `$ARGUMENTS`). Body: take the user's requirement description, read current `requirements.md`/`context.md`/`prompts.md`, propose additions/edits, show a line-level diff preview, wait for confirmation, then write. Mirrors CLI `specpilot refine` (REQ-002.A.6) as a standalone agent workflow, no CLI dependency
8. [CS-085] [BL-044] `specpilot-validate` slash command — hybrid: mechanical checks scripted, judgment checks stay prose. Frontmatter `allowed-tools: Bash, Read`. Body: run an embedded script that (a) checks all expected `.specs/` files exist, (b) checks each markdown file has YAML front-matter with `fileID`/`lastUpdated`/`version`/`contributors`/`relatedFiles`, (c) checks `relatedFiles:` cross-references resolve to real files; then summarize findings in plain language with optional fix suggestions (never auto-apply). Mirrors CLI `specpilot validate --fix --verbose` (REQ-002.A.3). Note: GitHub Copilot only runs terminal commands in "agent mode" — flag as a known platform limitation where this command degrades to prose-only, higher error rate
9. [CS-086] [BL-045] `specpilot-archive` slash command — mechanical, must embed a deterministic script, not model line-counting. Frontmatter `allowed-tools: Bash, Read, Edit`. Body: run a script counting lines in `.specs/planning/tasks.md` `## Completed` section (threshold 25) and `.specs/development/prompts.md` (threshold 100); if over threshold, move oldest entries to `tasks-archive.md`/`prompts-archive.md` with a timestamped header, preserving IDs exactly; include the branch guard (`git rev-parse --abbrev-ref HEAD`, warn + confirm if not `main`/`master`, mirrors ARCH-004.19). Mirrors CLI `specpilot archive --dry-run --force` (REQ-002.A.8)
10. [CS-087] [BL-046] `specpilot-backfill` slash command — mechanical/structural; needs an embedded mandate-fingerprint baseline since there's no CLI holding "current version" state in the web-app model. Body: check each IDE file for known mandate fingerprints (critical mandates list, Code Philosophy heading, Code Rules heading, Re-Anchor heading — fingerprint text embedded literally in the command body); for each missing fingerprint, append the corresponding block, append-only, never overwrite; check `project.yaml` for `team.devPrefix`, prompt if absent; report per-file updated/already-current/skipped. **Maintenance cost to flag**: this command's embedded baseline must be manually kept in sync whenever `CLAUDE.md`/`copilot-instructions.md` content changes, since (unlike the CLI's `specBackfiller.ts`) there's no shared source-of-truth constant to import from
11. [CS-088] [BL-047] Extend CLI-side `specBackfiller.ts` to backfill missing slash command files — for existing CLI users (web app and CLI coexist), detect missing `.claude/commands/specpilot-*.md`, `.cursor/commands/specpilot-*.md`, `.windsurf/workflows/specpilot-*.md`, `.agent/workflows/specpilot-*.md`, `.github/prompts/specpilot-*.prompt.md` and generate them from the same shared `{ name, description, body }` content used by `slashCommandGenerator.ts` (BL-038), so CLI-side backfill and web-app-side generation never drift apart

## Completed

> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).
> **Line limit**: The Completed section has a 25-line limit. When exceeded, run `specpilot archive` to move older entries to `tasks-archive.md`.

78. [CD-116] [CS-051] Change "Enter your name" prompt to GitHub username — `init.ts` and `add-specs.ts` now prompt `'Enter your GitHub username…'`; default attempts `git config user.name`, falling back to `'your-username'`; value populates `TemplateContext.author` (contributors front-matter) and is written as `team.devPrefix` in generated `project.yaml` (e.g. `devPrefix: "girishr"`); `templateEngine.ts` `team:` section updated to include `devPrefix: "{{author}}"`
79. [CD-117] [CS-052] Generate `.gitattributes` with `merge=union` — new `IdeConfigGenerator.generateGitAttributes()` writes `.gitattributes` at project root with `merge=union` for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; if file exists, only missing lines are appended (existing content preserved); called unconditionally from `SpecGenerator.generateSpecs()` for both `init` and `add-specs`
80. [CD-118] [CS-053] Make short handle prompt mandatory; add `devPrefix` to generated ID conventions — `init.ts` and `add-specs.ts`: replaced `git config user.name` fallback with `os.userInfo().username` shown as suggestion; prompt explains ID prefixing with examples (`CD-jsmith-001`, `PROMPT-jsmith-001`); accepts GitHub/GitLab/Bitbucket username or any short tag; prompt loops until non-empty when prompts enabled; `--no-prompts` falls back to OS login name; generated `tasks.md` template updated with `CD-{devPrefix}-###` and `PROMPT-{devPrefix}-###` in ID conventions and new `## Multi-Dev Notes` section; generated `prompts.md` conventions updated to show prefixed ID examples
81. [CD-119] [CS-056] Lower archive thresholds — `PROMPTS_LINE_LIMIT` 300→100, `PROMPTS_KEEP_LINES` 250→80, `COMPLETED_LINE_LIMIT` 150→25, `COMPLETED_KEEP_ENTRIES` 100→20 in `specArchiver.ts`; `specValidator.ts` static constants updated (100/25); `specFileGenerator.ts` Archive Policy text updated to 100 lines; `cli.ts` archive description updated; `docs/GUIDE.md` threshold references updated; `specArchiver.test.ts` and `specValidator.test.ts` test data and assertions updated; 38 tests passing
82. [CD-120] [CS-054] Add branch warning to `specpilot archive` — `archiveCommand()` in `src/commands/archive.ts` calls `git rev-parse --abbrev-ref HEAD` via `execSync`; if branch is not `main` or `master`, prints yellow `⚠ You're on branch '{name}'` warning and prompts `Continue? [y/N]`; declining aborts without writing; `--force` flag skips the prompt; git failure silently ignored; `--force` option added to `archive` command in `cli.ts`; REQ-002.A.8 and ARCH-004.19 added to spec files
83. [CD-121] [CS-055] Backfill `tasks.md` devPrefix ID conventions — `specBackfiller.ts`: new `readDevPrefix()` reads `team.devPrefix` from `project.yaml`; new `backfillTasksMd()` checks for `CD-{devPrefix}-###` convention line and `## Multi-Dev Notes` section, inserts both if absent; `BackfillResult` extended with `tasksMd: BackfillFileResult`; `backfill.ts` display updated to show third file result and correct item counts; skipped-with-reason shows warning instead of success
84. [CD-122] [CS-057] Backfill `team.devPrefix` prompt — `specBackfiller.ts`: new `ensureDevPrefix()` checks if `team.devPrefix` absent and prompts before patching `tasks.md`; `readContributorsFirst()` reads first entry from `contributors:` list (inline or block) falling back to `os.userInfo().username`; `promptHandle()` loops until non-empty answer; `writeDevPrefix()` inserts `team:\n  devPrefix:` after `license:` line (or inside existing `team:` block) using text-based insertion; `--no-prompts` / `dryRun` accept suggestion silently; `BackfillOptions.noPrompts` added; `--no-prompts` flag added to `backfill` CLI command in `cli.ts`
85. [CD-girishr-001] [CS-058] IDE-routed AI context files — `ideConfigGenerator.ts`: new `generateAiContextFile()` routes per IDE: Cursor → `.cursor/rules/project.mdc` (YAML front-matter `description`/`globs`/`alwaysApply: true` + mandates body); Windsurf → `.windsurfrules` (plain markdown at project root); Antigravity → `.antigravity/rules.md` (plain markdown); VSCode/Codex → `.github/copilot-instructions.md` (unchanged); `generateCursorRules()`, `generateWindsurfRules()`, `generateAntigravityRules()` private helpers added; `specGenerator.ts` updated to call `generateAiContextFile()` instead of always calling `generateCopilotInstructions()`; `init.ts` dry-run note updated; closes BL-027 and BL-031
86. [CD-girishr-002] [CS-059] Generate `CLAUDE.md` router for Cowork — `ideConfigGenerator.ts`: `'cowork'` case in `generateAiContextFile()` → `generateClaudeMd()`; content: lean router with critical mandates + ordered pointer list to `.specs/` files and SKILL.md + Re-Anchor; existing-file: `[o]verwrite / [a]ppend / [s]kip` or `--no-prompts` auto-skip + yellow warning; `buildClaudeMd()` + `buildClaudeMdSection()` helpers added; 3 new tests (102 → 105); closes BL-023 and BL-028
87. [CD-girishr-003] [CS-060] Write `specBackfiller.test.ts` — new test suite (7th) covering all backfiller logic that shipped without tests in CS-055/CS-057: `backfillProjectYaml()` (3 insertion strategies, skipped/updated/missing), `backfillCopilotInstructions()` (created/skipped/updated), `backfillTasksMd()` (devPrefix convention line + Multi-Dev Notes), `ensureDevPrefix()` + `writeDevPrefix()` + `readContributorsFirst()` (inline/block/fallback), dry-run for all three targets; 24 new tests (105 → 129 total)
88. [CD-girishr-004] Spec sync: refreshed stale spec files to match current CLI/package state — `architecture/api.yaml` now documents package version 1.6.7, current command options, `archive`, `backfill`, and aliases; `planning/roadmap.md`, `development/context.md`, `development/docs.md`, `development/prompts.md`, and `project/project.yaml` updated for current phase/version and CLI workflow alignment
89. [CD-girishr-005] [CS-061] IDE file backfill in `specpilot backfill` — detects existing `.cursor/rules/project.mdc`, `CLAUDE.md`, `.windsurfrules`, `.antigravity/rules.md`, and `.claude/skills/specpilot-project/SKILL.md` by filesystem presence; appends missing MD mandates to mandate-bearing IDE files; reports SKILL.md as `stale` when structural fingerprints are missing without auto-patching it; extends `BackfillResult` with `ideFiles`; updates CLI display; 15 new backfiller tests (129 → 144 total)
90. [CD-girishr-006] [CS-062] Add purpose descriptions to generated spec files — updated template generation so all generated `.specs/` markdown files include a one-line front-matter `description:` field (`requirements.md`, `architecture.md`, `tasks.md`, `roadmap.md`, `tests.md`, `docs.md`, `context.md`, `prompts.md`, `threat-model.md`, `security-decisions.md`); added `# Purpose:` comment to generated `architecture/api.yaml` (YAML config, no front-matter); descriptions aligned with `specTreePrinter.ts` labels; no behavioral logic changes and test suite remains 144/144 passing
91. [CD-girishr-007] [CS-063] [BL-029] Add IDE/Agent prompt to `specpilot add-specs` — `add-specs.ts` now prompts for IDE/Agent preference using the same 6-choice `inquirer` list as `init.ts` (vscode / Cursor / Windsurf / Antigravity / Cowork / Codex); selected IDE passed to `specGenerator.generateSpecs()` so the correct AI context file is generated; respects `--no-prompts` flag (defaults to `vscode`); closes BL-029
93. [CD-girishr-009] Release v1.8.0 — bump `package.json` version to `1.8.0`, promote `[Unreleased]` in `CHANGELOG.md` to `[1.8.0] - 2026-06-06`, create git tag `v1.8.0`, push to GitHub, create GitHub release, publish to npm
92. [CD-girishr-008] [CS-065] [BL-034] Add Kotlin and Swift language support — `frameworks.ts`: `kotlin` → `['android', 'spring', 'ktor', 'compose']`, `swift` → `['ios', 'swiftui', 'vapor']`; `projectDetector.ts`: `detectKotlinProject()` (build.gradle / build.gradle.kts / settings.gradle.kts; Spring/Ktor/Android/Compose sniffing) and `detectSwiftProject()` (Package.swift / .xcodeproj / .xcworkspace; Vapor/SwiftUI/iOS sniffing) wired into `detectProject()`; `templateEngine.ts`: 4 base templates (`kotlin-project.yaml`, `kotlin-architecture.md`, `swift-project.yaml`, `swift-architecture.md`) + 7 framework-specific variants (kotlin-android/spring/ktor/compose, swift-ios/swiftui/vapor) + build commands (`./gradlew build`, `swift build`) + dependency sections; `init.ts` and `add-specs.ts` `supportedLanguages` extended; `projectDetector.test.ts` +15 tests, `templateEngine.test.ts` +10 tests; 144 → 169 total
95. [CD-girishr-013] [CS-069] [BL-035] Remove `docs.md` from generated output — deleted `generateDocsMd()` from `specFileGenerator.ts` and its call in `generateAll()`; removed `Docs: ./docs.md` cross-reference from `context.md` template; dropped `development/docs.md` from required-files test assertion (26 tests pass)
96. [CD-girishr-014] [CS-071] [BL-037] `prompts.md` token trims — removed `## Common Commands` (specpilot CLI docs) and `## AI Agent Guidelines` (duplicates AI config file mandates) and `## Cross-References` footer from `generatePromptsMd()` in `specFileGenerator.ts`; 2 new assertions added to existing prompts.md test (188 total)
95. [CD-girishr-013] [CS-070] [BL-036] Conditional `api.yaml` generation — added `apiParadigm: 'rest' | 'cli' | 'graphql' | 'none'` to `TemplateContext` and `SpecGeneratorOptions`; `inferApiParadigm()` helper in `specGenerator.ts` maps REST frameworks → `rest`, UI/mobile frameworks → `none`, fallback → `rest`; explicit `inquirer` list prompt ("What API paradigm does this project use?") added in `init.ts` and `add-specs.ts` after framework question; `generateApiYaml()` in `specFileGenerator.ts` routes on `context.apiParadigm` — emits only the matching section (REST/CLI/GraphQL) or skips file entirely for `none`; 8 new tests (180 → 188 total)
107. [CD-girishr-015] [CS-073] Terse spec file templates — stripped (a) instructional prose/blockquotes/HTML comments/example rows, (b) `## Cross-References` footer blocks, and (c) verbose `[TODO: ...]` filler (→ bare `[TODO]`) from 7 `generateXxx()` methods in `specFileGenerator.ts`; removed `## Multi-Dev Notes` blockquote from `tasks.md` template; collapsed roadmap milestones to single `## Milestones` section; dropped ADR-001/ADR-002 example subsections from `security-decisions.md`; updated 1 test assertion (ADR-001/002 checks removed); 188 tests still passing
94. [CD-girishr-012] [CS-068] [CS-072] Token optimization — `prompts.md` + new `onboarding.md` (`specFileGenerator.ts`, `templateEngine.ts`, `specGenerator.ts`, `init.ts`, `add-specs.ts`) — stripped both onboarding prompt sections from `generatePromptsMd()`; new `generateOnboardingMd()` writes `.specs/development/onboarding.md` with self-destruct header and greenfield or brownfield prompt selected via new `context.projectType: 'greenfield' | 'brownfield'` field; `generateSpecs()` return type changed from `void` to `{ onboardingPrompt: string }`; greenfield/brownfield `inquirer` list prompt added as first interactive prompt in `init.ts` (default greenfield) and `add-specs.ts` (default brownfield); onboarding prompt printed to stdout in highlighted block after generation; `NEW_PROJECT_README` and `EXISTING_PROJECT_README` Quick Start rewritten to point to `onboarding.md` (absorbs CS-072); 11 new tests (169 → 180 total)
111. [CD-girishr-019] [CS-074] Add Code Philosophy + Code Rules to all generated AI instruction files — `ideConfigGenerator.ts`: new `buildCodePhilosophyMarkdown()` injected into `buildCopilotInstructions()` (covers GitHub Copilot, Cursor, Windsurf, Antigravity), `buildClaudeMd()`, and `buildClaudeMdSection()`; `agentConfigGenerator.ts`: same 14-item block added to SKILL.md and CODEX_INSTRUCTIONS.md templates; `specBackfiller.ts`: new `CODE_SECTIONS` constant (2 entries), `backfillMarkdownIdeFile()` and `backfillCopilotInstructions()` updated — total backfill checks 8→10, append Code Philosophy + Code Rules when missing; 2 new backfiller tests + 1 generator test (190 → 192)
110. [CD-girishr-018] [CS-075] Fix stale `Cowork` reference in `.specs/development/docs.md` — replaced `` `CLAUDE.md` for Cowork `` with `` `CLAUDE.md` for Claude Code ``; single-line text change, no code or test impact
109. [CD-girishr-017] [CS-077] Rename Cursor output to `specpilot.mdc` — `ideConfigGenerator.ts`: `project.mdc` → `specpilot.mdc`; `specBackfiller.ts`: backfill target updated; migration warning emitted when old `project.mdc` exists but `specpilot.mdc` does not (no auto-rename); 2 new tests (188 → 190); swept all `project.mdc` label refs in `.specs/`, `README.md`, `docs/GUIDE.md`, `CHANGELOG.md`
108. [CD-girishr-016] [CS-076] Rename `VSCode` IDE choice label to `GitHub Copilot` — `init.ts` and `add-specs.ts`: `{ name: 'VSCode' }` → `{ name: 'GitHub Copilot' }`, internal value stays `'vscode'`; swept all `VSCode` label references in `.specs/` (`context.md`, `roadmap.md`, `requirements.md`, `docs.md`, `api.yaml`, `architecture.md`), `README.md`, `docs/GUIDE.md`, and `CHANGELOG.md`; no routing logic or test changes
112. [CD-girishr-020] Fix `specValidator.ts` requiring a file that's never generated — `development/docs.md` was removed from `specFileGenerator.ts` output back in CD-girishr-013 (CS-069), but `specValidator.ts` still listed it in `requiredFiles` and in the `development/context.md` cross-reference check; caused `specpilot validate` to fail on every freshly-scaffolded project with `Missing required file: development/docs.md`, plus a spurious warning on `context.md`; removed all 3 stale references (`requiredFiles` array + 2 entries in the cross-ref checks list); `specValidator.test.ts` updated to match (removed `docs.md` fixture creation, dropped its refs from the `context.md` fixture, required-file count 11→10); 192 tests still passing; discovered via a real `specpilot validate` run against this repo after `development/docs.md` was deleted
