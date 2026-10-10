# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Local MCP endpoint in `specpilot serve`** (BL-PM-007): `specpilot serve --mcp` also answers MCP at `http://127.0.0.1:<port>/mcp`, so Claude Code, Cursor and other AI IDEs on this machine can list projects and tasks, read spec files, add and move tasks, run `specpilot validate`'s checks and regenerate command files. The tools run the page's own code behind the page's checks (loopback, Host, the token, JSON only, the read and write allowlists, one write lock); a task write needs the `sha256` it last read and is refused when `tasks.md` changed since. Requests from web pages are refused. Off by default; with `--read-only` only the read tools. The token is new on each start, or `SPECPILOT_MCP_TOKEN` (32 characters or more) when set; SpecPilot never writes it anywhere. Home shows a Connect Your AI IDE card with the one-line config and a Copy button when `--mcp` is on; if you put the line in `.mcp.json`, the card says to add that file to `.gitignore`, since it then holds the token.
- **MCP revision `2026-07-28` on `specpilot serve --mcp`** (BL-089): the local endpoint also speaks the current MCP revision, which has no `initialize` handshake: each request carries its version, and its `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers must match the request body or it is refused before any tool runs. `server/discover` lists the revisions served. Clients on `2025-11-25` and `2025-06-18` work as before, on the same URL and config line.
- **Tasks line in generated instruction files** (BL-PM-007): `CLAUDE.md`, `.github/copilot-instructions.md`, Cursor's `.mdc`, `.windsurfrules` and `.antigravity/rules.md` get one more process mandate: use the SpecPilot MCP tools for tasks when connected, otherwise edit `.specs/planning/tasks.md` and keep its table format. New files only; `specpilot backfill` does not add it yet (BL-088).
- **Open in AI IDE and per-file Open in VS Code in `specpilot serve`** (BL-PM-010, BL-PM-013): a menu beside Open in VS Code offers Open in Cursor when the project has SpecPilot's Cursor rules file, and, while `development/onboarding.md` exists, sends the onboarding prompt to Cursor through its prompt link or copies it for Claude Code and other IDEs. The file view and the Instructions, Commands and Skills details panels get Open in VS Code for that file. Links only: no route, no process, no write.
- **Clone progress in `specpilot serve`** (BL-PM-009): while a clone runs, the Clone a Repository sheet shows git's own stage and percentage (`Receiving objects 42% · 0:13`, then `Resolving deltas`, `Updating files`), sent over the page's live-reload stream as a stage and a number only, never the URL or the folder; git now runs with `--progress`. When git gives no percentage, the sheet shows the moving bar and the elapsed time as before.

## [2.12.0] - 2026-10-09

### Added

- **Remove from list on Home, and the SpecPilot wordmark** (BL-PM-014): each Recent project on the `specpilot serve` Home screen has a Remove from list button, as the Open a Project sheet does (the folder is not touched), and the SpecPilot name now sits beside Home's logo as on specpilot.dev, drawn from the Sixtyfour font's outlines inside the page, so nothing is downloaded (the font's SIL Open Font License ships as `ui/OFL-Sixtyfour.txt`).
- **Open in VS Code from the `specpilot serve` page** (BL-PM-008): an icon on every project view, and beside each Recent project on Home whose folder exists, opens that project's folder in VS Code through a `vscode://file/` link, and a task's details panel has Open tasks.md in VS Code, which opens the file at that task's line. The server starts no process and has no new route; VS Code asks before it opens anything.
- **Commands and Skills split, and Regenerate All, in the `specpilot serve` page** (BL-PM-006): the Commands and Skills views group their files under From SpecPilot (`specpilot-*` commands whose bytes match a released SpecPilot version; the `specpilot-project` skill) and Yours (everything else, including an edited `specpilot-*` command). Regenerate All runs `specpilot backfill`'s command step for the shown project: it adds missing `specpilot-*` commands and updates unedited ones for each IDE in use, keeps everything else, and shows what it did, including kept files and the command folders the page does not list. Skills, instruction files and `.specs/` are not written. Not with `--read-only`. The startup line says command files can be written too.
- **New Task in the `specpilot serve` page** (BL-PM-005): a New Task button on the Tasks view opens a small form for a description and a section (Backlog by default, or Current Sprint). SpecPilot adds one row to that section's table in `planning/tasks.md` with the next free ID (BL-### or CS-###, counting the IDs in `tasks-archive.md` too), writes the description as you typed it, and changes nothing else in the file. The new row is selected and opened in the details panel. A description with a line break or a `|` is refused with the reason. Not available with `--read-only`.

### Changed

- **New projects start from Home in `specpilot serve`** (BL-PM-014): the `+` tile in the left rail now shows Home, with Open a Project Folder ready, instead of opening the Open a Project sheet; the sheet opens from Home's Open a Project Folder and Clone a Repository.
- **`specpilot backfill` writes no command file through a linked folder** (BL-PM-006): when `.claude`, `.claude/commands`, `.github`, `.github/prompts` or another folder on the way is a symbolic link or not a folder, the command file is kept and listed (`kept: folder is a symbolic link or not a folder`) instead of being created through it. A command file that cannot be written is listed (`kept: could not be written: <code>`) and the other files are still handled, where before the run stopped with an error.

## [2.11.0] - 2026-10-08

### Added

- **The whole init.specpilot.dev setup chat in the `specpilot serve` page** (BL-PM-004b): Start a New Project and the setup of a folder without `.specs/` ask the web chat's questions in its order and eight steps, with its pickers (platform tabs, starter chips, cards, grouped and categorized choices, `Other` entries), its recommendations and warnings, a note under each question naming the files it fills, and the language and framework suggested from the platforms you pick. The extra answers fill the matching sections of the spec files; a setup that answers only the questions `specpilot init` asks writes the same files as before. Unfinished setups are kept in your browser and listed beside the chat until you create the project, and the recap can preview every file before anything is written.

### Fixed

- **Answers are written into the spec files as typed**: `< 100ms`, `Q&A` or `"quoted"` used to land as `&lt; 100ms`, `Q&amp;A` and `&quot;quoted&quot;`, because the templates HTML-escaped every value although the files are Markdown and YAML. A handle, `--lang` or `--framework` typed at the terminal, or a project name `add-specs` reads from `package.json`, that holds one of those characters is now quoted where it goes into YAML, so the files still read back. Output is otherwise byte for byte the same.

## [2.10.0] - 2026-10-07

### Changed

- **The spec templates and everything that renders them now live in a pure core** (`src/core/`: no file system, no Node API, checked by lint and a test), and `init`, `add-specs`, `refine --update` and `specpilot serve` write what it returns (BL-032, phase 1). Every file is byte for byte what 2.9.0 wrote, pinned by a test recorded on 2.9.0's generator. One difference in kind: every date in a generated project now comes from one value, where three separate clock reads could straddle midnight.

### Added

- **The templates accept 23 optional answers**, each rendered only when given (BL-032, phase 2): platforms; access control, special considerations and accessibility notes; architecture pattern, active users, team size, deployment targets, offline databases and sync strategy, integrations and other APIs, response-time and availability targets; databases, auth strategy and realtime transports; compliance and CI/CD; security concerns; build timeline; constraint detail; testing strategy. No command asks them yet: the chat of `specpilot serve` will (BL-PM-004b), and init.specpilot.dev's answers map onto them once it adopts the core. A project generated without them is unchanged.

### Fixed

- **`project.yaml` now reads back as written** (BL-085, folded into BL-032): `name:` and `description:` are quoted when YAML needs it (a description containing `: `, a name that looks like a number), and a description containing `&`, `<`, `>`, `"`, `'`, `` ` `` or `=` is written as typed, where it used to be HTML-encoded (`Don&#x27;t`). Any other value is written exactly as before.

## [2.9.0] - 2026-10-06

### Added

