# SpecPilot Tool — Improvement Plan

> Changes to the SpecPilot source code so it generates **better .specs** for users.
> These are code changes, not content fixes to SpecPilot's own `.specs/` folder.
> Created: 2026-02-20

---

## Priority Legend

| Tag    | Meaning                     | Guidance                |
| ------ | --------------------------- | ----------------------- |
| **P0** | Generates broken output     | Fix before next release |
| **P1** | Generates misleading output | Fix this sprint         |
| **P2** | Quality-of-life improvement | Schedule within 2 weeks |
| **P3** | Enhancement                 | Backlog                 |

---

## P0 — Generates Broken Output

### TOOL-001: Fix double-write bug in `spec-update-template.md` generation

- **File:** ~~specGenerator.ts L473-L518~~ (method removed in FIX-015)
- **Problem:** The generated `spec-update-template.md` was corrupted — two copies interleaved.
- **Status:** Resolved by FIX-015 which removed `generateSpecUpdateTemplateMd()` entirely.
- [x] Done (resolved via FIX-015)

---

## P1 — Generates Misleading Output

### TOOL-002: Replace OpenAPI `api.yaml` with CLI interface spec

- **Files:**
  - ~~specGenerator.ts L180-L189~~ → now `specFileGenerator.ts` `generateApiYaml()`
  - ~~templateRegistry.ts~~ (deleted in FIX-013)
  - [specValidator.ts](../../../src/utils/specValidator.ts) — `architecture/api.yaml` in required files
- **Problem:** Every generated project gets an OpenAPI 3.0 stub. Misleading for CLI tools, libraries, desktop apps.
- **Fix:**
  1. During `specpilot init`, ask the user: "Does your project expose an API?" (yes → OpenAPI stub, no → CLI/library interface spec)
  2. For CLI projects: generate a `cli-interface.yaml` documenting commands, flags, arguments, exit codes
  3. For library projects: generate an `api-surface.md` documenting exports
  4. Rename generated file contextually or keep `api.yaml` but change content
- **Effort:** 1-2 hours
- [ ] Done

### TOOL-003: Stop generating `project-plan.md` (merge into `roadmap.md`)

