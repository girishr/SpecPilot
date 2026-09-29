---
fileID: TESTS-001
lastUpdated: 2026-09-29
version: 2.11
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, architecture.md, tasks.md]
---

# Testing

## Current Coverage [TESTS-001.1]

**12 test suites, 445 tests, all passing** (Jest) — 216 before BL-050, +10 in `specReader.test.ts` (BL-050), +12 in `specArchiver.test.ts` (BL-057), +71 in `specServer.test.ts` (BL-051), +18 in `specPoller.test.ts` and +23 in `specServer.test.ts` (BL-052); +30 in `taskMover.test.ts` and +22 in `specServer.test.ts` (BL-053); +43 in `specArchiver.test.ts` (BL-061)

| Suite                 | File                          | Tests | Covers                                                                                           |
| --------------------- | ----------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Spec Generator        | `specGenerator.test.ts`       | 34    | End-to-end `.specs/` generation, IDE-routed AI context files, CLAUDE.md router, mandate output   |
| Template Engine       | `templateEngine.test.ts`      | 35    | Handlebars helpers (capitalize, lowercase, year), renderFromString, built-in template edge cases, Kotlin/Swift template keys and dependency sections |
| Project Detector      | `projectDetector.test.ts`     | 31    | Node.js/Python/Kotlin/Swift detection, framework identification, metadata extraction             |
| Project Migrator      | `projectMigrator.test.ts`     | 11    | Simple↔complex migration, file mapping, backup, merge strategy                                   |
| Spec Validator        | `specValidator.test.ts`       | 26    | Required files, YAML validity, mandate checking, cross-references, auto-fix                      |
| Spec Archiver         | `specArchiver.test.ts`        | 72    | Prompt/tasks archive thresholds (100/25), dry-run behaviour, archived block formatting; table-shaped `## Completed` (BL-057): rows moved by position incl. duplicate `#`/ID cells, header + separator kept and repeated in archive, byte-identical rows, list output unchanged, trailing section survives, archive → validate round trip has no Completed warning and the section is ≤ 25 lines (table and list), no warning when archive would move nothing, `--dry-run` writes nothing; the `specpilot-archive` slash command's `archive_tasks()` extracted from `SLASH_COMMANDS` and run under `bash` in a temp dir (no git repo, so no branch prompt) against table / table + trailing section / list / list + trailing section fixtures, asserted byte-identical to the CLI's output          ; prompts.md (BL-061): newest-first and oldest-first logs keep their newest entries, long / abbreviated (with and without a dot, incl. "Sept") / ISO dates, the last date in an entry wins, undated and mixed logs refused with nothing changed, undated entries and equal dates tolerated, 100 vs 101 lines, multi-line entries move whole, the generated `## Prompt History` table by its Date column with the header repeated, no log section refused, validate agrees before/after and on refusal, `lastDate()` cases, and the bash `archive_prompts()` byte-identical to the CLI on eleven shapes, including three with no trailing newline (7 of the old prompts tests now use dated logs instead of undated `Line N` text, which the fix refuses) |
| Spec Backfiller       | `specBackfiller.test.ts`      | 50    | `backfillProjectYaml()` (3 insertion strategies), `backfillCopilotInstructions()` (created/skipped/updated), `backfillTasksMd()` (devPrefix convention line + Multi-Dev Notes), `ensureDevPrefix`/`writeDevPrefix`/`readContributorsFirst`, dry-run for all paths (CS-060); IDE file backfill: cursor/claude/windsurf/antigravity mandate fingerprinting, SKILL.md structural fingerprint + stale detection, absent files skipped, dry-run (CS-061); slash command backfill: no signals → empty result, single/multiple IDE signal detection, dry-run reports without writing, real writes land at the correct per-IDE path, never overwrites an existing command file (CS-088) |
| Slash Command Generator | `slashCommandGenerator.test.ts` | 12  | Per-IDE routing/path/frontmatter (Claude Code, Cursor, Windsurf, Antigravity, GitHub Copilot), Codex reference-copy + one-time console notice, empty-list no-op (CS-079), all 8 commands present in `SLASH_COMMANDS` by default including `argument-hint`/`$ARGUMENTS` for `specpilot-refine` (CS-080–084), `allowed-tools` + embedded bash script + Copilot limitation note for `specpilot-validate` (CS-085), `allowed-tools` + branch guard + archive thresholds for `specpilot-archive` (CS-086); the extracted `archive_tasks()` bash is exercised in `specArchiver.test.ts` (BL-057), `allowed-tools` + fingerprint functions + devPrefix check + no-stray-backslash regression for `specpilot-backfill` (CS-087) |
| Spec Reader           | `specReader.test.ts`          | 10    | Pure parse of spec contents: front-matter metadata, `.yaml` leading-comment metadata, `tasks.md` Backlog / Current Sprint / Completed rows from a real-shaped fixture (incl. stray `_(empty …)_` line), malformed table row, missing section, section after `## Completed`, byte-for-byte cell round-trip |
| Spec Server           | `specServer.test.ts`          | 116   | Path guard (traversal, absolute, NUL, non-allowlisted file, symlink escaping the root, symlink escaping the allowlist), Host check (DNS rebinding), `/api/specs` shape against this repo's own `.specs/`, every task row byte-identical to its `tasks.md` line; `.git/HEAD` branch read incl. worktree `.git` files and detached HEAD; UI markdown renderer (`ui/md.js`) escapes raw HTML in every block type, keeps `[ID]` brackets and file list numbers, bounds table cells; integration on port 0 incl. the favicon route and the page's icon link; `--poll` validation; `/api/events` headers, Host check, 8-stream cap (503), heartbeat, cleanup on disconnect with polling stopped, no timers left after `close()`, and an edit to a temp `.specs` file arriving as a paths-only event within 2 s; the watched set equals the served set over an edge-case tree (hidden files and folders, `node_modules`, file and folder symlinks inside and outside the allowlist); `ui/route.js` keeps a fresh load of a deleted file's URL on the file view, escapes the URL's path, and is served and loaded; task moves over HTTP: token in the page and `tasks.sha256` in `/api/specs`, moves from pages on 127.0.0.1 and localhost, rejections for missing/wrong/short token, foreign or missing Origin, Host localhost with Origin 127.0.0.1, form and text content types, foreign Host (403/415), 17 KB body (413), stale If-Match (409 with fresh payload), missing If-Match (428), unknown/Completed/duplicate id and a bad section (422) — each leaving `tasks.md` untouched; GET on the route → 405; two simultaneous moves → one 200, one 409, nothing lost; `--read-only` → no token, POST 405: each route's status and security headers, 405 for other methods, 404 for unknown paths, 403 for a foreign Host, port-in-use error |
| Spec Poller           | `specPoller.test.ts`          | 18    | Edit, create, delete, atomic rename with identical size and mtime (inode only), burst coalesced into one event, files outside the allowlist / `node_modules` / dot-folders ignored, ENOENT between `readdir` and `stat` → delete, EACCES on a file → skipped, unreadable folder → contents kept, no scanning before `start()` or after `stop()`, no timer left after `stop()` mid-burst, 2000-file cap logged once, edits and new files at every allowlisted root (`.claude/commands/`, `.claude/skills/`, `.github/prompts/`, `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`) fire events |
| Task Mover            | `taskMover.test.ts`           | 30    | Byte-for-byte line moves (up, down, between sections, first and last row, CRLF, no trailing newline) with a one-line diff; refusals (unknown/duplicate/Completed id, no table, bad index, unkeepable bytes); 409 on a stale hash, 422 without writing; lock serialises two moves; a failed rename leaves `tasks.md` untouched; mode kept; symlink refused; a file with invalid UTF-8 refused rather than re-encoded; the hash is re-checked right before the rename (an editor save in between → 409, not clobbered); every move shape confirmed by real `git diff --numstat` = `1 1`; `tasksChecks()` words findings as `specpilot validate` does |

