---
fileID: SEC-003
lastUpdated: 2026-10-08 (BL-PM-006 Spec Report)
version: 1.15
contributors: [girishr]
relatedFiles:
  [security/threat-model.md, architecture/architecture.md, project/project.yaml]
---

# Security Decisions

## Overview [SEC-003.1]

This file records security-related architectural and implementation decisions made during SpecPilot development. Each entry follows an ADR (Architecture Decision Record) style: what was decided, why, and what alternatives were considered.

## Decisions [SEC-004]

### [SEC-004.1] Project name validated with allowlist regex

- **Date**: 2026-02-28
- **Decision**: Replace the project name denylist (blocking specific dangerous characters) with an allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`.
- **Rationale**: A denylist can miss unknown-bad characters or new attack vectors. An allowlist explicitly permits only safe characters — letters, digits, dots, hyphens, and underscores — blocking everything else by default. This prevents both path traversal (`../`) and Handlebars template injection (`{{`).
- **Alternatives considered**:
  - Denylist of dangerous characters (original approach) — rejected because it's fragile and must be updated for each new threat.
  - Sanitization / escaping of input — rejected because it silently transforms the user's input, which is confusing for a project name.
- **Reference**: FIX-007 / CD-046

### [SEC-004.2] No network calls at runtime

- **Date**: 2026-02-28
- **Decision**: All templates are built-in (inline in source code). SpecPilot makes zero outbound HTTP/network calls during `init`, `add-specs`, `validate`, or any other command. `specpilot serve` (BL-051) is a loopback-only listener and makes no outbound calls either; its UI loads no external fonts or scripts (SEC-004.8).
- **Rationale**: Eliminates an entire class of attacks (SSRF, DNS exfiltration, man-in-the-middle on template downloads). Also ensures the tool works fully offline.
- **Alternatives considered**:
  - Remote template registry — rejected for security and reliability reasons.
  - Optional telemetry — rejected to keep the tool fully offline and trust-transparent.
- **Reference**: ARCH-007.3

### [SEC-004.3] Handlebars auto-escaping relied on for template safety (revised 2026-10-08, BL-PM-004b: no HTML escaping)

- **Revision (2026-10-08, BL-PM-004b, the developer's direction)**: the engine compiles with `noEscape`: values land as typed, because the output is Markdown and YAML, never HTML, and the escaping turned answers such as `< 100ms` into `&lt; 100ms` in every file. Template safety never rested on the escaping: Handlebars treats a value as data, never as template source, so `{{` in a value is text (pinned by a test), and the project name of `init` and a new project keeps its allowlist (SEC-004.1). YAML values go through `yaml`/`yamlList`; the free values written into YAML outside them (the terminal-typed handle; `--lang` and `--framework`; and the project name of `add-specs`, which comes from the folder's `package.json` or build file, also in a repository cloned from the page, so the allowlist does not cover it) go through `dq` inside a template's double quotes (`devPrefix`, api.yaml's `project`, `title`, `name`) and `fm` in front matter (`project`, `language`, `framework`, `contributors`), which quotes a value only when it holds one of the seven characters HTML escaping covered, so every other value keeps its bytes (found by spec-reviewer B, 2026-10-08). Any page that shows these files as HTML escapes them itself (the serve UI does, SEC-002.5 d). The original decision follows.

- **Date**: 2026-02-28
- **Decision**: Use only double-brace `{{ }}` interpolation (which HTML-escapes output). Never use triple-brace `{{{ }}}` (unescaped) in any template.
- **Rationale**: Handlebars' default escaping neutralizes `<`, `>`, `&`, `"`, `'`, and backticks in user-supplied values. Since SpecPilot outputs Markdown/YAML (not HTML), the escaping is a defence-in-depth measure rather than a strict requirement — but it costs nothing and prevents unexpected template expansion.
- **Alternatives considered**:
  - Custom escaping function applied before rendering — rejected as unnecessary given Handlebars' built-in escaping and the allowlist on `projectName`.
  - Switching to a logic-less template engine — rejected because Handlebars helpers (`currentDate`, `uppercase`, etc.) add genuine value.
- **Reference**: SEC-002.2

### [SEC-004.4] Minimal runtime dependency set

- **Date**: 2026-02-28
- **Decision**: Keep runtime dependencies to the smallest practical set: `commander`, `handlebars`, `chalk`, `inquirer`, `js-yaml` (YAML parsing in `specValidator.ts`, `init.ts` and `specServer.ts`). No additional libraries unless strictly necessary. `fs-extra`, declared since the initial release but never imported, was removed in BL-056 (with `@types/fs-extra`), leaving 5. `specpilot serve` added none.
- **Rationale**: Each dependency is a potential supply-chain attack surface. Fewer dependencies = smaller attack surface, easier audit, and fewer transitive risks.
- **Alternatives considered**:
  - Using a full framework (e.g., `oclif`) — rejected because it brings a large dependency tree for marginal benefit.
  - Inlining functionality (e.g., replacing `chalk` with ANSI codes) — considered too fragile for cross-platform terminal support.
- **Reference**: SEC-002.3

### [SEC-004.5] Claude Code plugin ships as a lowest-privilege bundle

- **Date**: 2026-07-26
- **Decision**: The plugin bundles **only** skills/commands and templates — **no hooks, no MCP servers, no `bin/` executables, no monitors**. All spec-file operations happen as Bash file writes Claude proposes, each surfacing as a normal permission prompt.
- **Rationale**: A plugin runs arbitrary code at the user's privilege level. Hooks/monitors run **unsandboxed and automatically** (e.g. `SessionStart` before the user does anything); MCP servers and `bin/` add long-running processes and PATH injection. Excluding all of them limits the plugin's blast radius to permission-gated file writes the user still approves — the same trust surface as Claude Code editing files normally.
- **Alternatives considered**:
  - Bundling the `specpilot` CLI in `bin/` — rejected: adds a PATH executable and a runtime dependency; the file-generation logic can be carried as templates instead.
  - A `SessionStart` hook to auto-validate specs — rejected: auto-running code with no user action is exactly the highest-risk plugin capability.
- **Reference**: REQ-002.G.4, SEC-002.4

### [SEC-004.6] Repo hardening for the marketplace auto-pin vector

- **Date**: 2026-07-26
- **Decision**: Because the plugin lives in this repo and the community catalog **auto-bumps the pinned commit SHA** as commits are pushed, harden the repo: branch protection on `main`, required review, 2FA/passkeys on the maintainer account, and treat everything under `plugin/` and the `build:plugin` generator as security-sensitive in review.
- **Rationale**: The auto-pin means a merged malicious PR or a stolen push credential becomes the installable plugin version for new installs and auto-update users, without a separate release gate. The commit path *is* the release path, so it must be protected as one.
- **Alternatives considered**:
  - A separate plugin repo — rejected earlier for distribution reasons (REQ-002.G.1); does not remove the vector, only moves it.
  - Disabling auto-pin — not offered by the marketplace; mitigated by controlling what lands on `main` instead.
- **Reference**: SEC-002.4

### [SEC-004.7] Plugin is self-contained with no runtime dependencies

- **Date**: 2026-07-26
- **Decision**: The plugin ships **no npm dependencies and no install hook**; it carries its scaffolding templates inline (generated from `src/utils`) and relies only on Bash + Claude's own tools at runtime.
- **Rationale**: Any dep the plugin shipped, combined with an install hook, would execute on the user's machine — reproducing the CLI's supply-chain surface (SEC-002.3) on every install. A zero-dependency plugin removes that class of risk entirely.
- **Alternatives considered**:
  - Shipping a `package.json` + `SessionStart` `npm install` hook (a documented plugin pattern) — rejected: turns every transitive dep into code that runs at session start.
- **Reference**: REQ-002.G.2, REQ-002.G.5, SEC-002.4

### [SEC-004.8] `specpilot serve` is loopback-only, Host-checked, allowlisted and read-only

- **Date**: 2026-09-28
- **Decision**: Listen on `127.0.0.1` only; reject any `Host` other than `127.0.0.1:<port>` / `localhost:<port>` with 403; serve files only from a fixed allowlist (`.specs/**`, `CLAUDE.md`, `AGENTS.md`, `.claude/commands/**`, `.claude/skills/**`, `.github/copilot-instructions.md`, `.github/prompts/**`) after rejecting `..`, absolute paths, NUL, hidden and `node_modules` segments below an allowlisted folder and symlinked folders on the way, and after checking the `realpath` stays inside both the root and the allowlist (BL-052 aligned these rules with the live-reload scanner, so what is served is exactly what is watched); send `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on every response and no CORS headers; expose no write route.
- **Rationale**: A local server is reachable by every web page the user visits. Loopback binding stops other machines; the Host check stops DNS rebinding; the allowlist plus `realpath` stops traversal and symlink escape; the CSP limits the damage of any rendering bug; no CORS keeps responses opaque to other origins. With no writes there was nothing to forge in Phase 1; the Phase 3 write route adds the token (SEC-004.10).
- **Alternatives considered**:
  - A per-session token on every request — deferred to Phase 3 (BL-053), where the first write route needs one anyway.
  - Serving the whole project root — rejected: the UI needs only specs and generated instruction files; source and secrets stay unreachable.
  - Loading Google Fonts as the mockup does — rejected: breaks the CSP and the offline guarantee (SEC-004.2).
- **Reference**: SEC-002.5, REQ-002.H.4, ARCH-004.33

### [SEC-004.9] Live reload is polled, capped and content-free

- **Date**: 2026-09-28
- **Decision**: Detect changes by `stat()` polling over the files the path guard would serve (mtime, size, inode; never content), only while at least one `/api/events` stream is open; cap open streams at 8 and answer the 9th with 503; send only the changed allowlisted paths; heartbeat every 25 s; end every stream and clear every timer on Ctrl+C.
- **Rationale**: A local page can open streams in a loop, so an uncapped stream count is an easy way to pin the process. Polling only the allowlisted set keeps each tick small and never touches source or secrets. Content-free events mean the stream reveals nothing `/api/specs` does not already return.
- **Alternatives considered**:
  - `fs.watch` with `recursive: true` — rejected: unreliable on Linux before Node 20, and it watches whatever the tree contains rather than the allowlist.
  - WebSockets — rejected: two-way, and needs a handshake implementation or a dependency; SSE is a plain `GET`.
  - Pushing file content in events — rejected: widens what the stream exposes and duplicates `/api/file`.
- **Reference**: SEC-002.5 (g), REQ-002.H.8, ARCH-004.35

### [SEC-004.10] Task moves: CSRF token + Origin + JSON-only, one write-allowlisted file, atomic replace

- **Date**: 2026-09-29
- **Decision**: `POST /api/tasks/move` is the only write route (until BL-055; see SEC-004.12). It requires a per-start random 32-byte token (meta tag in `index.html`, header `X-SpecPilot-Token`, `crypto.timingSafeEqual`), an `Origin` equal to the page's own origin, `Content-Type: application/json`, a body ≤ 16 KB and the usual Host check; it writes only `.specs/planning/tasks.md` (a write allowlist separate from the read allowlist), only by relocating one existing line, only when `If-Match` matches the file's sha256, under an in-process lock, through a temp file, `fsync` and `rename`. `--read-only` removes the route, the handles and the token. This closes the CSRF item SEC-004.8 deferred to Phase 3.
- **Rationale**: Each layer covers a different forgery: the token stops any page that cannot read ours (the CSP-bound page is the only reader); `Origin` stops cross-site `fetch` and rebound origins even if a token leaked; JSON-only stops HTML form posts, which cannot set that content type without a preflight; the size cap bounds parsing. Relocating a line (never writing request text) means a forged request could at worst reorder tasks, which `If-Match` and git make recoverable. (Since BL-PM-005, `POST /api/tasks/new` writes request text into `tasks.md`, one row; see SEC-004.18.)
- **Alternatives considered**:
  - SameSite cookies — rejected: localhost cookies are shared across ports and the page has no login; a header token is simpler and not sent automatically.
  - Accepting a full new `tasks.md` from the client — rejected: turns the endpoint into an arbitrary-text writer.
  - Merging on a hash mismatch — rejected: silent merges of a hand-edited file are how edits get lost; 409 and a redraw are explicit.
- **Reference**: SEC-002.5 (f, h), REQ-002.H.10, REQ-002.H.11, ARCH-004.36

### [SEC-004.11] Multiple projects: roots fixed at start, chosen by index, no registry

- **Date**: 2026-10-01
- **Decision**: `specpilot serve a b c` serves the folders named on the command line, each `realpath`-resolved and required to contain `.specs/` (until BL-055: a named folder without it is served for setup, SEC-004.12). The list never changes while the server runs (until BL-067, SEC-004.13). `/api/` routes pick a project with `?project=<n>`, an index into that list: one value matching `^(0|[1-9][0-9]*)$` (empty, repeated, signed, padded or out of range → 404). Order: Host, method, then for a move Origin, token, content type and size, then the project, so an unauthenticated request never gets an answer that depends on the project; from there every SEC-004.8–SEC-004.10 control applies unchanged to that one root. One token per server start covers every project. Nothing is written outside the served folders; no route accepts a folder path (both changed by BL-067, SEC-004.13: the list may grow by one route, and the registry is written outside the project; the index rule and the per-root guards are unchanged).
- **Rationale**: Taking roots only from the command line means a web page can never choose what the server reads; an index (not a path) leaves nothing to traverse. Running the existing per-root guards unchanged keeps one security model to test. A shared origin and token across projects grant nothing new: the same local user named every folder.
- **Alternatives considered**:
  - A registry in `~/.specpilot/projects.json` plus an "open folder" route — deferred to BL-067: the first write outside the project (ARCH-007.5), and a route that turns a forged request into "serve this folder".
  - One server per folder — rejected for this phase: one port and origin per project, so one rail would need cross-origin calls and a token per origin.
  - Projects addressed by folder name or path in the URL — rejected: names collide and paths invite traversal; an index has neither problem.
- **Reference**: SEC-002.5 (i), REQ-002.H.13, ARCH-004.39

### [SEC-004.12] Guided setup: named folders only, the CLI's generator, new files only, existing files kept

- **Date**: 2026-10-02
- **Decision**: `POST /api/setup` (BL-055) is the second write route. It exists only for a folder named on the command line in which `.specs` does not exist, and takes the folder by index, never by path. It has the same layers as a task move: Host, exact `Origin`, the per-start token, `application/json`, ≤ 16 KB; `--read-only` removes it. The body is a fixed set of keys; every value is a choice from a fixed list except the handle, which must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$` or be empty (the OS username is then used, as in the CLI; it is not request text). The server calls the unchanged `SpecGenerator.generateSpecs()` with prompts off and `targetDir` set to a staging folder inside the served folder, then creates each staged file in place with an exclusive create (`wx`) and `fsync`. `.specs` must not exist; a file outside `.specs/` that exists as anything is kept untouched and reported (before submit, from a derived target list pinned to the generator by a test; after, from what the creates actually did); a parent on the way that is a symbolic link or not a folder refuses the setup. A failed create removes only what the request created; the staging folder, which carries a marker file, is always removed, and at startup (not `--read-only`) `serve` removes stale folders that have that exact name pattern and marker, nothing else. The standing write allowlist still holds only `tasks.md`.
- **Rationale**: Reusing the generator keeps one set of templates and makes the output the CLI's, but the generator replaces or appends to some existing files, so it must never run against the project folder from a request; staging plus exclusive creates turns "never change an existing file" into something the file system enforces (`O_EXCL`) rather than a list to keep in step; keeping, not refusing, means a project that already has a `.gitattributes` or an editor settings file still gets its `.specs/`, and `specpilot backfill` stays the one tool that adds SpecPilot sections to an existing instruction file. Fixed choices and a handle allowlist keep the property task moves had, that a request cannot put free text into a file. Folders by index keep the BL-054 rule that a page can never choose what the server touches.
- **Alternatives considered**:
  - Running the generator directly in the project folder after a pre-check: rejected, a file that appears between the check and the write would be replaced, and the pre-check needs its own copy of the generator's path list.
  - A staging folder under the OS temp directory: rejected, a write outside the project (ARCH-007.5).
  - Letting the page answer the CLI's overwrite / append / skip questions: rejected, a request could then change an existing file.
  - Refusing the whole setup when any target exists (first draft): rejected, it turned away most real projects for files setup can simply leave alone.
  - Listing the files to be created by generating on `GET`: rejected, a `GET` must not write; the kept list before submit comes from the derived target list instead.
  - Cleaning staging folders by name alone: rejected, a user folder could share the name; the marker file makes the folder SpecPilot's.
  - Free-text handle as in the CLI: rejected over HTTP; the CLI's own prompt is unchanged.
- **Reference**: SEC-002.5 (j), SEC-002.2, REQ-002.H.15, REQ-002.H.16, ARCH-004.40

### [SEC-004.13] Opening a folder from the page: one path rule, append-only roots, a paths-only registry that is never repaired

- **Date**: 2026-10-03
- **Decision**: `POST /api/projects` (BL-067) is the third write route and the first that takes a path from the browser. It has every layer of SEC-004.10 (Host, exact `Origin`, per-start token, `application/json`, ≤ 16 KB) and is absent with `--read-only`. The path is checked by one function: a leading `~` is expanded against the home directory (`homeDir()`: `HOME`, else `USERPROFILE`, else `os.homedir()`) and nothing else; it must then be absolute (a relative path is refused, never resolved against the server's cwd), is `realpath`-resolved before every comparison, must be a directory, and must not be the home folder, a file-system root or a folder already served (409 naming the index). The folder is not read before it is served; afterwards it is one more indexed root under the unchanged SEC-004.8 to SEC-004.12 controls (read allowlist, `tasks.md` move rules, guided setup rules). The served list is append-only for the run: an index never changes and no root is dropped; one server serves at most 20 projects (409 past that). The registry `~/.specpilot/projects.json` is the one file SpecPilot writes outside a project: it holds paths, a last-opened time and a pinned flag, at most 50 entries; `~/.specpilot` must be a real folder and the file a regular file (`lstat`; a link is refused, never followed), both created by SpecPilot with modes 0700 and 0600 and only when the first entry is written; writes go to a temp file in the same folder, `fsync`, `rename`, after re-reading under the write lock; a file that cannot be read or parsed is refused with its reason for the run and never written. The lock is per process: two servers writing at once can drop one entry, never corrupt the file (accepted for a recents list). Reading the registry never adds a served root; removing an entry edits the list and makes no call on the folder.
- **Rationale**: The two things SEC-004.11 kept out were kept out because of what they cost, not because they are wrong: a registry is a write outside the project, and an open route turns a forged request into "serve this folder". Both are taken on with the smallest surface that gives the feature. The CSRF layers already stop any page that cannot read ours, so the route's own job is to be unambiguous about the path (one rule, `realpath` first, no relative paths, no cwd) and to grant nothing new once the folder is served (same guards, same two writes). Home and `/` are refused because serving them means the page lists `~/.specs` style paths nobody has and a poller walks allowlisted folders under the whole home; a served-twice folder is refused because two indices for one folder would let two pollers and two hashes disagree. The registry stores paths only because a name or branch copied into it would be shown as fact when stale; it is never repaired because the file is the only copy of the user's list and a bad parse is more likely an edit than an attack; `lstat` and the 0700 / 0600 modes keep a planted link from redirecting the write and keep the list to the user. Append-only roots keep the index rule of SEC-004.11 exactly, so no existing test or guard changes meaning.
- **Alternatives considered**:
  - A native folder picker opened by the server (the mockup's `Browse Folders…`): rejected, a browser request would open an OS dialog from a background process; the typed path and the Recent list cover it.
  - Serving the registry's folders at startup: rejected, a hand-edited or planted entry would then choose what the server reads without a request; the registry is a list to click, not a configuration.
  - A `DELETE` method or a query parameter for removal: rejected, a JSON `POST` keeps the single `writeAllowed()` path with its content-type check and leaves nothing in URLs or logs.
  - Repairing or truncating a corrupt registry: rejected, the only copy of the user's list; refuse and say so.
  - Recording every command-line folder unconditionally: rejected, `specpilot serve` alone would write outside the project on first use; folders are recorded only when the file already exists (open question for the developer).
  - Letting a request remove a served project from the running server: rejected, it would renumber or orphan indices other pages hold; the list is append-only for the run and the registry entry alone is removable.
  - Storing the project name and branch in the registry: rejected, stale copies shown as fact; they are read live once the folder is served.
- **Reference**: SEC-002.5 (k), REQ-002.H.18, REQ-002.H.19, REQ-002.H.20, ARCH-004.42

### [SEC-004.14] New project from the page: the parent through the one path rule, the name through `init`'s allowlist, one exclusive `mkdir`, BL-055's staging

- **Date**: 2026-10-04
- **Decision**: `POST /api/projects/new` (BL-PM-003) is the fourth write route and the first that creates a folder. It has every layer of SEC-004.10 (Host, exact `Origin`, per-start token, `application/json`, ≤ 16 KB) and is absent with `--read-only`. The request names the parent and the project name separately. The parent goes through `checkOpenPath()` (SEC-004.13) unchanged: `~`-expanded, absolute, `realpath`-resolved, a directory, not home, not a root (for this field that refusal reads `Pick a folder inside your home folder, like ~/dev.`), and its real path must have no segment named `.specs`. The name must match `init`'s allowlist `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` (SEC-004.1) and be at most 214 characters, checked by the function `init` uses. The target `<parent>/<name>` is looked at with `lstat`: a symbolic link or a non-folder is refused; an existing folder is used only when it has no entry at all and is not served; a missing one is created with one non-recursive `mkdir`, which fails if anything is there. No parent is created and nothing existing is overwritten, emptied or removed. The files are written by guided setup's path (SEC-004.12): the unchanged generator into a marked staging folder inside the target, then one exclusive create per file; on failure only what the request created is removed, the target itself with a non-recursive `rmdir` and only when the request created it. Every answer is a choice from a fixed list, except the handle (SEC-004.12's allowlist) and the four project-context answers `init` asks: each a single line of at most 1000 characters with no control characters or line separators (U+0000 to U+001F, U+007F to U+009F, U+2028, U+2029), written as plain text into `.specs/development/onboarding.md` and nowhere else, never compiled as a template. The 20-project cap is checked before anything is created. The new folder is then served and recorded exactly as a folder opened through `POST /api/projects`. No `git` or other process is started.
- **Rationale**: The two risks of creating a folder from a request are where it lands and what it replaces. Splitting the target into a parent that must already exist (and passes the rule every opened folder passes) and a name that is one allowlisted segment leaves nothing to traverse and nothing for `realpath` to guess about a path that does not exist yet. A non-recursive `mkdir` is the file system's own exclusive create, so "never overwrite" does not rest on a check made earlier. Requiring an existing target to be empty keeps one meaning per flow: new or empty folder is `init`, a folder with content is `add-specs` through the existing setup. Reusing the staging path means there is still one writer of generated files behind the server, with the keep and rollback behaviour already tested. The context answers are accepted because the feature is "the same questions as `init`", and bounded because they are the first free text from a request: one line, a length cap and no control characters is what the terminal prompt could deliver, and plain-text interpolation means template syntax in them is inert.
- **Alternatives considered**:
  - One `path` for the target: rejected, the last segment needs the name rule anyway and the rest cannot be `realpath`-resolved before it exists.
  - `mkdir` with `recursive: true`: rejected, a mistyped parent would create a tree, and it does not fail when the folder exists.
  - Using an existing folder whatever it holds, as the CLI does: rejected, that is guided setup's case and would give two flows with different questions for one folder.
  - Generating straight into the new folder because it is new: rejected, a second write path with no rollback and no exclusive create.
  - Leaving the four context questions out over HTTP: rejected by the developer (2026-10-04), who accepted the free text with these limits; it would not be "the same questions as `init`".
  - Running `git init` in the new folder: rejected for this item, the CLI runs none and it would start a process from a browser request (the developer's decision).
- **Reference**: SEC-002.5 (l), SEC-002.1, SEC-002.2, REQ-002.H.23, REQ-002.H.24, ARCH-004.43

### [SEC-004.15] Clone from the page: the user's `git` started without a shell, a URL allowlist behind `--`, https and ssh only, no prompt, a time limit, BL-PM-003's folder rule

- **Date**: 2026-10-04
- **Decision**: `POST /api/projects/clone` (BL-PM-002) is the fifth write route, the first that starts a process for a request and the first use of the network. It has every layer of SEC-004.10 (Host, exact `Origin`, per-start token, `application/json`, ≤ 16 KB) and is absent with `--read-only`. git is run as the argument array `['clone', '--no-recurse-submodules', '--', url, target]`, with no shell (`spawn` without the shell option, because `execFile`, which the probe uses, cannot start a detached child), and only the URL and the target folder come from the request. The URL must match one of three anchored forms on a fixed character set (`https://host[:port]/path`, `ssh://[user@]host[:port]/path`, `user@host:path`), be 1 to 2048 characters, hold no whitespace or control character and no user or password in an https URL, and is passed to git unchanged; `file://`, `ext::`, `http://`, `git://`, local paths and anything starting with `-` match no form. `GIT_ALLOW_PROTOCOL=https:ssh` repeats the transport rule inside git. No prompt can be waited on: stdin closed, no controlling terminal, `GIT_TERMINAL_PROMPT=0`, empty `GIT_ASKPASS`, `SSH_ASKPASS_REQUIRE=never`, `GCM_INTERACTIVE=never`. Nothing about ssh is set on macOS and Linux; on Windows `GIT_SSH_COMMAND=ssh -oBatchMode=yes` is added only when the user has set no ssh command of their own (`GIT_SSH_COMMAND`, `GIT_SSH`, `core.sshCommand`). The clone has 10 minutes; then its process group is killed. The parent and the folder name follow SEC-004.14 through the same function; the target is created by one exclusive `mkdir` or is an existing empty folder. One clone runs at a time, outside the write lock, and counts toward the 20-project cap. While it runs, its folder is refused to the open and new-project routes. `serve` stops it on SIGINT, SIGTERM and SIGHUP. Any early end (git's error, the limit, the page's connection closing, also just after git finished, the server stopping) removes the entries of that folder, and the folder itself only when the request created it. git's last `fatal:` line, with the line before it in front, is returned as one line of text, control characters removed, at most 300 characters, `remote:` lines left out. The folder then enters the server as in SEC-004.13.
- **Rationale**: The classic ways a clone URL turns into code execution are an option (`--upload-pack=`, `-u`), a transport that runs a command (`ext::`) and a host that ssh reads as an option (`-oProxyCommand=`). `--` ends option parsing, the allowlist leaves no form that starts with `-` or names another transport, and `GIT_ALLOW_PROTOCOL` holds even if the allowlist had a gap or the user's config rewrites the URL. Refusing `file://` and local paths keeps a forged request from copying a local repository into a folder the page can then read. Refusing credentials in the URL keeps secrets out of error messages, the process list and `.git/config`; the user's credential helper and ssh agent still work, because the child inherits the user's environment. Submodules are off because they are URLs the repository chooses, not the user. A process without a terminal must fail instead of asking, and a limit must end what still waits. A user's own ssh command is never replaced, because it may be how their keys are found; on POSIX that is kept without exception by setting nothing, since a probe cannot see a command configured through `includeIf "gitdir:"`, and the missing terminal already makes ssh fail instead of asking. The clean-up can be recursive because the folder was empty or missing when the request began, checked under the lock.
- **Alternatives considered**:
  - A git library (isomorphic-git, nodegit): rejected, a new dependency and its own credential, proxy and ssh handling beside the user's.
  - `exec` or `spawn` with `shell: true`: rejected, request text would be quoted for a shell.
  - Checking the URL with `new URL()` and passing its serialisation: rejected, git would get a string other than the one checked, and the scp-like form is not a URL.
  - Allowing `http://` or `git://`: rejected, clear text and no host authentication.
  - Allowing `https://user@host/...`: rejected, tokens are often pasted in that place.
  - Holding the write lock for the whole clone: rejected (the developer's decision), every other write would wait for minutes.
  - Always setting `GIT_SSH_COMMAND`: rejected (the developer's decision), it would replace the user's own ssh command.
  - Setting it on POSIX when the probe finds no ssh command (the Spec Report's default): dropped after the build (the developer's decision), it overrode a `core.sshCommand` set through a conditional include.
  - `StrictHostKeyChecking=accept-new` so first-time hosts work: rejected, it would accept a host key nobody looked at; the page shows ssh's message and the user runs `ssh -T git@host` once.
  - A size limit on the clone: not built, git offers none and watching the folder size is new machinery; the time limit bounds it.
  - Showing all of git's stderr: rejected, `remote:` lines are text the remote host chooses.
  - Showing the `fatal:` line alone (the Spec Report's default): changed after the build (the developer's decision), over ssh it is always `Could not read from remote repository.` and the reason is the line before it.
- **Reference**: SEC-002.5 (m), SEC-002.3, REQ-002.H.25, REQ-002.H.26, ARCH-003.23, ARCH-004.44

### [SEC-004.16] A pure spec core: input is render context only, YAML through one helper, nothing secret inside, no publish without the developer

- **Date**: 2026-10-06 (BL-032 Spec Report)
- **Decision**: The templates and everything that renders them live in `src/core/`, which may import nothing but `handlebars` and files beside it and may use no Node global (REQ-002.I.2), checked by an ESLint `no-restricted-imports` override and a test. User answers reach the core as context values only; `renderFromString()` is called on the core's own template literals and never on anything from a prompt, a request or a file. Phase 2's optional fields are rendered through `{{ }}` in markdown and through the `yaml` and `yamlList` helpers in YAML (plain when YAML 1.2 reads the value back unchanged, double-quoted and escaped otherwise), so no `{{{ }}}` appears in any template (SEC-004.3 holds); `project.yaml`'s `name:` and `description:` take the same helper (BL-085). Phase 3 publishes the core as `@specpilot/spec-core` only after its own Spec Report and the developer's `yes, proceed`, with templates precompiled (or no Handlebars) so the web app's CSP keeps no `unsafe-eval`, an exact-version pin, and a `files` whitelist.
- **Rationale**: The core ships in a public browser bundle and runs in a Worker (SEC-002.7); a module that cannot read the environment or the disk cannot leak either, and a rule enforced by lint and a test does not rot. One quoting helper for YAML is one place to get escaping right, where today's templates quote by hand or not at all (BL-085).
- **Alternatives considered**:
  - A comment stating the purity rule, as `specReader.ts` has (ARCH-003.13) — rejected: a comment is not checked, and the folder will grow.
  - Validating values inside the core (lengths, character sets) — rejected: the core would then refuse what a caller allowed, in two places; validation stays at the entry points (the prompts, the serve routes, REQ-002.H.16).
  - Escaping markdown values differently from `description` (no HTML escaping) — deferred: it would change the bytes of today's output for the same input, which phases 1 and 2 must not; revisit with SEC-005's open question on `description` and `author`. (Taken in BL-PM-004b for every value, SEC-004.3 revised.)
- **Reference**: SEC-002.2, SEC-002.7

### [SEC-004.17] Full setup chat: the 23 fields checked at the route, setups in the browser and never the token, one compiled rule script

- **Date**: 2026-10-07 (BL-PM-004b Spec Report)
- **Decision**: The 23 optional fields enter only through `POST /api/projects/new`, `POST /api/setup` and the read-only `POST /api/preview`, each checked before the lock (type, length, list size, the eight integration keys, one line, no control characters), not against the option lists, since `Other: ___` is free text; escaping stays the core's (SEC-004.16). The three routes take bodies up to 64 KB (bytes): every ASCII body that passes the field checks fits (about 55 KB at most); a body of mostly non-ASCII text at the character limits can exceed it and gets 413, whose message the page shows under the button, accepted rather than sizing the limit for three bytes per character. Unfinished setups are kept in the page's `localStorage` (`sp-setups`) with answers only; the token is never stored. The chat's rules run in the page from `/assets/chat-core.js`, the compiled `src/core/chatFlow.ts`, which imports nothing.
- **Rationale**: The route is where answers enter, as for the context answers (SEC-004.12); restricting values to the offered options would forbid the web's free entries and add a second copy of every list on the server. Browser storage keeps the registry the one file SpecPilot writes outside a project (SEC-002.5 k) and is the developer's decision; what it exposes is what the user typed for a project not yet created. Serving the compiled core file keeps one copy of the rules without a bundler or a new dependency.
- **Alternatives considered**:
  - Drafts in `~/.specpilot/drafts` (the backlog row's first plan) — rejected by the developer (2026-10-07): a second file outside a project, with its own folder, mode and atomic-write rules.
  - Accepting only listed option labels — rejected: breaks `Other: ___`, and the templates escape any string anyway.
  - Keeping the 16 KB limit — rejected: 23 fields with free entries can exceed it (18 lists of up to 25 entries: 10 list fields and 8 integration categories).
- **Reference**: SEC-002.8, SEC-002.5, REQ-002.H.28, REQ-002.I.7

### [SEC-004.18] New Task: the first route that writes request text into an existing file of a project

- **Date**: 2026-10-08 (BL-PM-005 Spec Report)
- **Decision**: `POST /api/tasks/new` appends one row, `| <ID> | <description> |`, to Backlog or Current Sprint in `.specs/planning/tasks.md`, the description being text from the request. It sits behind every guard of the move route (SEC-004.10): Host, exact `Origin`, the per-start token, `application/json` only, 16 KB, `If-Match` on the file's sha256, the one in-process lock, temp file + `fsync` + `rename` keeping the mode, no write through a symbolic link, the validator's `tasks.md` checks in memory, and no route with `--read-only`. It writes the same one file (the write allowlist is unchanged); `tasks-archive.md` is only read, for IDs, and refused when it is a symbolic link or not a regular file. The ID is computed by the server, never taken from the request. The description must be one line of at most 4000 Unicode code points (the longest row today is 1631) with no control character (U+0000–U+001F, U+007F–U+009F), no unpaired surrogate, no `|` and no trailing `\`, so it cannot add a second row, end the table, or start a heading or front matter: whatever it holds stays inside one cell of one line. It is written as typed (surrounding white space removed), not escaped; the page renders it with `md()` as every row (escaped HTML, links drawn as text, not followed).
- **Rationale**: Until now a forged request against `tasks.md` could at worst reorder tasks (SEC-004.10); request text reached a project only in the files a new project or setup creates (BL-PM-003, SEC-004.14). With this route the same forgery, if it passed every layer, could add a task row with text of its choice, which an AI agent reading `tasks.md` would see. The layers that stop a forged move stop this one, and nothing new is reachable: the token is in the page only, the row is one visible line in a file under git, and the developer can already type anything into it. A one-line, pipe-free cell is the narrowest shape that still holds what a person types.
- **Alternatives considered**:
  - Escaping `|` as `\|` — rejected: it writes text the user did not type, the page's reader would show the backslash, and the file has no escaped pipe today.
  - Accepting the ID from the page — rejected: two pages could send the same ID, and the request would choose what lands in the ID cell.
  - Numbering from every `BL-`/`CS-` string in both files — rejected: the files name other repositories' IDs in running text (`CS-096` in BL-049), which would skip numbers for no reason.
- **Reference**: SEC-004.10, SEC-002.5, REQ-002.H.29, ARCH-004.48

### [SEC-004.19] Regenerate All: backfill's command refresh from the page, links on the way refused

- **Date**: 2026-10-08 (BL-PM-006 Spec Report)
- **Decision**: `POST /api/commands/regenerate` runs `refreshCommands()` (SEC-002.6) for the IDEs detected in the named project, behind every guard of the move route (SEC-004.10): Host, exact `Origin`, the per-start token, `application/json` only, 16 KB, the one in-process lock, no route with `--read-only`. The request carries no text and no path: the body must be `{}`; the files it can write are the fixed `KNOWN_COMMAND_HASHES` target paths under the project root, chosen by signal files on disk. A file is replaced only when its bytes hash to a released SpecPilot version for that path, through temp file + `fsync` + mode + a last byte comparison + `rename`; a missing one is created with `wx`; a file that is a link or not a regular file is kept. New in the shared function, so also for `specpilot backfill`: folders on the way (`.claude`, `.claude/commands`, `.github`, `.github/prompts`, …) are checked with `lstat` one level at a time and created without `recursive`, each re-checked; a level that is a symbolic link or not a folder makes that file kept. A per-file write error is recorded as kept (`could not be written: <code>`) and the run continues. Residual: a local process that swaps a checked folder for a link between the `lstat` and the write can still redirect it; that needs write access to the project, which the threat model already treats as trusted (SEC-002.5 residual risk). Instruction files, `SKILL.md` and `.specs/` are not written.
- **Rationale**: Until now a project with `.specs/` had one writable file. This adds up to 48 fixed paths, but no request-chosen content: what lands there is SpecPilot's own current text, and what it replaces is SpecPilot's own older text, so a forged request that passed every layer could at worst update unedited command files or add missing ones, which `specpilot backfill` would do anyway and git shows. Without the folder check, a `.claude` link already in the repository (e.g. from a cloned project) would let `mkdir -p` and the create land outside it; `wx` alone guards only the file name.
- **Alternatives considered**:
  - All of `specpilot backfill` from the page — rejected by default: it appends text into `CLAUDE.md` and four other rule files the user edits, and writes `project.yaml` and `tasks.md` without the hash check the task writer has (open question 1).
  - `If-Match` over the command files — rejected: each replace already compares the file's bytes immediately before `rename`, which is the check that matters per file.
  - The folder check in the route only — rejected: the same write runs from the CLI; one guard in the shared function.
- **Reference**: SEC-002.6, SEC-004.10, REQ-002.H.30, ARCH-004.49

## Open Questions [SEC-005]

- Should SpecPilot add `npm audit` integration as a first-party feature? (tracked in BL-010)
- Should the `description` and `author` fields be validated with a stricter allowlist, or is Handlebars auto-escaping sufficient for interactive prompts from a local user? (Since BL-PM-004b there is no HTML escaping; the handle is quoted for YAML by `dq` and `yaml`, SEC-004.3.) (Over HTTP the handle has an allowlist since BL-055, SEC-004.12; the terminal prompts are unchanged. Since BL-PM-003 the project-context answers sent over HTTP are limited to one line of 1000 characters without control characters, SEC-004.14.)
- Should the `build:plugin` generator's own dependency chain be pinned/audited separately, given it now sits in the plugin's trusted computing base (SEC-002.4)?

---

_Last updated: 2026-10-08_
