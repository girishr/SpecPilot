---
fileID: ROADMAP-001
lastUpdated: 2026-10-04 (BL-PM-003 built)
version: 1.27
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
- IDE-native AI context routing for GitHub Copilot, Cursor, Windsurf, Antigravity, Claude Code, and Codex complete [ROADMAP-002.9] ✅
- Kotlin and Swift language support, conditional api.yaml, onboarding.md, terse spec templates complete [ROADMAP-002.10] ✅
- Code Philosophy + Code Rules in all generated AI instruction files [ROADMAP-002.11] ✅
- `specpilot-*` slash command generator with 8 commands across all supported IDEs, plus CLI-side backfill [ROADMAP-002.12] ✅
- Claude Code plugin (community marketplace) — self-contained, lowest-privilege plugin generated from `src/utils` into a `plugin/` subdir, distributed via `git-subdir` [ROADMAP-002.13]
- `specpilot serve` local UI over `.specs/`: Phase 0 groundwork (BL-050) ✅, Phase 1 read-only UI (BL-051) ✅ and live reload (BL-052) ✅, shipped together as v2.3.0, then task moves (BL-053) ✅ in v2.4.0, multiple projects named on the command line (BL-054) ✅ in v2.6.0 (a remembered project list and opening a folder from the page, BL-067 ✅, unreleased) and guided setup of a named folder without `.specs/` (BL-055) ✅ in v2.7.0 [ROADMAP-002.14]
- SpecPilot Local complete: every screen and action in the approved mockup that the content rule allows, then one full release, the website update and the announcement (BL-059) [ROADMAP-002.15]

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
- 2026-02-07: v1.4.0 release with AI IDE support for GitHub Copilot, Cursor, Windsurf, and Antigravity
- 2026-02-08: Cloud-based AI agent integration (Claude Code Skills, Codex Instructions)

### v1.5.x - Spec Maintenance Workflow (March-April 2026)

- 2026-03-07: Spec-first review gate, re-anchor prompts, and prompt/task archiving policy added
- 2026-03-12: Security specs added with threat model and security decision log
- 2026-04-26: `backfill` command added for non-destructive mandate updates in existing projects
- 2026-04-26: `archive` command thresholds lowered to keep active spec files concise

### v1.6.x - IDE-Native Backfill Alignment (May 2026)

- 2026-05-02: IDE-routed AI context file generation added
- 2026-05-03: Claude Code `CLAUDE.md` router generation added
- 2026-05-05: `specBackfiller.test.ts` added; 7 suites / 129 tests documented
- 2026-05-10: Spec files refreshed to match the current CLI surface and package version 1.6.7

### v2.0.x - Language Expansion + Output Quality (June 2026)

