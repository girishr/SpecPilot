---
title: Requirements
project: SpecPilot SDD CLI
language: typescript
framework: node
lastUpdated: 2026-07-05
sourceOfTruth: project/project.yaml
fileID: REQ-001
version: 1.24
contributors: [girishr]
relatedFiles:
  [architecture/architecture.md, architecture/api.yaml, planning/tasks.md]
---

# SpecPilot SDD CLI Requirements

## Functional Requirements [REQ-002]

### Core Commands [REQ-002.A]

- `specpilot init <name>` — initialize new project with `.specs/` structure [REQ-002.A.1]
- `specpilot add-specs` — add `.specs/` to an existing project with codebase analysis [REQ-002.A.2]
- `specpilot validate [--fix] [--verbose]` — validate spec files, cross-references, and front-matter; auto-fix common issues [REQ-002.A.3]
- `specpilot list [--verbose]` — list available built-in templates [REQ-002.A.4]
- `specpilot migrate` — legacy structure-conversion command for old `.project-spec` or deprecated layouts; not a general existing-project update mechanism [REQ-002.A.5]
- `specpilot refine <description>` — refine spec files with new requirements; show line-level diff and prompt for confirmation before writing [REQ-002.A.6]
- `specpilot backfill` — non-destructively backfills missing mandates, rules, IDE config, and `specpilot-*` slash command files into projects already running `.specs/`; reads `project.yaml` and existing IDE files, inserts only what's absent (append-only, no overwrites); prompts for `devPrefix` if absent; IDE files and slash-command targets both detected by filesystem presence without an IDE-selection prompt; SKILL.md reported stale if structural sections missing, not auto-patched; `--dry-run` supported [REQ-002.A.7]
- `specpilot archive [--dry-run] [--force]` — archive oversized `.specs/` files; before archiving, detect the current git branch and warn (with `[y/N]` confirmation) when not on `main` or `master`; `--force` bypasses the branch warning [REQ-002.A.8]

### Project Initialization [REQ-002.B]

- Prompt for project context: what it does, target users, expected scale, constraints (1 mandatory, 3 optional) [REQ-002.B.1]
- Prompt for a **mandatory** short handle (no default/fallback); prompt text explains the handle will appear in task IDs (e.g. `CD-jsmith-001`) and prompt IDs (e.g. `PROMPT-jsmith-001`) to prevent collisions when multiple devs share spec files; user may provide their GitHub, GitLab, or Bitbucket username or any short tag of their choice [REQ-002.B.2]
- Store GitHub username as `devPrefix` under a `team:` section in generated `project.yaml` to support project-scoped ID namespacing (e.g. `CD-{devPrefix}-001`) [REQ-002.B.7]
- Generate `.gitattributes` at project root with `merge=union` for append-heavy spec files (`.specs/development/prompts*.md`, `.specs/planning/tasks.md`, `CHANGELOG.md`) to prevent git merge conflicts on shared branches; if `.gitattributes` already exists, append only the missing lines [REQ-002.B.8]
- Prompt for IDE/Agent selection and generate appropriate config files [REQ-002.B.3]
- Prevent duplicate initialization with informative errors [REQ-002.B.4]
- Allow custom spec folder naming [REQ-002.B.5]
- Support `--no-prompts` flag to skip all interactive prompts [REQ-002.B.6]

### Language & Framework Support [REQ-002.C]

- Support TypeScript, JavaScript, Python, Kotlin, and Swift languages [REQ-002.C.1]
- Auto-detect language and framework from project files: `package.json` / `tsconfig.json` (TS/JS); `requirements.txt` / `pyproject.toml` / `setup.py` (Python); `build.gradle` / `build.gradle.kts` / `settings.gradle.kts` (Kotlin); `Package.swift` / `*.xcodeproj` / `*.xcworkspace` (Swift) [REQ-002.C.2]
- Framework-specific template content: TypeScript (React, Express, Next.js, NestJS, Vue, Angular); Python (FastAPI, Django, Flask, Streamlit); Kotlin (Android, Spring Boot, Ktor, Jetpack Compose); Swift (iOS/UIKit, SwiftUI, Vapor) [REQ-002.C.3]

### Codebase Analysis (add-specs) [REQ-002.D]

- Scan codebase for TODOs/FIXMEs with file name and line numbers [REQ-002.D.1]
- Detect test frameworks (Jest, Pytest, Mocha, etc.) and count test cases [REQ-002.D.2]
- Extract architecture information (components, directories) [REQ-002.D.3]
- Display folder structure as nested tree with proper indentation (max depth 3) [REQ-002.D.4]
- Support `--no-analysis` and `--deep-analysis` flags [REQ-002.D.5]

