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
| `backfill`              | Backfill missing mandates & slash commands into existing project files |
| `list`                  | Show available templates                                          |
| `migrate`               | Convert legacy `.project-spec` folder (rarely needed)             |
| `refine [desc]`         | Refine project specifications                                     |
| `serve [folders...]`    | Serve a local web UI over the `.specs/` of this project, or of each folder named; open more from the page, remembered in `~/.specpilot/projects.json` (task moves, guided setup of a folder without `.specs/`, unless `--read-only`) |

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
| `add-specs` | `--no-analysis` · `--deep-analysis` · `--no-prompts`                                |
| `backfill`  | `--dir` · `--specs-name` · `--dry-run` · `--no-prompts`                             |
| `serve`     | `--port` · `--poll` · `--read-only` · `--open`                                      |

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

Serve a local web UI over a project's `.specs/`, where you can also move tasks between Backlog and Current Sprint, set up `.specs/` in a folder that has none yet, and open more projects. With no folders it serves the project you run it from (the folder that contains `.specs/`); name one or more folders to serve those instead, all from one server, or open them later from the page. Press Ctrl+C to stop.

```bash
specpilot serve                  # this project, at http://127.0.0.1:4321
specpilot serve --port 5000 --open
specpilot serve ../api ../web    # two projects on one server; switch in the left rail
specpilot serve ../new-project   # no .specs/ there yet: the page sets it up (or `specpilot serve .`)
```

| Option        | Default | Description                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------------- |
| `--port <n>`  | `4321`  | Port to listen on (127.0.0.1 only)                                                       |
| `--poll <ms>` | `1000`  | Change-detection interval in ms (minimum 250); polling runs only while a page is open    |
| `--read-only` |        | No task moves, no guided setup, no opening folders and no registry: the UI only reads, with no drag handles and no write routes |
| `--open`      |         | Open the UI in the default browser                                                       |

