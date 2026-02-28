---
fileID: TESTS-001
lastUpdated: 2026-02-28
version: 1.4
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, architecture.md, tasks.md]
---

# Testing

## Current Coverage [TESTS-001.1]

**5 test suites, 72 tests, all passing** (Jest)

| Suite | File | Tests | Covers |
|-------|------|-------|--------|
| Spec Generator | `specGenerator.test.ts` | 3 | End-to-end .specs/ generation, folder structure, file creation |
| Template Engine | `templateEngine.test.ts` | 24 | Handlebars helpers (capitalize, lowercase, year), renderFromString, edge cases |
| Project Detector | `projectDetector.test.ts` | 17 | Node.js/Python detection, framework identification, metadata extraction |
| Project Migrator | `projectMigrator.test.ts` | 11 | Simple↔complex migration, file mapping, backup, merge strategy |
| Spec Validator | `specValidator.test.ts` | 17 | Required files, YAML validity, mandate checking, cross-references, auto-fix |

## Test Plans [TESTS-002]

### Unit Tests [TESTS-002.1]

- Template engine helpers and rendering
- Spec file validation rules and auto-fix
- Migration file mapping (simple ↔ complex structure)
- Project detection (Node.js, Python)
- Framework identification

### Integration Tests [TESTS-002.2]

- End-to-end CLI workflow (init → validate)
- Template application and file system operations
- Error handling scenarios

### Validation Tests [TESTS-002.3]

- Spec file structure validation
- YAML front-matter presence and format
- Cross-reference validation
- Mandate checking

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
