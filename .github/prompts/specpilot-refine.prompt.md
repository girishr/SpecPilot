---
mode: agent
description: Refine .specs/ requirements from a new requirement description, with a diff preview before writing
---

Refine the project's spec files with a new requirement.

Requirement description: $ARGUMENTS

1. Read the current `.specs/project/requirements.md`, `.specs/development/context.md`, and `.specs/development/prompts.md`.
2. Propose specific additions or edits to those files that incorporate the requirement description above, following the existing stable-ID conventions (e.g. `REQ-###.#`).
3. Show a line-level diff preview of every proposed change — do not just describe it.
4. Wait for the user's confirmation before writing anything.
5. Once confirmed, write the changes.

This mirrors the CLI's `specpilot refine` (REQ-002.A.6) as a standalone agent workflow — it has no dependency on the CLI being installed.