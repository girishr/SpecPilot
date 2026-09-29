---
title: Requirements
project: SpecPilot SDD CLI
language: typescript
framework: node
lastUpdated: 2026-09-28
sourceOfTruth: project/project.yaml
fileID: REQ-001
version: 1.28
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
- `specpilot serve [--port <n>] [--open]` — serve a read-only local web UI over the current project's `.specs/` (see REQ-002.H) [REQ-002.A.10]

### Project Initialization [REQ-002.B]

- Prompt for project context: what it does, target users, expected scale, constraints (1 mandatory, 3 optional) [REQ-002.B.1]
- Prompt for a **mandatory** short handle (no default/fallback); prompt text explains the handle will appear in task IDs (e.g. `CD-jsmith-001`) and prompt IDs (e.g. `PROMPT-jsmith-001`) to prevent collisions when multiple devs share spec files; user may provide their GitHub, GitLab, or Bitbucket username or any short tag of their choice [REQ-002.B.2]
- Store GitHub username as `devPrefix` under a `team:` section in generated `project.yaml` to support project-scoped ID namespacing (e.g. `CD-{devPrefix}-001`) [REQ-002.B.7]
- Generate `.gitattributes` at project root with `merge=union` for append-heavy spec files (`.specs/development/prompts*.md`, `.specs/planning/tasks.md`, `CHANGELOG.md`) to prevent git merge conflicts on shared branches; if `.gitattributes` already exists, append only the missing lines [REQ-002.B.8]
- Prompt for IDE/Agent selection and generate appropriate config files [REQ-002.B.3]
- Prevent duplicate initialization with informative errors [REQ-002.B.4]
- Allow custom spec folder naming [REQ-002.B.5]
- Support `--no-prompts` flag to skip all interactive prompts [REQ-002.B.6]
- After the last onboarding question, pause for explicit developer confirmation (`Press Enter to continue...`) between the generated file tree and the next-steps text, and again (`Press Enter to see your onboarding prompt...`) between the next-steps text and the onboarding prompt dump, so each screen is readable before the next scrolls in; both pauses are skipped when `--no-prompts` is set [REQ-002.B.9]

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
- `specpilot-archive` slash command (all IDEs; `allowed-tools: Bash, Read, Edit`) — runs an embedded script that archives `.specs/planning/tasks.md`'s `## Completed` section past 25 lines and `.specs/development/prompts.md` past 100 lines into timestamped archive files, preserving IDs verbatim; includes the same git branch guard as `specpilot archive` (warns and requires confirmation off `main`/`master`); mirrors CLI `specpilot archive --dry-run --force` (REQ-002.A.8); the embedded `archive_tasks()` must handle both list- and table-shaped `## Completed` sections and bound the section at the next `## ` heading exactly as the CLI does (REQ-002.F.7) [REQ-002.E.13]
- `specpilot-backfill` slash command (all IDEs; `allowed-tools: Bash, Read, Edit`) — runs an embedded script checking 4 mandate fingerprints (Critical Mandates, Code Philosophy, Code Rules, Re-Anchor) across 5 candidate IDE files and appends whichever are missing, append-only; also flags a missing `team.devPrefix` in `project.yaml`; the embedded baseline is a literal copy with no shared import from `ideConfigGenerator.ts`, so it must be manually kept in sync when those generator functions change [REQ-002.E.14]
- CLI-side `specpilot backfill` must also detect and generate missing `.claude/commands/specpilot-*.md`, `.cursor/commands/specpilot-*.md`, `.windsurf/workflows/specpilot-*.md`, `.agent/workflows/specpilot-*.md`, and `.github/prompts/specpilot-*.prompt.md` files for whichever IDEs are already in use (signaled by the same files `backfillIdeFiles` checks), generated from the same shared `SLASH_COMMANDS` definitions used by `slashCommandGenerator.ts` so CLI-side backfill and web-app-side generation never drift apart; never overwrites an existing command file [REQ-002.A.9]

### Generated Spec Quality [REQ-002.F]

