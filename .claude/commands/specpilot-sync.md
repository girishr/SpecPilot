---
description: Compare .specs/ against actual project state and propose fixes for drift
---

Find and fix drift between `.specs/` and the real project.

1. Read `.specs/architecture/architecture.md`, `.specs/project/requirements.md`, and `.specs/quality/tests.md`.
2. Compare their claims against the actual `src/` structure and `package.json` (versions, dependencies, scripts).
3. List concrete discrepancies: stale version numbers, renamed or removed files/modules still referenced, undocumented modules that exist in `src/` but aren't mentioned in the specs, stale command or test-suite lists.
4. Propose specific per-file edits to close each discrepancy — do not just describe the problem, show the fix.
5. Wait for the user's confirmation before writing any of the proposed edits.

This is a judgment/comparison task, not a mechanical one — do not attempt to script the diff; read and reason about each file.