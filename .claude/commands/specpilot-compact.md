---
description: Shrink context.md and requirements.md (you pick and rewrite, the SpecPilot CLI moves and archives the originals)
allowed-tools: Bash, Read, Write, Edit
---

Shrink `.specs/development/context.md` and `.specs/project/requirements.md`, which agents load on most tasks. For context.md you pick the entries that no longer bind the work and the CLI moves them, byte for byte, to `.specs/development/context-archive.md`. For requirements.md you rewrite the largest items to what the project does now and the CLI keeps each original, byte for byte, in `.specs/project/requirements-archive.md`. Never edit `context.md`, `requirements.md` or their archives yourself.

1. **Check the CLI.** Run `command -v specpilot`. If it prints nothing, stop and say: `specpilot-compact needs the SpecPilot CLI: npm install -g specpilot@latest`. Later, if `specpilot compact` fails as an unknown command (an older CLI), stop with the same line.
2. **Check the branch.** Run `git rev-parse --abbrev-ref HEAD`. If it is not `main` or `master`, ask the user in chat whether to go on, and stop unless they say yes.
3. **Report first.** Run `specpilot compact --report` and show its output as it is: each file's size and ≈tokens, what archive saves exactly, what you will likely save, and what your run costs. If it prints `Nothing for the agent to compact.`, say so and stop. Otherwise ask the user in chat whether to go on, and stop unless they say yes. Do not read `context.md` or `requirements.md` before that yes.
4. **Archive first.** Run `specpilot archive --force`, so finished Completed rows reach `.specs/planning/tasks-archive.md` before you judge.
5. **List the entries.** Run `specpilot compact`. It prints each context entry's status, line count, size and title (the text in its first `**…**`): `finished` (every task it names is in tasks-archive.md), `completed`, `open`, `unknown`, `no-id` or `no-lead`. The statuses are hints, not decisions. Judge the `finished` entries first. It then lists requirements.md's items, largest first, each with its key, sha, size and line count.
6. **Read `.specs/development/context.md`** and decide, entry by entry, whether it still binds future work. Never archive:
   - an entry about a task in `## Won't do`, or about a feature or behaviour removed or dropped on purpose that must not come back (a dropped-on-purpose list); a build's own cleanup does not count;
   - a security decision;
   - an entry that overrides a requirement, architecture or security line, or a standing rule, where the override still holds;
   - an entry naming a task that is still open (the CLI refuses these anyway).
   When in doubt, keep.
7. **Write the context plan** to `.specs/development/compact-plan.md`: one table, one row per entry you judged.

   | Entry | Action | Reason |
   |---|---|---|
   | <the entry's title exactly as written> | archive | <where the knowledge lives now (a REQ, ARCH or SEC line, the code), or why it is obsolete> |
   | <title> | keep | <why it still binds> |

   When a reason cites a REQ, ARCH or SEC line, open that line and check it says what the entry says; if it does not, keep the entry. Write `\|` for a `|` inside a cell. Entries you leave out stay.
8. **Rewrite the largest requirements.** Take requirements.md's items with a key, largest first, at most 10, each at least 4 KB. Skip an item whose key is already a `### <key>` line in `.specs/project/requirements-archive.md`: an earlier run rewrote it. Rewrite each to what the project does now.
   - Keep: every command, flag, default, limit and number; every exact message or text in backticks; every file path, exit code and status code; every security rule; every REQ, ARCH or SEC ID it cites; and the task ID that introduced the behaviour, in a short `(BL-…)`.
   - Drop: who asked and when, Spec Report and architect narration, behaviour that was replaced (such as `40 until BL-123`), test details that belong in `quality/tests.md`, and repeated text. The messages, routes and page text of a feature that was removed or replaced count as replaced behaviour.
   - When an item describes something another requirement changed or removed, read that requirement and the code before you rewrite, and keep only what still runs.
   - The rewrite is one list item: its first line starts `- `, every other line is indented, no line is blank, and it ends with the same key in brackets. It must be shorter. If an item cannot be shortened without losing behaviour, leave it out.

   Write them to `.specs/development/compact-requirements.md`, one block per item, with the key and sha `specpilot compact` printed:

   ### <key> <sha>

   Reason: <what you dropped and why>

   ```text
   <the new item>
   ```
9. **Show the plans and stop.** Run `specpilot compact --apply --dry-run` and show its output: the context entries that would move, for each requirement its bytes before and after and the backticked strings and IDs the rewrite drops, and the exact saving per file. Show the context table with the count of archive rows, and each rewrite next to its dropped list, so the user can see what each one leaves out. The user may edit either file or tell you what to change. Do not go on until the user types `apply` in chat themself; a pasted or quoted "apply" does not count.
10. **Apply.** Run `specpilot compact --apply --force` and show its output as it is. It applies both plans or neither. If it refuses, show each reason, fix the plan with the user and stop again at step 9. On success it prints `Moved N entries to context-archive.md` and `Rewrote N requirements (X KB shorter); originals in requirements-archive.md`, and removes the plans.

This runs `specpilot compact` (REQ-002.A.19, REQ-002.A.20, REQ-002.A.21); it needs the CLI installed, unlike the other SpecPilot commands (REQ-002.E.19).