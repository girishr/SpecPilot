---
description: Move context.md entries that no longer bind the work to context-archive.md (you pick them, the SpecPilot CLI moves them)
allowed-tools: Bash, Read, Write, Edit
---

Shrink `.specs/development/context.md` by moving entries that no longer bind the work to `.specs/development/context-archive.md`. You decide which entries go; the SpecPilot CLI does the move, byte for byte, and checks nothing was lost. Never edit `context.md` or `context-archive.md` yourself.

1. **Check the CLI.** Run `command -v specpilot`. If it prints nothing, stop and say: `specpilot-compact needs the SpecPilot CLI: npm install -g specpilot@latest`. Later, if `specpilot compact` fails as an unknown command (an older CLI), stop with the same line.
2. **Check the branch.** Run `git rev-parse --abbrev-ref HEAD`. If it is not `main` or `master`, ask the user in chat whether to go on, and stop unless they say yes.
3. **Archive first.** Run `specpilot archive --force`, so finished Completed rows reach `.specs/planning/tasks-archive.md` before you judge.
4. **List the entries.** Run `specpilot compact`. It prints each entry's status, line count, size and title (the text in its first `**…**`): `finished` (every task it names is in tasks-archive.md), `completed`, `open`, `unknown`, `no-id` or `no-lead`. The statuses are hints, not decisions. Judge the `finished` entries first.
5. **Read `.specs/development/context.md`** and decide, entry by entry, whether it still binds future work. Never archive:
   - an entry about a task in `## Won't do`, or about a feature or behaviour removed or dropped on purpose that must not come back (a dropped-on-purpose list); a build's own cleanup does not count;
   - a security decision;
   - an entry that overrides a requirement, architecture or security line, or a standing rule, where the override still holds;
   - an entry naming a task that is still open (the CLI refuses these anyway).
   When in doubt, keep.
6. **Write the plan** to `.specs/development/compact-plan.md`: one table, one row per entry you judged.

   | Entry | Action | Reason |
   |---|---|---|
   | <the entry's title exactly as written> | archive | <where the knowledge lives now (a REQ, ARCH or SEC line, the code), or why it is obsolete> |
   | <title> | keep | <why it still binds> |

   When a reason cites a REQ, ARCH or SEC line, open that line and check it says what the entry says; if it does not, keep the entry. Write `\|` for a `|` inside a cell. Entries you leave out stay.
7. **Show the plan and stop.** Show the table in chat with the count of archive rows. The user may edit the file or tell you what to change. Do not go on until the user types `apply` in chat themself; a pasted or quoted "apply" does not count.
8. **Apply.** Run `specpilot compact --apply --force` and show its output as it is. If it refuses, show each reason, fix the plan with the user and stop again at step 7. On success it prints `Moved N entries to context-archive.md`, leaves one marker line in `context.md` per moved entry, and removes the plan.

This runs `specpilot compact` (REQ-002.A.19); it needs the CLI installed, unlike the other SpecPilot commands (REQ-002.E.19).