# .specs Folder — Fix Report

> Prioritized fixes for SpecPilot's own `.specs/` folder based on deep review.
> Created: 2026-02-20

---

## Priority Legend

| Tag    | Meaning                      | Guidance                |
| ------ | ---------------------------- | ----------------------- |
| **P0** | Broken / actively misleading | Fix before next commit  |
| **P1** | Stale or structurally wrong  | Fix this sprint         |
| **P2** | Quality / hygiene            | Schedule within 2 weeks |
| **P3** | Nice-to-have                 | Backlog                 |

---

## P0 — Broken / Actively Misleading

### 1. Delete or rewrite `spec-update-template.md` (CORRUPTED)

- **File:** `spec-update-template.md` (lines 1-76)
- **Problem:** Two copies of the template are interleaved line-by-line, producing garbled output (e.g., `# Spec Update Template---`). Completely unreadable.
- **Fix:** Delete the file and recreate it with a single clean copy of the template.
- **Effort:** 10 min
- [ ] Done

### 2. Replace `architecture/api.yaml` (describes non-existent REST API)

- **File:** `architecture/api.yaml` (181 lines)
- **Problem:** OpenAPI 3.0 spec with `servers: url: https://api.specpilot.dev/v1`, `POST /projects`, `GET /templates`, `POST /validate`. SpecPilot is a CLI tool — none of these endpoints exist.
- **Fix:** Replace with a CLI interface specification documenting the 6 actual commands (`init`, `validate`, `migrate`, `list`, `specify`, `add-specs`), their flags, arguments, and exit codes. Can still use YAML format, just not OpenAPI.
- **Effort:** 30 min
- [ ] Done

### 3. Fix wrong CLI docs in `development/docs.md`

- **File:** `development/docs.md` (lines 250-301)
- **Problem:** Documents `specpilot --list-templates`, `specpilot --validate`, `specpilot --migrate`. Actual commands are `specpilot list`, `specpilot validate`, `specpilot migrate`.
- **Fix:** Update the API Documentation section to match the real Commander.js commands.
- **Effort:** 10 min
- [ ] Done

---

## P1 — Stale or Structurally Wrong

### 4. Update all stale `lastUpdated` dates

- **Files affected:**
  - `project/requirements.md` — lastUpdated: 2025-10-26 (4+ months stale)
  - `project/project-plan.md` — lastUpdated: 2025-10-26
  - `quality/tests.md` — lastUpdated: 2025-10-26
  - `development/prompts.md` — lastUpdated: 2025-10-26 (content extends to Feb 2026)
- **Fix:** Update each file's `lastUpdated` to today's date after reviewing & refreshing content.
- **Effort:** 15 min
- [ ] Done

### 5. Fix duplicate PROMPT IDs in `development/prompts.md`

- **File:** `development/prompts.md` (429 lines)
- **Problem:** Multiple IDs reused:
  - `PROMPT-002.0.1` — used for both "Cursor Settings Implementation" and "Developer Name Prompt"
  - `PROMPT-002.0.3` — used twice
  - `PROMPT-002.1` — used twice
- **Fix:** Re-number duplicate entries with unique IDs. Consider adopting an auto-incrementing scheme.
- **Effort:** 15 min
- [ ] Done

### 6. Fix duplicate roadmap entry in `planning/roadmap.md`

- **File:** `planning/roadmap.md` (lines 44-45)
- **Problem:** "2026-02-08: Cloud-based AI agent integration" appears twice consecutively.
- **Fix:** Remove the duplicate line.
- **Effort:** 2 min
- [ ] Done

### 7. Archive completed tasks in `planning/tasks.md`

- **File:** `planning/tasks.md` (~300 lines)
- **Problem:** 38 completed items (CD-001 through CD-039) dominate the file. The 2 active sprint items are buried.
- **Fix:** Move completed items into a `### Completed (Archived)` collapsible section or a separate `tasks-archive.md`. Keep only active / upcoming items in the main view.
- **Effort:** 20 min
- [ ] Done

### 8. Delete or merge `project/project-plan.md`

- **File:** `project/project-plan.md` (57 lines)
- **Problem:** Covers only Phase 1 (Oct 2025), completely stale. Overlaps with `planning/roadmap.md` (timeline) and `planning/tasks.md` (work items). Three files doing the same job.
- **Fix:** Merge any unique content (milestones, success criteria) into `roadmap.md`, then delete `project-plan.md`.
- **Effort:** 15 min
- [ ] Done

### 9. Fix trailing `-` in `project/project.yaml`

- **File:** `project/project.yaml` (line 30)
- **Problem:** Empty list item after the last MANDATE rule — bare `-` on its own line.
- **Fix:** Remove the empty line.
- **Effort:** 1 min
- [ ] Done

---

## P2 — Quality / Hygiene

### 10. Scope down `development/docs.md`

