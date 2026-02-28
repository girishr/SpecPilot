# SpecPilot Code Review — Fixes Report

**Date:** 2026-02-22
**Reviewer:** Claude Opus 4.6 (acting as senior staff engineer)
**Codebase Version:** 1.4.0
**Status:** Actionable fixes, prioritized by severity

---

## How to Use This Report

Each fix has a **priority**, the **file(s)** affected, the **problem**, and the **exact fix** required.
Work top-to-bottom. Each item is independent unless noted.

Check off items as you complete them:

---

## P0 — Critical (Fix Immediately)

### FIX-001: Remove unused `blessed` dependency

- **File:** `package.json` (line 53)
- **Problem:** `blessed` (^0.1.81) is listed as a production dependency but is never imported or used anywhere in the entire codebase. It adds ~2MB to install size for zero benefit.
- **Evidence:** `grep` for `import blessed`, `require('blessed')` — zero results across all source files.
- **Fix:** Run `npm uninstall blessed`
- **Effort:** 2 minutes
- [x] Done

---

### FIX-002: Fix broken `lowercase` Handlebars helper

- **File:** `src/utils/templateEngine.ts` (line 30)
- **Problem:** The `lowercase` helper does `str.slice(1)` which removes the first character instead of lowercasing the string. This is a copy-paste bug from the `capitalize` helper below it.
- **Current code:** `Handlebars.registerHelper('lowercase', (str: string) => str.slice(1));`
- **Fix:** Change to `Handlebars.registerHelper('lowercase', (str: string) => str.toLowerCase());`
- **Effort:** 1 minute
- [x] Done

---

### FIX-003: Fix hardcoded version in welcome screen

- **File:** `src/utils/logger.ts` (line 49)
- **Problem:** `displayWelcome()` shows `'SpecPilot CLI v1.2.2'` but `package.json` version is `1.4.0`. Users see the wrong version.
- **Current code:** `chalk.blue.bold('SpecPilot CLI v1.2.2')`
- **Fix:** Either read version from package.json at runtime, or accept it as a constructor parameter:

  ```typescript
  // Option A: Read at runtime
  const pkg = require('../../package.json');
  // then use: chalk.blue.bold(`SpecPilot CLI v${pkg.version}`)

  // Option B: Pass as parameter
  constructor(private version: string = require('../../package.json').version) {}
  // then use: chalk.blue.bold(`SpecPilot CLI v${this.version}`)
  ```

- **Effort:** 5 minutes
- [x] Done

---

### FIX-004: Fix hardcoded date in spec generator

- **File:** `src/utils/specGenerator.ts` (line 96)
- **Problem:** `lastUpdated` is hardcoded to `'2025-10-05'` instead of using the current date. Every project generated today gets a stale date.
- **Current code:** `lastUpdated: '2025-10-05',`
- **Fix:** Change to `lastUpdated: new Date().toISOString().split('T')[0],`
- **Effort:** 1 minute
- [x] Done

---

## P1 — High (Fix This Week)

### FIX-005: Remove unused `Command` imports from all command files

- **Files:** All 6 command files import `{ Command } from 'commander'` but none use `Command`
  - `src/commands/init.ts` (line 1)
  - `src/commands/validate.ts` (line 1)
  - `src/commands/migrate.ts` (line 1)
  - `src/commands/list.ts` (line 1)
  - `src/commands/specify.ts` (line 1)
  - `src/commands/add-specs.ts` (line 1)
- **Problem:** Dead imports. They increase cognitive load and will trigger lint warnings when a linter is added.
- **Fix:** Remove `import { Command } from 'commander';` from each file. None of them reference `Command` in their code.
- **Effort:** 5 minutes
- [x] Done

---

### FIX-006: Extract duplicated `getFrameworksForLanguage()` into shared utility

- **Files:**
  - `src/commands/init.ts` (line 176–183)
  - `src/commands/add-specs.ts` (line 141–148)
- **Problem:** The same function with the same body exists in two files. They will drift as one gets updated and the other doesn't.
- **Fix:** Create `src/utils/frameworks.ts`:
  ```typescript
  export function getFrameworksForLanguage(language: string): string[] {
    const frameworks: Record<string, string[]> = {
      typescript: ["react", "express", "next", "nest", "vue", "angular"],
      python: ["fastapi", "django", "flask", "streamlit"],
    };
    return frameworks[language] || [];
  }
  ```
  Then import from this shared file in both `init.ts` and `add-specs.ts`, removing the local copies.