- All generated spec files must include YAML front-matter with `fileID`, `lastUpdated`, `version`, `contributors`, `relatedFiles` [REQ-002.F.1]
- Generated `project.yaml` rules must use tiered structure: 🔴 critical / 🟡 process / 🟢 preferences [REQ-002.F.2]
- Generated `prompts.md` must include a Re-Anchor Prompt section for AI context recovery mid-session [REQ-002.F.3]
- Dual onboarding prompts: new projects get planning-focused prompt with baked-in project context; existing projects get codebase-analysis prompt [REQ-002.F.4]
- Generated `project.yaml` and `.github/copilot-instructions.md` must include a Spec-First review gate mandate requiring a Spec Report and explicit developer `yes, proceed` before any code or non-spec file changes [REQ-002.F.5]
- Generated `tasks.md` must show `CD-{devPrefix}-###` ID pattern with `## Multi-Dev Notes` callout; generated `prompts.md` must reference `PROMPT-{devPrefix}-###` [REQ-002.F.6]
- `specpilot archive`, generated archive guidance, and `specpilot validate` line-limit warnings must use lower active-file thresholds to reduce clutter in day-to-day work: archive `planning/tasks.md` when the `## Completed` section exceeds 25 lines and archive `development/prompts.md` when the file exceeds 100 lines. The `## Completed` section may be a numbered list (the generated template) or a markdown table (hand-converted, as in this repo): for a table, the archivable entries are the body rows — header and separator rows stay in the active file and are repeated above the moved rows in the archive block so it still renders as a table — and rows move by position, byte for byte, oldest first. `specpilot validate` must warn about the Completed section only when `specpilot archive` would move something, and archive must leave the section in a state validate accepts, so validate never tells the user to run an archive that does nothing (BL-057) [REQ-002.F.7]
- Every generated `.specs/` markdown file must include a `description:` field in its YAML front-matter stating the file's purpose in one line, so a new developer can immediately understand the role of each file when browsing the specs folder; `api.yaml` (YAML config, no front-matter) gets a `# Purpose:` comment instead [REQ-002.F.8]
- `specpilot add-specs` must prompt for IDE/Agent preference using the same 6-choice list as `specpilot init` (vscode, Cursor, Windsurf, Antigravity, Claude Code, Codex); selected IDE must be passed to `SpecGenerator.generateSpecs()` so the correct AI context file is generated for the existing project; must respect `--no-prompts` flag by defaulting to `vscode` [REQ-002.F.9]
- All generated AI instruction files must include `## Code Philosophy — Write Only What Needed` (7 items) and `## Code Rules` (7 rules) in caveman style; injected into every IDE/agent output: `CLAUDE.md`, `copilot-instructions.md`, Cursor rules, Windsurf rules, Antigravity rules, `SKILL.md`, `CODEX_INSTRUCTIONS.md`; `specpilot backfill` must detect missing sections and append them to existing IDE files [REQ-002.F.10]

### Plugin Distribution [REQ-002.G]

- SpecPilot must be available as a Claude Code plugin that lives in a `plugin/` subdirectory **inside this repo** (not a separate repo), with a `plugin/.claude-plugin/plugin.json` manifest; the CLI remains at the repo root as the source of truth and the only option for non-Claude-Code IDEs [REQ-002.G.1]
- The plugin must be **self-contained with no runtime dependency on the `specpilot` CLI**: `init`/`add-specs`/`migrate` commands instruct Claude to scaffold the fixed `.specs/` tree and IDE config files via plain Bash file operations (each surfacing as a normal permission prompt), then populate content in-session — replacing the CLI's paste-the-onboarding-prompt second step [REQ-002.G.2]
- The plugin bundles: (a) `init`, `add-specs`, `migrate` scaffolding commands; (b) the eight existing self-contained workflow commands (`status`, `reanchor`, `report`, `sync`, `refine`, `validate`, `archive`, `backfill` — already CLI-independent per REQ-002.E.7–E.14); (c) the `specpilot-project` skill [REQ-002.G.3]
- The plugin must be a **lowest-privilege** bundle: **no hooks, no MCP servers, no `bin/` executables, no monitors** — only skills/commands and templates, so its blast radius is limited to permission-gated file writes Claude proposes [REQ-002.G.4]
- The plugin's committed files must be **generated from `src/utils` by a build step** (single source of truth, zero drift — the same pattern `slashCommandGenerator.ts` uses); the generated bundle is checked into `plugin/` and is never hand-edited [REQ-002.G.5]
- The plugin must pass `claude plugin validate` locally before submission, and be distributed via the community marketplace using a `git-subdir` source (`url: github.com/girishr/SpecPilot, path: plugin`), which pins the plugin to a specific commit SHA [REQ-002.G.6]

### Local Spec Server — `specpilot serve` [REQ-002.H]