## Coverage Areas [TESTS-002]

### Unit Tests [TESTS-002.1]

- Template engine helpers, rendering, Kotlin/Swift template keys
- Spec file validation rules and auto-fix
- Migration file mapping (simple ↔ complex structure)
- Project detection: Node.js, Python, Kotlin, Swift; framework identification
- Markdown section bounds (`findSectionBounds`) via existing archiver/validator tests; Spec Reader parsing (BL-050)
- Spec Backfiller: fingerprint detection, mandate insertion (3 strategies), `readContributorsFirst`, `writeDevPrefix`, `ensureDevPrefix`, dry-run guard, IDE file backfill, SKILL.md stale detection

### Integration Tests [TESTS-002.2]

- End-to-end CLI workflow (init → validate)
- Template application and file system operations
- Error handling scenarios

### Validation Tests [TESTS-002.3]

- Spec file structure, YAML front-matter, cross-references, mandate checking
- Archive threshold warnings for `prompts.md` (100 lines) and `tasks.md` (25 lines)

## Acceptance Criteria [TESTS-003]

### CLI Initialization [TESTS-003.1]

- [x] Creates correct folder structure
- [x] Generates all required files
- [x] Applies correct templates
- [x] Handles custom folder names
- [x] Provides success feedback

### Template System [TESTS-003.2]

- [x] Lists available templates
- [x] Applies language-specific templates
- [x] Handles framework variations
- [ ] Supports custom templates

### Validation [TESTS-003.3]

- [x] Detects invalid spec structures
- [x] Reports validation errors clearly
- [x] Provides auto-fix suggestions
- [x] Maintains data integrity
