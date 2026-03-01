---
fileID: ROADMAP-001
lastUpdated: 2026-03-01
version: 1.5
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
- 2026-02-07: v1.4.0 release with 5 AI IDE support (VSCode, Cursor, Windsurf, Kiro, Antigravity)
- 2026-02-08: Cloud-based AI agent integration (Cowork Skills, Codex Instructions)

## Objectives [ROADMAP-004]

- Deliver working templates for TypeScript/JavaScript, Python, and Go [ROADMAP-004.1]
- Enforce safeguards (prevent init in folders that already have .specs/) [ROADMAP-004.2]
- Ship clear docs and getting-started guidance [ROADMAP-004.3]

## Risks and Mitigations [ROADMAP-005]

- Template scope creep: fix by locking language targets per release [ROADMAP-005.1]
- Inconsistent docs: fix by validating all spec files before release [ROADMAP-005.2]
- Cross-platform issues: fix by testing on macOS, Linux, and Windows CI [ROADMAP-005.3]
