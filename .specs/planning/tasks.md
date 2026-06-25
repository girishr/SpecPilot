---
fileID: TASKS-001
lastUpdated: 2026-06-25
version: 5.21
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

1. [CS-067] Token optimization — project.yaml template (`templateEngine.ts`)
   - Edit A: Remove entire `rules:` block (`critical:` + `process:` sub-keys) from the generated `project.yaml` template; replace with single comment: `# Rules and mandates: see your AI agent configuration file (single source of truth)`
3. [CS-068] Token optimization — generated `prompts.md` template (`specFileGenerator.ts`)
   - Edit A: Remove both onboarding prompt sections (new-project prompt, existing-project prompt, shared conventions block) from `generatePromptsMd()`; generated `prompts.md` retains only: Archive Policy, Re-Anchor Prompt, Prompt History table, Common Commands, AI Agent Guidelines, Cross-References
4. [CS-069] [BL-035] Remove `docs.md` from generated output — `generateDocsMd()` in `specFileGenerator.ts` produces three content areas that are all redundant: (a) spec file conventions (front-matter/ID format) already enforced by `specpilot validate` and visible by example in every other spec file; (b) spec update checklist duplicates mandate #5 in `buildCriticalMandatesMarkdown()`; (c) CLI commands reference (`specpilot init`, `validate`, etc.) are SpecPilot's own docs that belong in SpecPilot's README/GUIDE.md, not in every user project; remove the `generateDocsMd()` call from `generateAll()` and delete the method
5. [CS-070] [BL-036] Make `api.yaml` generation conditional — `generateApiYaml()` currently outputs all three paradigm sections (REST/OpenAPI, CLI, GraphQL) for every project regardless of `context.framework`; route on `context.framework` to emit only the relevant section (e.g. `express`/`fastapi`/`django`/`spring` → REST; CLI-flagged frameworks → CLI block; `graphql` → GraphQL); skip file entirely if no API paradigm is detectable
6. [CS-071] [BL-037] Additional `prompts.md` token trims — `generatePromptsMd()` still generates two sections after CS-068: (a) "Common Commands" block listing `specpilot init/add-specs/validate` — SpecPilot's own CLI docs embedded in every user project; (b) "AI Agent Guidelines" block duplicating the AI config file mandates verbatim; remove both sections
7. [CS-072] [BL-038] Fix `.specs/README.md` after CS-068 — both `NEW_PROJECT_README` and `EXISTING_PROJECT_README` have a Step 1–3 onboarding flow pointing to onboarding prompt sections that CS-068 removes; rewrite Quick Start to reflect the post-CS-068 `prompts.md` structure
8. [CS-073] Terse generated spec file templates (`specFileGenerator.ts`) — strip three categories of verbosity from all `generateXxx()` template strings: (a) instructional prose aimed at the dev (explanatory blockquotes, HTML comments, example `[ASSUMPTION]` rows); (b) `## Cross-References` footer blocks in every file (~4 lines × 10 files); (c) verbose multi-line `[TODO: ...]` filler — replace with single `[TODO]` per section; target skeleton: front-matter + section headers with stable IDs + one `[TODO]` per section; no prose, no navigation links

## Completed

> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).
> **Line limit**: The Completed section has a 25-line limit. When exceeded, run `specpilot archive` to move older entries to `tasks-archive.md`.