- **Files:**
  - [specGenerator.ts L302-L324](../../../src/utils/specGenerator.ts#L302-L324) — `generateProjectPlanMd()`
  - [specGenerator.ts L114](../../../src/utils/specGenerator.ts#L114) — call site
  - [specValidator.ts L30](../../../src/utils/specValidator.ts#L30) — in `requiredFiles` array
  - [specValidator.ts L365](../../../src/utils/specValidator.ts#L365) — cross-reference check
  - [specGenerator.test.ts L46](../../../src/__tests__/specGenerator.test.ts#L46) — expected in test
  - [docs/GUIDE.md L315](../../../docs/GUIDE.md#L315) — referenced in guide
- **Problem:** Three files do overlapping jobs: `project-plan.md` (milestones), `roadmap.md` (milestones), `tasks.md` (work items). New users won't know where to put what.
- **Fix:**
  1. Remove `generateProjectPlanMd()` call from the generation pipeline
  2. Merge unique content (success criteria, project charter) into the `roadmap.md` template
  3. Remove `project/project-plan.md` from `specValidator.ts` required files
  4. Update tests and docs
- **Effort:** 30 min
- [ ] Done

### TOOL-004: Reduce generated mandates from 10 to 5

- **File:** [templateEngine.ts L118-L131](../../../src/utils/templateEngine.ts#L118-L131)
- **Problem:** 10 MANDATE rules generated in `project.yaml`, plus 3 generic rules and 2 more. Many are redundant (3 variations of "update .specs before commit") or SpecPilot-internal concerns leaked to users (npm publish, git push). Mandate fatigue causes users to ignore all of them.
- **Fix:** Consolidate to 5 enforceable mandates:
  ```yaml
  rules:
    - "Follow {{language}} best practices and coding standards"
    - "MANDATE: Update relevant .specs/ files before each commit"
    - "MANDATE: Log AI interactions to .specs/prompts.md with timestamps"
    - "MANDATE: Never commit, push, or publish without developer approval"
    - "MANDATE: Keep documentation current — update dates, counts, and status"
  ```
- **Effort:** 15 min
- [ ] Done

### TOOL-005: Fix `docs.md` template — wrong CLI commands

- **File:** [specGenerator.ts L210-L270](../../../src/utils/specGenerator.ts#L210-L270) — `generateDocsMd()` (verify exact lines)
- **Problem:** If the generated `docs.md` includes CLI usage examples, ensure they reference the actual Commander.js subcommands (`specpilot init`, `specpilot list`, `specpilot validate`) not the old flag-style (`specpilot --list-templates`, `specpilot --validate`).
- **Fix:** Update the docs.md template string to use correct command syntax.
- **Effort:** 10 min
- [ ] Done

---

## P2 — Quality-of-Life Improvements

### TOOL-006: Add `## Assumptions` section to generated `requirements.md`

- **File:** [specGenerator.ts L143-L170](../../../src/utils/specGenerator.ts#L143-L170) — `generateRequirementsMd()`
- **Problem:** Generated `requirements.md` has Functional/Non-Functional sections but no Assumptions section. Users and AI agents need to document runtime assumptions (Node version, OS, network access, etc.) somewhere standard.
- **Fix:** Add `## Assumptions\n[TODO: Document runtime, environment, and dependency assumptions]` to the template.
- **Effort:** 5 min
- [ ] Done

### TOOL-007: Add `## Assumptions` section to generated `architecture.md`

- **File:** [templateEngine.ts](../../../src/utils/templateEngine.ts) — `getArchitectureTemplate()` (or wherever architecture.md template lives)
- **Problem:** Same as TOOL-006 — no Assumptions section in architecture specs.
- **Fix:** Add `## Assumptions\n[TODO: Document architectural assumptions and constraints]` to the architecture.md template.
- **Effort:** 5 min
- [ ] Done

### TOOL-008: Add stale-date warning to `specpilot validate`

- **File:** [specValidator.ts](../../../src/utils/specValidator.ts)
- **Problem:** The validator checks for file existence, YAML validity, and cross-references, but doesn't flag stale `lastUpdated` dates. A spec untouched for 90+ days in an active project is likely stale.
- **Fix:** Parse `lastUpdated` from each file's front-matter. If > 90 days old and the corresponding source files have changed (or just as a warning), emit: `"Warning: {file} has not been updated in {N} days"`.
- **Effort:** 45 min
- [ ] Done

### TOOL-009: Add `status` field to generated front-matter

- **Files:** All `generate*Md()` methods in [specGenerator.ts](../../../src/utils/specGenerator.ts)
- **Problem:** Generated specs have no `status` field. Users can't mark a spec as `draft`, `active`, or `deprecated`.
- **Fix:** Add `status: active` to the YAML front-matter of all generated markdown files.
- **Effort:** 15 min
- [ ] Done

### TOOL-010: Make `spec-update-template.md` useful or stop generating it

- **File:** ~~specGenerator.ts L473-L518~~ (method removed in FIX-015)
- **Problem:** The template was generated but never referenced by any command.
- **Status:** Resolved by FIX-015 — method and file both deleted.
- [x] Done (resolved via FIX-015)

### TOOL-011: Add archive guidance to generated `prompts.md`

- **File:** [specGenerator.ts L325-L430](../../../src/utils/specGenerator.ts#L325-L430) — `generatePromptsMd()`
- **Problem:** Generated prompts.md has no guidance on archiving old entries. Users will let it grow unboundedly (SpecPilot's own is already 429 lines after 4 months).
- **Fix:** Add a section to the template:
  ```markdown
  ## Archive Policy

  When this file exceeds 200 lines, archive entries older than 30 days to `prompts-archive.md`.
  Keep only the most recent entries and a summary of archived content.
  ```
- **Effort:** 5 min
- [ ] Done

### TOOL-012: Add archive guidance to generated `tasks.md`

- **File:** [specGenerator.ts](../../../src/utils/specGenerator.ts) — `generateTasksMd()`
- **Problem:** Same as TOOL-011. Generated tasks.md will accumulate completed items indefinitely.
- **Fix:** Add a section:
  ```markdown
  ## Archive Policy

  Move completed tasks older than 30 days to a `### Completed (Archived)` section
  or a separate `tasks-archive.md` file. Keep the active view focused on current work.
  ```
- **Effort:** 5 min
- [ ] Done

---

## P3 — Enhancements

### TOOL-013: Generate a `security/` folder with starter files

- **File:** [specGenerator.ts](../../../src/utils/specGenerator.ts) — add new generate methods
- **Problem:** No security specs generated. Projects handling user input (paths, names, templates) should have at minimum a threat model and security decisions doc.
- **Fix:** Add `security/` subfolder generation with:
  - `threat-model.md` — starter template for identifying threats
  - `security-decisions.md` — template for documenting security choices (input sanitization, dependency policy)
- **Also update:**
  - [specValidator.ts](../../../src/utils/specValidator.ts) — add `security/threat-model.md` to expected files (or optional files)
  - [templateRegistry.ts](../../../src/utils/templateRegistry.ts) — add to file lists
  - Tests and docs
- **Effort:** 1-2 hours
- [ ] Done

### TOOL-014: Make onboarding prompt context-aware

- **File:** ~~specGenerator.ts L346-L415~~ → now `specFileGenerator.ts` `generatePromptsMd()`
- **Problem:** The prompt was code-first, not spec-first. For green-field projects, not appropriate.
- **Status:** Resolved by FIX-018 — dual-prompt system: "new project" gets planning-focused prompt with baked-in project context; "existing project" keeps the analyze-and-populate prompt.
- [x] Done (resolved via FIX-018)

### TOOL-015: Add `--dry-run` flag to `specpilot init`

- **File:** [commands/init.ts](../../../src/commands/init.ts)
- **Problem:** Users can't preview what will be generated before committing to it.
- **Fix:** Add `--dry-run` flag that lists files that would be created without writing them.
- **Effort:** 30 min
- [ ] Done

---

## Execution Order

| Step | Fix #    | Description                              | Depends On                       |
| ---- | -------- | ---------------------------------------- | -------------------------------- |
| 1    | TOOL-001 | Verify/fix template double-write         | —                                |
| 2    | TOOL-004 | Reduce mandates to 5                     | —                                |
| 3    | TOOL-005 | Fix CLI commands in docs.md template     | —                                |
| 4    | TOOL-010 | Remove or wire up spec-update-template   | —                                |
| 5    | TOOL-003 | Stop generating project-plan.md          | —                                |
| 6    | TOOL-002 | Replace api.yaml with context-aware spec | TOOL-003 (fewer files to update) |
| 7    | TOOL-006 | Add Assumptions to requirements.md       | —                                |
| 8    | TOOL-007 | Add Assumptions to architecture.md       | —                                |
| 9    | TOOL-009 | Add status field to front-matter         | —                                |
| 10   | TOOL-011 | Add archive guidance to prompts.md       | —                                |
| 11   | TOOL-012 | Add archive guidance to tasks.md         | —                                |
| 12   | TOOL-008 | Add stale-date warning to validator      | —                                |
| 13   | TOOL-013 | Generate security/ folder                | —                                |
| 14   | TOOL-014 | Context-aware onboarding prompt          | —                                |
| 15   | TOOL-015 | Add --dry-run flag                       | —                                |

---

## Files Modified (Summary)

> **Note:** After FIX-011 (module split) and FIX-013 (TemplateRegistry removal):
> - `src/utils/specGenerator.ts` is now an 81-line coordinator
> - `src/utils/specFileGenerator.ts` (642 lines) handles spec file generation
> - `src/utils/ideConfigGenerator.ts` (137 lines) handles IDE settings
> - `src/utils/agentConfigGenerator.ts` (238 lines) handles agent configs
> - `src/utils/templateRegistry.ts` has been deleted
> - Line numbers below may need updating after each fix

| Source File                           | Fixes Touching It                                          |
| ------------------------------------- | ---------------------------------------------------------- |
| `src/utils/specFileGenerator.ts`      | TOOL-001, 002, 003, 005, 006, 009, 010, 011, 012, 014     |
| `src/utils/specGenerator.ts`          | TOOL-003 (coordinator)                                     |
| `src/utils/templateEngine.ts`         | TOOL-004, 007                                              |
| `src/utils/specValidator.ts`          | TOOL-003, 008, 013                                         |
| `src/commands/init.ts`                | TOOL-015                                                   |
| `src/__tests__/specGenerator.test.ts` | TOOL-002, 003, 010, 013                                    |
| `docs/GUIDE.md`                       | TOOL-003                                                   |

---

_Total: 15 changes · Estimated effort: ~8-10 hours · P0+P1 fixes: ~3-4 hours_
