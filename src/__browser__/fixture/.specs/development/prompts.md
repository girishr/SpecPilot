---
title: Prompts Log
description: AI interaction log for fixture-project
project: fixture-project
language: typescript
framework: 
lastUpdated: 2026-10-11
sourceOfTruth: project/project.yaml
---

# Development Prompts Log

## Overview
This file (prompts.md) contains ALL AI interactions for fixture-project. Update .specs/prompts.md with every AI interaction.

**🚨 MANDATE**: Update with every AI interaction.

## Archive Policy

> **Line limit: 100 lines.** When this file exceeds 100 lines, run:
>
> ```bash
> specpilot archive
> ```
>
> This will move older entries from this file into `development/prompts-archive.md` automatically, keeping the most recent entries here. A `--dry-run` flag is available to preview changes before writing.
>
> No stub `prompts-archive.md` file is generated during `specpilot init` — it is created on first archive run.

## Re-Anchor Prompt

> Paste this into your AI agent when: the session has been running > 1 hour, you've made > 20 exchanges, or the AI seems to have forgotten project rules.

~~~
You are working on fixture-project (typescript).

CRITICAL RULES — re-read these before continuing:
1. NEVER commit, push, or deploy unless I explicitly ask you to.
2. NEVER modify .specs/ folder structure or file names — only update file contents.
3. After EVERY code change, proactively update all affected .specs/ files without being asked.
4. Spec-First Development — update .specs/ before writing code.
5. Log this and all AI interactions in .specs/development/prompts.md.

For full project context, read .specs/project/project.yaml.
~~~

---

## Prompt History

| Date | User | Prompt Summary | Context |
|------|------|----------------|---------|
| YYYY-MM-DD | @username | Example prompt | Brief context or outcome |