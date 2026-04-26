---
fileID: TASKS-001
lastUpdated: 2026-04-26
version: 5.2
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
12. [BL-020] Publish SpecPilot as a Claude Code / Cowork Plugin
    - Create standalone plugin package (separate repo from npm CLI)
    - Scaffold plugin structure: `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/`, `README.md`
    - Design and write skills: `spec-first` (enforce Spec-First review gate), `validate-specs`, `refine-specs`, `spec-init` (guide user through init flow)
    - Optional: `spec-driven-dev` agent with SDD system prompt and tool restrictions
    - Optional: hooks/hooks.json to warn before edits when `.specs/` is stale
    - Host plugin as public GitHub repo for distribution (`claude plugins install github:…`)
    - Submit to official Anthropic plugin directory via claude.ai/settings/plugins/submit
    - Dependency management rules
13. [BL-022] add a short description at the top of each generated specs file that shows what is the purpose of this file. This will help a new dev who is looking thru the specs files to understand what is function of each of this files. This can be along with the front-matter field section.
13. [BL-023] inspired by this linkedin post try to use the CLAUDE.md Stop stuffing everything into CLAUDE.md. Use it as a router. https://www.linkedin.com/posts/alokkumarsunny_stop-stuffing-everything-into-claudemd-activity-7435312701452632064-9vNa . Also we need to look at how to make use of skills.md _(design rationale — will close after BL-028 is implemented)_
14. ~~[BL-024] Add multi-dev git workflow guidance to generated `tasks.md` template~~ **Delivered by CD-118/CS-053** — `## Multi-Dev Notes` section and `CD-{devPrefix}-###` convention are already in the generated template.
16. [BL-025] Add Mermaid diagram placeholder to generated `architecture.md` — insert a single `graph TD` starter block in the `## System Architecture` section as a ready-to-fill scaffold; add a comment above it pointing to Mermaid docs; keep it generic (not framework-specific for v1); rendered natively in GitHub, GitLab, VS Code, and most AI IDEs with no extra tooling; change is in `getArchitectureTemplate()` in `templateEngine.ts`; future enhancement (not in this task): branch on `framework` to generate slightly more relevant stubs
17. [BL-027] Generate `.cursor/rules/project.mdc` for Cursor — Cursor's native AI rules file with YAML front-matter (`description: Project mandates and AI coding rules`, `globs:`, `alwaysApply: true`) + same mandates body as `copilot-instructions.md`; generated in `ideConfigGenerator.ts` when IDE = Cursor; this is what Cursor actually reads for AI context — `.github/copilot-instructions.md` is only partially supported
18. [BL-028] Generate `CLAUDE.md` router file for Claude Code / Cowork — project-root `CLAUDE.md` is Claude Code's primary instructions file (equivalent to `copilot-instructions.md` for Copilot); should act as a router pointing to `.specs/` and `.claude/skills/specpilot-project/SKILL.md`; contains critical mandates inline + pointers to spec files for full context; generated in `agentConfigGenerator.ts` when IDE = Cowork; complements the existing SKILL.md (which provides project context to Claude skills)
19. [BL-029] Add IDE prompt to `specpilot add-specs` — currently `add-specs` hardcodes `vscode` as the IDE default, so existing projects never get Cursor/Cowork/Windsurf/Kiro/Codex files; add the same 7-choice IDE prompt from `init.ts` to `add-specs.ts`; pass selected IDE through to `specGenerator.generateSpecs()`; respect `--no-prompts` flag (default to `vscode` when skipped)
20. [BL-030] Expand `specpilot backfill` scope to include IDE-specific files — after BL-027/BL-028 are implemented, add `.cursor/rules/project.mdc`, `CLAUDE.md`, and `.claude/skills/specpilot-project/SKILL.md` to backfill's fingerprint detection so version upgrades propagate mandate changes to these files too; detect which IDE files exist in the project to determine which to backfill (don't require IDE selection)
21. [BL-031] Generate `.windsurfrules` for Windsurf — plain markdown file at project root with same mandates body as `copilot-instructions.md`; generated in `ideConfigGenerator.ts` when IDE = Windsurf; this is Windsurf's native AI context file
22. [BL-032] Generate `.kiro/steering/project.md` for Kiro — plain markdown file with same mandates body as `copilot-instructions.md`; generated in `ideConfigGenerator.ts` when IDE = Kiro; this is Kiro's native steering file

## Current Sprint

### Generated Output Improvements

### Multi-Dev Alignment


## Completed

> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).
> **Line limit**: The Completed section has a 25-line limit. When exceeded, run `specpilot archive` to move older entries to `tasks-archive.md`.

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
78. [CD-117] [CS-052] Generate `.gitattributes` with `merge=union` — new `IdeConfigGenerator.generateGitAttributes()` writes `.gitattributes` at project root with `merge=union` for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; if file exists, only missing lines are appended (existing content preserved); called unconditionally from `SpecGenerator.generateSpecs()` for both `init` and `add-specs`
77. [CD-116] [CS-051] Change "Enter your name" prompt to GitHub username — `init.ts` and `add-specs.ts` now prompt `'Enter your GitHub username…'`; default attempts `git config user.name`, falling back to `'your-username'`; value populates `TemplateContext.author` (contributors front-matter) and is written as `team.devPrefix` in generated `project.yaml` (e.g. `devPrefix: "girishr"`); `templateEngine.ts` `team:` section updated to include `devPrefix: "{{author}}"`
77. [CD-115] [CS-050] Add `specpilot backfill` (alias `bf`) command — new `src/utils/specBackfiller.ts` uses fingerprint-based detection to find missing mandates in `project.yaml` and `copilot-instructions.md`; text-based insertion (not yaml.dump) preserves comments and emoji; `src/commands/backfill.ts` prints per-file results via `logger.displayWithLogo()`; registered in `cli.ts` with `--dir`, `--specs-name`, `--dry-run`; welcome screen and `--help` ali ases updated; `migrate` description corrected from “Migrate between spec versions” to “Convert legacy `.project-spec` folder” in `cli.ts`, `logger.ts`, `README.md`, and `docs/GUIDE.md`; `docs/GUIDE.md` backfill section added with when-to-use guidance; `README.md` commands table, aliases, and per-command options table updated
79. [CD-118] [CS-053] Make short handle prompt mandatory; add `devPrefix` to generated ID conventions — `init.ts` and `add-specs.ts`: replaced `git config user.name` fallback with `os.userInfo().username` shown as suggestion; prompt explains ID prefixing with examples (`CD-jsmith-001`, `PROMPT-jsmith-001`); accepts GitHub/GitLab/Bitbucket username or any short tag; prompt loops until non-empty when prompts enabled; `--no-prompts` falls back to OS login name; generated `tasks.md` template updated with `CD-{devPrefix}-###` and `PROMPT-{devPrefix}-###` in ID conventions and new `## Multi-Dev Notes` section; generated `prompts.md` conventions updated to show prefixed ID examples
80. [CD-119] [CS-056] Lower archive thresholds — `PROMPTS_LINE_LIMIT` 300→100, `PROMPTS_KEEP_LINES` 250→80, `COMPLETED_LINE_LIMIT` 150→25, `COMPLETED_KEEP_ENTRIES` 100→20 in `specArchiver.ts`; `specValidator.ts` static constants updated (100/25); `specFileGenerator.ts` Archive Policy text updated to 100 lines; `cli.ts` archive description updated; `docs/GUIDE.md` threshold references updated; `specArchiver.test.ts` and `specValidator.test.ts` test data and assertions updated; 38 tests passing
81. [CD-120] [CS-054] Add branch warning to `specpilot archive` — `archiveCommand()` in `src/commands/archive.ts` calls `git rev-parse --abbrev-ref HEAD` via `execSync`; if branch is not `main` or `master`, prints yellow `⚠ You're on branch '{name}'` warning and prompts `Continue? [y/N]`; declining aborts without writing; `--force` flag skips the prompt; git failure silently ignored; `--force` option added to `archive` command in `cli.ts`; REQ-002.A.8 and ARCH-004.19 added to spec files
82. [CD-121] [CS-055] Backfill `tasks.md` devPrefix ID conventions — `specBackfiller.ts`: new `readDevPrefix()` reads `team.devPrefix` from `project.yaml`; new `backfillTasksMd()` checks for `CD-{devPrefix}-###` convention line and `## Multi-Dev Notes` section, inserts both if absent; `BackfillResult` extended with `tasksMd: BackfillFileResult`; `backfill.ts` display updated to show third file result and correct item counts; skipped-with-reason shows warning instead of success
83. [CD-122] [CS-057] Backfill `team.devPrefix` prompt — `specBackfiller.ts`: new `ensureDevPrefix()` checks if `team.devPrefix` absent and prompts before patching `tasks.md`; `readContributorsFirst()` reads first entry from `contributors:` list (inline or block) falling back to `os.userInfo().username`; `promptHandle()` loops until non-empty answer; `writeDevPrefix()` inserts `team:\n  devPrefix:` after `license:` line (or inside existing `team:` block) using text-based insertion; `--no-prompts` / `dryRun` accept suggestion silently; `BackfillOptions.noPrompts` added; `--no-prompts` flag added to `backfill` CLI command in `cli.ts`