- **Guided setup, one question at a time, in the `specpilot serve` page** (BL-PM-004): Start a New Project and the setup of a folder without `.specs/` ask the questions `specpilot init` and `specpilot add-specs` ask, one at a time, as a chat: a friendly line per question with the CLI's own question under it, step dividers, a progress bar, chips or a field with Continue and Skip, and a recap of your answers by step, with the files that will be written folded inside, before anything is written. Tap any answer, in the thread or the recap, to change it; you come straight back. A project name or handle that would be refused is caught at its own question. A Brownfield new project is no longer asked the four project-context questions, which `init` does not write for Brownfield. The files written are the same as before, byte for byte what the CLI writes. This replaces the New tab of the Open a Project sheet and the setup form. No new route and no new file outside the project; `--read-only` turns it off.
- **Start a new project from the `specpilot serve` page** (BL-PM-003): Home has a Start a New Project button (it opened a New tab in the Open a Project sheet until BL-PM-004 replaced that with the chat above). Give a parent folder and a project name, answer the questions `specpilot init` asks, and the page creates the folder (or uses it when it exists and is empty), writes the same files `init` writes there, and opens the project. Nothing that exists is changed: a folder with content is refused (open it from the Folder tab to add `.specs/` to it), and a run that fails removes what it created. The request is protected like the other write routes, and `--read-only` turns it off.
- **Clone a repository from the `specpilot serve` page** (BL-PM-002): Home has a Clone a Repository button and the Open a Project sheet has a Clone tab. Give a repository URL, a parent folder and, if you like, a folder name (it is filled with the repository's name as you type the URL); while the clone runs the sheet shows a moving bar and the elapsed time; the page runs your installed `git clone` and opens the result, on its Tasks view when the repository has `.specs/` and in guided setup when it has none. Only `https://` and SSH URLs (`git@host:path`, `ssh://`) are accepted, and an https URL must not contain a user name or password: git uses your credential helper and ssh keys as it does in a terminal. Submodules are not cloned. The target folder must not exist or must be empty. git is never asked a question it would wait on: a repository that needs a login it cannot get fails with git's own message (its last `fatal:` line and the line before it), and a clone that takes longer than 10 minutes is stopped. Your ssh setup is used as it is. A clone that fails, is stopped or is cancelled removes what it downloaded. The request is protected like the other write routes, and `--read-only` turns it off. This is the first time SpecPilot starts a program for the page and the first time it uses the network; it does so only for a clone you ask for. Needs `git` on your `PATH`.

### Changed

- `specpilot serve` now stops the same way on `kill` (SIGTERM) and a closed terminal (SIGHUP) as on Ctrl+C: it stops a running clone, removes what it downloaded, closes and exits 0, waiting at most 5 seconds for that clean-up (BL-PM-002).
- `specpilot serve`: a project whose `project.yaml` has no `name` is shown under its folder's name (`dev`) in the header, the sidebar, the rail tile and the page title, where the whole path used to stand (rail initials `DD` for `~/Documents/dev`). The path stays in the tooltip and the sub-line (BL-PM-002).
- `specpilot init` takes its API-paradigm and IDE choices, its handle message and its language list from the module `add-specs` and the page already share (BL-075). What it asks and writes is unchanged.

## [2.8.0] - 2026-10-04

### Added

- **Open another project from the `specpilot serve` page, and have it remembered** (BL-067): a `+` tile in the left rail opens the Open a Project sheet; type a folder path (or `~/…`) and it is served alongside the others, with guided setup if it has no `.specs/` yet. Folders you open are listed under Recent projects next time, remembered in `~/.specpilot/projects.json` (paths and last-opened times only; the file is created the first time you open a folder from the page, and a folder you name on the command line is added to it only once that file exists). Remove from list forgets a folder without touching it. Projects already on the server keep their numbers. The request is protected like task moves and setup (per-session token, Origin check, JSON only); the home folder, the root of a drive and folders that are already open are refused; a `projects.json` that cannot be read is left exactly as it is and the page says so. `--read-only` turns the tile and the registry off. This is the first file SpecPilot writes outside a project. No Clone tab or folder picker yet.
- **A Home screen in `specpilot serve`** (BL-PM-001): the logo at the top of the left rail is now a Home tile, and `#home` goes to the same place. Home is the mockup's welcome column: the logo, "Your specs, as a board.", an Open a Project Folder button (the same sheet as the `+` tile), two lines on what the page does (files are the truth; nothing leaves this machine), your Recent projects with path, last-opened time (written like `4 Oct 2026, 07:08`, also in the sheet) and, for projects already open, the git branch, and the server's address and version; click a project to open it. Press `h` (outside a text field) to go Home. It uses the routes that were already there: nothing new is read or written. `specpilot serve` still starts on the first project's Tasks view, and `--read-only` has no Home. Start a New Project, Clone a Repository and the AI IDE card are not there yet.

## [2.7.1] - 2026-10-03

### Fixed

- **`specpilot add-specs`, `specpilot init` and `specpilot refine --update` no longer replace files you already have** (BL-073). Run in a project with its own `.vscode/settings.json`, `.cursor/rules/specpilot.mdc`, `SKILL.md`, a `specpilot-*` command file or similar, they used to overwrite it. Now any file outside `.specs/` that already exists is left exactly as it is and listed at the end as kept, the same keep rule `specpilot serve` guided setup follows. The overwrite / append / skip question for an existing `CLAUDE.md` or `.github/copilot-instructions.md` is gone: those files are kept too, so `--no-prompts` is no longer needed to avoid the existing-file question; it still skips the setup questions. Run `specpilot backfill` afterwards to merge the missing SpecPilot sections into kept files. `.gitattributes` still gets its missing `merge=union` lines, and the command now says how many it appended.

## [2.7.0] - 2026-10-03

### Added

- **`specpilot serve` can set up `.specs/` in a folder that has none** (BL-055): name the folder on the command line (`specpilot serve ../new-project`, or `specpilot serve .`) and its page asks the questions `specpilot add-specs` asks, then creates the same files that command creates. It only creates files that are missing: one that already exists (for example your own `.gitattributes`, `CLAUDE.md` or `.vscode/settings.json`) is left exactly as it is, and the page lists it before and after; run `specpilot backfill` to add SpecPilot sections to kept instruction files. An interrupted setup leaves a marked `.specpilot-setup-*` folder, which the next `specpilot serve` removes. The page cannot choose a folder, the request is protected like task moves (per-session token, Origin check, JSON only), and `--read-only` turns setup off. Until now `serve` stopped with an error when a named folder had no `.specs/`; running `specpilot serve` with no folder in a directory without `.specs/` still does.

## [2.6.0] - 2026-10-02

### Fixed

- **`specpilot backfill` no longer re-adds mandates to projects created by SpecPilot 2.0.0 or later** (BL-066). It checked `.github/copilot-instructions.md` for the wording SpecPilot used before 2.0.0 and `project.yaml` for a `rules:` section that 2.0.0 stopped writing, so on a fresh project it would append all 8 mandates again in different words and 9 rules to `project.yaml`. It now checks copilot-instructions.md in the wording the file already uses, and leaves a `project.yaml` without `rules:` alone.
- **`specpilot validate` no longer fails a fresh project with "Missing MANDATE for prompt tracking in project.yaml rules"** (BL-066). A `project.yaml` without a `rules:` section is how SpecPilot has generated it since 2.0.0; the mandates are in your AI agent file.
- **`specpilot backfill` no longer adds a convention line and `## Multi-Dev Notes` to a fresh `planning/tasks.md`** (BL-069). It looked for `CD-<your handle>-###` while `init` writes `CD-{devPrefix}-###`, and it still added the Multi-Dev Notes section that 2.0.0 removed from new projects. Either form of the convention line now counts, and Multi-Dev Notes is no longer added; an existing section is left alone.

### Added

- **`specpilot serve` can serve several projects at once** (BL-054): `specpilot serve ../api ../web` serves every folder you name from one server on one port, each with its own tasks, files and live reload; switch between them in the left rail. Running `specpilot serve` with no folders works exactly as before. The project list is fixed when the server starts: the page cannot add a folder, and nothing is stored outside your projects.

### Changed

- **`specpilot validate` and `specpilot archive`: the `## Completed` limit in `planning/tasks.md` is now 40 lines (was 25), and archive keeps the newest 20 rows** (BL-060). A table-shaped Completed section used to fit only about 17 rows, and archive kept exactly as many as fit, so the next completion brought the warning back. There is now room for at least 10 completions between archives. **Run `specpilot backfill`** to refresh the `/specpilot-archive` command, which carries its own copy of the limit.

## [2.5.0] - 2026-10-01

### Fixed

- **`specpilot backfill` now updates installed `specpilot-*` command files** (BL-058): until now it only added missing command files, so fixes to a command never reached projects that already had it. A command file is now replaced when it is byte for byte a version an earlier SpecPilot generated (checked by SHA-256 against every version since 2.2.0); a file you changed is never written. **Run `specpilot backfill` to pick up the `/specpilot-archive` fixes from 2.2.4 (BL-057, table-shaped `## Completed` sections) and 2.4.0 (BL-061, archiving the oldest `prompts.md` entries).** Use `--dry-run` to preview.
- Files that are kept are listed with the reason, and the command still exits 0: `kept: modified` (delete it and re-run `specpilot backfill` to get the latest version), `kept: CRLF line endings` (a known version saved with Windows line endings), or a symbolic link, which is never written through.
- Codex: the in-repo reference copies in `.codex/prompts/` are added and updated the same way when `CODEX_INSTRUCTIONS.md` exists. Nothing outside the project is touched; copy them to `~/.codex/prompts/` yourself.

## [2.4.0] - 2026-09-29

### Added

- **Move tasks in `specpilot serve`** (BL-053): drag a row, or use `Alt+Up/Down` and `Alt+Left/Right`, to reorder tasks or move them between `## Backlog` and `## Current Sprint`. A move changes exactly one line of `.specs/planning/tasks.md` (the row is cut and pasted unchanged) and every other byte stays as it was; Undo is one click. If the file changed on disk since the page loaded, the move is refused and the page shows the current file. Protected by a per-session token, an Origin check and JSON-only requests; `--read-only` turns moves off. `tasks.md` is the only file the server can write.

### Fixed

- **`specpilot archive` archived the newest `prompts.md` entries instead of the oldest** (BL-061): every version from 1.5.1 through 2.3.0 moved the entries at the top of the log, which is right only for a log written oldest first. In a log written newest first under `## Latest Entries`, it kept the oldest entries and moved the most recent ones. Nothing was deleted: the moved entries are in `development/prompts-archive.md` under an `## Archived on <date>` header and can be copied back.
- **In generated `prompts.md` files, `specpilot archive` moved the boilerplate instead of the log** (BL-061): a generated `prompts.md` keeps its log in a `## Prompt History` table and has no `## Latest Entries` heading, so every version from 1.5.1 through 2.3.0 fell back to the lines just after the front matter. If yours went over 100 lines and you ran `specpilot archive`, the `## Overview`, `## Archive Policy` and `## Re-Anchor Prompt` sections may have been moved to `development/prompts-archive.md`; copy them back from there.
- **How archiving `prompts.md` works now** (BL-061): the archiver reads each entry's own date (`Month D, YYYY`, abbreviated months such as `Sept. 3, 2025`, or `YYYY-MM-DD`; for a table row, its Date cell) to tell which end is older, moves whole oldest entries only, never moves boilerplate, and refuses with a plain message, changing nothing, when there is no log section or the dates do not run one way. `specpilot validate` reports the same reason. The `/specpilot-archive` slash command has the same fix, but existing projects keep their current copy of that command until they replace it (BL-058 tracks updating installed command files).

## [2.3.0] - 2026-09-29

### Added

- **`specpilot serve`: a read-only local web UI over your `.specs/`** (BL-051): `specpilot serve [--port <n>] [--poll <ms>] [--open]` serves the current project at `http://127.0.0.1:4321/` with Tasks, Roadmap, Requirements, Explorer, Architecture, Tests, Security, Instructions, Commands and Skills views. Everything shown is the files' own text, verbatim, and open pages update themselves when a file changes (BL-052): the server polls the allowlisted files every second (`--poll <ms>`, minimum 250) and pushes changed paths over server-sent events, while keeping your place on the page. Loopback only, Host-checked, allowlisted to `.specs/` and your generated instruction and command files, and no route writes to disk. No new dependencies.

### Removed

- **Unused `fs-extra` dependency** (BL-056): declared since the first release but never imported. `@types/fs-extra` removed with it.

## [2.2.4] - 2026-09-27

### Fixed

- **`specpilot archive` did nothing on a table-shaped `## Completed` section while `specpilot validate` kept telling you to run it** (BL-057): `archiveTasks()` only recognised numbered-list entries, so a Completed section written as a markdown table was never archived. Tables are now supported: the body rows are the entries, the header and separator stay in place and are repeated above the moved rows in `tasks-archive.md`, and rows move by position, byte for byte, oldest first. Validator and archiver now share one decision (`planCompletedArchive()`), so `validate` warns about the Completed section only when `archive` would move something, and after `archive` runs the warning is gone. Numbered-list sections (the generated template) archive exactly as before.
- **The `specpilot-archive` slash command could still sweep sections after `## Completed` into the archive**: its embedded `archive_tasks()` measured the section to end-of-file, the bug fixed in the CLI in 2.2.1 but never ported to this independent bash copy. It now bounds the section at the next `## ` heading, handles table-shaped sections, and uses the same arithmetic as the CLI. **Existing projects do not get this fix automatically**: `specpilot backfill` never overwrites an existing command file. To get it after upgrading, delete each IDE's copy of the command — `.claude/commands/specpilot-archive.md`, `.cursor/commands/specpilot-archive.md`, `.windsurf/workflows/specpilot-archive.md`, `.agent/workflows/specpilot-archive.md`, `.github/prompts/specpilot-archive.prompt.md` — and run `specpilot backfill`. Codex users must re-copy `.codex/prompts/specpilot-archive.md` into `~/.codex/prompts/` themselves, because backfill skips Codex and the working copy lives outside the repo; for the same reason backfill does not refresh the project's `.codex/prompts/` reference copy either, so regenerate that file first (for example, run `specpilot init` in a scratch directory with Codex selected and take its `.codex/prompts/specpilot-archive.md`).

### Changed

- **Internal: shared section-bounds helper and pure spec reader** (BL-050, `specpilot serve` Phase 0 groundwork; no user-visible change): new `src/utils/markdownSections.ts` `findSectionBounds()` is now the single TypeScript source of the "a `## ` section ends at the next `## ` heading, not EOF" rule, used by `specArchiver.ts` (`archiveTasks()`, `archivePrompts()`) and `specValidator.ts` (`validateLineLimits()`) with identical behaviour. New `src/utils/specReader.ts` is a pure, fs-free parser from `.specs/` file contents to per-file metadata and `tasks.md` Backlog / Current Sprint / Completed rows, cell text verbatim. 10 new tests (216 → 226).

## [2.2.3] - 2026-08-02

### Fixed

- **`specpilot init`'s success screen scrolled past before it could be read** (CS-091): the generated file tree, next-steps text, and onboarding prompt dump printed back-to-back in one uninterrupted burst of `console.log` calls, so the file tree was gone from the terminal before a user could read it. `logger.ts`'s `displayInitSuccess()` split into `displayInitTree()` and `displayInitNextSteps()`; `init.ts` now inserts an `inquirer` "Press Enter to continue..." gate between the tree and the next-steps text, and a second "Press Enter to see your onboarding prompt..." gate before the dump — both skipped automatically when `--no-prompts` is set, so CI/scripted runs are unaffected. `add-specs.ts` updated to the renamed logger methods.

## [2.2.2] - 2026-08-01

### Fixed

- **`specpilot backfill` falsely reported CLAUDE.md, Cursor, Windsurf, and Antigravity rule files as missing all 8 critical mandates**: `specBackfiller.ts`'s `MD_MANDATES` fingerprints only matched the verbose phrasing used in `copilot-instructions.md` (e.g. `"NEVER commit"`), but `buildCriticalMandatesMarkdown()` generates those four IDE-native files with terser wording (e.g. `"No commit unless asked."`). Every project's CLAUDE.md/Cursor/Windsurf/Antigravity file would show as missing mandates it already had, and running `backfill` for real would append a duplicate, differently-worded mandate block. Added `TERSE_MD_MANDATES` matching the actual generated wording and routed the four IDE-native file checks to use it instead.

## [2.2.1] - 2026-07-30

### Fixed

- **`specpilot backfill` could never fix the "Missing MANDATE for prompt tracking" error** (CS-090): `specBackfiller.ts`'s `YAML_MANDATES` only listed the 8 `rules.critical` mandates, so the `rules.process` prompt-tracking mandate that `specValidator.ts` checks for was never written — `specpilot validate` reported an error that `specpilot backfill` structurally could not resolve. Added `YAML_PROCESS_MANDATES` and rewrote `insertYamlMandates()` to target `rules.critical` and `rules.process` independently.
- **`specpilot backfill` corrupted `project.yaml` when it had no `rules:` key**: the fallback appended a bare, two-space-indented `critical:` block with no parent `rules:` key, which YAML silently nested under whatever top-level key happened to precede it (e.g. producing `dependencies.critical`), leaving the mandates invisible to the validator. Now emits a proper top-level `rules:` block.
- **`specpilot archive` silently destroyed any `tasks.md` section after `## Completed`**: `archiveTasks()` assumed `## Completed` ran to end-of-file, so a following section (e.g. `## Multi-Dev Notes`) was swept into `tasks-archive.md` while the active `## Completed` section was left holding unrelated lines. The Completed section is now bounded by the next `## ` heading and trailing content is preserved; `specValidator.ts`'s line-limit check measures the same way so the warning and the archiver cannot disagree. Compounding this, `backfillTasksMd()` appended `## Multi-Dev Notes` at end-of-file when no `## Backlog` existed — placing SpecPilot's own generated section exactly where the archiver would eat it; it now inserts before `## Completed`.
- **Dead and incorrect `validate --fix` paths removed**: `addMandatesToProjectYaml()` guarded on `rule.includes('prompt')`, which the critical mandate "unless prompt**ed** by the developer" satisfies while the validator requires `/prompts/i` — so it believed the mandate already existed and wrote nothing, while the validator kept erroring. It also used `yaml.dump()`, destroying all comments and rewriting quoting. Both it and `createInitialPromptsEntry()` were unreachable (nothing ever pushed `add-mandates`/`create-prompts-entry` into `fixable`) and are deleted; `specpilot backfill` already handles this via comment-preserving text insertion.
- **`autoFix()` could write arbitrary files into `.specs/`**: the `fix.startsWith('create-')` catch-all treated any such token as a filename; now constrained to the validator's `requiredFiles`.
- **`planning/roadmap.md` never got a staleness warning**: `validateStaleDates()` iterated `requiredFiles`, which omits `roadmap.md`; it is now checked explicitly without making its absence an error.

## [2.2.0] - 2026-07-06

### Added

- **Slash Command Generator — Core Infrastructure** (CS-079): new `src/utils/slashCommandGenerator.ts`, parallel to `ideConfigGenerator.ts`; commands defined once as `{ name, description, body }` and routed per IDE (Claude Code → `.claude/commands/`, Cursor → `.cursor/commands/`, Windsurf → `.windsurf/workflows/`, Antigravity → `.agent/workflows/`, GitHub Copilot → `.github/prompts/*.prompt.md`, Codex → `.codex/prompts/` reference copy with a one-time manual-copy notice); wired into `SpecGenerator.generateSpecs()`; `SLASH_COMMANDS` starts empty and is populated incrementally by upcoming tasks.
- **Eight `specpilot-*` slash commands** (CS-080–087): `status`, `reanchor`, `report`, `sync`, `refine <description>`, `validate`, `archive`, and `backfill`, populating `SLASH_COMMANDS` end to end. `validate`, `archive`, and `backfill` embed deterministic bash scripts (rather than relying on model judgment for line-counting or fingerprint checks) that were extracted and run against real/synthetic fixtures before merging.
- **CLI-side slash command backfill** (CS-088): `specpilot backfill` now also detects and generates missing `specpilot-*` command files for whichever IDEs are already in use, reusing the same `SLASH_COMMANDS` definitions as the generator so CLI-side and web-app-side output never drift apart; never overwrites an existing command file.

### Fixed

- **`specpilot validate` failing on every freshly-scaffolded project**: `specValidator.ts` still listed `development/docs.md` as a required file and cross-referenced it from `development/context.md`, even though `docs.md` generation was removed from `specFileGenerator.ts` back in 2.0.0 (CS-069). Every new project created via `init`/`add-specs` failed validation immediately with `Missing required file: development/docs.md`. Removed all 3 stale references; `specValidator.test.ts` updated to match (required-file count 11 → 10).

## [2.1.0] - 2026-06-28

### Changed

- **Code Philosophy + Code Rules in all generated AI instruction files** (CS-074): new `buildCodePhilosophyMarkdown()` in `ideConfigGenerator.ts` injected into `buildCopilotInstructions()` (GitHub Copilot, Cursor, Windsurf, Antigravity), `buildClaudeMd()`, and `buildClaudeMdSection()`; same 14-item block added to SKILL.md and CODEX_INSTRUCTIONS.md in `agentConfigGenerator.ts`; `specBackfiller.ts` extended with `CODE_SECTIONS` constant — backfill now detects missing Code Philosophy / Code Rules sections and appends them; total checks per IDE file increased 8→10; 3 new tests (190 → 192).
- **Rename Cursor output file to `specpilot.mdc`** (CS-077): `ideConfigGenerator.ts` now writes `.cursor/rules/specpilot.mdc` instead of `project.mdc`; `specBackfiller.ts` backfills `specpilot.mdc`; migration warning emitted when old `project.mdc` exists but `specpilot.mdc` does not (no auto-rename); 2 new tests (188 → 190); swept all `project.mdc` references in `.specs/`, `README.md`, `docs/GUIDE.md`.
- **Rename `VSCode` IDE label to `GitHub Copilot`** (CS-076): display name only change in `init.ts` and `add-specs.ts` (`{ name: 'VSCode' }` → `{ name: 'GitHub Copilot' }`); internal value stays `'vscode'`; all `VSCode` label references updated in `.specs/` docs, `README.md`, `docs/GUIDE.md`, and `CHANGELOG.md`.
- **Rename `Cowork` IDE option to `Claude Code`** (CS-075): `init.ts` and `add-specs.ts` display name updated; internal value changed from `'cowork'` to `'claude-code'`; `agentConfigGenerator.ts` and `ideConfigGenerator.ts` routing updated; CLAUDE.md header reference updated.

## [2.0.1] - 2026-06-26

### Changed

- **Claude Code replaces Cowork as an IDE option**: the `cowork` choice is now `claude-code` in the IDE prompts of `init` and `add-specs` and in the IDE and agent config generators, and the generated `CLAUDE.md` header no longer mentions Cowork.

### Fixed

- **`onboarding.md` references**: the logger, `init`'s required-file list and the post-init `.specs/` tree name `onboarding.md` instead of the removed `docs.md`.
- **IDE choice names**: the IDE choices of `init` and `add-specs` are explicit name/value pairs, so their display names are capitalised correctly (e.g. VSCode).

## [2.0.0] - 2026-06-26

### Changed

- **Terse AI agent mandates** (CS-066): rewrote all 8 critical mandates in `ideConfigGenerator.ts` to compact caveman style ("No commit unless asked" vs "NEVER commit"); mandate 5 now tiered (Trivial → `tasks.md`, Feature → `requirements.md` + `tasks.md`, Architectural → all files + `CHANGELOG.md`); mandate 8 now tiered spec-first gate (Trivial → no gate, Feature → read 1–2 files, Architectural → full Spec Report + `yes, proceed`); replaced static "Read in this order" list with on-demand `buildContextRoutingTable()` keyed by task type across all 4 IDE config builders.
- **Token-optimized `project.yaml` template** (CS-067): removed entire `rules:` block (`critical:`, `process:`, `preferences:`) and `ai_context:` block from generated `project.yaml`; replaced with single comment `# Rules and mandates: see your AI agent configuration file (single source of truth)`.
- **Onboarding prompt extracted to `onboarding.md`** (CS-068/CS-072): both onboarding prompts removed from `prompts.md`; new `generateOnboardingMd()` writes `.specs/development/onboarding.md` with a self-destruct header and the correct greenfield or brownfield prompt selected via new `projectType` option; `init` and `add-specs` now prompt for project type and print the onboarding prompt to stdout after generation; `generateSpecs()` return type changed to `{ onboardingPrompt: string }`; `.specs/README.md` Quick Start rewritten to point to `onboarding.md`.
- **`docs.md` removed from generated output** (CS-069): deleted `generateDocsMd()` — spec file conventions are enforced by `specpilot validate`, the update checklist duplicated mandate #5, and the CLI reference belongs in SpecPilot's own docs, not every user project.
- **Conditional `api.yaml` generation** (CS-070): new `apiParadigm` option (`rest` | `cli` | `graphql` | `none`) on `TemplateContext` and `SpecGeneratorOptions`; `generateApiYaml()` emits only the matching section or skips the file entirely for `none`; `inferApiParadigm()` auto-detects from framework (e.g. `react` → `none`, `express` → `rest`); interactive list prompt added to `init` and `add-specs`.
- **Slimmer `prompts.md` template** (CS-071): removed "Common Commands" (SpecPilot CLI docs) and "AI Agent Guidelines" (duplicates AI config file mandates) sections from generated `prompts.md`.
- **Terse generated spec file templates** (CS-073): stripped instructional prose, `## Cross-References` footer blocks, and verbose multi-line `[TODO: ...]` filler from all `generateXxx()` template strings; skeleton is now: front-matter + section headers with stable IDs + one `[TODO]` per section.

## [1.8.0] - 2026-06-06

### Added

- **Kotlin and Swift language support** (CD-girishr-008/CS-065/BL-034): `specpilot init` and `specpilot add-specs` now support `--lang kotlin` and `--lang swift`; `frameworks.ts` adds `kotlin → [android, spring, ktor, compose]` and `swift → [ios, swiftui, vapor]`; `projectDetector.ts` auto-detects Kotlin projects from `build.gradle` / `build.gradle.kts` / `settings.gradle.kts` (with Spring Boot, Ktor, Android, Compose framework sniffing) and Swift projects from `Package.swift` / `.xcodeproj` / `.xcworkspace` (with Vapor, SwiftUI, iOS framework sniffing); `templateEngine.ts` adds 4 base templates (`kotlin-project.yaml`, `kotlin-architecture.md`, `swift-project.yaml`, `swift-architecture.md`) and 7 framework-specific `project.yaml` variants with tailored dependency sections and build commands (`./gradlew build` for Kotlin, `swift build` for Swift); 25 new tests, 144 → 169 total; closes BL-034.

## [1.7.0] - 2026-05-28

### Added

- **IDE/Agent prompt in `specpilot add-specs`** (CD-girishr-007/CS-063): `specpilot add-specs` now prompts for IDE/Agent preference using the same 6-choice list as `specpilot init` (vscode, Cursor, Windsurf, Antigravity, Cowork, Codex) instead of always defaulting to `vscode`; the selected IDE is passed to `specGenerator.generateSpecs()` so the correct AI context file is generated for existing projects; respects `--no-prompts` flag (defaults to `vscode` when skipped); closes BL-029.
- **Purpose descriptions in generated spec files** (CD-girishr-006/CS-062): generated `.specs/` markdown templates now include a one-line front-matter `description:` field so each file's role is immediately clear during onboarding (`requirements.md`, `architecture.md`, `tasks.md`, `roadmap.md`, `tests.md`, `docs.md`, `context.md`, `prompts.md`, `threat-model.md`, `security-decisions.md`); generated `architecture/api.yaml` now includes a `# Purpose:` header comment (YAML config file, no markdown front-matter).
- **IDE file backfill in `specpilot backfill`** (CD-girishr-005/CS-061): `SpecBackfiller` now detects existing `.cursor/rules/project.mdc`, `CLAUDE.md`, `.windsurfrules`, `.antigravity/rules.md`, and `.claude/skills/specpilot-project/SKILL.md` by filesystem presence; mandate-bearing IDE files are checked against `MD_MANDATES` and receive an appended backfill block for missing mandates; Cowork SKILL.md is structural-check only and reports `action='stale'` with a regeneration hint instead of auto-patching; `BackfillResult.ideFiles` and CLI display support added; 15 new tests, 129 → 144 total.
- **`specBackfiller.test.ts`** (CD-girishr-003/CS-060): new 7th test suite covering all backfiller logic that shipped without tests in CS-055/CS-057 — `backfillProjectYaml()` (fingerprint detection, 3 insertion strategies: after last MANDATE line / under `critical:` key / appended block; skipped/updated/missing paths), `backfillCopilotInstructions()` (file absent → created; all mandates present → skipped; partial → appends backfill block), `backfillTasksMd()` (devPrefix convention line + Multi-Dev Notes section; ordering check; dry-run guard), `ensureDevPrefix()` / `writeDevPrefix()` (inserts `team:` block after `license:` line; inserts inside existing `team:` block without duplicating key), `readContributorsFirst()` (inline array / block list / fallback); dry-run for all three targets; 24 new tests, 105 → 129 total.

## [1.6.7] - 2026-05-01

### Changed

- **Remove Kiro IDE support** (CD-123): Kiro was never shipped (all settings keys were aspirational/undocumented); dropped from `ideConfigGenerator.ts` (`IDE_OVERRIDES` + `IDE_DIRS`), `init.ts` choices, `docs/GUIDE.md`, `README.md`, and all `.specs/` files; BL-032 (Kiro steering file) removed from backlog.

## [1.6.6] - 2026-04-26

### Changed

- **`CLAUDE.md` router for Cowork** (CD-girishr-002/CS-059): `specpilot init` with IDE = Cowork now generates a project-root `CLAUDE.md` instead of `.github/copilot-instructions.md`; file is intentionally lean — critical mandates inline + ordered pointer list to `.specs/` files and `.claude/skills/specpilot-project/SKILL.md` + Re-Anchor footer; existing-file handling mirrors `copilot-instructions.md`: `[o]verwrite / [a]ppend / [s]kip` with prompts, auto-skip + yellow warning with `--no-prompts`; `generateClaudeMd()`, `buildClaudeMd()`, `buildClaudeMdSection()` added to `IdeConfigGenerator`; `'cowork'` case added to `generateAiContextFile()`; 3 new tests (102 → 105); closes BL-023 and BL-028.
- **IDE-routed AI context files** (CD-girishr-001/CS-058): `specpilot init` now generates the IDE-native AI context file instead of always generating `.github/copilot-instructions.md`; Cursor → `.cursor/rules/project.mdc` (YAML front-matter with `alwaysApply: true` + mandates body); Windsurf → `.windsurfrules` (plain markdown, project root); Antigravity → `.antigravity/rules.md` (plain markdown); VSCode and Codex continue to generate `.github/copilot-instructions.md`; `generateAiContextFile()` method added to `IdeConfigGenerator` routing to three new private helpers (`generateCursorRules`, `generateWindsurfRules`, `generateAntigravityRules`); `specGenerator.ts` updated to call `generateAiContextFile()` instead of the unconditional `generateCopilotInstructions()` call; closes BL-027 and BL-031.
- **Branch warning for `specpilot archive`** (CD-120/CS-054): before archiving, `archiveCommand()` detects the current git branch via `execSync('git rev-parse --abbrev-ref HEAD')`; if not `main` or `master`, prints a yellow warning and prompts `Continue? [y/N]`; declining aborts with no file changes; `--force` flag bypasses the prompt; git detection failure (non-git repo) is silently ignored; `--force` option added to `archive` command in `cli.ts`.
- **Backfill `tasks.md` devPrefix ID conventions** (CD-121/CS-055): `specpilot backfill` now also patches `planning/tasks.md` for existing projects — reads `team.devPrefix` from `project.yaml`, inserts the `CD-{devPrefix}-###` convention line after the `CS-###` line if absent, and inserts a `## Multi-Dev Notes` callout section before `## Backlog` if absent; `BackfillResult` extended with `tasksMd` field; `backfill.ts` output updated to show all three files.
- **Backfill `team.devPrefix` into `project.yaml` when missing** (CD-122/CS-057): `specpilot backfill` now handles the case where `team.devPrefix` is absent (e.g. projects initialized before CS-051) — reads `contributors[0]` from `project.yaml` as the suggested handle (fallback: `os.userInfo().username`), prompts the user interactively, and writes `team:\n  devPrefix: "{handle}"` into `project.yaml` using text-based insertion before proceeding to patch `tasks.md`; `--no-prompts` accepts the suggestion silently; `BackfillOptions.noPrompts` added; `--no-prompts` flag added to `backfill` CLI command.
- **Lower `specpilot archive` thresholds** (CD-119/CS-056): `planning/tasks.md` now archives when `## Completed` exceeds **25 lines** (was 150); `development/prompts.md` now archives when the file exceeds **100 lines** (was 300); keep sizes reduced to 20 entries and 80 lines respectively; `specValidator.ts` warning thresholds updated to match; Archive Policy text in generated `prompts.md` updated to 100 lines; `cli.ts` archive command description updated; `docs/GUIDE.md` threshold references updated.

## [1.6.5] - 2026-04-25

### Added

- **Mandatory short handle prompt with `devPrefix` ID conventions in generated templates** (CD-118/CS-053): `init.ts` and `add-specs.ts` now prompt with the agreed text explaining that the handle is used as a prefix in task IDs (e.g. `CD-jsmith-001`) and prompt IDs (e.g. `PROMPT-jsmith-001`); accepts GitHub/GitLab/Bitbucket username or any short tag; prompt loops until non-empty when `--prompts` is enabled; `--no-prompts` falls back to `os.userInfo().username`; removed `git config user.name` dependency; generated `tasks.md` template updated: ID conventions now show `CD-{devPrefix}-###` and `PROMPT-{devPrefix}-###`, new `## Multi-Dev Notes` callout added advising pull before appending, prefixed IDs, and archive on default branch only; generated `prompts.md` conventions updated to show prefixed ID examples.
- **Generate `.gitattributes` with `merge=union` for spec files** (CD-117/CS-052): `specpilot init` and `specpilot add-specs` now generate `.gitattributes` at project root with `merge=union` rules for `.specs/development/prompts*.md`, `.specs/planning/tasks.md`, and `CHANGELOG.md`; prevents git merge conflicts when multiple developers append to these files on separate branches; if `.gitattributes` already exists, only the missing lines are appended — existing content is never overwritten; implemented in `IdeConfigGenerator.generateGitAttributes()`, called unconditionally from `SpecGenerator.generateSpecs()`.
- **GitHub username prompt and `devPrefix` in generated `project.yaml`** (CD-116/CS-051): `init.ts` and `add-specs.ts` now prompt `'Enter your GitHub username (used in spec file contributors and as your dev prefix for task/prompt IDs):'` instead of the generic name prompt; default is `git config user.name` (falling back to `'your-username'`); value flows into `contributors: [{{author}}]` front-matter (unchanged pipeline) and is also written as `team.devPrefix` in generated `project.yaml` to namespace task and prompt IDs (e.g. `CD-girishr-001`).
- **`specpilot backfill` command** (CD-115/CS-050): new `src/utils/specBackfiller.ts` uses fingerprint-based detection (not yaml.dump) to find mandates missing from `project.yaml` and `copilot-instructions.md`; text-based insertion preserves all comments, emoji, and formatting; if `copilot-instructions.md` does not exist it is created in full; `src/commands/backfill.ts` prints a per-file result summary; registered in `cli.ts` as `backfill` / alias `bf` with `--dir`, `--specs-name`, `--dry-run`; welcome screen and `--help` aliases line updated; `migrate` description corrected everywhere from "Migrate between spec versions" to "Convert legacy `.project-spec` folder (rarely needed)".

## [1.6.4] - 2026-04-12

### Added

- **Per-command options reference in README and GUIDE.md** (CD-114/CS-045): added `### Per-Command Options` table to `README.md` listing all flags for all 7 commands with a `specpilot <command> --help` pointer; fixed 6 **Options:** sections in `docs/GUIDE.md` to match `cli.ts` ground truth — removed phantom `--prompts, -p` from `init` and `refine`, corrected `--verbose` (no short form `-v`) in `validate` and `list`, added missing `--dir`/`--specs-name` to `init` and `refine`, added missing `--lang`/`--framework`/`--no-prompts` to `add-specs`, added missing **Options:** block to `migrate`.
- **Spec-First review gate mandate for AI changes** (CD-113/CS-049): live `.specs/project/project.yaml`, generated `project.yaml` in `templateEngine.ts`, live `.github/copilot-instructions.md`, and generated copilot instructions in `ideConfigGenerator.ts` now require the AI to read relevant `.specs/` files, update affected specs first, present a **Spec Report**, and wait for explicit developer `yes, proceed` before touching code or non-spec files; generation tests expanded accordingly.
- **Handle existing `copilot-instructions.md` during `specpilot add-specs`** (CD-110/CS-047): `generateCopilotInstructions()` in `ideConfigGenerator.ts` now checks whether `.github/copilot-instructions.md` already exists; if absent, writes the full file as before; if present with `--no-prompts`, auto-skips and prints a warning with the SpecPilot mandates block for manual merging; if present with prompts enabled, asks the user `[o]verwrite / [a]ppend / [s]kip`; overwrite replaces the file, append adds a `## SpecPilot Mandates` section; `generateSpecs()` in `specGenerator.ts` accepts a new `noPrompts` option and forwards it; `add-specs.ts` passes `!options.prompts`; 5 new tests added (96 → 101 total).
- **Actionable guidance after `specpilot validate` failure** (CD-108): when validation fails, a `📋 AI Fix Prompts` block is printed with copy-pasteable prompts for each content-level issue (mandate check, cross-reference gaps, missing front-matter); developers paste these directly to their AI assistant for safe, format-preserving fixes.
- **Two-phase `specpilot validate` output** (CD-110): Phase 1 (missing files) shows only the `--fix` hint with "re-run after for content guidance" — AI prompts suppressed; Phase 2 (all files present, content issues only) shows only AI prompts — `--fix` hint suppressed; the two are never shown simultaneously, removing the "which do I run?" ambiguity.
- **Security files created with full starter templates by `--fix`** (CD-109): `specpilot validate --fix` now writes `security/threat-model.md` and `security/security-decisions.md` with proper YAML front-matter, labelled sections (SEC-001.1–SEC-004, ADR-001/002), and structured [TODO] placeholders; also emits AI fix prompts guiding the user to fill in attack surface, real threats, and ADR decisions based on their actual codebase.

### Fixed

- **`specpilot validate` never showing content guidance after `--fix`** (CD-111/BUG-003): when `--fix` created missing files and re-validation passed, the AI fill-in prompts for newly created files (e.g. security starters) were silently discarded; `validate.ts` now captures the pre-fix prompts, merges them with any new prompts from re-validation, and always displays them after `--fix` — either as "Next step — fill in the newly created files" (success path) or "content guidance for your AI assistant" (still-failing path).
- **`specpilot validate` false-positive mandate errors** (CD-108): broadened mandate detection from an over-strict regex to a simple `/mandate/i && /prompts/i` per-rule check — eliminates spurious "Missing MANDATE" errors when the mandate is present but worded differently.
- **`specpilot validate` cross-reference errors no longer fail validation** (CD-108): filename-presence checks are advisory — downgraded from errors to warnings; fix prompts generated instead of blocking validation.
- **`specpilot validate` now checks `security/` subfolder** (CD-108): `security/threat-model.md` and `security/security-decisions.md` added to `requiredFiles`; both missing files are auto-creatable via `--fix`.
- **`specpilot validate --fix` `add-mandates` path no longer rewrites `project.yaml`** (CD-108): `yaml.dump()` serialisation destroyed comments and emoji — replaced with an AI fix prompt instead.

## [1.6.3] - 2026-03-30

### Fixed

- **`ERR_REQUIRE_ESM` crash on startup** (BUG): chalk v5+ is ESM-only and incompatible with the CommonJS build; downgraded `chalk` dependency from `^5.6.2` to `^4.1.2` (last CommonJS-compatible release). All chalk API usage (`chalk.green`, `chalk.blue`, etc.) is identical between v4 and v5 — no source changes required.

## [1.6.2] - 2026-03-22

### Fixed

- **README Project Structure tree updated to include `security/` subfolder** (docs): `threat-model.md` and `security-decisions.md` entries added; tree now reflects the full generated `.specs/` folder structure introduced in v1.6.0.

## [1.6.1] - 2026-03-18

### Added

- **Document command aliases in README and GUIDE.md** (CD-104/CS-044): added aliases tip blockquote below the Commands table in `README.md` listing all 7 aliases with an example; added matching aliases table in `docs/GUIDE.md` after the `## Commands Reference` heading.
- **Aliases in welcome screen and `--help` output** (CD-105/CS-046): `displayWelcome()` in `logger.ts` now shows an Aliases line listing all 7 short forms; tip text updated to reference per-command `--help`; `.addHelpText('after', ...)` added to `cli.ts` printing aliases table and per-command options note.

## [1.6.0] - 2026-03-17

### Added

- **`security/` subfolder generated during `specpilot init`** (CD-103/CS-033): `generateAll()` in `specFileGenerator.ts` now creates `security/threat-model.md` and `security/security-decisions.md` starter templates with YAML front-matter and ADR-style placeholder sections; `security/` mkdir added to `specGenerator.ts` subfolders; dry-run list in `init.ts` updated (+3 entries); `specTreePrinter.ts` updated with 2 new entries; 2 new tests added (96 total).

## [1.5.1] - 2026-03-16

### Added

- **Rename `specify` command to `refine`** (CD-102/CS-043): `src/commands/specify.ts` renamed to `src/commands/refine.ts`; exported function renamed `specifyCommand` → `refineCommand`; interface `SpecifyOptions` → `RefineOptions`; command registered as `refine` (alias `ref`) in `cli.ts` with updated description; welcome screen, generated `docs.md` template, README, `docs/GUIDE.md`, and all `.specs/` reference files updated to use `refine`.
- **Post-init `.specs/` tree display** (CD-101/CS-041): After `specpilot init` and `specpilot add-specs` success, the generated `.specs/` folder is now displayed as a tree with one-line descriptions for each file. Shared helper `src/utils/specTreePrinter.ts` provides hardcoded `SPEC_ENTRIES` list and `getSpecTreeLines(specsName)` function; called from `Logger.displayInitSuccess()` in `logger.ts`.
- **`specpilot init --dry-run` flag** (CD-100/CS-034): `initCommand()` now accepts `--dry-run`; when set, skips all interactive prompts and file creation — prints the full list of files and directories that would be created (14 files, 9 dirs) and exits cleanly without writing anything. Option registered in `cli.ts`.
- **Archive guidance in generated `prompts.md`** (CD-099/CS-031): `generatePromptsMd()` in `specFileGenerator.ts` now includes a `## Archive Policy` section instructing users to run `specpilot archive` when the file exceeds 300 lines; explains that older entries move to `prompts-archive.md` automatically and `--dry-run` is available; no stub file generated during init.
- **`specpilot archive` command** (CD-098/CS-038): New `SpecArchiver` class (`src/utils/specArchiver.ts`) archives `development/prompts.md` when > 300 lines (moves older entries to `prompts-archive.md`) and `planning/tasks.md` Completed section when > 150 lines (moves to `tasks-archive.md`); archived blocks are appended with a timestamped header; `--dry-run` flag previews changes without writing; command registered in `cli.ts` with alias `ar`; welcome screen updated.
- **`specpilot validate` stale-date warnings** (CD-096/CS-029): `validateStaleDates()` added to `SpecValidator` — warns when any `.md` spec file has a `lastUpdated` front-matter field older than 90 days.
- **`specpilot validate` line-limit warnings** (CD-096/CS-029): `validateLineLimits()` added to `SpecValidator` — warns when `development/prompts.md` exceeds 300 lines or the `## Completed` section of `planning/tasks.md` exceeds 150 lines, with a hint to run `specpilot archive`.
- **Jest types added to `tsconfig.json`** (CD-096): Added `"jest"` to the `types` array so `ts-jest` can resolve `describe`/`it`/`expect` globals in test files.

### Fixed

- **`specpilot validate` crash on nested `rules` in `project.yaml`** (CD-097): `flattenRules()` helper added to `SpecValidator` — flattens nested `critical`/`process`/`preferences` rule sub-arrays into a single list before mandate checks; fixes `rules.some is not a function` error and the spurious "should have a rules section" warning.

- **`## Assumptions` section added to generated `requirements.md`** (CD-093/CS-027): `generateRequirementsMd()` in `specFileGenerator.ts` now includes a labelled `## Assumptions` section with 3 placeholder items and a reviewer note; placed before `## Cross-References`.
- **`## Assumptions` section added to generated `architecture.md`** (CD-094/CS-028): `getArchitectureTemplate()` in `templateEngine.ts` now appends a `## Assumptions` section with 3 placeholder items and a reviewer note; placed after `## Monitoring and Observability`.
- **`.specs/security/` folder added** (CD-095/CS-020): New `threat-model.md` documents 3 threats — path traversal [SEC-002.1], template injection [SEC-002.2], supply chain [SEC-002.3] — with impact/likelihood/mitigation tables. New `security-decisions.md` records 4 ADR-style decisions (allowlist regex, no network calls, Handlebars auto-escaping, minimal dependencies). Updated `architecture.md` (v1.7, ARCH-004.13) and `docs.md` (v1.4, `security/` added to protected structure).

### Fixed

(CD-089/CS-042): TypeScript frameworks now lists React, Express, Next.js, Nest.js, Vue, Angular (removed non-existent CLI entry); JavaScript section corrected to React + Express only with a note that no framework prompt is shown; Python section corrected to FastAPI, Django, Flask, Streamlit (removed `Data Science` which was not a valid framework value); `specify` command signature changed from `<desc>` to `[desc]` to reflect optional argument.

- **Welcome screen missing commands fixed** (CD-090): `migrate` and `specify` added to hardcoded Available Commands list in `displayWelcome()` in `logger.ts`; fixed missing space in `add-specs` entry; commands now listed in logical usage order with consistent column alignment.
- **README Project Structure expanded** (CD-091): Tree now shows all 10 generated files with inline descriptions; redundant `### Key Files` bullet list removed.
- **Cross-document doc audit** (CD-092): `docs/GUIDE.md` Project Structure tree updated to match README (alphabetical folders, all 10 files, `copilot-instructions.md` note added); `docs/GUIDE.md` framework tables corrected (TypeScript: added Nest.js/Vue/Angular, removed CLI; JavaScript: React+Express only with note; Python: replaced `Data Science` with Flask and Streamlit); `.specs/development/docs.md` pre-commit checklist and Protected Structure section now reference `.github/copilot-instructions.md`.

## [1.5.0] - 2026-03-08

### Changed

- **`project/requirements.md` rewritten to v1.3** (CD-080): Restructured into sub-sections (REQ-002.A–F). Added `specify` command with diff/confirmation [REQ-002.A.6], project context prompts during `init` [REQ-002.B.1], `--no-prompts` flag [REQ-002.B.6], IDE settings generation for VSCode/Cursor/Windsurf/Kiro/Antigravity [REQ-002.E.2], cloud agent config for Cowork/Codex [REQ-002.E.3], dual onboarding prompts [REQ-002.F.4], new `## Assumptions [REQ-004]` section, path-injection NFR [REQ-003.4].
- **`prompts.md` archived and trimmed** (CD-081): Manually archived `prompts.md` (447 lines) to new `prompts-archive.md`; active file trimmed to 56 lines; 300-line Archive Policy section added; `tasks.md` Completed header updated with 150-line limit guidance.
- **`architecture.md` Assumptions section added** (CD-082): New `## Assumptions [ARCH-007]` section (v1.5 → v1.6) — Node.js ≥16 + CommonJS [ARCH-007.1], cross-platform paths [ARCH-007.2], offline-only [ARCH-007.3], single root [ARCH-007.4], write access [ARCH-007.5], tsc to dist/ [ARCH-007.6], no global state [ARCH-007.7].
- **CS-022 and CS-030 closed as won't do** (CD-083/084): `status: active` on all files adds no value since all files are currently active; field will be used organically when files become deprecated or archived.
- **“Read before describe” mandate added** (CD-085/CS-039): Added critical mandate to `copilot-instructions.md`, live `project.yaml`, and generated `project.yaml` template in `templateEngine.ts` — AI must never describe or quote file contents without first reading the file via a tool call; if not read, must say so explicitly.
- **"Never implement unless asked" mandate added** (CD-086/CS-040): Added as critical rule #7 to `copilot-instructions.md`, live `project.yaml`, and generated `project.yaml` template in `templateEngine.ts` — AI must not write code or make file changes unless developer explicitly asks; if next step seems obvious, ask first.
- **Generated `api.yaml` is now a dual-section template** (CD-087/CS-023): `generateApiYaml()` in `specFileGenerator.ts` rewritten to produce a generic spec with both a `cli:` section and an OpenAPI 3.0.3 `paths:` section; each section is preceded by a comment instructing the user to remove whichever does not apply; replaces the previous minimal OpenAPI-only stub.
- **Generated `api.yaml` expanded to three-option template** (CD-088): Added OPTION C (GraphQL) with `endpoint`, `queries`, and `mutations` stubs; added top-level `project` and `version` fields; OPTION A (REST API), OPTION B (CLI), OPTION C (GraphQL) — each labelled and independently removable.

### Added

- **`.github/copilot-instructions.md` generation** (CD-076): New `generateCopilotInstructions()` in `ideConfigGenerator.ts`; called from `specGenerator.ts` unconditionally for every `specpilot init` regardless of IDE choice; contains project name/stack, 5 critical mandates, process mandates, and a Re-Anchor note; 1 new test added (73 total)
- **Re-Anchor Prompt in generated `prompts.md`** (CD-077): `## Re-Anchor Prompt` section added to `generatePromptsMd()` template — a ready-to-paste prompt that re-establishes all critical rules for AI agents mid-session (triggered when session > 1 hour / > 20 exchanges)

### Changed

- **Tiered `project.yaml` rules** (CD-074): Generated `project.yaml` rules restructured from flat list into three tiers: 🔴 critical (git/deploy gates, .specs immutability, proactive spec-update), 🟡 process (spec-first, context, tracking, prompts), 🟢 preferences (best practices, TDD, semver). npm-specific deploy mandate replaced with generic "Never deploy, publish, or release."
- **`docs.md` template corrected** (CD-073): `generateDocsMd()` rewritten with correct front-matter schema and CLI subcommands (`list`, `validate`, `migrate`, `specify`)

### Removed

- **`project/project-plan.md` removed from generated `.specs/` structure** (CS-024):
  - `generateProjectPlanMd()` removed from `specFileGenerator.ts`
  - File no longer generated during `specpilot init` or `specpilot add-specs`
  - Removed from `specValidator.ts` required files list (9 required files, down from 10)
  - Removed cross-reference validation rule for `project-plan.md`
- **`blessed` dependency removed** (FIX-001): Unused terminal UI library removed from `package.json`
- **`TemplateRegistry` class removed** (FIX-013): Template catalog inlined as static `TEMPLATES` constant in `list.ts`; empty `src/templates/` directory deleted
- **`spec-update-template.md` generation removed** (FIX-015): Removed `generateSpecUpdateTemplateMd()` and its call from `specFileGenerator.ts`

### Added

- **ESLint linting** (FIX-010): Added `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`; created `.eslintrc.json`; updated `lint` script in `package.json`
- **72 tests across 5 suites** (FIX-014): Added `specValidator.test.ts` (17), `projectMigrator.test.ts` (11), `projectDetector.test.ts` (17), `templateEngine.test.ts` (24); total now 72
- **Diff preview and confirmation for `specify` command** (FIX-019): Collects all pending changes, shows line-level diff, prompts for confirmation before writing; `--no-prompts` flag skips confirmation
- **Dual onboarding prompts** (FIX-018): `init` (new project) bakes 4 context-question answers into a planning-focused prompt; `add-specs` (existing project) uses a codebase-analysis prompt
- **`src/utils/frameworks.ts`** (FIX-006): Extracted shared `getFrameworksForLanguage()` utility from duplicated code across `init.ts` and `add-specs.ts`

### Changed

- **`roadmap.md` template expanded** (CS-024): Merged charter content (objectives, success criteria, risks) from removed `project-plan.md` into `roadmap.md`
- **`agentConfigGenerator.ts`** (CS-024): Codex Instructions template updated to reference `planning/roadmap.md` instead of `project/project-plan.md`
- **`specGenerator.ts` refactored into 4 files** (FIX-011): Split 1,298-line file into `specFileGenerator.ts` (642 lines), `ideConfigGenerator.ts` (137 lines), `agentConfigGenerator.ts` (238 lines); `specGenerator.ts` is now an 81-line coordinator
- **IDE settings deduplicated** (FIX-012): Single `getBaseSettings()` + per-IDE `IDE_OVERRIDES` map in `ideConfigGenerator.ts`; all IDE-specific override keys marked `// ASPIRATIONAL`
- **`tasks.md` template updated** (CS-032): Generated file now uses `BL-###` / `CS-###` / `CD-###` ID convention with numbered list format, ID stability notes, and archive guidance

### Fixed

- **`lowercase` Handlebars helper** (FIX-002): Was calling `str.slice(1)` instead of `str.toLowerCase()`
- **Hardcoded version string in `logger.ts`** (FIX-003): Welcome screen now reads version dynamically from `package.json`
- **Hardcoded `lastUpdated` date in spec generator** (FIX-004): Now uses `new Date().toISOString().split('T')[0]` instead of a static date
- **Unused `Command` imports** (FIX-005): Removed from all 6 command files (`init.ts`, `validate.ts`, `migrate.ts`, `list.ts`, `specify.ts`, `add-specs.ts`)
- **Project name validation** (FIX-007): Replaced denylist with allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` to prevent Handlebars template injection
- **Migration file paths** (FIX-008): Corrected subfolder paths in `projectMigrator.ts` (e.g. `architecture/architecture.md`, `project/requirements.md`)
- **Duplicate `[1.2.2]` CHANGELOG entries** (FIX-009): Merged into single entry

## [1.4.0] - 2026-02-07

### Added

- **IDE Workspace Settings Generation** (CS-008): Complete support for 5 AI-first code editors
  - VSCode configuration with Copilot integration settings
  - Cursor IDE settings with cursor-specific AI context configuration
  - Windsurf IDE workspace settings with windsurf-specific AI features
  - Kiro IDE configuration with kiro-specific context awareness
  - Antigravity IDE settings with antigravity-specific AI integration
  - IDE selection prompt during project initialization
  - Automatic generation of IDE-specific workspace folders for code and .specs
  - IDE-specific `extensions.json` with workspace recommendations
  - Workspace folder configuration for seamless .specs integration in AI context

### Changed

- Enhanced project initialization to prompt user for preferred AI IDE
- Improved spec generator with IDE-specific configuration routing

## [1.3.0] - 2025-11-07

### Added

- **Gemini-Style Graphical CLI Interface**: Complete visual overhaul with ASCII art logos
  - Added `blessed` dependency for advanced terminal UI capabilities
  - Implemented comprehensive logo display system in `logger.ts`
  - Added ASCII art SpecPilot logo with vertical layout for professional presentation
  - Integrated logos across all CLI commands (init, validate, list, migrate, specify, add-specs)
  - Strategic logo placement before prompts and results for enhanced user experience

### Changed

- **CLI User Experience**: Upgraded from basic text output to branded, graphical interface
  - All commands now display SpecPilot logo before key interactions
  - Improved visual consistency across the entire CLI application
  - Enhanced professional appearance similar to Gemini Code interface

### Fixed

- **Package.json Formatting**: Added missing newline at end of file for proper formatting

## [1.2.2] - 2025-10-27

### Added

- Initial release of SpecPilot SDD CLI
- **Core Commands**:
  - `specpilot <project>` - Initialize new SDD projects
  - `specpilot validate` - Validate specifications and mandates
  - `specpilot migrate` - Migrate from complex to simplified structure
  - `specpilot list` - Show available templates
- **Template System**:
  - TypeScript templates (Generic, React, Express, Next.js, CLI)
  - Python templates (Generic, FastAPI, Django, Data Science)
  - Java templates (Generic, Spring Boot)
  - Framework-specific content generation

- **Specification Files Generation**:
  - Simplified 8-file `.specs/` structure
  - `project.yaml` - Configuration + rules + AI context
  - `architecture.md` - Architecture decisions + patterns
  - `requirements.md` - Functional/non-functional requirements
  - `api.yaml` - OpenAPI specifications
  - `tests.md` - Test strategy + coverage plans
  - `tasks.md` - Task tracking (backlog/sprint/completed)
  - `context.md` - Development memory + learnings
  - `prompts.md` - **MANDATED** AI interaction tracking
  - `docs.md` - Development guidelines + deployment

- **Key Features**:
  - Automatic prompt tracking mandate enforcement
  - Migration from complex to simplified structures
  - Validation with auto-fix capabilities
  - Comprehensive template system
  - Production-ready project initialization

### Technical Details

- Built with TypeScript and Node.js
- Uses Commander.js for CLI functionality
- Handlebars for templating
- Comprehensive test suite with Jest
- NPM-ready packaging

### Breaking Changes

- None (initial release)

### Fixed

- **Specify Command**: Fixed file path references to use correct subfolder structure
  - Updated project.yaml path from `.specs/project.yaml` to `.specs/project/project.yaml`
  - Updated requirements.md path to `.specs/project/requirements.md`
  - Updated context.md path to `.specs/development/context.md`
  - Updated prompts.md path to `.specs/development/prompts.md`
  - Resolves "project.yaml not found" error when running specify in valid projects
- **CS-012**: Enhanced migrate command with better error messages and guidance
  - Added migration necessity detection to prevent confusion
  - Provides helpful suggestions when migrate is used incorrectly
  - Detects when target structure already exists
  - Clear documentation on when to use init vs add-specs vs migrate

### Changed

- **Documentation**: Updated CHANGELOG.md with missing version entries (1.2.1, 1.2.0, 1.1.4)
- **README**: Fixed unclosed code block causing rendering issues in documentation

## [1.2.1] - 2025-10-26

### Added

- **AI Onboarding Enhancement**: Comprehensive AI onboarding prompt in generated `.specs/prompts.md`
- **Project Documentation**: Added `.specs/README.md` with detailed onboarding guidance for AI assistants
- **Enhanced CLI Messages**: Improved success messages with detailed next steps and project information

### Changed

- **Onboarding Experience**: CLI now provides comprehensive guidance for new users and AI assistants
- **Documentation**: Enhanced project specs with operational mandates and AI interaction guidelines

### Fixed

- **README.md Rendering**: Fixed unclosed code block causing rendering issues in documentation

## [1.2.0] - 2025-10-26

### Added

- **AI Onboarding Prompt**: Standardized AI onboarding prompt added to all generated `.specs/prompts.md` files
- **Enhanced Project Guidance**: Improved CLI success messages with detailed next steps for specification-driven development

### Changed

- **Onboarding Process**: Streamlined first-time user experience with comprehensive AI assistant guidance
- **Documentation Standards**: Updated all generated specs to include AI interaction best practices

## [1.1.4] - 2025-10-25

### Added

- **Project Onboarding Documentation**: Added `.specs/README.md` with comprehensive AI prompt guidance
- **Enhanced AI Integration**: Improved prompts.md with standardized onboarding content for AI assistants

### Changed

- **CLI Success Messages**: Enhanced with detailed next steps and project structure guidance
- **Documentation**: Improved AI assistant integration documentation

## [1.1.3] - 2025-10-18

### Added

- **CS-010**: JavaScript language support - Added JavaScript templates and detection for Node.js projects
- **AI Onboarding**: Added AI onboarding prompt to prompts.md for new projects
- **CS-011**: Enhanced folder structure display - Architecture.md now shows nested directory trees instead of flat lists

### Changed

- **Project Detection**: Improved language detection to distinguish between TypeScript and JavaScript projects
- **Template Engine**: Added JavaScript-specific templates alongside existing TypeScript templates

### Fixed

- **Architecture Display**: Folder structures now display as proper nested trees with indentation
- **Language Support**: JavaScript projects are now properly detected and templated

## [1.1.2] - 2025-10-12

### Added

- **CS-004**: Existing .specs folder detection - Prevents duplicate project initialization with informative error messages
- **CS-005**: Developer name prompting - Prompts for developer name during init and replaces "Your Name" placeholders in generated specs
- **CS-009**: Enhanced `add-specs` command - Adds .specs folder to existing projects with intelligent codebase analysis
- **Project Detector**: Auto-detects language/framework from package.json, requirements.txt, setup.py, pyproject.toml
- **Code Analyzer**: Scans codebase for TODOs/FIXMEs, analyzes tests, extracts architecture information
- **Codebase Analysis**: Automatic TODO/FIXME parsing with line numbers and file locations
- **Test Detection**: Identifies test frameworks (Jest, Pytest, Mocha, etc.) and counts test cases
- **Architecture Extraction**: Analyzes project structure, components, and file types

### Changed

- **Git Mandates**: Added project rules requiring developer prompts for all git commit/push operations
- **Init Command**: Now prompts for developer name and displays existing project info if .specs already exists
- **CLI Commands**: Added `add-specs` command (alias: `add`) with options for --no-analysis and --deep-analysis
- **Project Detection**: Defaults to TypeScript for Node.js projects when language cannot be explicitly determined

### Fixed

- Existing project initialization now provides helpful next steps instead of silently failing
- Developer attribution in generated spec files now uses actual developer name
- Language detection improved for JavaScript/TypeScript projects

### Technical Details

- New utilities: `projectDetector.ts`, `codeAnalyzer.ts`
- New command: `src/commands/add-specs.ts`
- Analysis features: TODO parsing, test framework detection, component extraction
- Smart directory exclusion: node_modules, dist, .git, **pycache**, venv

## [1.1.1] - 2025-10-11

### Added

- **CS-009**: Comprehensive metadata conventions and stable ID system
- YAML front-matter metadata headers for all spec files
- Stable ID format for sections and items (REQ-001, ARCH-002, etc.)
- Enhanced spec validation with cross-reference checking
- Complete `.specs/` subfolder structure (project/, architecture/, planning/, quality/, development/)
- Comprehensive documentation in `.specs/development/docs.md`

### Changed

- **README**: Added table of contents, prerequisites, and improved examples
- **Validator**: Updated to handle subfolder structure and validate metadata
- **Templates**: Aligned with current TypeScript/Python support
- **Documentation**: Removed references to unsupported features

### Fixed

- Cross-references now use correct subfolder paths
- Validation properly detects missing files in subfolder structure
- Command examples updated to match actual CLI interface
