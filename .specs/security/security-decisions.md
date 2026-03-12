---
fileID: SEC-003
lastUpdated: 2026-03-12
version: 1.0
contributors: [girishr]
relatedFiles: [security/threat-model.md, architecture/architecture.md, project/project.yaml]
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

## Open Questions [SEC-005]

- Should SpecPilot add `npm audit` integration as a first-party feature? (tracked in BL-010)
- Should the `description` and `author` fields be validated with a stricter allowlist, or is Handlebars auto-escaping sufficient for interactive prompts from a local user?

---

_Last updated: 2026-03-12_