- **File:** `development/docs.md` (301 lines, covers 10+ topics)
- **Problem:** Mixes spec conventions, mandate enforcement, deployment procedures, API docs, troubleshooting, contributing guide, and support info. Much of it duplicates the README.
- **Fix:** Keep only development procedures and spec conventions. Move contributing/troubleshooting/support to README. Remove duplicate API docs section.
- **Effort:** 30 min
- [ ] Done

### 11. Reduce mandates in `project/project.yaml`

- **File:** `project/project.yaml` (15 mandates + 7 ai-context items)
- **Problem:** Too many mandates — many are redundant or unenforceable (e.g., 3 separate "update .specs" rules, 3 "never do X without asking"). Mandate fatigue means they get ignored.
- **Suggested consolidation (5 mandates):**
  1. "Update relevant .specs/ files before each commit"
  2. "Log all AI interactions to .specs/prompts.md with timestamps"
  3. "Never commit, push, or publish without developer approval"
  4. "Keep documentation current and relevant"
  5. "Follow specification-driven development principles"
- **Effort:** 15 min
- [ ] Done

### 12. Update `project/requirements.md` content

- **File:** `project/requirements.md` (47 lines)
- **Problem:** Missing features shipped after Oct 2025: IDE config generation (7 IDEs), Cowork/Codex support, ASCII art UI, `add-specs` command, `specify` command. No Assumptions section.
- **Fix:** Add missing functional requirements, add `## Assumptions` section, add acceptance criteria to existing items.
- **Effort:** 25 min
- [ ] Done

### 13. Update `quality/tests.md`

- **File:** `quality/tests.md` (57 lines)
- **Problem:** All acceptance criteria unchecked. Stale since Oct 2025. Doesn't reflect actual test coverage (only 1 test file exists: `specGenerator.test.ts`).
- **Fix:** Document actual test coverage, check completed criteria, add missing test requirements.
- **Effort:** 20 min
- [ ] Done

### 14. Cap/archive `development/prompts.md`

- **File:** `development/prompts.md` (429 lines and growing)
- **Problem:** Unbounded growth. Contains full implementation details that duplicate git history. Will become unmanageable.
- **Fix:** Set a rolling window (keep last 30 days), archive older entries to `prompts-archive.md`. Trim entries to decision summaries, not full implementation details.
- **Effort:** 30 min
- [ ] Done

---

## P3 — Nice-to-Have

### 15. Add `security/` folder

- **Problem:** No security specifications exist. SpecPilot handles user paths, project names, and template rendering — all of which have injection/traversal risks.
- **Fix:** Create `.specs/security/` with at minimum:
  - `threat-model.md` — path traversal, template injection, supply chain
  - `security-decisions.md` — input sanitization approach, dependency policy
- **Effort:** 45 min
- [ ] Done

### 16. Add `## Assumptions` to `architecture/architecture.md`

- **File:** `architecture/architecture.md`
- **Problem:** No documented assumptions (e.g., Node.js ≥16 required, CommonJS module system, no Windows-specific path handling).
- **Fix:** Add an Assumptions section.
- **Effort:** 10 min
- [ ] Done

### 17. Add `status` front-matter to all spec files

- **Problem:** No way to tell if a spec is `draft`, `active`, or `deprecated`.
- **Fix:** Add `status: active` (or `draft`/`deprecated`) to the front-matter of each spec file.
- **Effort:** 15 min
- [ ] Done

---

## Execution Order

| Step | Fix # | Description                       | Depends On                |
| ---- | ----- | --------------------------------- | ------------------------- |
| 1    | 1     | Delete/rewrite corrupted template | —                         |
| 2    | 9     | Fix trailing `-` in project.yaml  | —                         |
| 3    | 6     | Remove duplicate roadmap entry    | —                         |
| 4    | 3     | Fix wrong CLI docs in docs.md     | —                         |
| 5    | 5     | Fix duplicate PROMPT IDs          | —                         |
| 6    | 2     | Replace api.yaml with CLI spec    | —                         |
| 7    | 8     | Delete/merge project-plan.md      | 2                         |
| 8    | 7     | Archive completed tasks           | —                         |
| 9    | 4     | Update all stale dates            | After content updates     |
| 10   | 11    | Consolidate mandates              | —                         |
| 11   | 10    | Scope down docs.md                | 3, 4                      |
| 12   | 12    | Update requirements.md            | —                         |
| 13   | 13    | Update tests.md                   | —                         |
| 14   | 14    | Cap/archive prompts.md            | 5                         |
| 15   | 15    | Add security/ folder              | —                         |
| 16   | 16    | Add Assumptions section           | —                         |
| 17   | 17    | Add status front-matter           | After all content updates |

---

_Total: 17 fixes · Estimated effort: ~5 hours · P0 fixes: ~50 min_