- **Several projects**: name any folders; one without `.specs/` is served too and offers guided setup (below). They are numbered in command-line order from 0 (`../api` is project 0, `../web` is project 1), and that number is the `?project=<n>` on the server's `/api/` routes and the `#1/...` at the start of a page link for any project after the first (no number means project 0). Each project keeps its own tasks, files and live reload; a move changes only that project's `tasks.md`. Folders opened from the page (below) get the next numbers; a number never changes while the server runs, and one server holds at most 20 projects.
- **Task moves**: drag a row, or use `Alt+Up/Down` to reorder and `Alt+Left/Right` to move between Backlog and Current Sprint. A move changes exactly one line of `.specs/planning/tasks.md` and nothing else, and offers Undo; Completed rows do not move. If the file changed on disk since the page loaded, the move is refused and the page redraws. Start with `--read-only` to turn moves off.
- **Guided setup**: a folder you name that has no `.specs/` shows, instead of the views, a Start Guided Setup button. It starts a chat that asks the questions `specpilot add-specs` asks (project type, language and framework when they are not detected, API paradigm, handle, IDE) one at a time: a friendly line per question with the CLI's own question under it, chips or a field with Continue and Skip, step dividers and a progress bar, then a recap of your answers by step with the files that will be written folded inside, before anything is created. Tap any answer, in the thread or the recap, to change it; you come straight back. It then creates exactly what `add-specs` creates for those answers. A handle that would be refused is caught where you type it. Your answers stay in the page while it is open; they are not saved anywhere. Files outside `.specs/` that already exist (your own `.gitattributes`, `CLAUDE.md`, `.vscode/settings.json`, a command file) are never changed: the recap's file list marks them (`Already here, will be kept`) and the page lists them again afterwards, and `specpilot backfill` adds missing SpecPilot sections to kept instruction and command files (a kept `.gitattributes` does not get the `merge=union` lines). Setup is offered only for folders named on the command line, not for the current-directory default, which still needs `.specs/` (`specpilot serve .` names it). The request is protected like a task move. While it runs, the files are generated into a `.specpilot-setup-<id>/` folder inside the project, which is removed when done; if a run is interrupted, the next `specpilot serve` removes that folder (and only that folder, recognised by its marker file).
- **Home**: the logo at the top of the left rail (or the `h` key, or `#home`) shows "Your specs, as a board.", an Open a Project Folder button and your Recent projects (path, last-opened time and, for projects already open, the git branch); click one to open it. `specpilot serve` still starts on the first project's Tasks view, and `--read-only` has no Home.
- **Open a project from the page**: the `+` tile in the left rail opens a sheet; type a folder path (`/Users/you/project` or `~/project`) and Open, and the folder is served alongside the others, with guided setup if it has no `.specs/`. Folders you open this way are listed under Recent projects next time, remembered in `~/.specpilot/projects.json` (path, last-opened time and a pinned flag, at most 50; the file is created the first time you open a folder from the page, and folders named on the command line are added to it only once it exists). Remove from list forgets a folder without touching it. The home folder, the root of a drive and folders already open are refused; a `projects.json` that cannot be read is left exactly as it is, and the page and the terminal say so. The request is protected like a task move.
- **Start a new project from the page**: Start a New Project on Home opens the same chat: name the project to start, then it asks for the parent folder (`/Users/you/dev` or `~/dev`) and the questions `specpilot init` asks, one at a time, then shows your answers and the files that will be written, and creates `<parent>/<name>`, writes the files `init` writes there and opens it on its onboarding prompt. An existing folder is used only if it is empty; one with content is refused (open it from the Folder tab to add `.specs/` to it). The parent must already exist and cannot be your home folder itself, the root of a drive, or a `.specs/` folder or anything under one. A project name that would be refused is caught where you type it. For a Brownfield project the four project-context questions are not asked, because `init` writes those answers only for Greenfield. Nothing that exists is changed, a run that fails removes what it created, and no `git init` is run. Not offered here: `--specs-name` and `--dry-run`.
- **Clone a repository from the page**: Clone a Repository on Home (or the Clone tab of the same sheet) asks for a repository URL, a parent folder and a folder name (leave it empty for the repository's name), runs your installed `git clone` and opens the result: on Tasks when the repository has `.specs/`, in guided setup when it has none. Accepted URLs: `https://host/path`, `git@host:path` and `ssh://host/path`; an https URL must not contain a user name or password (git uses your credential helper and ssh keys, as in a terminal), so for Azure DevOps drop the `org@` part. Submodules are not cloned, and there is no branch or depth option. The target folder must not exist or must be empty; the parent follows the rules of Start a New Project. As you type or paste the URL, Folder name is filled with the repository's name until you type one yourself. While the clone runs the sheet shows a moving bar and the elapsed time (no percentage yet). git is never asked a question it would wait on: a repository that needs a login it cannot get fails with git's own message, its last `fatal:` line with the line before it, for example `Host key verification failed. fatal: Could not read from remote repository.`, and a clone is stopped after 10 minutes. The page cannot accept an ssh host key for you: for a host you have never connected to, run `ssh -T git@host` once in a terminal, then clone again. Your ssh setup is used as it is; SpecPilot sets no ssh option on macOS and Linux. One clone runs at a time. A clone that fails, is stopped, or is cancelled (Cancel, Escape, closing the tab, Ctrl+C) removes what it downloaded; on Ctrl+C the server waits at most 5 seconds for that. Needs `git` on your `PATH`. This is the only time SpecPilot starts another program for the page and the only time it uses the network. On Windows ssh is put in batch mode (unless you have set `GIT_SSH_COMMAND`, `GIT_SSH` or `core.sshCommand`), and a stopped clone can leave git's helper process running until it ends by itself, and the clean-up can then fail on a file that helper still holds; the message says so.
- **Nothing else is written**: in a project with `.specs/`, its `.specs/planning/tasks.md` is the only file the server can change; in a named folder without `.specs/`, setup creates new files and changes none; a new project is one new folder (or an empty one) with new files; a clone is one new folder (or an empty one) filled by `git clone`; `~/.specpilot/projects.json` is the one file written outside your projects; everything else is read on every request.
- **Loopback only**: binds 127.0.0.1 only; rejects any Host header other than `127.0.0.1:<port>` or `localhost:<port>` (403).
- **Live reload**: polls allowlisted files with `stat()` every `--poll` ms while a page is open, and pushes changed paths on `/api/events`; open pages update in place.
- **What it shows**: `.specs/`, `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.claude/commands/`, `.claude/skills/` and `.github/prompts/`, as the files' own text.
- **Limits**: paths through symlinked folders, hidden files and `node_modules` are not shown. Task moves are refused, not approximated, when they cannot change exactly one line: a section with no table yet (a fresh project's `[TODO]`), a move involving the file's last line when it has no trailing newline, and a `tasks.md` that is not valid UTF-8. If an editor saves `tasks.md` in the same instant the server writes it, that save can be overwritten; git keeps it recoverable.

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

Each IDE/Agent selection also generates 8 `specpilot-*` slash/workflow commands (`status`, `reanchor`, `report`, `sync`, `refine`, `validate`, `archive`, `backfill`) that mirror key CLI operations as in-editor commands — e.g. `.claude/commands/specpilot-status.md` for Claude Code, `.cursor/commands/` for Cursor, `.github/prompts/` for GitHub Copilot. Running `backfill` on an existing project fills in any commands missing for your already-configured IDE(s) and updates the ones you have not edited to the current version; edited files are kept and listed. Each command file is reported as added, updated (to the current version), or kept with its reason: `kept: modified` (you changed it; delete it and re-run `specpilot backfill` to get the latest version), `kept: CRLF line endings` (a known version saved with Windows line endings) or `kept: symbolic link` (links are never written through). See the [Full Guide](docs/GUIDE.md#generated-slash-commands) for the complete list and per-IDE paths.

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

### Quick Contribution Guide

1. Review [`.specs/project/requirements.md`](.specs/project/requirements.md)
2. Check [`.specs/planning/tasks.md`](.specs/planning/tasks.md)
3. Update specs when making changes
4. Run `specpilot validate` before committing

## Documentation

- **[Full Guide](docs/GUIDE.md)**: Comprehensive documentation
- **[SpecPilot vs GitHub Spec Kit](docs/comparison.md)**: Side-by-side comparison to help you choose the right tool
- **[CHANGELOG](CHANGELOG.md)**: Version history
- **[Issues](https://github.com/girishr/SpecPilot/issues)**: Bug reports & feature requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

_Built with specification-driven development principles for serious production projects._