### IDE & Agent Configuration [REQ-002.E]

- Generate the IDE-native AI context file based on selected IDE: GitHub Copilot/Codex → `.github/copilot-instructions.md`; Cursor → `.cursor/rules/specpilot.mdc` (front-matter: `alwaysApply: true`); Windsurf → `.windsurfrules`; Antigravity → `.antigravity/rules.md`; Claude Code → `CLAUDE.md` (critical mandates + context pointers); `--no-prompts` defaults to `vscode`; existing `CLAUDE.md`: `[o]verwrite / [a]ppend / [s]kip` with prompts, auto-skip + warning without [REQ-002.E.1]
- Generate workspace settings for desktop IDEs: GitHub Copilot (`.vscode/`), Cursor (`.cursor/`), Windsurf (`.windsurf/`), Antigravity (`.antigravity/`) [REQ-002.E.2]
- Generate agent instruction files for cloud agents: Claude Code (`.claude/skills/specpilot-project/SKILL.md`), Codex (`CODEX_INSTRUCTIONS.md`) [REQ-002.E.3]
- IDE settings include: search inclusion for `.specs/`, markdown/YAML formatting, extensions recommendations [REQ-002.E.4]
- Existing projects must be able to receive new generated instruction/rule mandates via a non-destructive update path that merges or appends missing SpecPilot content instead of overwriting user customizations [REQ-002.E.5]
- Generate per-IDE slash/workflow command files from a single shared `{ name, description, body }` definition: Claude Code → `.claude/commands/`, Cursor → `.cursor/commands/`, Windsurf → `.windsurf/workflows/`, Antigravity → `.agent/workflows/`, GitHub Copilot → `.github/prompts/*.prompt.md`; Codex has no repo-level auto-discovery, so a reference copy is written to `.codex/prompts/` with a one-time manual-copy instruction printed to the user [REQ-002.E.6]
- `specpilot-status` slash command (all IDEs) — summarizes `.specs/planning/tasks.md` Current Sprint items and the next incomplete `.specs/planning/roadmap.md` milestone in one screen [REQ-002.E.7]
- `specpilot-reanchor` slash command (all IDEs) — reads `.specs/project/project.yaml` and the Re-Anchor Prompt section of `.specs/development/prompts.md` verbatim and restates them as current operating context [REQ-002.E.8]
- `specpilot-report` slash command (all IDEs) — formalizes the Spec-First review gate (mandate 8): classifies the pending change, reads the relevant `.specs/` files per the Context routing table, updates specs first, presents a Spec Report, and requires the user's literal `yes, proceed` before any code is written [REQ-002.E.9]
- `specpilot-sync` slash command (all IDEs) — compares `architecture/architecture.md`, `project/requirements.md`, and `quality/tests.md` against actual `src/` structure and `package.json`, lists discrepancies, and proposes per-file edits pending confirmation [REQ-002.E.10]
- `specpilot-refine <description>` slash command (all IDEs, argument-taking) — takes a requirement description, reads `requirements.md`/`context.md`/`prompts.md`, proposes additions with a line-level diff preview, and writes only after confirmation; mirrors CLI `specpilot refine` (REQ-002.A.6) with no CLI dependency [REQ-002.E.11]
- `specpilot-validate` slash command (all IDEs; `allowed-tools: Bash, Read`) — runs an embedded script checking required `.specs/` files exist, front-matter fields are present, and `relatedFiles` cross-references resolve; summarizes findings and suggests fixes without auto-applying; mirrors CLI `specpilot validate --fix --verbose` (REQ-002.A.3); on GitHub Copilot outside agent mode, degrades to prose-only (known platform limitation) [REQ-002.E.12]
- `specpilot-archive` slash command (all IDEs; `allowed-tools: Bash, Read, Edit`) — runs an embedded script that archives `.specs/planning/tasks.md`'s `## Completed` section past 25 lines and `.specs/development/prompts.md` past 100 lines into timestamped archive files, preserving IDs verbatim; includes the same git branch guard as `specpilot archive` (warns and requires confirmation off `main`/`master`); mirrors CLI `specpilot archive --dry-run --force` (REQ-002.A.8) [REQ-002.E.13]
- `specpilot-backfill` slash command (all IDEs; `allowed-tools: Bash, Read, Edit`) — runs an embedded script checking 4 mandate fingerprints (Critical Mandates, Code Philosophy, Code Rules, Re-Anchor) across 5 candidate IDE files and appends whichever are missing, append-only; also flags a missing `team.devPrefix` in `project.yaml`; the embedded baseline is a literal copy with no shared import from `ideConfigGenerator.ts`, so it must be manually kept in sync when those generator functions change [REQ-002.E.14]
- CLI-side `specpilot backfill` must also detect and generate missing `.claude/commands/specpilot-*.md`, `.cursor/commands/specpilot-*.md`, `.windsurf/workflows/specpilot-*.md`, `.agent/workflows/specpilot-*.md`, and `.github/prompts/specpilot-*.prompt.md` files for whichever IDEs are already in use (signaled by the same files `backfillIdeFiles` checks), generated from the same shared `SLASH_COMMANDS` definitions used by `slashCommandGenerator.ts` so CLI-side backfill and web-app-side generation never drift apart; never overwrites an existing command file [REQ-002.A.9]

