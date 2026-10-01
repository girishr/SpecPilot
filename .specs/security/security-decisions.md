---
fileID: SEC-003
lastUpdated: 2026-10-01
version: 1.7
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
- **Decision**: `POST /api/tasks/move` is the only write route. It requires a per-start random 32-byte token (meta tag in `index.html`, header `X-SpecPilot-Token`, `crypto.timingSafeEqual`), an `Origin` equal to the page's own origin, `Content-Type: application/json`, a body ≤ 16 KB and the usual Host check; it writes only `.specs/planning/tasks.md` (a write allowlist separate from the read allowlist), only by relocating one existing line, only when `If-Match` matches the file's sha256, under an in-process lock, through a temp file, `fsync` and `rename`. `--read-only` removes the route, the handles and the token. This closes the CSRF item SEC-004.8 deferred to Phase 3.
- **Rationale**: Each layer covers a different forgery: the token stops any page that cannot read ours (the CSP-bound page is the only reader); `Origin` stops cross-site `fetch` and rebound origins even if a token leaked; JSON-only stops HTML form posts, which cannot set that content type without a preflight; the size cap bounds parsing. Relocating a line (never writing request text) means a forged request could at worst reorder tasks, which `If-Match` and git make recoverable.
- **Alternatives considered**:
  - SameSite cookies — rejected: localhost cookies are shared across ports and the page has no login; a header token is simpler and not sent automatically.
  - Accepting a full new `tasks.md` from the client — rejected: turns the endpoint into an arbitrary-text writer.
  - Merging on a hash mismatch — rejected: silent merges of a hand-edited file are how edits get lost; 409 and a redraw are explicit.
- **Reference**: SEC-002.5 (f, h), REQ-002.H.10, REQ-002.H.11, ARCH-004.36

### [SEC-004.11] Multiple projects: roots fixed at start, chosen by index, no registry

- **Date**: 2026-10-01
- **Decision**: `specpilot serve a b c` serves the folders named on the command line, each `realpath`-resolved and required to contain `.specs/`. The list never changes while the server runs. `/api/` routes pick a project with `?project=<n>`, an index into that list: one value matching `^(0|[1-9][0-9]*)$` (empty, repeated, signed, padded or out of range → 404). Order: Host, method, then for a move Origin, token, content type and size, then the project, so an unauthenticated request never gets an answer that depends on the project; from there every SEC-004.8–SEC-004.10 control applies unchanged to that one root. One token per server start covers every project. Nothing is written outside the served folders; no route accepts a folder path.
- **Rationale**: Taking roots only from the command line means a web page can never choose what the server reads; an index (not a path) leaves nothing to traverse. Running the existing per-root guards unchanged keeps one security model to test. A shared origin and token across projects grant nothing new: the same local user named every folder.
- **Alternatives considered**:
  - A registry in `~/.specpilot/projects.json` plus an "open folder" route — deferred to BL-067: the first write outside the project (ARCH-007.5), and a route that turns a forged request into "serve this folder".
  - One server per folder — rejected for this phase: one port and origin per project, so one rail would need cross-origin calls and a token per origin.
  - Projects addressed by folder name or path in the URL — rejected: names collide and paths invite traversal; an index has neither problem.
- **Reference**: SEC-002.5 (i), REQ-002.H.13, ARCH-004.39

## Open Questions [SEC-005]

- Should SpecPilot add `npm audit` integration as a first-party feature? (tracked in BL-010)
- Should the `description` and `author` fields be validated with a stricter allowlist, or is Handlebars auto-escaping sufficient for interactive prompts from a local user?
- Should the `build:plugin` generator's own dependency chain be pinned/audited separately, given it now sits in the plugin's trusted computing base (SEC-002.4)?

---

_Last updated: 2026-10-01_