- 2026-06-06: v1.8.0 → v2.0.0 — Kotlin and Swift language support; conditional api.yaml (rest/cli/graphql/none); onboarding.md split from prompts.md; mandatory devPrefix; terse spec templates; Cursor output renamed to `specpilot.mdc`; 188 tests
- 2026-06-28: v2.1.0 — Code Philosophy + Code Rules injected into all generated AI instruction files and backfillable via `specpilot backfill` (CS-074)
- 2026-07-05: v2.2.0 — `slashCommandGenerator.ts` added with 8 `specpilot-*` commands (`status`, `reanchor`, `report`, `sync`, `refine`, `validate`, `archive`, `backfill`) routed across all supported IDEs, plus CLI-side backfill for missing command files (CS-079–088); fixed `specpilot validate` failing on every fresh project due to a stale `docs.md` required-file check; 209 tests
- 2026-07-30: v2.2.1 — bug-fix release from an audit of the validator/archiver/backfiller triangle (CS-090, CD-girishr-033/034): `specpilot backfill` now writes the `rules.process` prompt-tracking mandate the validator checks for (previously unfixable) and no longer corrupts a `project.yaml` that has no `rules:` key; `specpilot archive` no longer destroys `tasks.md` sections following `## Completed`; dead, comment-destroying `validate --fix` paths removed; 216 tests
- 2026-08-01: v2.2.2 — `specpilot backfill` no longer falsely reports `CLAUDE.md`, Cursor, Windsurf, and Antigravity rule files as missing all 8 critical mandates: new `TERSE_MD_MANDATES` fingerprints match the terse wording `buildCriticalMandatesMarkdown()` actually generates (per CHANGELOG `[2.2.2]`)
- 2026-08-02: v2.2.3 — `specpilot init` success screen gets two "Press Enter" read-pause gates (tree → next steps → onboarding prompt), skipped under `--no-prompts` (CS-091; per CHANGELOG `[2.2.3]`)
- 2026-09-27: v2.2.4 — Fixed: `specpilot archive` did nothing on a table-shaped `## Completed` section while `specpilot validate` kept telling you to run it (BL-057); The `specpilot-archive` slash command could still sweep sections after `## Completed` into the archive. Changed: Internal: shared section-bounds helper and pure spec reader (per CHANGELOG `[2.2.4]`)
- 2026-09-29: v2.3.0 — Added: `specpilot serve`: a read-only local web UI over your `.specs/` (BL-051, BL-052). Removed: Unused `fs-extra` dependency (per CHANGELOG `[2.3.0]`)
- 2026-09-29: v2.4.0 — Added: Move tasks in `specpilot serve` (BL-053). Fixed: `specpilot archive` archived the newest `prompts.md` entries instead of the oldest; In generated `prompts.md` files, `specpilot archive` moved the boilerplate instead of the log; How archiving `prompts.md` works now (BL-061) (per CHANGELOG `[2.4.0]`)
- 2026-10-01: v2.5.0 — Fixed: `specpilot backfill` now updates installed `specpilot-*` command files (BL-058) (per CHANGELOG `[2.5.0]`)
- 2026-10-02: v2.6.0 — Added: `specpilot serve` serves several projects from one server (BL-054); Fixed: `backfill` and `validate` follow what `init` writes since 2.0.0 (BL-066, BL-069); Changed: `## Completed` limit 40 lines (BL-060) (per CHANGELOG `[2.6.0]`)
- 2026-10-03: v2.7.0 — Added: `specpilot serve` can set up `.specs/` in a named folder that has none, running what `add-specs` runs and keeping every existing file (BL-055) (per CHANGELOG `[2.7.0]`)
- 2026-10-03: v2.7.1 — Fixed: `init`, `add-specs` and `refine --update` keep existing files outside `.specs/` instead of replacing them, and the overwrite / append / skip question is gone (BL-073) (per CHANGELOG `[2.7.1]`)
- 2026-10-04: v2.8.0 — Added: open another project from the `specpilot serve` page and have it remembered in `~/.specpilot/projects.json` (BL-067); a Home screen with Open a Project Folder and Recent projects (BL-PM-001) (per CHANGELOG `[2.8.0]`)

### Next - SpecPilot Local complete (planned) [ROADMAP-003.1]

Priority: the complete UI and its features first. Order, one BL per branch and Spec Report:

1. v2.7.1 patch: `init`, `add-specs` and `refine --update` keep existing files outside `.specs/` (BL-073) ✅ in v2.7.1
2. Projects: remembered projects and the Open a Project sheet (BL-067) ✅ and the Home screen (BL-PM-001) ✅ in v2.8.0
3. New projects: start a new project in a new or empty folder (BL-PM-003) ✅ on `main`, unreleased; then clone a repository (BL-PM-002), the 8-step chat setup with live preview and drafts (BL-PM-004)
4. Page actions: New Task (BL-PM-005), Commands and Skills split with Regenerate All (BL-PM-006), Open in VS Code (BL-PM-008)
5. Local MCP endpoint and the Connect your AI IDE card (BL-PM-007)
6. Full release of SpecPilot Local
7. Website update with the `specpilot serve` docs, then the announcement and LinkedIn post (BL-059)

Releases between steps are decided per step. Not planned now: the mockup's Needs you list, out-of-date instruction files, the in-sync chip, the conflict banner and the agent runner (left out under the content rule; to be revisited).

## Objectives [ROADMAP-004]

- Deliver working templates for TypeScript, JavaScript, and Python [ROADMAP-004.1]
- Enforce safeguards (prevent init in folders that already have .specs/) [ROADMAP-004.2]
- Ship clear docs and getting-started guidance [ROADMAP-004.3]
- Keep generated and live `.specs/` files aligned with the evolving CLI surface [ROADMAP-004.4]
- Embed minimal-code principles (Code Philosophy + Code Rules) into every generated AI instruction file [ROADMAP-004.5]

## Risks and Mitigations [ROADMAP-005]

- Template scope creep: fix by locking language targets per release [ROADMAP-005.1]
- Inconsistent docs: fix by validating all spec files before release [ROADMAP-005.2]
- Cross-platform issues: fix by testing on macOS, Linux, and Windows CI [ROADMAP-005.3]
