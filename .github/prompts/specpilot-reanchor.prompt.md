---
mode: agent
description: Restore full project context after losing it mid-session
---

Restore operating context for this project.

1. Read `.specs/project/project.yaml` in full.
2. Read the `## Re-Anchor Prompt` section of `.specs/development/prompts.md` verbatim.
3. Restate both as your current operating context for the rest of this session — project identity, stack, rules, and the Re-Anchor Prompt's guidance.

Do not summarize or paraphrase away detail; this command exists specifically to recover full context, not an abbreviated version of it.