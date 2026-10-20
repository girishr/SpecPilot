# SpecPilot

[![npm version](https://img.shields.io/npm/v/specpilot.svg)](https://www.npmjs.com/package/specpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![smithery badge](https://smithery.ai/badge/specpilot/specpilot)](https://smithery.ai/servers/specpilot/specpilot)

SpecPilot is a spec-driven development (SDD) CLI for AI coding agents like Claude Code, Cursor, and ChatGPT. It initializes, validates, and syncs a `.specs/` directory so AI-assisted coding stays grounded in living requirements, architecture, and task specs instead of drifting from the codebase.

![SpecPilot CLI demo](docs/demo.gif)

## MCP server

Prefer to stay inside your editor? SpecPilot also runs as a remote MCP server, so
Claude Code, Cursor or Copilot can run the whole onboarding itself - answering what
it can infer from your repo and asking you only the rest.

```bash
claude mcp add --transport http specpilot https://init.specpilot.dev/mcp
```

Then ask your agent: *"Onboard this project with SpecPilot"*.

For Cursor, VS Code and other clients, add it as an HTTP (streamable) server:

```json
{
  "mcpServers": {
    "specpilot": {
      "type": "http",
      "url": "https://init.specpilot.dev/mcp"
    }
  }
}
```

No install, no API key. Full setup notes: <https://specpilot.dev/mcp-setup>

`specpilot serve` also serves a local MCP endpoint, so your AI IDE can read this machine's specs, add or move tasks and set up a folder: see [Local MCP endpoint](#local-mcp-endpoint-specpilot-serve) below.

## Quick Start

```bash
# Install globally
npm install -g specpilot

# Create a new project
specpilot init my-project --lang typescript --framework react

# Add specs to existing project
cd existing-project
specpilot add-specs

# Validate specifications
specpilot validate
```

### 🚀 Next Steps to Populate Your Specs with AI

After creating a project, follow these steps to populate your specifications using AI:

1. **Open the generated guide**: Check `.specs/README.md` for full guidance
2. **Copy the onboarding prompt**: Use the prompt from `.specs/development/onboarding.md`
3. **Paste into your AI agent**: ChatGPT, Claude, or other AI assistants
4. **Review generated spec files**: Examine the AI-generated requirements and architecture

This AI-assisted approach ensures comprehensive, high-quality specifications tailored to your project needs.

## Commands

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `init <name>`           | Initialize new SDD project                                        |
| `init <name> --dry-run` | Preview files that would be created without writing               |
| `add-specs`             | Add specs to existing project                                     |
| `validate`              | Validate specification files                                      |
| `archive`               | Archive oversized `prompts.md` / `tasks.md` entries               |
| `backfill`              | Backfill missing mandates, slash commands & the Claude Code skill     |
| `list`                  | Show available templates                                          |
| `migrate`               | Convert legacy `.project-spec` folder (rarely needed)             |
| `refine [desc]`         | Refine project specifications                                     |
| `serve [folders...]`    | Serve a local web UI over the `.specs/` of this project, or of each folder named, plus the projects remembered in `~/.specpilot/projects.json` (every project you serve or open; reopened at startup when they have `.specs/`); in a folder without `.specs/` and with nothing remembered, with no project open until you open one from the page (task moves, new tasks, Regenerate All for command files, the Setup view of a folder without `.specs/`, unless `--read-only`) |

> **Tip — command aliases:** All commands have a short alias you can use instead of the full name.
> `init` → `i` &nbsp;·&nbsp; `validate` → `v` &nbsp;·&nbsp; `migrate` → `m` &nbsp;·&nbsp; `list` → `ls` &nbsp;·&nbsp; `refine` → `ref` &nbsp;·&nbsp; `archive` → `ar` &nbsp;·&nbsp; `add-specs` → `add` &nbsp;·&nbsp; `backfill` → `bf`
> Example: `specpilot i my-app` is identical to `specpilot init my-app`.

### Per-Command Options

| Command     | Options                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `init`      | `--lang` · `--framework` · `--dir` · `--specs-name` · `--no-prompts` · `--dry-run` |
| `validate`  | `--fix` · `--verbose`                                                               |
| `migrate`   | `--from` · `--to` · `--backup`                                                      |
| `list`      | `--lang` · `--verbose`                                                              |
| `refine`    | `--update` · `--no-prompts`                                                         |
| `archive`   | `--dry-run` · `--force`                                                             |
| `add-specs` | `--no-analysis` · `--no-prompts`                                                    |
| `backfill`  | `--dir` · `--specs-name` · `--dry-run` · `--no-prompts`                             |
| `serve`     | `--port` · `--poll` · `--read-only` · `--open` · `--no-mcp` · `--stop`              |

> Run `specpilot <command> --help` for full flag descriptions and default values.

### Examples

```bash
# Initialize with specific language/framework
specpilot init api --lang python --framework fastapi

# Preview files that would be created without writing anything
specpilot init api --dry-run

# Refine specifications
specpilot refine "REST API for user management" --update

# Validate with auto-fix
specpilot validate --fix
```

## specpilot serve

Serve a local web UI over a project's `.specs/`, where you can also move tasks between Backlog and Current Sprint, add new ones, bring SpecPilot's command files up to date, set up `.specs/` in a folder that has none yet, and open more projects. With no folders it serves the project you run it from (the folder that contains `.specs/`); name one or more folders to serve those instead, all from one server, or open them later from the page. Press Ctrl+C to stop.

```bash
specpilot serve                  # this project, at http://127.0.0.1:4321
specpilot serve --port 5000 --open
specpilot serve ../api ../web    # two projects on one server; switch in the left rail
specpilot serve ../new-project   # no .specs/ there yet: the page sets it up (or `specpilot serve .`)
specpilot serve --stop           # stop the server on port 4321 from another terminal (--port for another)
```

| Option        | Default | Description                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------------- |
| `--port <n>`  | `4321`  | Port to listen on (127.0.0.1 only)                                                       |
| `--poll <ms>` | `1000`  | Change-detection interval in ms (minimum 250); polling runs only while a page is open    |
| `--read-only` |        | No task moves, no new tasks, no Setup view steps, no opening folders and no registry: the UI only reads, with no drag handles, no Add or Archive buttons and no write routes |
| `--open`      |         | Open the UI in the default browser                                                       |
| `--no-mcp`    |         | Leave out the local MCP endpoint at `/mcp` (served by default for your AI IDE, with the Connect Your AI IDE card on Home and in the Setup view; below). `--mcp` is still accepted and changes nothing |
| `--stop`      |         | Stop the SpecPilot server running on this machine on `--port` (default 4321), as Ctrl+C would; takes no other option. A `--read-only` server cannot be stopped this way: press Ctrl+C in its terminal |

- **Several projects**: name any folders; one without `.specs/` is served too and shows the Setup view (below). They are numbered in command-line order from 0 (`../api` is project 0, `../web` is project 1), and that number is the `?project=<n>` on the server's `/api/` routes and the `#1/...` at the start of a page link for any project after the first (no number means project 0). Each project keeps its own tasks, files and live reload; a move changes only that project's `tasks.md`. Folders opened from the page (below) get the next numbers; a number never changes while the server runs, and one server holds at most 20 projects.
- **Quit**: the power button at the foot of the left rail stops the server after you confirm, as Ctrl+C or `specpilot serve --stop` would (a running clone is stopped and cleaned up first). The page then says SpecPilot has stopped; other open pages simply stop updating. Not shown with `--read-only`.
- **Task moves**: drag a row, use `Alt+Up/Down` to reorder and `Alt+Left/Right` to move between Backlog and Current Sprint, or open a card's menu (right-click, the `⋯` button on the card, or `Shift+F10`) and pick `Move to <lane>` (its end, or `<lane>, top`), `Move up` or `Move down`; the menu also has `Open details` and `Copy ID`. A move changes exactly one line of `.specs/planning/tasks.md` and nothing else, and offers Undo; Completed rows do not move. If the file changed on disk since the page loaded, the move is refused and the page redraws. Start with `--read-only` to turn moves off.
- **Section headings**: when `.specs/planning/tasks.md` lacks `## Backlog`, `## Current Sprint` or `## Completed`, a warning above the lanes names the empty lane, what the file has instead and the fix (edit the file; best ask your AI IDE, so anything that refers to the section follows), with `Open tasks.md in VS Code` and `Copy prompt`; a `## ` heading the board does not know gets a note that its rows are not shown here; a known section that holds its tasks as plain lines or a list instead of a table gets a warning saying the lane shows none of them and how to turn them into a table. Warnings hide for the session into a one-line strip, notes until the headings change. `specpilot validate` warns on the missing ones and `--fix` renames an unambiguous variant.
- **Commands and Skills**: each view lists its files in two groups. Under From SpecPilot are the `specpilot-*` commands whose bytes match a version SpecPilot released (in `.claude/commands/` and `.github/prompts/`) and the `specpilot-project` skill while it is still SpecPilot's own render of your `project.yaml`; everything else is under Yours, including a `specpilot-*` command you edited. Regenerate All, in the From SpecPilot header of Commands, runs what `specpilot backfill` runs for command files, and nothing else: for each IDE whose instruction file is in the project it adds the missing `specpilot-*` commands and updates the unedited ones to the current version, in every IDE's command folder, also the ones the page does not list (`.cursor/commands/`, `.windsurf/workflows/`, `.agent/workflows/`, `.codex/prompts/`). It also refreshes `.claude/skills/specpilot-project/SKILL.md` from `.specs/project/project.yaml` (name, language, framework, platforms, package manager, test framework, repository URL, license) when the skill is still SpecPilot's own, and adds it when missing; a skill you edited, or one rendered from values `project.yaml` no longer holds, is kept with the reason `does not match SpecPilot's render of project.yaml`. Edited files, links, files under a linked folder, your own commands and skills, instruction files and `.specs/` are never written. What it did is shown above the groups as it happened: updated, added, kept with the reason, and the folders the page does not list.
- **New Task**: the `+ Add` button in the header of the Backlog or Current Sprint lane opens a small form for that lane: a description, with the ID the row will get shown above it. SpecPilot adds one row, `| <ID> | <description> |`, at the end of that section's table in `.specs/planning/tasks.md` and changes nothing else in the file. The ID is the next free one: `BL-###` for Backlog, `CS-###` for Current Sprint, one past the highest in use in `tasks.md` and `tasks-archive.md` (only IDs in ID columns and leading tags count, not IDs mentioned in a description; gaps are never filled). The description is written exactly as you typed it, markdown included, with no label or date added; one with a line break, a control character, a `|` or a trailing `\`, or over 4000 characters, is refused with the reason, and what you typed stays in the form. The new row is selected and opened in the details panel. If the file changed on disk since the page loaded, nothing is added and the page redraws. Protected like a task move; off with `--read-only`.
- **Archive oldest Completed rows**: the Completed lane's header has an `Archive` button. It opens a dialog that says what the action does and lists the checks that apply, each with its state: the branch (as `specpilot archive` warns, archive on `main` or `master` after merging) and `## Completed`'s 40-line limit (the `specpilot validate` warning), with how many rows would move. A check that warns has a box to tick, and `Archive` is enabled once every box is ticked. It then does what `specpilot archive` does for that section: the oldest rows move, byte for byte, into a dated block at the end of `.specs/planning/tasks-archive.md`, the newest 20 stay, nothing else in either file changes, and the lane shows what is left. Within the limit you can still archive by ticking the limit check. `prompts.md` is left to `specpilot archive`. Protected like a task move; off with `--read-only`.
- **Setup view**: a folder without `.specs/` (one you name, open from the page or clone) shows the Setup view instead of the other views, and Start a New Project on Home shows it too, with a Project name and a Parent folder (with Browse…). Your AI IDE does the setup: it reads the code, answers what it can, and asks you the rest. The view says how, in three steps: 1 Connect your AI IDE, the config for this server with Copy and a status, `Waiting for a connection` until an IDE connects to `/mcp`, then `Connected · <the IDE's name>`; 2 Tell it what to do, one line to paste into the IDE (`Set up SpecPilot for <folder>`, or `Start a SpecPilot project called <name> in <parent>`); 3 Progress, four rows that follow the IDE's calls (Read the code, Answer the questions, Write the files, Validate). When `.specs/` appears, the page opens the project; there is no Finish button. For a new project, the page checks the name and the parent as you type and remembers `<parent>/<name>` for this run of the server as the one place a new project may be made; nothing is created until your IDE does it, and the folder must be missing or empty. Without MCP the view says so and how to restart. `specpilot add-specs` (in an existing folder) or `specpilot init` (for a new one) asks the same questions in the terminal. The current-directory default is never offered setup (it needs `.specs/` to start; `specpilot serve .` names it). If a setup is interrupted, the next `specpilot serve` removes the `.specpilot-setup-<id>/` folder it left (and only that folder, recognised by its marker file).
- **Home**: the logo at the top of the left rail, the `+` tile below the projects (or the `h` key, or `#home`) shows "Your specs, as a board.", an Open a Project Folder button and your Recent projects (path, last-opened time and, for projects already open, the git branch); click one to open it, or Remove from list to forget it (the folder is not touched). `specpilot serve` starts on the first project's Tasks view (the first folder you named, else the project you opened most recently); in a folder without `.specs/` and with nothing remembered it starts with no project open and shows Home (the terminal says `No .specs/ folder in <folder>`; the folder itself is not served, `specpilot serve .` names it). `--read-only` has no Home, so there a folder without `.specs/` still exits 1.
- **Open a project from the page**: Open a Project Folder on Home opens a sheet (Clone a Repository opens it on its Clone tab); type a folder path (`/Users/you/project` or `~/project`), or click Browse… to pick it in your system's folder dialog (macOS; Linux with `zenity` or `kdialog`; Windows), and Open, and the folder is served alongside the others, with the Setup view if it has no `.specs/`. Folders you open this way are listed under Recent projects next time, remembered in `~/.specpilot/projects.json` (path, last-opened time and a pinned flag, at most 50; the file is created the first time a project is served, and every project you serve or open is added to it). At startup, after the folders you name, the remembered projects that have `.specs/` are reopened, pinned and most recently opened first, up to 20 in all (the terminal says `Reopened <k> remembered projects from ~/.specpilot/projects.json.`); a folder without `.specs/` stays on the list to click, a missing one is skipped, and reopening never changes the file. Remove from list forgets a folder without touching it. Browse… only fills in the path; nothing is opened until you click Open. The Clone tab's Parent folder and the Setup view's Parent folder (Start a New Project) have the same Browse… button, which likewise only fills in the field. Checked on macOS: picking a folder fills the field and Open opens it, and no privacy prompt appears at Browse… or at Open, also for a folder inside `~/Documents`; the Linux and Windows dialogs are not yet checked by hand. The home folder, the root of a drive and folders already open are refused; a `projects.json` that cannot be read is left exactly as it is, and the page and the terminal say so. The request is protected like a task move.
- **Clone a repository from the page**: Clone a Repository on Home (or the Clone tab of the same sheet) asks for a repository URL, a parent folder and a folder name (leave it empty for the repository's name), runs your installed `git clone` and opens the result: on Tasks when the repository has `.specs/`, in the Setup view when it has none. Accepted URLs: `https://host/path`, `git@host:path` and `ssh://host/path`; an https URL must not contain a user name or password (git uses your credential helper and ssh keys, as in a terminal), so for Azure DevOps drop the `org@` part. Submodules are not cloned, and there is no branch or depth option. The target folder must not exist or must be empty; the parent follows the rules of Start a New Project. As you type or paste the URL, Folder name is filled with the repository's name until you type one yourself. While the clone runs the sheet shows the elapsed time and, once git reports it, git's stage and percentage (`Receiving objects 42% · 0:13`, then `Resolving deltas` and `Updating files`); until then, or when git reports none, a moving bar. git is never asked a question it would wait on: a repository that needs a login it cannot get fails with git's own message, its last `fatal:` line with the line before it, for example `Host key verification failed. fatal: Could not read from remote repository.`, and a clone is stopped after 10 minutes. The page cannot accept an ssh host key for you: for a host you have never connected to, run `ssh -T git@host` once in a terminal, then clone again. Your ssh setup is used as it is; SpecPilot sets no ssh option on macOS and Linux. One clone runs at a time. A clone that fails, is stopped, or is cancelled (Cancel, Escape, closing the tab, Ctrl+C) removes what it downloaded; on Ctrl+C the server waits at most 5 seconds for that. Needs `git` on your `PATH`. This is the only time SpecPilot starts another program for the page and the only time it uses the network. On Windows ssh is put in batch mode (unless you have set `GIT_SSH_COMMAND`, `GIT_SSH` or `core.sshCommand`), and a stopped clone can leave git's helper process running until it ends by itself, and the clean-up can then fail on a file that helper still holds; the message says so.
- **Open in VS Code**: the icon at the top right of every project view (and beside each Recent project on Home whose folder still exists) is a `vscode://file/` link to that project's folder. Your browser hands it to VS Code, which asks before opening it; SpecPilot starts nothing itself. Nothing happens if VS Code is not installed. A task's details panel has Open tasks.md in VS Code, which opens `.specs/planning/tasks.md` at that task's line; VS Code puts a file in the window it picks (by default the last one you used), which may not be this project's. It opens VS Code only, not Insiders or another editor. The file view of every `.specs/` file and the details panel of every Instructions, Commands and Skills file also have Open in VS Code, which opens that file.
- **Open in AI IDE**: the sparkle icon beside Open in VS Code shows a short menu when it has something to offer. Open in Cursor (`cursor://file/`) appears when the project has `.cursor/rules/specpilot.mdc`, the file SpecPilot writes for Cursor. While `.specs/development/onboarding.md` exists, Send onboarding prompt to Cursor puts the prompt into Cursor's chat through Cursor's own link (it stays on this machine; Cursor waits for you to confirm, and uses the window it has in front, so open the project in Cursor first), and Copy onboarding prompt copies it for Claude Code, which has no link to open, or any other IDE. A prompt too long for a Cursor link (10,000 characters) is copied instead. It is on project views only, not on Home's rows.
- **Nothing else is written**: in a project with `.specs/`, its `.specs/planning/tasks.md` and, through Regenerate All, its `specpilot-*` command files and its `specpilot-project` skill are the only files the server can change; in a named folder without `.specs/`, setup creates new files and changes none; a new project is one new folder (or an empty one) with new files; a clone is one new folder (or an empty one) filled by `git clone`; `~/.specpilot/projects.json` is the one file written outside your projects; everything else is read on every request.
- **Loopback only**: binds 127.0.0.1 only; rejects any Host header other than `127.0.0.1:<port>` or `localhost:<port>` (403).
- **Live reload**: polls allowlisted files with `stat()` every `--poll` ms while a page is open, and pushes changed paths on `/api/events`; open pages update in place.
- **What it shows**: `.specs/`, `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.claude/commands/`, `.claude/skills/` and `.github/prompts/`, as the files' own text.
- **Limits**: paths through symlinked folders, hidden files and `node_modules` are not shown. Task moves and new tasks are refused, not approximated, when they cannot change exactly one line: a section with no table yet (a fresh project's `[TODO]`), a move involving the file's last line when it has no trailing newline, and a `tasks.md` that is not valid UTF-8. If an editor saves `tasks.md` in the same instant the server writes it, that save can be overwritten; git keeps it recoverable. VS Code reads a path ending in `:<number>` as a line number, so a project folder whose name ends that way (`notes:12`) may not open as a folder from Open in VS Code. Windows paths (`C:\…`) in that link are untested. The Cursor links are untested on a machine with Cursor installed, and Windsurf has none yet. Adding or removing `.cursor/rules/specpilot.mdc` shows on the page at its next refresh, not at once, since that file is not watched. The Setup view's Connected status shows the name the IDE sends when it connects (`clientInfo`); it was checked with test requests in both MCP revisions, not with every IDE. The order the setup tools want is sent as the MCP `instructions` and in the tools' descriptions; whether an IDE shows `instructions` to its agent is up to the IDE, and only test requests were checked. A local program that can read the page can also register a new project's folder itself: the setup tools guard against an agent writing elsewhere by mistake, not against software already running on your machine.

### Local MCP endpoint (`specpilot serve`)

The server also answers MCP at `http://127.0.0.1:<port>/mcp`, so Claude Code, Cursor and other AI IDEs on this machine can read the specs and add or move tasks through the same checks as the page. It is on by default; start with `--no-mcp` to leave it out (the Setup view then says how to restart). `--mcp` is still accepted and changes nothing.

```bash
specpilot serve
# MCP endpoint: http://127.0.0.1:4321/mcp
# Add to your IDE's MCP settings: {"mcpServers":{"specpilot-local":{"type":"http","url":"http://127.0.0.1:4321/mcp","headers":{"X-SpecPilot-Token":"<token>"}}}}
```

Copy that line from the terminal, from the **Connect Your AI IDE** card on Home, or from step 1 of the Setup view (Copy button) into your IDE's MCP settings, or into `.mcp.json` in your project and add `.mcp.json` to `.gitignore`.

- **Tools**: `specpilot_list_projects`, `specpilot_read_spec`, `specpilot_list_tasks`, `specpilot_new_task`, `specpilot_move_task`, `specpilot_validate_specs` (no `--fix`, writes nothing) and `specpilot_regenerate_commands`. Each takes an optional `project` index. The two task writes need the `sha256` that `specpilot_list_tasks` returned; if `tasks.md` changed since, the write is refused ("since you last read it") and nothing is written. Open pages show the change through live reload.
- **Setup tools**: `specpilot_setup_questions` (a path) returns what was detected in the code and every question, with choices and suggestions; `specpilot_setup_project` (the path, the answers, and which ones the user gave) writes `.specs/`, the instruction files and the skill (creating a new project's folder), runs `specpilot validate` and returns the files written and the result. Nine tools in all. They work only on a folder the page is setting up: one you named, opened or cloned that has no `.specs/`, or the new project's folder you named on the Setup view. The server tells the IDE the order (questions, answer from the code, ask the user the rest, write, report). The Setup view's Progress rows follow these calls.
- **Same guards as the page**: loopback only, the Host check, the token (a wrong or missing `X-SpecPilot-Token` gets 403), JSON only, 64 KB, the page's read allowlist, the page's write allowlist and one write lock for page and IDE. A request from a web page (any other `Origin`) is refused with 403; IDEs send none. Clones and the project list are not tools.
- **Protocol revisions**: MCP `2026-07-28` (no handshake; the version, `Mcp-Method` and `Mcp-Name` headers must match the request body), and `2025-11-25` and `2025-06-18` (with `initialize`), on the same URL. A client that speaks both picks one; the config line is the same. Streamable HTTP, POST only, no sessions; answers are JSON, never a stream, and no change notifications are sent.
- **Token**: a new one each time `serve` starts, so the line needs copying again after a restart. To keep one line, set `SPECPILOT_MCP_TOKEN` (at least 32 characters, no spaces) in the environment of `serve` and of your IDE; the line then says `${SPECPILOT_MCP_TOKEN}`, which Claude Code fills in from the environment (other IDEs: put the token in its place). SpecPilot never writes the token anywhere.
- **`--read-only`**: only the four read tools (no task writes, no Regenerate, no setup tools); the endpoint gets its own token and the page stays read-only.
- **Instruction files**: files generated by `init`, `add-specs` and the setup through your AI IDE carry one more process mandate: use the SpecPilot MCP tools for tasks when they are connected, otherwise edit `.specs/planning/tasks.md` and keep its table format. `specpilot backfill` does not add it to existing files yet.

## Supported Languages & Frameworks

### TypeScript

- **React**: SPA applications
- **Express**: REST APIs
- **Next.js**: Full-stack apps
- **Nest.js**: Scalable server-side apps
- **Vue**: Progressive UI framework
- **Angular**: Enterprise SPA framework

### JavaScript

- **React**: SPA applications
- **Express**: REST APIs

> Note: no framework prompt is shown for JavaScript — pass `--framework` explicitly if needed.

### Python

- **FastAPI**: Modern REST APIs
- **Django**: Full-stack applications
- **Flask**: Lightweight REST APIs
- **Streamlit**: Data Science / ML apps

### Kotlin

- **Android**: Native Android apps
- **Spring**: Server-side REST APIs
- **Ktor**: Async Kotlin web framework
- **Compose**: Jetpack Compose UI

### Swift

- **iOS**: Native iOS apps
- **SwiftUI**: Declarative Apple UI
- **Vapor**: Swift server-side framework

## Project Structure

SpecPilot generates a `.specs/` folder with organized subdirectories:

```
.specs/
├── architecture/
│   ├── api.yaml              # CLI / REST API / GraphQL interface spec
│   └── architecture.md       # System design decisions and patterns
├── development/
│   ├── context.md            # Development memory, decisions, learnings
│   ├── onboarding.md         # One-time AI bootstrap prompt — delete after first use
│   └── prompts.md            # AI interaction log — MANDATED, update every session
├── planning/
│   ├── roadmap.md            # Release milestones and objectives
│   └── tasks.md              # Sprint tracker (backlog / current / completed)
├── project/
│   ├── project.yaml          # Project config and AI context (MANDATED)
│   └── requirements.md       # Functional & non-functional requirements
├── quality/
│   └── tests.md              # Test strategy, coverage targets, acceptance criteria
└── security/
    ├── security-decisions.md # ADR-style security design decisions
    └── threat-model.md       # Threat inventory with impact/likelihood/mitigation
```

> Also generated at project root: an AI context file (`.github/copilot-instructions.md`, `CLAUDE.md`, `.cursor/rules/specpilot.mdc` , `.windsurfrules`, `.antigravity/rules.md`  etc.) based on your selected IDE/Agent

## Configuration

SpecPilot requires no global configuration. Each project is self-contained with settings in `project.yaml`.

### IDE & Agent Support

SpecPilot generates AI agent configuration files during project initialization. When you run `specpilot init`, you'll be prompted to select your AI IDE/Agent:

**Desktop IDEs (Workspace Settings):**

- **GitHub Copilot** - Industry standard with Copilot integration
- **Cursor** - AI-first code editor with enhanced AI context
- **Windsurf** - Advanced AI coding assistant
- **Antigravity** - AI-powered IDE with context awareness

**Cloud-Based AI Agents (Instruction Files):**

- **Claude Code** - Anthropic Claude Code CLI agent (`CLAUDE.md`)
- **Codex** - OpenAI Codex agent with instruction context

**Generated Configuration Files:**

Each IDE/Agent selection generates one AI context file at the project root:

| IDE/Agent   | Generated file                        |
|-------------|---------------------------------------|
| GitHub Copilot | `.github/copilot-instructions.md`  |
| Codex       | `.github/copilot-instructions.md`     |
| Cursor      | `.cursor/rules/specpilot.mdc`         |
| Windsurf    | `.windsurfrules`                      |
| Antigravity | `.antigravity/rules.md`               |
| Claude Code      | `CLAUDE.md`                           |

All context files contain: project name/stack, critical mandates, Code Philosophy, Code Rules, and a Re-Anchor Prompt.

For desktop IDEs: `.vscode/settings.json` (or `.cursor/`, `.windsurf/`, etc.)

- IDE-specific workspace folder setup for code + .specs
- Extensions recommendations for development
- AI context configuration for better spec integration

### Generated Slash Commands

Each IDE/Agent selection also generates 8 `specpilot-*` slash/workflow commands (`status`, `reanchor`, `report`, `sync`, `refine`, `validate`, `archive`, `backfill`) that mirror key CLI operations as in-editor commands — e.g. `.claude/commands/specpilot-status.md` for Claude Code, `.cursor/commands/` for Cursor, `.github/prompts/` for GitHub Copilot. Running `backfill` on an existing project fills in any commands missing for your already-configured IDE(s) and updates the ones you have not edited to the current version; edited files are kept and listed. Each command file is reported as added, updated (to the current version), or kept with its reason: `kept: modified` (you changed it; delete it and re-run `specpilot backfill` to get the latest version), `kept: CRLF line endings` (a known version saved with Windows line endings) `kept: symbolic link` (links are never written through), `kept: folder is a symbolic link or not a folder` (nothing is written through a linked `.claude/` or similar) or `kept: could not be written: <code>` (the write failed; the rest still run). The `specpilot serve` page's Regenerate All runs the same step. See the [Full Guide](docs/GUIDE.md#generated-slash-commands) for the complete list and per-IDE paths.

The generated settings/instructions automatically configure your AI agent to:

- Include `.specs/` folder in AI context
- Understand project structure and requirements
- Follow specification-driven development principles
- Access development guidelines and onboarding prompts

**Example:**

```bash
# During init, you'll be prompted to select your IDE/Agent
specpilot init my-project --lang typescript --framework react
# Respond with your preferred IDE/Agent:
# - vscode, cursor, windsurf, antigravity (desktop)
# - claude-code, codex (cloud agents)
```

## Troubleshooting

### Common Issues

#### Permission Errors

```bash
sudo chown -R $USER ~/.npm-global
npm config set prefix '~/.npm-global'
```

#### Template Not Found

```bash
specpilot list --verbose
```

#### Validation Failures

```bash
specpilot validate --verbose --fix
```

#### Migration Issues

**Error: "Source structure 'complex' not found"**

```bash
# For NEW projects, use:
specpilot init my-project

# For EXISTING projects without specs:
specpilot add-specs

# Only use migrate if you have an old .project-spec folder
specpilot migrate --from complex --to simple --backup
```

### Debug Mode

```bash
DEBUG=specpilot specpilot <command>
```

## Why SpecPilot?

SpecPilot implements **Specification-Driven Development (SDD)** where specifications come first:

```
Specifications → Architecture → Code → Tests → Deployment
```

**Benefits:**

- **Clarity**: Everyone understands what needs to be built
- **Consistency**: Standardized structure across projects
- **Quality**: Built-in validation and testing
- **AI-Ready**: Clear context for AI assistants
- **Maintainable**: Comprehensive documentation

## Contributing

This project follows SDD principles. See [`.specs/`](.specs/) for contribution guidelines.

### Development Setup

```bash
git clone https://github.com/girishr/SpecPilot.git
cd SpecPilot
npm install
npm run build
npm link  # For local testing
```

#### Browser tests for `specpilot serve`

The page's clicks, keys, focus and live reload are tested in headless Chromium, separately from `npm test`:

```bash
npx playwright-core install chromium-headless-shell  # once, if Playwright's Chromium is not on this machine yet
npm run test:browser                                  # builds, then runs src/__browser__/ (about 10 s)
```

The suite starts the built server on scratch copies of a fixture project (`src/__browser__/fixture/`, never this repo's own `.specs/`) under a temporary `HOME`, so it writes nothing in the repo or in `~/.specpilot/`. A failing test prints the paths of its error message and stack, a screenshot and the page's HTML, kept in a temp folder.

### Quick Contribution Guide

1. Review [`.specs/project/requirements.md`](.specs/project/requirements.md)
2. Check [`.specs/planning/tasks.md`](.specs/planning/tasks.md)
3. Update specs when making changes
4. Run `specpilot validate` before committing

Releases follow the checklist in [`docs/RELEASING.md`](docs/RELEASING.md).

## Documentation

- **[Full Guide](docs/GUIDE.md)**: Comprehensive documentation
- **[SpecPilot vs GitHub Spec Kit](docs/comparison.md)**: Side-by-side comparison to help you choose the right tool
- **[CHANGELOG](CHANGELOG.md)**: Version history
- **[Issues](https://github.com/girishr/SpecPilot/issues)**: Bug reports & feature requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

_Built with specification-driven development principles for serious production projects._
