---
fileID: TESTS-001
lastUpdated: 2026-05-05
version: 1.7
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, architecture.md, tasks.md]
---

# Testing

## Current Coverage [TESTS-001.1]

**7 test suites, 129 tests, all passing** (Jest)

| Suite            | File                      | Tests | Covers                                                                                           |
| ---------------- | ------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Spec Generator   | `specGenerator.test.ts`   | 15    | End-to-end `.specs/` generation, IDE-routed AI context files, CLAUDE.md router, mandate output   |
| Template Engine  | `templateEngine.test.ts`  | 24    | Handlebars helpers (capitalize, lowercase, year), renderFromString, built-in template edge cases |
| Project Detector | `projectDetector.test.ts` | 17    | Node.js/Python detection, framework identification, metadata extraction                          |
| Project Migrator | `projectMigrator.test.ts` | 11    | Simple↔complex migration, file mapping, backup, merge strategy                                   |
| Spec Validator   | `specValidator.test.ts`   | 24    | Required files, YAML validity, mandate checking, cross-references, auto-fix                      |
| Spec Archiver    | `specArchiver.test.ts`    | 14    | Prompt/tasks archive thresholds (100/25), dry-run behaviour, archived block formatting           |
| Spec Backfiller  | `specBackfiller.test.ts`  | 24+   | `backfillProjectYaml()` (3 insertion strategies), `backfillCopilotInstructions()` (created/skipped/updated), `backfillTasksMd()` (devPrefix convention line + Multi-Dev Notes), `ensureDevPrefix`/`writeDevPrefix`/`readContributorsFirst`, dry-run for all paths (CS-060); IDE file backfill: cursor/claude/windsurf/antigravity mandate fingerprinting, SKILL.md structural fingerprint + stale detection, absent files skipped, dry-run (CS-061 pending) |

## Test Plans [TESTS-002]

### Unit Tests [TESTS-002.1]

- Template engine helpers and rendering
- Spec file validation rules and auto-fix
- Migration file mapping (simple ↔ complex structure)
- Project detection (Node.js, Python)
- Framework identification
- Spec Backfiller: fingerprint detection, text-based mandate insertion (3 strategies), `readContributorsFirst` (inline/block/fallback), `writeDevPrefix` (with/without existing `team:` block), `ensureDevPrefix` (`noPrompts`, `dryRun`), dry-run guard for all three backfill targets

### Integration Tests [TESTS-002.2]

- End-to-end CLI workflow (init → validate)
- Template application and file system operations
- Error handling scenarios

### Validation Tests [TESTS-002.3]

- Spec file structure validation
- YAML front-matter presence and format
- Cross-reference validation
- Mandate checking
- Archive threshold warnings and archive-trigger behaviour for `prompts.md` and `tasks.md`

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
