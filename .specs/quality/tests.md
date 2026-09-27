---
fileID: TESTS-001
lastUpdated: 2026-09-27
version: 2.7
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, architecture.md, tasks.md]
---

# Testing

## Current Coverage [TESTS-001.1]

**9 test suites, 238 tests, all passing** (Jest) — 216 before BL-050, +10 in `specReader.test.ts` (BL-050), +12 in `specArchiver.test.ts` (BL-057)

| Suite                 | File                          | Tests | Covers                                                                                           |
| --------------------- | ----------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Spec Generator        | `specGenerator.test.ts`       | 34    | End-to-end `.specs/` generation, IDE-routed AI context files, CLAUDE.md router, mandate output   |
| Template Engine       | `templateEngine.test.ts`      | 35    | Handlebars helpers (capitalize, lowercase, year), renderFromString, built-in template edge cases, Kotlin/Swift template keys and dependency sections |
| Project Detector      | `projectDetector.test.ts`     | 31    | Node.js/Python/Kotlin/Swift detection, framework identification, metadata extraction             |
| Project Migrator      | `projectMigrator.test.ts`     | 11    | Simple↔complex migration, file mapping, backup, merge strategy                                   |
| Spec Validator        | `specValidator.test.ts`       | 26    | Required files, YAML validity, mandate checking, cross-references, auto-fix                      |
| Spec Archiver         | `specArchiver.test.ts`        | 29    | Prompt/tasks archive thresholds (100/25), dry-run behaviour, archived block formatting; table-shaped `## Completed` (BL-057): rows moved by position incl. duplicate `#`/ID cells, header + separator kept and repeated in archive, byte-identical rows, list output unchanged, trailing section survives, archive → validate round trip has no Completed warning and the section is ≤ 25 lines (table and list), no warning when archive would move nothing, `--dry-run` writes nothing; the `specpilot-archive` slash command's `archive_tasks()` extracted from `SLASH_COMMANDS` and run under `bash` in a temp dir (no git repo, so no branch prompt) against table / table + trailing section / list / list + trailing section fixtures, asserted byte-identical to the CLI's output           |
| Spec Backfiller       | `specBackfiller.test.ts`      | 50    | `backfillProjectYaml()` (3 insertion strategies), `backfillCopilotInstructions()` (created/skipped/updated), `backfillTasksMd()` (devPrefix convention line + Multi-Dev Notes), `ensureDevPrefix`/`writeDevPrefix`/`readContributorsFirst`, dry-run for all paths (CS-060); IDE file backfill: cursor/claude/windsurf/antigravity mandate fingerprinting, SKILL.md structural fingerprint + stale detection, absent files skipped, dry-run (CS-061); slash command backfill: no signals → empty result, single/multiple IDE signal detection, dry-run reports without writing, real writes land at the correct per-IDE path, never overwrites an existing command file (CS-088) |
| Slash Command Generator | `slashCommandGenerator.test.ts` | 12  | Per-IDE routing/path/frontmatter (Claude Code, Cursor, Windsurf, Antigravity, GitHub Copilot), Codex reference-copy + one-time console notice, empty-list no-op (CS-079), all 8 commands present in `SLASH_COMMANDS` by default including `argument-hint`/`$ARGUMENTS` for `specpilot-refine` (CS-080–084), `allowed-tools` + embedded bash script + Copilot limitation note for `specpilot-validate` (CS-085), `allowed-tools` + branch guard + archive thresholds for `specpilot-archive` (CS-086); the extracted `archive_tasks()` bash is exercised in `specArchiver.test.ts` (BL-057), `allowed-tools` + fingerprint functions + devPrefix check + no-stray-backslash regression for `specpilot-backfill` (CS-087) |
| Spec Reader           | `specReader.test.ts`          | 10    | Pure parse of spec contents: front-matter metadata, `.yaml` leading-comment metadata, `tasks.md` Backlog / Current Sprint / Completed rows from a real-shaped fixture (incl. stray `_(empty …)_` line), malformed table row, missing section, section after `## Completed`, byte-for-byte cell round-trip |

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
