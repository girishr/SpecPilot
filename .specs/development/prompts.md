---
fileID: PROMPT-001
lastUpdated: 2026-04-26
version: 1.9
contributors: [girishr]
relatedFiles:
  [development/context.md, development/prompts-archive.md, project/project.yaml]
---

# Development Prompts Log

This file contains all AI-assisted development prompts and responses for the SpecPilot SDD CLI project, organized chronologically.

## Re-Anchor Prompt [PROMPT-000]

> Paste this into your AI agent when: the session has been running > 1 hour, you've made > 20 exchanges, or the AI seems to have forgotten project rules.

```
You are working on SpecPilot (TypeScript / Node.js / Commander.js).

CRITICAL RULES — re-read these before continuing:
1. NEVER commit, push, or deploy unless I explicitly ask you to.
2. NEVER modify .specs/ folder structure or file names — only update file contents.
3. After EVERY code change, proactively update all affected .specs/ files without being asked.
4. Spec-First Development — update .specs/ before writing code.
5. Log this and all AI interactions in .specs/development/prompts.md.

For full project context, read .specs/project/project.yaml.
```

## Latest Entries [PROMPT-002]
- CS-057: Backfill `team.devPrefix` prompt — `ensureDevPrefix()` + `readContributorsFirst()` + `writeDevPrefix()` + `promptHandle()` in `specBackfiller.ts`; `BackfillOptions.noPrompts`; `--no-prompts` flag on `backfill` CLI command; build clean, 102 tests (April 26, 2026) [PROMPT-002.0.0.14]
- CS-056 proposal: lower archive thresholds so `tasks.md` Completed archives above 25 lines and `prompts.md` archives above 100 lines; update archiver, validator warnings, generated guidance, and tests after spec approval (April 26, 2026) [PROMPT-002.0.0.11]
- CS-055: Backfill `tasks.md` devPrefix ID conventions — `readDevPrefix()` + `backfillTasksMd()` in `specBackfiller.ts`; `BackfillResult.tasksMd`; `backfill.ts` display updated; build clean, 102 tests (April 26, 2026) [PROMPT-002.0.0.13]
- CS-054: Branch warning for `specpilot archive` — `archiveCommand()` detects branch via `execSync`, warns + prompts `[y/N]` if not `main`/`master`, `--force` bypasses; committed (April 26, 2026) [PROMPT-002.0.0.12]
- CS-056: Lower archive thresholds — `PROMPTS_LINE_LIMIT` 300→100, `COMPLETED_LINE_LIMIT` 150→25; tests updated; `specpilot archive` run on SpecPilot's own spec files; committed `fd10048` (April 26, 2026) [PROMPT-002.0.0.11]
- CS-055: Added to Current Sprint tasks.md — backfill `tasks.md` devPrefix ID conventions in existing projects by reading `team.devPrefix` from `project.yaml` in `specBackfiller.ts`; no prompt needed (April 26, 2026) [PROMPT-002.0.0.10]
- CS-053: Mandatory short handle prompt in `init.ts` and `add-specs.ts`; `os.userInfo().username` for `--no-prompts`; loop until non-empty; `generateTasksMd()` updated with `CD-{devPrefix}-###` convention + `## Multi-Dev Notes`; `generatePromptsMd()` updated with prefixed ID examples; committed `c9875db` (April 26, 2026) [PROMPT-002.0.0.9]
- CS-052: Generate `.gitattributes` with `merge=union` for shared spec files; committed `bdb2762` (April 26, 2026) [PROMPT-002.0.0.8]
- CS-051: GitHub username prompt + `team.devPrefix` in generated `project.yaml`; committed `2aacf28` (April 26, 2026) [PROMPT-002.0.0.7]
- CS-050: Add `specpilot backfill` (alias `bf`) command — fingerprint-based detection for missing mandates in `project.yaml` and `copilot-instructions.md`; committed `715ab3d` (April 26, 2026) [PROMPT-002.0.0.6]- CS-040: Add “never implement unless asked” mandate to copilot-instructions.md, project.yaml, templateEngine.ts (March 7, 2026) [PROMPT-002.0.0.5]
- CS-039: Add “read before describe” mandate to copilot-instructions.md, project.yaml, templateEngine.ts (March 7, 2026) [PROMPT-002.0.0.4]
- CS-022 + CS-030: Closed as won't do — status: active on all files is noise; field used organically when non-active (March 7, 2026) [PROMPT-002.0.0.3]
- CS-021: Add `## Assumptions [ARCH-007]` section to `architecture/architecture.md` (v1.5→1.6) (March 7, 2026) [PROMPT-002.0.0.2]
- CS-019: Archive prompts.md (447→56 lines) to prompts-archive.md; add Archive Policy + 150-line note to tasks.md Completed (March 7, 2026) [PROMPT-002.0.0.1]
- CS-018: Rewrite `project/requirements.md` to v1.3 — add IDE config, agent config, specify command, Assumptions section (March 7, 2026) [PROMPT-002.0.0]
- CS-008: IDE Workspace Settings - Windsurf/Antigravity/Kiro Implementation (February 7, 2026) [PROMPT-002.0]
- CS-008: IDE Workspace Settings - Cursor Implementation (February 7, 2026) [PROMPT-002.0.1]
- CS-008: IDE Workspace Settings - VSCode Implementation (February 7, 2026) [PROMPT-002.0.2]
- CS-011: Fix Generator for Application Structure Display (October 18, 2025) [PROMPT-002.0.3]
- CS-009: Enhanced add-specs Command Implementation (October 12-16, 2025) [PROMPT-002.1]
- CS-005: Developer Name Prompt Implementation (October 12, 2025) [PROMPT-002.0.4]
- CS-004: Existing .specs Folder Detection (October 12, 2025) [PROMPT-002.0.5]
- Version 1.1.2 Release & Git Mandates (October 12, 2025) [PROMPT-002.0.6]
- Implement CS-008: .specs Structure Optimization & Metadata (October 6, 2025) [PROMPT-002.1.1]
- Language Support Limitation & Java Removal (October 3, 2025) [PROMPT-002.2]
- Publish SpecPilot v1.1.0 to NPM [PROMPT-002.3]
- Add Metadata Mandate to SpecPilot Templates [PROMPT-002.4]
- Add Metadata Update Mandate [PROMPT-002.5]
- Add Spec Update Mandate to SpecPilot [PROMPT-002.6]
- Specification Update (2025-10-04) [PROMPT-002.7]
- Project Initialization (September 14, 2025) [PROMPT-002.8]

## Archive Policy

This file has a **100-line limit**. When it exceeds 100 lines, run `specpilot archive` to move older detailed entries to [prompts-archive.md](prompts-archive.md). The most recent entries are always kept here.

> Archived entries: [prompts-archive.md](prompts-archive.md) (PROMPT-003 and PROMPT-004 archived 2026-03-07)