- **Effort:** 15 minutes
- [x] Done

---

### FIX-007: Sanitize project names to prevent template injection

- **File:** `src/commands/init.ts` (line 35–38)
- **Problem:** Project name validation blocks filesystem-invalid chars (`<>:"/\|?*`) but allows Handlebars injection characters like `{{`. Since names are interpolated into Handlebars templates, a malicious name could execute template expressions.
- **Current validation:** `/[<>:"/\\|?*]/.test(projectName)`
- **Fix:** Replace with allowlist: `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(projectName)`. Also add a max-length check (e.g., 214 chars, matching npm's limit).
- **Effort:** 10 minutes
- [x] Done

---

### FIX-008: Fix migration file mapping for subfolder structure

- **File:** `src/utils/projectMigrator.ts` (line 166–195)
- **Problem:** `mapComplexToSimpleFile()` maps files to a flat target structure (e.g., `'architecture.md' → join(targetDir, 'architecture.md')`), but the current `.specs/` structure uses subfolders (`architecture/architecture.md`, `project/requirements.md`, etc.). Migrations produce the wrong output.
- **Fix:** Update the mapping to match the subfolder structure:
  ```typescript
  const mapping: Record<string, string> = {
    "project.yaml": join(targetDir, "project", "project.yaml"),
    "architecture.md": join(targetDir, "architecture", "architecture.md"),
    "requirements.md": join(targetDir, "project", "requirements.md"),
    "api.yaml": join(targetDir, "architecture", "api.yaml"),
    "tests.md": join(targetDir, "quality", "tests.md"),
    "tasks.md": join(targetDir, "planning", "tasks.md"),
    "context.md": join(targetDir, "development", "context.md"),
    "prompts.md": join(targetDir, "development", "prompts.md"),
    "docs.md": join(targetDir, "development", "docs.md"),
    // ... complex structure mappings similarly updated
  };
  ```
  Also ensure target subdirectories are created before copying files.
- **Effort:** 20 minutes
- [x] Done

---

### FIX-009: Fix duplicate CHANGELOG entry

- **File:** `CHANGELOG.md` (lines 50 and 185)
- **Problem:** `## [1.2.2] - 2025-10-27` appears twice with different content. The first instance (line 50) covers the initial release notes. The second (line 185) covers specify command fixes and migration improvements.
- **Fix:** Merge both entries under a single `[1.2.2]` heading, combining their content. Remove the duplicate.
- **Effort:** 10 minutes
- [x] Done

---

### FIX-010: Add a real linter

- **File:** `package.json` (line 18)
- **Problem:** The `lint` script is `echo 'Add linting here'`. For a project inviting contributors, this is a gap.
- **Fix:**
  ```bash
  npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
  ```
  Create a basic `.eslintrc.json`. Update the script to `"lint": "eslint src/ --ext .ts"`.
- **Effort:** 30 minutes
- [x] Done

---

## P2 — Medium (Fix Within 2 Weeks)

### FIX-011: Split `specGenerator.ts` (1,298 lines) into focused modules

- **File:** `src/utils/specGenerator.ts`
- **Problem:** This file is a God object that handles: spec file generation, IDE settings (VSCode, Cursor, Windsurf, Kiro, Antigravity), agent configs (Cowork, Codex), and all templates as inline strings. Contributors can't work on IDE configs without risking spec generation bugs.
- **Fix:** Split into 3 files:
  1. `src/utils/specFileGenerator.ts` — generates `.specs/` markdown and YAML files (~400 lines)
  2. `src/utils/ideConfigGenerator.ts` — generates IDE workspace settings (~500 lines)
  3. `src/utils/agentConfigGenerator.ts` — generates Cowork Skills, Codex instructions (~200 lines)

  Keep `specGenerator.ts` as a thin coordinator that delegates to these three modules.

- **Effort:** 2–3 hours
- [ ] Done

---

### FIX-012: Deduplicate IDE settings generation

- **File:** `src/utils/specGenerator.ts` (lines 700–1130, approximately)
- **Problem:** `generateVSCodeSettings`, `generateCursorSettings`, `generateWindsurfSettings`, `generateKiroSettings`, `generateAntigravitySettings` are ~95% identical. Each is ~80 lines of near-identical JSON with 2–3 IDE-specific keys. A bug fix in one is easily missed in the others.
- **Fix:** Create a single base settings object and a per-IDE overlay:

  ```typescript
  function getBaseSettings(context: TemplateContext): Record<string, any> {
    /* shared config */
  }

  const IDE_OVERRIDES: Record<string, Record<string, any>> = {
    cursor: { "cursor.aiAccess": true, "cursor.enableAIContext": true },
    windsurf: { "windsurf.aiContext.enabled": true },
    // ...
  };

  function generateIDESettings(
    ide: string,
    projectDir: string,
    context: TemplateContext,
  ) {
    const settings = { ...getBaseSettings(context), ...IDE_OVERRIDES[ide] };
    // write to appropriate directory
  }
  ```

- **Effort:** 1–2 hours (can be done as part of FIX-011)
- [x] Done

---

### FIX-013: Make the template system real or remove the abstraction

- **Files:**
  - `src/templates/` (empty directory)
  - `src/utils/templateRegistry.ts`
  - `src/utils/templateEngine.ts`
- **Problem:** The `templates/` directory is empty. `TemplateRegistry` returns identical file lists for every framework. `TemplateEngine.render()` is mostly bypassed in favor of `renderFromString()` with inline strings. The abstraction costs complexity but delivers no variation.
- **Fix (option A — invest):** Move inline templates from `specGenerator.ts` into actual `.hbs` files in `src/templates/`, organized by language/framework. Load them via `TemplateEngine.loadTemplate()`.
- **Fix (option B — simplify):** Delete `TemplateRegistry`, delete `templates/` directory, keep `TemplateEngine` only for `renderFromString()` and helpers. Be honest that all frameworks produce the same structure.
- **Effort:** 2–4 hours depending on direction
- [x] Done — Chose Option B: deleted `TemplateRegistry` and empty `templates/` dir, removed dead `loadTemplate()`/`render()` from `TemplateEngine`, inlined catalog as a static `TEMPLATES` constant in `list.ts`

---

### FIX-014: Add test coverage for validation, migration, and project detection

- **File:** `src/__tests__/` (currently only `specGenerator.test.ts` with 3 tests)
- **Problem:** The most important command (`validate`) has zero tests. Migration, project detection, code analysis, and the `specify` command's file mutations are all untested. A spec-first tool with minimal test coverage undermines its own credibility.
- **Priority test files to add:**
  1. `src/__tests__/specValidator.test.ts` — test validation rules, mandate checking, auto-fix
  2. `src/__tests__/projectMigrator.test.ts` — test file mapping, merge strategy
  3. `src/__tests__/projectDetector.test.ts` — test Node.js and Python detection
  4. `src/__tests__/templateEngine.test.ts` — test helpers work correctly
- **Effort:** 4–6 hours
- [x] Done — Added all 4 test suites (69 new tests, 72 total): specValidator (17), projectMigrator (11), projectDetector (17), templateEngine (24)

---

## P3 — Low (Fix Before Next Release)

### FIX-015: Remove or justify `spec-update-template.md` generation

- **File:** `src/utils/specGenerator.ts` (line 475–518)
- **Problem:** `spec-update-template.md` is generated in every project's `.specs/` root but is never referenced by any command, workflow, or documentation. It reads like internal meta-documentation that leaked into user output.
- **Fix:** Either integrate it into a workflow (e.g., `specpilot update` command) or stop generating it. If you keep it, reference it from `README.md` so users know it exists.
- **Effort:** 15 minutes
- [x] Done — Removed `generateSpecUpdateTemplateMd()` call from `generateAll()` and deleted the method. The file was unreferenced by any command, validator, or test.

---

### FIX-016: Clarify overlap between `project-plan.md`, `roadmap.md`, and `tasks.md`

- **Files:** Generated in `project/project-plan.md`, `planning/roadmap.md`, `planning/tasks.md`
- **Problem:** All three files track overlapping concerns (planning, milestones, tasks). Contributors and users will be confused about where to put what.
- **Fix:** Either:
  - (A) Merge `project-plan.md` into `roadmap.md` and stop generating it, or
  - (B) Give each file a distinct, documented purpose with clear boundaries (e.g., `tasks.md` = sprint-level work items, `roadmap.md` = quarter-level milestones, `project-plan.md` = project charter/scope)
- **Effort:** 30 minutes
- [x] Done — Chose Option B: gave each file a distinct documented purpose via header comments and purpose-appropriate template sections. `project-plan.md` = charter (scope/goals/stakeholders), `roadmap.md` = release milestones (versioned phases), `tasks.md` = sprint tracker (Backlog/In Progress/Completed/Blocked).

---

### FIX-017: Verify fabricated IDE setting keys

- **Files:** IDE settings generation in `src/utils/specGenerator.ts`
- **Problem:** Several generated settings keys appear fabricated and don't correspond to documented settings in those editors:
  - `"prompt.fileContext"` (VSCode — not a real setting)
  - `"cursor.aiAccess"`, `"cursor.enableAIContext"` (Cursor — undocumented)
  - `"windsurf.aiContext.enabled"`, `"windsurf.specs.integration"` (Windsurf — undocumented)
  - `"antigravity.ai.enabled"`, `"antigravity.contextual"` (Antigravity — undocumented)
  - `"kiro.ai.contextAware"`, `"kiro.specs.enabled"` (Kiro — undocumented)
- **Risk:** Invalid settings are silently ignored at best, generate warnings at worst, and erode user trust.
- **Fix:** Research each IDE's actual settings API. Remove or replace any keys that aren't real. Add comments noting which keys are aspirational vs. confirmed.
- **Effort:** 1–2 hours of research per IDE
- [x] Done — Removed fabricated base settings (`prompt.fileContext`, `chat.agent.enabled`, `chat.contextAware`, `chat.includeWorkspaceContext`, `workspace.folders`). Replaced with confirmed real VS Code settings only. All IDE-specific override keys (cursor.*, windsurf.*, kiro.*, antigravity.*) are now marked `// ASPIRATIONAL` in both source and generated output so users know they are unconfirmed.

---

### FIX-018: Reposition AI onboarding prompt as brownfield workflow

- **File:** Generated `prompts.md` and `README.md` (spec output)
- **Problem:** The primary onboarding flow tells users: "Copy prompt → paste into AI → AI reads your code → AI writes your specs." This is code-first development with extra steps — the opposite of spec-first thinking. The AI backfills specs from implementation, which undermines the tool's philosophy.
- **Fix:**
  - For `specpilot init` (greenfield): Guide users to write specs manually. The generated spec files already have sections and placeholders — lean into this as the default.
  - For `specpilot add-specs` (brownfield): The AI onboarding prompt is appropriate here — position it as "catch up" for existing projects.
  - Update generated `README.md` to reflect this distinction.
- **Effort:** 1 hour
- [ ] Done

---

### FIX-019: Add confirmation/diff to `specify` command's destructive writes

- **File:** `src/commands/specify.ts`
- **Problem:** The `specify` command silently overwrites sections of `requirements.md`, `context.md`, and `prompts.md` without showing what changed or asking for confirmation. For a tool that values careful specification, destructive writes without review are misaligned.
- **Fix:** Before writing, show a diff of what will change and prompt for confirmation (unless `--no-prompts` is set). At minimum, log which files were modified and what sections were replaced.
- **Effort:** 1–2 hours
- [ ] Done

---

## Summary

| Priority      | Count        | Total Effort     |
| ------------- | ------------ | ---------------- |
| P0 — Critical | 4 fixes      | ~10 minutes      |
| P1 — High     | 6 fixes      | ~1.5 hours       |
| P2 — Medium   | 4 fixes      | ~10–15 hours     |
| P3 — Low      | 5 fixes      | ~5–7 hours       |
| **Total**     | **19 fixes** | **~17–24 hours** |

### Recommended Execution Order

**Day 1 (< 1 hour):** FIX-001 through FIX-004 (all P0 items — mechanical, zero-risk fixes)

**Day 2 (~ 1.5 hours):** FIX-005 through FIX-009 (P1 code-level fixes)

**Day 3 (~ 30 min):** FIX-010 (add linter, catches future issues automatically)

**Week 2:** FIX-011, FIX-012, FIX-013 (structural refactoring — do together)

**Week 2–3:** FIX-014 (test coverage — do alongside refactoring)

**Before next release:** FIX-015 through FIX-019 (product/UX alignment)

---

_Generated from code review performed 2026-02-22. All line numbers reference the codebase as of commit containing "feat: Add git control mandates."_