70. [CD-girishr-010] [CS-066] Token optimization — AI agent config file (`ideConfigGenerator.ts`) — rewrote all 8 mandates in terse/caveman style in `buildCriticalMandatesMarkdown()`; mandate 5 now tiered (Trivial → `tasks.md`, Feature → `requirements.md` + `tasks.md`, Architectural → all files + `CHANGELOG.md`); mandate 8 now tiered gate (Trivial → no gate, Feature → read 1–2 files, Architectural → full Spec Report + `yes, proceed`); replaced "Read in this order: 1–5" with on-demand routing table in all 4 builder methods (`buildClaudeMd`, `buildClaudeMdSection`, `buildCopilotSection`, `buildCopilotInstructions`) via new `buildContextRoutingTable()` helper; 5 test assertions updated (169 total)
71. [CD-108] Overhaul `specpilot validate` accuracy and UX — (a) add `security/threat-model.md` and `security/security-decisions.md` to `requiredFiles`; (b) fix mandate detection regex from over-strict pattern to `/mandate/i && /prompts/i` to eliminate false positives; (c) remove `add-mandates` from `fixable` (yaml.dump rewrites destroy formatting); replace with `fixPrompts` AI prompt output; (d) downgrade cross-reference errors to warnings + `fixPrompts` entries (filename-presence check too blunt to fail validation); (e) front-matter errors now also generate a `fixPrompts` entry; (f) add `fixPrompts: Array<{issue,prompt}>` to `ValidationResult`; display collected prompts in `validate.ts` via `displayFixPrompts()`; tests updated (101 total)
71. [CD-109] Populate security files on `specpilot validate --fix` with proper starter templates + AI fill-in prompts — `createMissingFile()` in `specValidator.ts` now has dedicated cases for `security/threat-model.md` and `security/security-decisions.md`; both are written with full YAML front-matter, labelled sections (SEC-001.1 through SEC-004, ADR-001/002), and structured [TODO] placeholders matching the `specFileGenerator.ts` templates; missing-file loop also emits `fixPrompts` entries for each security file with step-by-step AI prompts guiding the user to fill in attack surface, threats, mitigations, and ADR decisions based on their actual codebase
72. [CD-110] Improve `specpilot validate` UX — two-phase output eliminates confusion between `--fix` and AI prompts: Phase 1 (missing files present) shows only the `--fix` hint with a note to re-run after; Phase 2 (all files exist, content issues only) shows only AI prompts; the two are never shown simultaneously; `validate --fix` re-validation similarly shows AI prompts only after structure is resolved
73. [CD-110] [CS-047] Handle existing `.github/copilot-instructions.md` during `specpilot add-specs` — `generateCopilotInstructions()` in `ideConfigGenerator.ts` now checks if the file exists; if absent, writes fully as before; if present with `--no-prompts`, auto-skips and prints a warning with the mandates block for manual merging; if present with prompts enabled, asks `[o]verwrite / [a]ppend / [s]kip`; `generateSpecs()` in `specGenerator.ts` accepts new `noPrompts` option forwarded from `add-specs.ts`; 5 new tests added (96 → 101 total)
74. [CD-111] [BUG-003] Fix `specpilot validate` never showing content guidance after `--fix` — when `--fix` created missing files and re-validation passed, the AI fill-in prompts for newly created files were silently discarded; root cause: prompts were generated only in the missing-files loop (Phase 1) and suppressed in the success path; fix in `validate.ts`: capture `results.fixPrompts` as `prefixPrompts` before auto-fix runs, then merge with `reResults.fixPrompts` (deduped by issue label) into `allPrompts`; always show `allPrompts` after `--fix` regardless of whether re-validation passes (labelled "📋 Next step — fill in the newly created files:") or fails (labelled "📋 Next step — content guidance for your AI assistant:")
75. [CD-113] [CS-049] [TRUST-003] Add Spec-First review gate mandate — live `.specs/project/project.yaml`, generated `project.yaml` template in `templateEngine.ts`, live `.github/copilot-instructions.md`, and generated copilot instructions in `ideConfigGenerator.ts` now require AI to read relevant `.specs/` files, update affected specs first, present a **Spec Report**, and wait for explicit developer `yes, proceed` before touching code or non-spec files; tests updated (103 total)
76. [CD-114] [CS-045] Document per-command options in README and `docs/GUIDE.md` — added `### Per-Command Options` table to `README.md` listing all flags for all 7 commands with a `--help` pointer; fixed 6 Options sections in `docs/GUIDE.md`: removed phantom `--prompts, -p` from `init` and `refine`, corrected `--verbose` (no `-v` short form) in `validate` and `list`, added missing `--dir`/`--specs-name` to `init` and `refine`, added missing `--lang`/`--framework`/`--no-prompts` to `add-specs`, added missing **Options:** section to `migrate`
77. [CD-115] [CS-050] Add `specpilot backfill` (alias `bf`) command — new `src/utils/specBackfiller.ts` uses fingerprint-based detection to find missing mandates in `project.yaml` and `copilot-instructions.md`; text-based insertion (not yaml.dump) preserves comments and emoji; `src/commands/backfill.ts` prints per-file results via `logger.displayWithLogo()`; registered in `cli.ts` with `--dir`, `--specs-name`, `--dry-run`; welcome screen and `--help` aliases updated; `migrate` description corrected from “Migrate between spec versions” to “Convert legacy `.project-spec` folder” in `cli.ts`, `logger.ts`, `README.md`, and `docs/GUIDE.md`; `docs/GUIDE.md` backfill section added with when-to-use guidance; `README.md` commands table, aliases, and per-command options table updated
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
