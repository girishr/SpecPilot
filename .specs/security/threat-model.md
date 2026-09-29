---
fileID: SEC-001
lastUpdated: 2026-09-29
version: 1.7
contributors: [girishr]
relatedFiles:
  [
    security/security-decisions.md,
    architecture/architecture.md,
    project/requirements.md,
  ]
---

# Threat Model

## Overview [SEC-001.1]

This document identifies and assesses security threats relevant to the SpecPilot CLI tool. SpecPilot is an offline, file-generating CLI — it reads user input (CLI arguments, interactive prompts) and writes files to disk. It makes no outbound network calls at runtime. Since BL-051, `specpilot serve` opens a read-only HTTP listener on the loopback interface (SEC-002.5).

The threat model focuses on four attack surfaces: **path traversal** via user-supplied names, **template injection** through the Handlebars rendering engine, **supply-chain compromise** of runtime dependencies, and **plugin distribution** (the Claude Code plugin surface — repo/account compromise, plugin dependencies, and build-generator poisoning).

## Threat Model [SEC-002]

### Path Traversal [SEC-002.1]

| Field             | Detail                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**   | A user-supplied project name containing path separators (`../`, `..\\`) or special filesystem characters could cause SpecPilot to write files outside the intended project directory.                     |
| **Impact**        | High — arbitrary file overwrite on the local filesystem.                                                                                                                                                  |
| **Likelihood**    | Low — requires intentional malicious input from the local user.                                                                                                                                           |
| **Entry point**   | `specpilot init <project-name>` CLI argument.                                                                                                                                                             |
| **Mitigation**    | Project name is validated against an allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` before any filesystem operation (FIX-007 / CD-046). Path separators, null bytes, and special characters are rejected. |
| **Residual risk** | Minimal. The allowlist approach blocks unknown-bad characters by default rather than trying to enumerate known-bad ones.                                                                                  |

### Template Injection [SEC-002.2]

| Field             | Detail                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Description**   | User-supplied values (`projectName`, `description`, `author`) are interpolated into Handlebars templates. A crafted input could inject Handlebars expressions (`{{`, `{{{`) to execute arbitrary helpers or access prototype properties.                                                                                                                                                                     |
| **Impact**        | Medium — could produce malformed spec files or, in theory, invoke registered Handlebars helpers with attacker-controlled arguments.                                                                                                                                                                                                                                                                          |
| **Likelihood**    | Low — the allowlist regex on `projectName` blocks `{` and `}` characters; `description` and `author` are interpolated with Handlebars double-brace escaping (HTML-encoded output).                                                                                                                                                                                                                           |
| **Entry point**   | All fields rendered by `TemplateEngine.renderFromString()`: `projectName`, `description`, `author`, `framework`, `language`.                                                                                                                                                                                                                                                                                 |
| **Mitigation**    | (1) `projectName` validated by allowlist regex — `{`, `}`, and all non-alphanumeric/dot/dash/underscore characters rejected (FIX-007). (2) Handlebars `{{ }}` auto-escapes HTML entities. (3) No `{{{ }}}` (triple-brace, unescaped) usage in any template. (4) Only 6 safe helpers registered (`uppercase`, `lowercase`, `capitalize`, `currentDate`, `currentYear`, `join`) — none execute arbitrary code. |
| **Residual risk** | Low. The `description` and `author` fields come from interactive prompts (not untrusted external sources). A local user who controls the terminal can already write arbitrary files.                                                                                                                                                                                                                         |

### Supply Chain [SEC-002.3]

| Field             | Detail                                                                                                                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**   | A compromised or malicious version of a runtime dependency could execute arbitrary code when SpecPilot runs.                                                                                                                                                                                                                      |
| **Impact**        | Critical — full code execution in the context of the CLI process.                                                                                                                                                                                                                                                                 |
| **Likelihood**    | Very low — all dependencies are widely-used, actively maintained packages.                                                                                                                                                                                                                                                        |
| **Entry point**   | `npm install` / dependency resolution at install time.                                                                                                                                                                                                                                                                            |
| **Dependencies**  | `commander` (CLI parsing), `handlebars` (templating), `chalk` (terminal colors), `inquirer` (interactive prompts), `js-yaml` (YAML parsing in `specValidator.ts`, `init.ts` and `specServer.ts`). `fs-extra` was removed in BL-056: it was declared but never imported. |
| **Mitigation**    | (1) Minimal dependency set — 5 direct runtime dependencies, all imported; `specpilot serve` added none (`node:http` is built in). (2) `package-lock.json` pinned in the repository. (3) No network calls at runtime — a compromised dep cannot phone home silently during normal operation. (4) All dependencies are high-profile packages with large install bases and active security reporting. |
| **Residual risk** | Non-zero but industry-standard. Periodic `npm audit` runs and lockfile review are recommended.                                                                                                                                                                                                                                    |

### Plugin Distribution [SEC-002.4]

Distributing SpecPilot as a Claude Code plugin (REQ-002.G, ARCH-004.27) adds a **new attack surface** distinct from the CLI. A Claude Code plugin runs with the user's privileges and is trusted on the basis of its source; Anthropic's marketplace review is a filter, not a guarantee.

| Field             | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Description**   | (a) **Repo/account compromise → auto-pin bump**: because the plugin lives in this repo and the community catalog auto-bumps the pinned commit SHA as commits are pushed, a merged malicious PR or a stolen push credential produces a new commit that becomes the installable version for new installs and for users with auto-update enabled. (b) **Plugin-dependency supply chain**: if the plugin ever shipped its own npm deps + an install hook, every such dep would run on the user's machine. (c) **Generator poisoning**: since the plugin is built from `src/utils`, a compromise of the build tooling, a template, or a generator dependency flows silently into the committed `plugin/` bundle. |
| **Impact**        | Critical — arbitrary code execution at the installing user's privilege level, on developer machines.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Likelihood**    | Low — requires compromising the maintainer's repo/account or the build/dependency chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Entry point**   | `girishr/SpecPilot` git history (`plugin/` subtree), the `build:plugin` generator and its dependencies, and the community-marketplace `git-subdir` pin.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Mitigation**    | (1) **Lowest-privilege plugin**: no hooks, no MCP, no `bin/`, no monitors, no shipped npm deps — the plugin only proposes permission-gated file writes (SEC-004.5). (2) **No install hook / no runtime deps** eliminates plugin-dependency supply chain (SEC-004.7). (3) **Repo hardening**: branch protection on `main`, required review, 2FA/passkeys, and treating everything under `plugin/` and the build generator as security-sensitive in review (SEC-004.6). (4) **SHA pinning + cache-copy**: users get exactly the reviewed commit; Claude Code copies marketplace plugins to a local cache and skips symlinks pointing outside the plugin dir, blocking host-file exfiltration. (5) **Generated-not-hand-edited** bundle keeps the audited surface in `src/utils` rather than in opaque plugin files.                                     |
| **Residual risk** | Non-zero: users who enable auto-update receive a poisoned commit N+1 before manual review. Reduced by repo hardening and the no-code-execution plugin shape (worst case is permission-gated file writes the user still approves).                                                                                                                                                                                                                                                                                                               |

### Local Spec Server — `specpilot serve` [SEC-002.5]

An HTTP server on `127.0.0.1` that shows a project's `.specs/` and a few generated files in the browser (BL-051) and, unless started with `--read-only`, moves task rows in `.specs/planning/tasks.md` (BL-053). Any page the user has open in the same browser can send it requests.

| Field             | Detail |
| ----------------- | ------ |
| **Description**   | (a) **DNS rebinding**: a hostile site rebinds its hostname to `127.0.0.1` and reads responses as same-origin. (b) **Path traversal / symlink escape** through `/api/file?p=`, reading files outside the project or outside the allowlist (e.g. `~/.ssh`, `.env`, source). (c) **Cross-origin reads**: another origin reading the JSON or file text. (d) **Stored XSS**: spec text rendered as HTML runs script in the UI's origin. (e) **Exposure beyond the machine** if bound to a non-loopback interface. (f) **CSRF** against `POST /api/tasks/move` (BL-053): a hostile page makes the browser reorder or move the user's tasks, via a form post, a `fetch` with `no-cors`, or a DNS-rebound origin. (g) **Resource exhaustion** through live reload (BL-052): many open `/api/events` streams, or a very large allowlisted tree making each poll expensive. (h) **Write integrity**: a move that corrupts or truncates `tasks.md` (crash mid-write, two writers at once, an external editor saving at the same moment, a write through a symlink). |
| **Impact**        | High for (a)–(c): disclosure of local file contents. Medium for (d): script in the UI's origin can read what the UI can read. Medium for (f) and (h): unwanted or lost edits to `tasks.md`, which is under version control. |
| **Likelihood**    | Low — requires the server to be running and the user to visit a hostile page (a–c), or a malicious string committed into the project's spec files (d). |
| **Entry point**   | HTTP requests to `127.0.0.1:<port>`: the `Host` header, the method, the path and the `p` query parameter; long-lived `/api/events` streams; `POST /api/tasks/move` bodies and headers; spec file text rendered by the UI. |
| **Mitigation**    | (1) Listen on `127.0.0.1` only (e). (2) `Host` must equal `127.0.0.1:<port>` or `localhost:<port>`, else 403 (a). (3) `/api/file` path allowlist, `..` / absolute / NUL rejected, no hidden or `node_modules` segment below an allowlisted folder, no symlinked folder on the way, `realpath` must stay inside the root and the allowlist, regular files only (b). (4) No CORS headers, so browsers keep cross-origin responses opaque (c). (5) The markdown renderer escapes `&<>"` before adding its own tags; `Content-Security-Policy: default-src 'self'` blocks inline and third-party script; `X-Content-Type-Options: nosniff` stops a served `.md` being run as script (d). (6) **CSRF (closed in BL-053, was deferred to Phase 3)**: per-start random 32-byte token in a meta tag, required as `X-SpecPilot-Token` and compared with `crypto.timingSafeEqual`; `Origin` must equal the page's own origin; only `application/json` (no form posts); bodies ≤ 16 KB; the Host check; `--read-only` removes the route (f). (7) `/api/events` is capped at 8 open streams (503 beyond), has the same Host check, sends only changed paths (never content), and the poller `stat()`s only files the path guard would serve, runs only while a stream is open, and stops with the last one; Ctrl+C clears every timer (g). (8) Writes: a write allowlist holding only `.specs/planning/tasks.md`; `If-Match` sha256 (409, never merge); an in-process lock; temp file + `fsync` + `rename` keeping the file mode; a symlinked `tasks.md` is refused; a move only relocates one existing line, so no request can inject text; the file hash is re-checked immediately before the `rename`, so an editor save that lands mid-move gets 409 instead of being overwritten; moves that cannot keep every other byte are refused (422), not approximated: a target section with no table yet, a move involving the file's last line when it has no trailing newline, and a `tasks.md` that is not valid UTF-8 (h). |
| **Residual risk** | Low. Any local process can already read these files directly; the server adds no capability a local user lacks. The residual browser-side risk is a renderer escaping bug, contained by the CSP. For (h): an external editor save landing in the instant between the pre-rename hash re-check and the `rename` itself would be overwritten; closing that window needs OS-level file locking, which Node does not offer portably. `tasks.md` is under git, so such a loss is recoverable. |

## Attack Surface Summary [SEC-003]

| Entry Point                          | Data Type            | Validated?                     | Used In                                  |
| ------------------------------------ | -------------------- | ------------------------------ | ---------------------------------------- |
| `<project-name>` CLI argument        | String               | ✅ Allowlist regex             | Directory creation, Handlebars templates |
| `--description` / interactive prompt | String               | ⚠️ Handlebars auto-escape only | Handlebars templates (double-brace)      |
| `--author` / interactive prompt      | String               | ⚠️ Handlebars auto-escape only | Handlebars templates (double-brace)      |
| Language / framework selection       | Enum (fixed choices) | ✅ Inquirer choice list        | Template selection, file content         |
| IDE / agent selection                | Enum (fixed choices) | ✅ Inquirer choice list        | Config generation                        |
| Existing project files (add-specs)   | Disk read            | N/A — read-only scan           | Code analysis output                     |
| Plugin git history / build generator | Code + templates     | ⚠️ Repo hardening + review     | Committed `plugin/` bundle (SEC-002.4)   |
| `specpilot serve` HTTP requests      | Host, method, path, `p` | ✅ Host allowlist, 405/404, path allowlist + realpath | Read-only file responses (SEC-002.5) |
| `specpilot serve --port`             | Integer              | ✅ 1–65535 integer             | `server.listen()` on 127.0.0.1           |
| `specpilot serve --poll`             | Integer (ms)         | ✅ whole number ≥ 250          | Poller interval (SEC-002.5 g)            |
| `GET /api/events` streams            | Long-lived connection | ✅ Host check, cap of 8 (503)  | Change events: paths only (SEC-002.5 g)  |
| `POST /api/tasks/move`               | JSON `{id, toSection, toIndex}`, `If-Match`, `X-SpecPilot-Token`, `Origin` | ✅ Host, Origin, token, JSON only, ≤ 16 KB, If-Match, row lookup | One line moved in `tasks.md` (SEC-002.5 f, h) |

## Out of Scope [SEC-004]

- **OS-level permissions**: SpecPilot runs with the invoking user's permissions; filesystem sandboxing is the OS's responsibility.
- **Runtime environment hardening**: Node.js version security, container isolation, etc. are outside SpecPilot's scope.
- **Generated file security**: The `.specs/` files SpecPilot writes are plain text (Markdown/YAML). It is the user's responsibility to keep them safe (e.g., not committing secrets).
- **CI/CD pipeline security**: Downstream use of spec files in build pipelines is out of scope.
- **Compliance frameworks**: SOC2, GDPR, HIPAA, etc. are tracked in the backlog (BL-010) but not yet addressed.

---

_Last updated: 2026-09-29_
