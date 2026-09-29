---
fileID: ARCH-001
lastUpdated: 2026-09-29
version: 2.18
contributors: [girishr]
relatedFiles:
  [
    project.yaml,
    requirements.md,
    api.yaml,
    tasks.md,
    security/threat-model.md,
    security/security-decisions.md,
  ]
---

# System Architecture

## Overview [ARCH-002]

The SpecPilot SDD CLI is a Node.js/TypeScript CLI tool that generates specification-driven development structures for both new and existing projects. It follows a template-based approach with intelligent codebase analysis to create consistent, customizable `.specs/` directories.

## Core Components [ARCH-003]

- **CLI Parser**: Command-line argument processing with Commander.js [ARCH-003.1]
- **Template Engine**: Handlebars helpers and `renderFromString()` utility [ARCH-003.2]
- **Spec Generator**: Thin coordinator that delegates to SpecFileGenerator, IdeConfigGenerator, and AgentConfigGenerator [ARCH-003.3]
- **Spec File Generator**: Generates `.specs/` markdown and YAML files (prompts.md, README, project.yaml, etc.) [ARCH-003.3.1]
- **IDE Config Generator**: Generates workspace settings and IDE-native AI context file based on selected IDE; GitHub Copilot/Codex → `.github/copilot-instructions.md`; Cursor → `.cursor/rules/specpilot.mdc`; Windsurf → `.windsurfrules`; Antigravity → `.antigravity/rules.md`; Claude Code → `CLAUDE.md` (lean router: mandates inline + pointers to `.specs/` + reference to SKILL.md) via `generateAiContextFile()` → `generateClaudeMd()` [ARCH-003.3.2]
- **Agent Config Generator**: Generates Claude Code Skills (`.claude/skills/specpilot-project/SKILL.md`) and Codex Instructions (`CODEX_INSTRUCTIONS.md`); CLAUDE.md itself is in IdeConfigGenerator [ARCH-003.3.3]
- **Slash Command Generator**: `src/utils/slashCommandGenerator.ts` — parallel to IdeConfigGenerator; commands defined once as `{ name, description, body }` in exported `SLASH_COMMANDS` (starts empty, populated incrementally by BL-039 through BL-046), rendered per IDE via `SlashCommandGenerator.generate()`; called from `SpecGenerator.generateSpecs()` right after the AI context file is generated [ARCH-003.3.4]
- **Validator**: Spec file validation with cross-reference checking [ARCH-003.4]
- **Archiver**: Archives oversized `.specs/` files (`prompts.md` > 100 lines → `prompts-archive.md`; `tasks.md` Completed > 25 lines → `tasks-archive.md`); supports `--dry-run`; the tasks.md decision lives in one exported pure function, `planCompletedArchive(lines)`, which `specValidator.ts` `validateLineLimits()` also calls (ARCH-004.32); the prompts.md decision likewise lives in `planPromptsArchive(lines)`, shared with the validator (ARCH-004.37) [ARCH-003.9]
- **Migrator**: Version migration and structure updates [ARCH-003.5]
- **Project Detector**: Auto-detects language/framework from existing files [ARCH-003.6]
- **Code Analyzer**: Scans codebase for TODOs, tests, and architecture with nested folder tree display [ARCH-003.7]
- **Frameworks Utility**: Shared `getFrameworksForLanguage()` function [ARCH-003.8]
- **Spec Tree Printer**: `src/utils/specTreePrinter.ts` — hardcoded `.specs/` file list with one-line descriptions; called by `Logger.displayInitTree()` (split from `displayInitSuccess()` into `displayInitTree()` + `displayInitNextSteps()` in CD-girishr-035) [ARCH-003.10]
- **Spec Backfiller**: `src/utils/specBackfiller.ts` — non-destructively backfills missing mandates into `project.yaml`, `copilot-instructions.md`, `planning/tasks.md`, existing IDE files, and missing `specpilot-*` slash command files; fingerprint-based and file-existence-based detection, append-only writes; prompts for missing `devPrefix`; SKILL.md stale-detected only, not auto-patched; `--dry-run` supported [ARCH-003.11]
- **Markdown Sections**: `src/utils/markdownSections.ts` — `findSectionBounds(lines, heading, prefix = false)` returns `{ start, end }` for a `## ` section (`start` = index of the first line whose trimmed text equals `heading`, or starts with it when `prefix` is true — `archivePrompts()` needs prefix matching because real headings carry an ID suffix, e.g. `## Latest Entries [PROMPT-002]`; `end` = index of the next line whose trimmed text starts with `## `, or `lines.length`), or `null` when the heading is absent; the single TypeScript source of the "section ends at the next `## ` heading, not EOF" rule, used by `specArchiver.ts` (`archiveTasks()`, `archivePrompts()`) and `specValidator.ts` (`validateLineLimits()`); the bash copy embedded in the `specpilot-archive` slash command (`slashCommandGenerator.ts`) stays separate because it runs in the user's shell and cannot import TypeScript [ARCH-003.12]
- **Spec Reader**: `src/utils/specReader.ts` — pure, fs-free parser (no `fs`/`path` imports): input is a map of `.specs/`-relative path → file contents; output is per-file metadata (`fileID`, `version`, `lastUpdated`, `contributors`, `relatedFiles` from markdown front matter, or from leading `# key: value` comments for `.yaml` files) plus, for `planning/tasks.md`, the table rows of `## Backlog`, `## Current Sprint` (ID | Description) and `## Completed` (# | ID | Description) with cell text verbatim (outer whitespace only trimmed); section bounds via `findSectionBounds()`; no CLI caller yet (groundwork for `specpilot serve`, BL-050) and written to move into `@specpilot/spec-core` (BL-032) unchanged [ARCH-003.13]
- **Spec Server**: `src/utils/specServer.ts` — read-only `node:http` server behind `specpilot serve` (`src/commands/serve.ts`); exports the Host check (`isAllowedHost()`), the `/api/specs` payload builder (`buildSpecsPayload()`, which walks `.specs/` and calls `readSpecs()`) and `startSpecServer(root, port)`; reads files on every request, caches nothing, writes nothing; `GET /api/events` holds the server-sent-event streams, starts the poller with the first stream and stops it with the last; `startSpecServer()` returns a handle whose `close()` ends every stream and clears every timer before closing the listener [ARCH-003.14]
- **Serve UI**: `ui/index.html`, `ui/app.css`, `ui/md.js`, `ui/route.js` (DOM-free hash routing and the "no longer exists" markup, `require`d by Jest), `ui/app.js` and `ui/favicon.svg` (the SpecPilot logo) at the package root (shipped via `package.json` `files`), ported from the approved mockup `specpilot-local.html`; no inline script or style (CSP `default-src 'self'`), no embedded data — it fetches `/api/specs` and `/api/file` and listens on `/api/events` with `EventSource`, redrawing in place on a change; renders spec files with the mockup's markdown renderer (`ui/md.js`, also `require`d by Jest); the server resolves `ui/` from its own install location (`__dirname`), never from cwd [ARCH-003.15]
- **Spec Paths**: `src/utils/specPaths.ts` — the allowlist, the path guard `resolveAllowedPath()` and `listAllowedFiles(root)` (every file a request may read: skips `node_modules` and dot-folders, stops at 2000 files, and reports folders it cannot list as unreadable rather than empty), moved out of `specServer.ts` so the server and the poller share one definition without an import cycle; the guard applies the scanner's own walk rules (no hidden or `node_modules` segment below an allowlisted folder, no symlinked folder on the way), so the files the poller watches are exactly the files `/api/file` serves (a test compares both sets over an edge-case tree) [ARCH-003.16]
- **Spec Poller**: `src/utils/specPoller.ts` — `createPoller(root, { intervalMs, settleMs, maxSettleMs, onChange })`; every tick it lists `listAllowedFiles(root)` and `stat()`s each file (mtime, size, inode), diffs against the previous snapshot, and after a change re-checks every `settleMs` until quiet (or `maxSettleMs`) before calling `onChange(paths)` once; `start()` / `stop()`; reads no file content; ENOENT on `stat` counts as a delete, EACCES keeps the last known entry, and the files of an unreadable folder keep theirs; everything runs on one chained `setTimeout`, so `stop()` clears exactly one timer [ARCH-003.17]
- **Task Mover**: `src/utils/taskMover.ts` — the single writer (BL-053): `planMove(content, {id, toSection, toIndex})` finds rows with `taskRowLines()` — the same table walk as `readSpecs()`, whose output is unchanged, reporting line indices and the separator row — and section bounds with `findSectionBounds()`, and returns the new content (the original lines with one line removed and the identical line inserted) or a refusal; `moveTask(root, move, ifMatch)` holds a per-process lock, re-reads and hashes `tasks.md`, applies `planMove`, runs the validator's `tasks.md` checks in memory before and after (`tasksChecks()`, the same helpers `specpilot validate` now calls, output unchanged), then writes a temp file in `.specs/planning/`, `fsync`s it, `chmod`s it to the original mode and `rename`s it over `tasks.md` [ARCH-003.18]

## Design Decisions [ARCH-004]

- **Template Storage**: Built-in inline templates (no external template files) [ARCH-004.1]
- **Structure Flexibility**: Customizable spec folder names [ARCH-004.2]
- **Language Support**: TypeScript, JavaScript, Python, Kotlin, and Swift with framework detection [ARCH-004.3]
- **Developer Control**: Guidelines, not prescriptions [ARCH-004.4]
- **Existing Projects**: add-specs command with intelligent analysis [ARCH-004.5]
- **Folder Structure Display**: Nested tree visualization instead of flat lists [ARCH-004.5.1]
- **Metadata First**: YAML front-matter for all spec files [ARCH-004.6]
- **Git Mandates**: Explicit prompts required for all git operations [ARCH-004.7]
- **Module Split**: specGenerator.ts split into 3 focused modules (FIX-011) [ARCH-004.8]
- **Dual Onboarding**: Separate prompts for new projects (planning-first) and existing projects (codebase-analysis) [ARCH-004.9]
- **Diff Preview**: refine command shows changes and asks for confirmation before writing [ARCH-004.10]
- **Universal Copilot Instructions**: replaced by per-IDE routing (ARCH-004.11 revised) — each IDE gets its native AI context file: GitHub Copilot/Codex → `.github/copilot-instructions.md`; Cursor → `.cursor/rules/specpilot.mdc` (YAML front-matter with `alwaysApply: true`); Windsurf → `.windsurfrules`; Antigravity → `.antigravity/rules.md`; `copilot-instructions.md` is **not** generated for Cursor/Windsurf/Antigravity since those IDEs partially or incorrectly parse it [ARCH-004.11]
- **Tiered Rules**: Generated `project.yaml` uses 🔴 critical / 🟡 process / 🟢 preferences tiers to give AI tools clear priority signals [ARCH-004.12]
- **Security Documentation**: `.specs/security/` subfolder with `threat-model.md` (path traversal, template injection, supply chain) and `security-decisions.md` (ADR-style security decision log) [ARCH-004.13]
- **Spec File Archiving**: `specpilot archive` command trims growing `.specs/` files back within tighter active-file limits to keep the working copies easy to scan; archived blocks receive a timestamped header and are appended to the corresponding `-archive.md` file; `--dry-run` flag previews without writing [ARCH-004.14]
- **Post-Init Tree Display**: After `specpilot init` and `specpilot add-specs` success, `Logger.displayInitTree()` (split from `displayInitSuccess()` into `displayInitTree()` + `displayInitNextSteps()` in CD-girishr-035) renders a tree of generated `.specs/` files via the shared `SpecTreePrinter` helper, with hardcoded one-line descriptions [ARCH-004.15]
- **Security Subfolder Generation**: `specpilot init` now generates `security/threat-model.md` and `security/security-decisions.md` starter templates in every new project; both files use YAML front-matter and labelled placeholder sections; `specTreePrinter.ts` includes both in the post-init tree [ARCH-004.16]
- **Spec-First Review Gate**: generated `project.yaml` and `.github/copilot-instructions.md` both include a critical mandate that blocks code or non-spec edits until the AI has read relevant `.specs/` files, updated the affected specs first, produced a Spec Report, and received an explicit developer `yes, proceed` [ARCH-004.17]
- **Non-Destructive Backfills**: `specpilot backfill` detects missing mandates vs current SpecPilot version and inserts only what's absent; append-only writes preserve user-authored content; `--dry-run` available [ARCH-004.18]
- **Archive Branch Guard**: before `specpilot archive` runs, `archiveCommand()` calls `git rev-parse --abbrev-ref HEAD`; if the branch is not `main` or `master`, a yellow warning is printed and the user is prompted `[y/N]`; declining aborts without writing files; `--force` flag skips the prompt; branch detection failure (e.g. not a git repo) is silently ignored [ARCH-004.19]
- **CLAUDE.md as Router**: when IDE = Claude Code, `generateAiContextFile()` routes to `generateClaudeMd()` which writes a project-root `CLAUDE.md`; file is intentionally lean — critical mandates inline plus ordered list of context pointers (`.specs/project/project.yaml`, `requirements.md`, `architecture.md`, `tasks.md`, `.claude/skills/specpilot-project/SKILL.md`); design follows the "router not a dumping ground" principle (BL-023); existing-file handling mirrors `generateCopilotInstructions()`: `[o]verwrite / [a]ppend / [s]kip` with prompts, auto-skip + yellow warning with `--no-prompts`; closes BL-023 and BL-028 [ARCH-004.23]
- **IDE File Backfill via Filesystem Detection**: `specpilot backfill` detects existing IDE files without an IDE-selection prompt and appends missing mandate blocks; SKILL.md stale-detected only, not auto-patched; absent files silently skipped [ARCH-004.24]
- **Migrate Is Legacy-Only**: `specpilot migrate` remains for rare old-structure conversions and should be documented as such; same-structure backfills belong to `specpilot backfill`, not `migrate` [ARCH-004.31]
- **One Completed-Archive Plan for Validator and Archiver**: `planCompletedArchive(lines)` in `specArchiver.ts` returns the line range to move out of `tasks.md` `## Completed` (plus, for a table, the header + separator lines to repeat in the archive block), or `null`; `archiveTasks()` executes it and `validateLineLimits()` warns if and only if it is non-null, so "validate warns" and "archive acts" cannot disagree (the CD-girishr-033 bug class). Section bounds come from `findSectionBounds()`. Trigger for both shapes is unchanged: section lines (`end - start`) > 25. **List** shape (first `/^\d+\./` line): byte-identical to before — keep the last 20 entry lines. **Table** shape (a `|` row followed by a separator row, used only when no numbered line exists): entries are the body rows; keep `min(20, max(0, 25 - overhead))` rows, where overhead = section lines that are not body rows, so the section ends at ≤ 25 lines; move the oldest (top) rows by position. The bash `archive_tasks()` in the `specpilot-archive` slash command mirrors this line for line, including the TS section-size arithmetic [ARCH-004.32]
- **Read-Only Local Server (BL-051)**: `specpilot serve` listens on `127.0.0.1` only and never on `0.0.0.0`; a `Host` allowlist (`127.0.0.1:<port>`, `localhost:<port>`) blocks DNS rebinding; `/api/file` is a fixed path allowlist with a `realpath` re-check so a symlink cannot escape the root or the allowlist; the one write route (BL-053) is protected as ARCH-004.36 describes. Zero new dependencies: `node:http` + `node:fs` + existing `js-yaml` (project name from `project.yaml`). The server re-reads disk per request instead of caching; live reload (ARCH-004.35) tells open pages when to re-fetch [ARCH-004.33]
- **UI Shows File Text Only**: the Serve UI keeps the mockup's layout, nav, routing, keyboard nav, theme and markdown renderer, but drops every mockup element that was not file content or that implies a write: the first-run screen, open/clone sheet and guided setup (BL-054/BL-055), the "needs you" badges, "in sync" / "out of date" pills, the "From SpecPilot / Yours" split (no file records which files SpecPilot generated), the hand-written "What Goes In Them" mandate list, drag and `Alt`+arrow moves, New Task, Regenerate and Open-in-Editor. Board rows show the whole description (CSS line clamp, not a cut at the first clause). Four renderer fixes against the mockup, each because it changed file text on screen: `[ID]` references keep their brackets; numbered list items show the number written in the file (`<li value>`), not a renumbering; table rows split on the first N−1 pipes like `readSpecs()`; content group headers are not CSS-uppercased. Front matter is shown as its raw block, so no key is dropped. External fonts are not loaded (CSP and ARCH-007.3); the DESIGN.md font stacks fall back to system fonts [ARCH-004.34]
- **Live Reload by Polling + Server-Sent Events (BL-052)**: `stat()` polling instead of `fs.watch` (recursive watch is unreliable on Linux before Node 20, and a poll over a bounded allowlisted set costs a few dozen `stat` calls a second); inode is compared alongside mtime and size so an atomic save (temp file renamed over the original) is caught even when the size and the mtime second match; one change → a 150 ms settle loop → one event. Server-sent events rather than WebSockets: one-way, plain `GET`, no dependency, and `EventSource` reconnects by itself. Streams are capped at 8 (503 beyond) and the poller and 25 s heartbeat only run while a stream is open. Events carry paths, never content, so the stream exposes nothing `/api/specs` does not. The UI adds no connection or sync indicator (content rule) [ARCH-004.35]
- **Task Moves Are Line Moves (BL-053)**: a move is one line cut and the identical line pasted, never a re-render of the table, so the diff is always exactly one line; Backlog and Current Sprint share the `ID | Description` shape and the file's own Notes keep the BL ID on a move, so no cell changes. Optimistic concurrency by `If-Match` on the file's sha256 (409 with fresh data, never a merge) plus an in-process lock; atomic replace by temp file + `fsync` + `rename`. CSRF defence is layered because the listener is reachable from any page the user visits: a per-start 32-byte token in a meta tag (not readable cross-origin), an exact `Origin` check, `application/json` only (no form posts), 16 KB bodies, and the Host check. `--read-only` removes the route, the handles and the token. The page ignores the poller's echo of its own write by comparing `tasks.sha256` [ARCH-004.36]
- **Prompts Archive Keeps the Newest, by Date (BL-061)**: `planPromptsArchive(lines)` returns the contiguous block of oldest entries to move, a refusal with a reason, or null. Order comes from the entries' own dates, not from headings or ID numbers: this repo's log runs newest first while the generated template's `## Prompt History` table is appended oldest first, and every earlier version assumed oldest-first (and, without `## Latest Entries`, archived the boilerplate after the front matter). A single inversion is refused rather than guessed around, because "which end is older" is exactly what a wrong guess destroys. `validateLineLimits()` reports the plan's refusal reason, so validate and archive agree; the bash `archive_prompts()` mirrors the plan line for line [ARCH-004.37]
- **GitHub Username as devPrefix**: `init` and `add-specs` prompt for GitHub username instead of display name; stored as `TemplateContext.author` (used in `contributors: [{{author}}]` front-matter) and written as `team.devPrefix` in generated `project.yaml` to namespace task and prompt IDs (e.g. `CD-{devPrefix}-001`); default obtained via `git config user.name`, falling back to `'your-username'` [ARCH-004.20]
- **Git Merge Strategy for Spec Files**: `specpilot init` and `specpilot add-specs` generate a `.gitattributes` file at project root with `merge=union` for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; if `.gitattributes` already exists, only missing lines are appended; implemented in `IdeConfigGenerator.generateGitAttributes()`, called unconditionally from `SpecGenerator.generateSpecs()` [ARCH-004.21]
- **devPrefix in Generated ID Conventions**: generated `tasks.md` shows `CD-{{author}}-###` and `## Multi-Dev Notes`; generated `prompts.md` shows `PROMPT-{{author}}-###` [ARCH-004.22]
- **Purpose Descriptions in Generated Spec Files**: every generated markdown spec file includes a `description:` front-matter field; `api.yaml` gets a `# Purpose:` comment [ARCH-004.25]
- **IDE/Agent prompt in `add-specs`**: `specpilot add-specs` now shows the same 6-choice IDE/Agent prompt as `specpilot init` (vscode / Cursor / Windsurf / Antigravity / Claude Code / Codex) instead of hardcoding `vscode`; selected IDE flows into `SpecGenerator.generateSpecs()` so the correct AI context file is generated for existing projects; `--no-prompts` defaults to `vscode` [ARCH-004.26]
- **Claude Code Plugin**: distributed from a `plugin/` subdirectory **inside this repo** (not a separate repo) via a `git-subdir` marketplace source (`url: github.com/girishr/SpecPilot, path: plugin`), so the CLI stays the root-level source of truth and users sparse-clone only `plugin/`; the plugin root holds `plugin/.claude-plugin/plugin.json`, `plugin/commands/` (the `init`/`add-specs`/`migrate` scaffolders plus the eight `specpilot-*` workflow commands), and `plugin/skills/specpilot-project/SKILL.md`. **Self-contained, no `specpilot` CLI dependency**: scaffolding commands instruct Claude to build the fixed `.specs/` tree and IDE config files via plain permission-gated Bash file writes, then populate content in-session (collapsing the CLI's two-step scaffold-then-paste-onboarding-prompt flow into one). **Lowest-privilege by design**: no hooks, no MCP servers, no `bin/`, no monitors. **Generated from a single source of truth**: the committed `plugin/` bundle is emitted from `src/utils` by a build step (same pattern `slashCommandGenerator.ts` already uses to render the 8 commands per IDE), never hand-edited, so the plugin and CLI can never drift [ARCH-004.27]
- **Code Philosophy + Code Rules in Generated Outputs**: all generated AI instruction files include `## Code Philosophy — Write Only What Needed` (7 YAGNI/minimal-code items) and `## Code Rules` (7 behavioral constraints) in caveman style; injected via `buildCodePhilosophyMarkdown()` in `ideConfigGenerator.ts` and inline in `agentConfigGenerator.ts`; `specpilot backfill` detects missing sections and appends them to existing IDE files [ARCH-004.28]
- **Per-IDE Slash Command Routing**: Claude Code → `.claude/commands/specpilot-<name>.md`; Cursor → `.cursor/commands/specpilot-<name>.md`; Windsurf → `.windsurf/workflows/specpilot-<name>.md`; Antigravity → `.agent/workflows/specpilot-<name>.md` (distinct from its `.antigravity/rules.md` mandate file); GitHub Copilot → `.github/prompts/specpilot-<name>.prompt.md`; Codex has no repo-level custom-prompt support (only `~/.codex/prompts/` is auto-discovered), so a reference copy is still written to `.codex/prompts/specpilot-<name>.md` plus a one-time printed instruction to copy it manually; `SLASH_COMMANDS` starts empty and is populated one command at a time by BL-039 through BL-046 [ARCH-004.29]
- **CLI-Side Slash Command Backfill**: `SlashCommandGenerator.resolveTarget()` (per-IDE path/frontmatter) is shared by both `generate()` (fresh scaffolding, always writes) and `backfillMissing()` (existing projects, only writes files absent on disk, never overwrites); `SpecBackfiller.backfillSlashCommands()` calls `backfillMissing()` once per IDE whose signal file already exists (`CLAUDE.md`, `.cursor/rules/specpilot.mdc`, `.windsurfrules`, `.antigravity/rules.md`, `.github/copilot-instructions.md` — same 5 signals `backfillIdeFiles` already checks; Codex excluded, no signal file convention); `BackfillResult.slashCommands: SlashCommandBackfillResult[]` reported in a new "Slash commands" section in `backfill.ts` CLI output; ensures CLI-side backfill and web-app-side `slashCommandGenerator.ts` generation never drift apart since both read from the same `SLASH_COMMANDS` constant [ARCH-004.30]

## Technology Stack [ARCH-005]

- **Runtime**: Node.js [ARCH-005.1]
- **Language**: TypeScript [ARCH-005.2]
- **CLI Framework**: Commander.js [ARCH-005.3]
- **Template Engine**: Handlebars [ARCH-005.4]
- **Package Manager**: NPM [ARCH-005.5]
- **Local Server**: Node.js built-in `node:http` (no web framework) [ARCH-005.6]

## Data Flow [ARCH-006]

### Init Command Flow [ARCH-006.1]

1. User runs `specpilot init <project-name>` with parameters
2. CLI parses arguments and validates project name (allowlist regex)
3. Checks for existing .specs folder (CS-004)
4. Prompts for framework and GitHub username (used as `contributors` handle and `devPrefix` for ID namespacing)
5. Prompts for IDE/agent selection
6. Asks 4 project context questions (1 mandatory, 3 optional)
7. Spec File Generator creates subfolder structure with mode-aware prompts
8. IDE-native AI context file generated based on selection; agent skill/instruction file generated (SKILL.md or CODEX_INSTRUCTIONS.md)
9. Validator confirms structure integrity

### Add-Specs Command Flow [ARCH-006.2]

1. User runs `specpilot add-specs` in existing project
2. Project Detector scans for package.json, requirements.txt, etc.
3. Auto-detects language, framework, dependencies
4. Code Analyzer scans for TODOs, tests, components (unless --no-analysis)
5. Prompts for missing information
6. Spec Generator creates .specs with analysis data (mode: existing)
7. Reports discovered items (TODOs, tests, components)

### Refine Command Flow [ARCH-006.3]

1. User runs `specpilot refine` in project with .specs/
2. Reads current spec files (requirements.md, context.md, prompts.md)
3. Collects all pending changes into a list
4. Shows line-level diff preview (added/removed lines with context)
5. Prompts for confirmation (unless --no-prompts)
6. Writes approved changes to disk

### Backfill Command Flow [ARCH-006.4]

1. User runs `specpilot backfill` in a project that already contains `.specs/`
2. Command reads current `.specs/project/project.yaml` and `.github/copilot-instructions.md`
3. Compares current content against the latest SpecPilot-managed mandate/instruction blocks
4. Computes only missing insertions or append operations; existing user-authored content is preserved
5. Detects which IDE-specific files exist (`.cursor/rules/specpilot.mdc`, `CLAUDE.md`, `.windsurfrules`, `.antigravity/rules.md`, `.claude/skills/specpilot-project/SKILL.md`) and checks each for missing mandate fingerprints
6. In `--dry-run`, prints the planned changes without writing
7. In write mode, applies the minimal merge/appends and prints a summary of updated, skipped, stale, and missing files

### Plugin Init Flow [ARCH-006.5]

1. User installs the plugin from the community marketplace (`git-subdir`, SHA-pinned) and runs `/specpilot:init`
2. Claude asks the project-context Q&A conversationally (replacing the CLI's `inquirer` prompts — no CLI invoked)
3. Claude creates the fixed `.specs/` tree and IDE config files via permission-gated Bash file writes, using templates carried in the plugin bundle (emitted from `src/utils` at build time)
4. Claude reads the generated onboarding prompt and executes it in-session to populate spec content, then removes it — no paste-into-an-agent second step
5. `add-specs` and `migrate` follow the same in-session pattern; the eight `specpilot-*` workflow commands operate exactly as their CLI-generated counterparts (REQ-002.E.7–E.14)

### Serve Flow [ARCH-006.6]

1. User runs `specpilot serve [--port <n>] [--poll <ms>] [--read-only] [--open]` in a folder containing `.specs/`
2. `startSpecServer()` listens on `127.0.0.1:<port>` (default 4321); `EADDRINUSE` → exit 1 with a message suggesting `--port`
3. The command prints `http://127.0.0.1:<port>`; with `--open`, spawns the platform opener (`open` / `xdg-open` / `cmd /c start`) on that fixed URL
4. Each request: Host check (403) → method check (405) → route: `/` and `/assets/*` from `ui/`; `/api/specs` walks `.specs/` and the Automation folders and returns `readSpecs()` output plus the nav tree; `/api/file?p=` runs the path guard and returns the file as `text/plain`; `/api/events` opens a server-sent-event stream (503 past 8)
5. The first open stream starts the poller; each settled change sends `event: change` with the changed paths to every stream; the page re-fetches and redraws in place. The last stream closing stops the poller and the heartbeat
6. A move: the page POSTs `/api/tasks/move` with the token, its origin and `If-Match`; the server checks Host, Origin, token, content type and size, then `moveTask()` writes under the lock and answers with the new hash and payload; the poller's event for that write finds the same hash and causes no second redraw
7. Ctrl+C: the handle's `close()` ends every stream, clears every timer and closes the listener

> **Open question — plugin build mechanism**: REQ-002.G.5 fixes the source of truth as `src/utils` (generate, don't hand-author). The concrete build step — a new `specpilot`-internal generator/npm script (e.g. `build:plugin`) that renders `plugin/commands/*.md`, `plugin/skills/`, and the manifest, extending the existing `slashCommandGenerator.ts` mechanism — is to be designed when the plugin work is scheduled (see BL-048).

## Assumptions [ARCH-007]

- **Node.js runtime**: Node.js >= 16 is required; the output module format is CommonJS (`"module": "commonjs"` in `tsconfig.json`) [ARCH-007.1]
- **File paths**: All file path operations use `path.join()` / `path.resolve()` to ensure cross-platform compatibility (macOS, Linux, Windows) [ARCH-007.2]
- **No network at runtime**: All templates are built-in; no HTTP calls are made during `init`, `add-specs`, or `validate`. `specpilot serve` opens a listener on the loopback interface only and makes no outbound requests; its UI loads nothing from outside the local server [ARCH-007.3]
- **Single project root**: The CLI operates on a single root directory; monorepo support is out of scope [ARCH-007.4]
- **Write access**: The user has write permission to the target project directory [ARCH-007.5]
- **TypeScript compilation**: Source is compiled with `tsc` to `dist/`; the published package ships the compiled JS, not the TS source [ARCH-007.6]
- **No global state**: All generator functions are stateless and receive all inputs as parameters — safe for programmatic use [ARCH-007.7]

