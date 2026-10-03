---
fileID: SEC-003
lastUpdated: 2026-10-03 (BL-067 Spec Report)
version: 1.9
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

### [SEC-004.3] Handlebars auto-escaping relied on for template safety

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
- **Rationale**: Each layer covers a different forgery: the token stops any page that cannot read ours (the CSP-bound page is the only reader); `Origin` stops cross-site `fetch` and rebound origins even if a token leaked; JSON-only stops HTML form posts, which cannot set that content type without a preflight; the size cap bounds parsing. Relocating a line (never writing request text) means a forged request could at worst reorder tasks, which `If-Match` and git make recoverable.
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

## Open Questions [SEC-005]

- Should SpecPilot add `npm audit` integration as a first-party feature? (tracked in BL-010)
- Should the `description` and `author` fields be validated with a stricter allowlist, or is Handlebars auto-escaping sufficient for interactive prompts from a local user? (Over HTTP the handle has an allowlist since BL-055, SEC-004.12; the terminal prompts are unchanged.)
- Should the `build:plugin` generator's own dependency chain be pinned/audited separately, given it now sits in the plugin's trusted computing base (SEC-002.4)?

---

_Last updated: 2026-10-03_