- `specpilot serve` serves the project in the current directory, which must contain `.specs/`; otherwise it exits 1 with a clear message. It binds `127.0.0.1` only, prints the URL, defaults to port 4321, accepts `--port <n>` and `--poll <ms>` (change-detection interval, default 1000, minimum 250), and fails with a message suggesting `--port` when the port is in use. `--open` opens the URL in the default browser via `child_process` (no new dependency) [REQ-002.H.1]
- Read-only: no route writes to disk, and the UI has no drag, keyboard-move or edit controls. Every request re-reads the files; open pages update themselves when an allowlisted file changes on disk (REQ-002.H.8), and a manual refresh still works [REQ-002.H.2]
- Routes: `GET /` (the UI page), `GET /assets/<file>` (the UI's own stylesheet, scripts and favicon — required because the CSP forbids inline code), `GET /api/specs` (project metadata, `readSpecs()` output and the nav tree), `GET /api/file?p=<path>` (one allowlisted file, raw text), `GET /api/events` (server-sent change events, REQ-002.H.8). Any other method → 405; any other path → 404 [REQ-002.H.3]
- Security: requests whose `Host` header is not exactly `127.0.0.1:<port>` or `localhost:<port>` are rejected with 403 (DNS rebinding); `/api/file` serves only `.specs/**`, `CLAUDE.md`, `AGENTS.md`, `.claude/commands/**`, `.claude/skills/**`, `.github/copilot-instructions.md` and `.github/prompts/**`, rejects `..` segments, absolute paths, NUL bytes, hidden or `node_modules` segments below an allowlisted folder and paths through a symlinked folder, and requires the file's `realpath` to be inside the project root **and** still inside the allowlist; every response carries `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, and no CORS headers [REQ-002.H.4]
- Content rule: every title, heading, task row, ID and text the UI shows is the file's own text, verbatim. The UI may group and order; it may not reword, summarise, invent statuses, add badges or derive labels. Task rows come from `readSpecs()`; anything that cannot be parsed is shown as raw text [REQ-002.H.5]
- Navigation (from the approved mockup): Plan — Tasks, Roadmap, Requirements; Specs — Explorer, Architecture, Tests, Security; Automation — Instructions, Commands, Skills. Hash routing, keyboard navigation, light/dark theme and the mockup's markdown renderer are kept; the project rail shows only the current project. The client fetches `/api/specs` and `/api/file`; the page embeds no data [REQ-002.H.6]
- Zero new runtime dependencies: the server uses `node:http`, `node:fs` and the existing `js-yaml`. The UI's HTML, CSS and JS ship inside the npm package [REQ-002.H.7]
- Live reload (BL-052): change detection polls with `stat()` — never `fs.watch`, whose recursive mode is unreliable on Linux before Node 20 — every `--poll` ms, over the allowlisted files and folders only (skipping `node_modules` and dot-folders such as `.git`, and capped at 2000 files with a one-time notice when the cap is hit; the watched set is exactly the set `/api/file` serves, except files beyond the cap), comparing mtime, size and inode (inode is an extra signal; some file systems report 0), never reading content; a file that vanishes between `readdir` and `stat` (ENOENT) counts as deleted, and one that cannot be stat-ed (EACCES) is skipped with its last known state kept — neither may throw or stop the poller; it catches edits, new files, deletions and atomic saves (write temp, rename). A burst is coalesced: after a change is seen the poller re-checks every 150 ms until one check finds nothing new (capped at 2 s), then emits once. Changes go to open pages as server-sent events on `GET /api/events` (still read-only): same Host check as every route, at most 8 open streams (the 9th gets 503), a heartbeat comment every 25 s, each event carries only the changed allowlisted paths, never content. Polling and the heartbeat run only while at least one stream is open, and Ctrl+C ends every stream and clears every timer [REQ-002.H.8]
- On a change event the page re-fetches `/api/specs`, and `/api/file` for the open file if it changed, then redraws in place: same route, scroll position, open inspector and selected row, no full reload, and a redraw never moves focus. If the open file was deleted — or a file URL is loaded fresh after its file was deleted — the view shows its path and that it no longer exists, nothing else. The page adds no connection indicator, "updated" marker or sync state; if the server stops, it keeps showing the last content, and `EventSource` reconnects on its own and re-fetches once when it does [REQ-002.H.9]

### Non-Functional Requirements [REQ-003]

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

