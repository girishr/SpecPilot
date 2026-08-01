---
mode: agent
description: Show current sprint status and next milestone at a glance
---

Give a one-screen status summary of the current sprint.

1. Read `.specs/planning/tasks.md` and extract the `## Current Sprint` section — list each item's ID and a short (<15 word) restatement.
2. Read `.specs/planning/roadmap.md` and find the `## Milestones` section — identify the next incomplete milestone.
3. Present a compact summary with two headings:
   - **Current Sprint**: bullet list of `[CS-###] [BL-###]` items with their short restatement.
   - **Next Milestone**: the next unchecked milestone from roadmap.md.

Keep it to one screen — do not re-print full task descriptions, just IDs and short summaries.