### Generated Spec Quality [REQ-002.F]

- All generated spec files must include YAML front-matter with `fileID`, `lastUpdated`, `version`, `contributors`, `relatedFiles` [REQ-002.F.1]
- Generated `project.yaml` rules must use tiered structure: 🔴 critical / 🟡 process / 🟢 preferences [REQ-002.F.2]
- Generated `prompts.md` must include a Re-Anchor Prompt section for AI context recovery mid-session [REQ-002.F.3]
- Dual onboarding prompts: new projects get planning-focused prompt with baked-in project context; existing projects get codebase-analysis prompt [REQ-002.F.4]
- Generated `project.yaml` and `.github/copilot-instructions.md` must include a Spec-First review gate mandate requiring a Spec Report and explicit developer `yes, proceed` before any code or non-spec file changes [REQ-002.F.5]
- Generated `tasks.md` must show `CD-{devPrefix}-###` ID pattern with `## Multi-Dev Notes` callout; generated `prompts.md` must reference `PROMPT-{devPrefix}-###` [REQ-002.F.6]
- `specpilot archive`, generated archive guidance, and `specpilot validate` line-limit warnings must use lower active-file thresholds to reduce clutter in day-to-day work: archive `planning/tasks.md` when the `## Completed` section exceeds 25 lines and archive `development/prompts.md` when the file exceeds 100 lines [REQ-002.F.7]
- Every generated `.specs/` markdown file must include a `description:` field in its YAML front-matter stating the file's purpose in one line, so a new developer can immediately understand the role of each file when browsing the specs folder; `api.yaml` (YAML config, no front-matter) gets a `# Purpose:` comment instead [REQ-002.F.8]
- `specpilot add-specs` must prompt for IDE/Agent preference using the same 6-choice list as `specpilot init` (vscode, Cursor, Windsurf, Antigravity, Claude Code, Codex); selected IDE must be passed to `SpecGenerator.generateSpecs()` so the correct AI context file is generated for the existing project; must respect `--no-prompts` flag by defaulting to `vscode` [REQ-002.F.9]
- All generated AI instruction files must include `## Code Philosophy — Write Only What Needed` (7 items) and `## Code Rules` (7 rules) in caveman style; injected into every IDE/agent output: `CLAUDE.md`, `copilot-instructions.md`, Cursor rules, Windsurf rules, Antigravity rules, `SKILL.md`, `CODEX_INSTRUCTIONS.md`; `specpilot backfill` must detect missing sections and append them to existing IDE files [REQ-002.F.10]

### Plugin Distribution [REQ-002.G]

- SpecPilot must be available as a Claude Code plugin in a separate public GitHub repo (`girishr/specpilot-plugin`), distinct from the npm CLI package [REQ-002.G.1]
- The plugin must define skills covering the core SDD workflow: `spec-first` (enforce Spec-First review gate), `validate-specs` (run specpilot validate guidance), `refine-specs` (guide spec updates after code changes), `spec-init` (walk user through specpilot init interactively) [REQ-002.G.2]
- The plugin must be installable via `claude plugins install github:girishr/specpilot-plugin` [REQ-002.G.3]
- The plugin must pass `claude plugin validate` before being submitted to the community marketplace [REQ-002.G.4]
- Plugin skills must reference the npm CLI (`specpilot`) for all spec file operations rather than reimplementing logic [REQ-002.G.5]

- Fast initialization (< 5 seconds) [REQ-003.1]
- Minimal memory footprint [REQ-003.2]
- Offline operation capability [REQ-003.3]
- Project name validated against allowlist regex to prevent template injection [REQ-003.4]

## Assumptions [REQ-004]

- Node.js >= 16 is available on the developer's machine [REQ-004.1]
- npm >= 8 is available for global installation [REQ-004.2]
- Projects are organized with a single root directory containing source files [REQ-004.3]
- Developers have write access to the project directory [REQ-004.4]
- AI IDE/agent is optional — SpecPilot works without any AI tooling [REQ-004.5]
- Internet access is not required at runtime (all templates are built-in) [REQ-004.6]

