---
fileID: SEC-003
lastUpdated: 2026-07-26
version: 1.1
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
- **Decision**: All templates are built-in (inline in source code). SpecPilot makes zero HTTP/network calls during `init`, `add-specs`, `validate`, or any other command.
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
- **Decision**: Keep runtime dependencies to the smallest practical set: `commander`, `handlebars`, `chalk`, `inquirer`. No additional libraries unless strictly necessary.
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

## Open Questions [SEC-005]

- Should SpecPilot add `npm audit` integration as a first-party feature? (tracked in BL-010)
- Should the `description` and `author` fields be validated with a stricter allowlist, or is Handlebars auto-escaping sufficient for interactive prompts from a local user?
- Should the `build:plugin` generator's own dependency chain be pinned/audited separately, given it now sits in the plugin's trusted computing base (SEC-002.4)?

---

_Last updated: 2026-07-26_
