---
fileID: ROADMAP-001
lastUpdated: 2026-05-10
version: 1.6
contributors: [girishr]
relatedFiles: [tasks.md, project.yaml, requirements.md]
---

# Project Roadmap

## Milestones [ROADMAP-002]

- Initial template system complete [ROADMAP-002.1] ✅
- Language support finalized [ROADMAP-002.2] ✅
- CLI safeguards implemented [ROADMAP-002.3] ✅
- Documentation and validation [ROADMAP-002.4] ✅
- Gemini-style CLI interface complete [ROADMAP-002.5] ✅
- Multi-IDE workspace settings support [ROADMAP-002.6] ✅
- Production deployment to NPM [ROADMAP-002.7] ✅
- Spec maintenance commands (`backfill`, `archive`) complete [ROADMAP-002.8] ✅
- IDE-native AI context routing for VSCode, Cursor, Windsurf, Antigravity, Cowork, and Codex complete [ROADMAP-002.9] ✅

## Timeline [ROADMAP-003]

### v1.1.x - Initial Release (October 2025)

- 2025-10-06 to 2025-10-10: Template implementation
- 2025-10-11: CLI safeguard feature
- 2025-10-12: Documentation update
- 2025-10-13: Testing and validation
- 2025-10-14: Release candidate
- 2025-10-27: v1.2.2 initial NPM release

### v1.3.0 - Visual Enhancement (November 2025)

- 2025-11-01 to 2025-11-05: Gemini-style CLI interface design
- 2025-11-06: ASCII logo implementation
- 2025-11-07: v1.3.0 release with graphical CLI

### v1.4.0 - IDE & Cloud Agent Integration (February 2026)

- 2026-02-01 to 2026-02-05: Multi-IDE workspace settings implementation
- 2026-02-06: IDE selection prompts and configuration generation
- 2026-02-07: v1.4.0 release with AI IDE support for VSCode, Cursor, Windsurf, and Antigravity
- 2026-02-08: Cloud-based AI agent integration (Cowork Skills, Codex Instructions)

### v1.5.x - Spec Maintenance Workflow (March-April 2026)

- 2026-03-07: Spec-first review gate, re-anchor prompts, and prompt/task archiving policy added
- 2026-03-12: Security specs added with threat model and security decision log
- 2026-04-26: `backfill` command added for non-destructive mandate updates in existing projects
- 2026-04-26: `archive` command thresholds lowered to keep active spec files concise

### v1.6.x - IDE-Native Backfill Alignment (May 2026)

- 2026-05-02: IDE-routed AI context file generation added
- 2026-05-03: Cowork `CLAUDE.md` router generation added
- 2026-05-05: `specBackfiller.test.ts` added; 7 suites / 129 tests documented
- 2026-05-10: Spec files refreshed to match the current CLI surface and package version 1.6.7

## Objectives [ROADMAP-004]

- Deliver working templates for TypeScript, JavaScript, and Python [ROADMAP-004.1]
- Enforce safeguards (prevent init in folders that already have .specs/) [ROADMAP-004.2]
- Ship clear docs and getting-started guidance [ROADMAP-004.3]
- Keep generated and live `.specs/` files aligned with the evolving CLI surface [ROADMAP-004.4]

## Risks and Mitigations [ROADMAP-005]

- Template scope creep: fix by locking language targets per release [ROADMAP-005.1]
- Inconsistent docs: fix by validating all spec files before release [ROADMAP-005.2]
- Cross-platform issues: fix by testing on macOS, Linux, and Windows CI [ROADMAP-005.3]
