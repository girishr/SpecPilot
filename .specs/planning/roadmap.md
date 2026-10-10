---
fileID: ROADMAP-001
lastUpdated: 2026-10-10 (v2.13.0 prepared)
version: 1.38
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
- Claude Code plugin (community marketplace) — self-contained, lowest-privilege plugin generated from `src/utils` into a `plugin/` subdir, distributed via `git-subdir` — deferred, not planned now [ROADMAP-002.13]
- `specpilot serve` local UI over `.specs/`: Phase 0 groundwork (BL-050) ✅, Phase 1 read-only UI (BL-051) ✅ and live reload (BL-052) ✅, shipped together as v2.3.0, then task moves (BL-053) ✅ in v2.4.0, multiple projects named on the command line (BL-054) ✅ in v2.6.0 (a remembered project list and opening a folder from the page, BL-067 ✅, and a Home screen, BL-PM-001 ✅, in v2.8.0), guided setup of a named folder without `.specs/` (BL-055) ✅ in v2.7.0, and a new project (BL-PM-003) ✅, a clone (BL-PM-002) ✅ and the setup chat (BL-PM-004) ✅ in v2.9.0, page actions (BL-PM-005, BL-PM-006, BL-PM-008, BL-PM-014) ✅ in v2.12.0, and a local MCP endpoint for AI IDEs (BL-PM-007) ✅, not yet released [ROADMAP-002.14]
- SpecPilot Local complete: every screen and action in the approved mockup that the content rule allows, then one full release, the website update and the announcement (BL-059) [ROADMAP-002.15]

## Timeline [ROADMAP-003]

One line per release, dated by its git tag (or by CHANGELOG where no tag exists: 1.1.4, 1.5.1, 1.6.0, 1.6.4, 1.6.5, 1.6.6). Details are in CHANGELOG.

### v1.1.x–v1.2.x - Initial Release (October 2025)

- 2025-10-10: v1.1.1 — metadata conventions, stable IDs and front matter on every spec file, the `.specs/` subfolders (CS-009)
- 2025-10-12: v1.1.2 — `add-specs` with codebase analysis, detection of an existing `.specs/`, a developer name prompt (CS-004, CS-005)
- 2025-10-18: v1.1.3 — JavaScript support, an AI onboarding prompt in `prompts.md`, nested folder trees in `architecture.md` (CS-010, CS-011)
- 2025-10-25: v1.1.4 — `.specs/README.md` with AI onboarding guidance, fuller success messages
- 2025-10-26: v1.2.0 — a standard AI onboarding prompt in every generated `prompts.md`
- 2025-10-26: v1.2.1 — onboarding guidance and success messages refined; README rendering fixed
- 2025-10-27: v1.2.2 — first npm release

### v1.3.0 - Graphical CLI (November 2025)

- 2025-11-07: v1.3.0 — Gemini-style graphical CLI with an ASCII logo

### v1.4.0 - AI IDE Integration (February 2026)

- 2026-02-07: v1.4.0 — IDE workspace settings for AI-first editors, chosen at `init` (CS-008)

### v1.5.x–v1.6.x - Spec Maintenance Workflow (March–May 2026)

- 2026-03-08: v1.5.0 — requirements restructured, a `specify` command, `prompts.md` archived, architecture assumptions (CD-080 to CD-084)
- 2026-03-16: v1.5.1 — `specify` renamed `refine`, the `.specs/` tree shown after `init`, `init --dry-run`, archive guidance in `prompts.md`
- 2026-03-17: v1.6.0 — `init` generates the `security/` subfolder (CS-033)
- 2026-03-18: v1.6.1 — command aliases in the docs, the welcome screen and `--help`
- 2026-03-22: v1.6.2 — README tree shows `security/`
- 2026-03-30: v1.6.3 — startup crash fixed (`chalk` back from ESM-only v5)
- 2026-04-12: v1.6.4 — per-command options reference, the Spec-First review gate mandate, fix prompts after a failed `validate`
- 2026-04-25: v1.6.5 — `specpilot backfill`, a mandatory handle with `devPrefix` IDs, `.gitattributes` with `merge=union`
- 2026-04-26: v1.6.6 — IDE-routed AI context files, the `CLAUDE.md` router, an archive branch warning, `devPrefix` backfill in `tasks.md`
- 2026-05-01: v1.6.7 — Kiro support removed (CD-123)

### v1.7.0–v1.8.0 - IDE Backfill and Language Expansion (May–June 2026)

- 2026-05-28: v1.7.0 — IDE prompt in `add-specs`, purpose lines in spec files, IDE file backfill, `specBackfiller.test.ts`
- 2026-06-06: v1.8.0 — Kotlin and Swift support (BL-034)

### v2.0.x–v2.2.x - Lean Output, Code Rules and Slash Commands (June–September 2026)

- 2026-06-26: v2.0.0 — terse mandates, a token-lean `project.yaml`, `onboarding.md` split from `prompts.md`, `docs.md` removed, conditional `api.yaml`, terse spec templates (CS-066 to CS-073)
- 2026-06-26: v2.0.1 — Claude Code replaces Cowork as an IDE option; `onboarding.md` references and IDE choice names fixed
- 2026-06-28: v2.1.0 — Code Philosophy and Code Rules in every generated AI instruction file, backfillable (CS-074); Cursor output renamed `specpilot.mdc`
- 2026-07-06: v2.2.0 — eight `specpilot-*` slash commands across all supported IDEs plus CLI backfill of missing command files (CS-079 to CS-088); `validate` no longer fails fresh projects on `docs.md`
- 2026-07-30: v2.2.1 — validator, archiver and backfiller fixes: `backfill` writes the prompt-tracking mandate and keeps a `project.yaml` without `rules:`, `archive` keeps sections after `## Completed` (CS-090)
- 2026-08-01: v2.2.2 — `backfill` no longer reports the terse mandates of `CLAUDE.md`, Cursor, Windsurf and Antigravity files as missing
- 2026-08-02: v2.2.3 — two "Press Enter" pauses on the `init` success screen, skipped under `--no-prompts` (CS-091)
- 2026-09-27: v2.2.4 — `archive` handles a table-shaped `## Completed` (BL-057); a shared section-bounds helper and a pure spec reader

### v2.3.0–v2.13.0 - `specpilot serve` (September–October 2026)

- 2026-09-29: v2.3.0 — `specpilot serve`, a read-only local web UI over `.specs/` with live reload (BL-051, BL-052); `fs-extra` removed
- 2026-09-29: v2.4.0 — move tasks in `specpilot serve` (BL-053); `archive` takes the oldest `prompts.md` entries (BL-061)
- 2026-10-01: v2.5.0 — `backfill` updates installed `specpilot-*` command files (BL-058)
- 2026-10-02: v2.6.0 — several projects from one server (BL-054); `backfill` and `validate` follow what `init` writes (BL-066, BL-069); `## Completed` limit 40 lines (BL-060)
- 2026-10-03: v2.7.0 — guided setup of `.specs/` in a named folder that has none (BL-055)
- 2026-10-03: v2.7.1 — `init`, `add-specs` and `refine --update` keep existing files outside `.specs/` (BL-073)
- 2026-10-04: v2.8.0 — open and remember projects from the page (BL-067); the Home screen (BL-PM-001)
- 2026-10-06: v2.9.0 — the setup chat (BL-PM-004), a new project (BL-PM-003) and a clone (BL-PM-002) from the page; shared question lists (BL-075)
- 2026-10-07: v2.10.0 — the pure spec core `src/core/` with byte-identical output (BL-032 phase 1) and 23 optional template fields (phase 2); `project.yaml` reads back as written (BL-085)
- 2026-10-08: v2.11.0 — the whole init.specpilot.dev setup chat with saved setups and a file preview (BL-PM-004b); answers no longer HTML-escaped
- 2026-10-09: v2.12.0 — New Task (BL-PM-005), Commands and Skills with Regenerate All (BL-PM-006), Open in VS Code (BL-PM-008), Remove from list and the wordmark on Home (BL-PM-014); new projects start from Home
- 2026-10-10: v2.13.0 — the local MCP endpoint and the Connect Your AI IDE card (BL-PM-007) with MCP revision `2026-07-28` (BL-089) and a build that cleans `dist/` first (BL-087); Open in AI IDE for Cursor (BL-PM-010) and per-file Open in VS Code (BL-PM-013); clone progress (BL-PM-009); guided setup on existing code with detected answers, saved setups removed (BL-PM-016); browser tests for the page (BL-079)

### Next - SpecPilot Local complete (planned) [ROADMAP-003.1]

Priority: the complete UI and its features first. Order, one BL per branch and Spec Report:

1. v2.7.1 patch: `init`, `add-specs` and `refine --update` keep existing files outside `.specs/` (BL-073) ✅ in v2.7.1
2. Projects: remembered projects and the Open a Project sheet (BL-067) ✅ and the Home screen (BL-PM-001) ✅ in v2.8.0
3. New projects: start a new project in a new or empty folder (BL-PM-003) ✅, clone a repository (BL-PM-002) ✅ and the guided setup as the init.specpilot.dev chat over the CLI's questions (BL-PM-004) ✅, all in v2.9.0
4. Shared spec core (BL-032): phase 1, a pure render core in this repo with `generateSpecs()` as a writer over it, no byte change, and phase 2, the 23 optional template fields the chat needs, rendered only when present, with BL-084 and BL-085 ✅ in v2.10.0; phase 3 later and gated on its own, the published `@specpilot/spec-core`, precompiled templates and `SpecPilot.Init` adopting it (REQ-002.I.6). Then the rest of the init.specpilot.dev chat on top of phase 2: the remaining 23 questions, richer pickers, filled-in spec content and a preview from `render()`, with saved setups in the browser (BL-PM-004b) ✅ in v2.11.0
5. Page actions: New Task (BL-PM-005) ✅, Commands and Skills split with Regenerate All (BL-PM-006) ✅, Open in VS Code (BL-PM-008) ✅, all in v2.12.0; Open in AI IDE for Cursor (BL-PM-010) ✅ and per-file Open in VS Code (BL-PM-013) ✅, in v2.13.0; Open in Windsurf (BL-PM-015) pending
6. Local MCP endpoint and the Connect your AI IDE card (BL-PM-007) ✅, with MCP revision `2026-07-28` (BL-089) ✅ and a build that cleans `dist/` first (BL-087) ✅, in v2.13.0
7. Full release of SpecPilot Local
8. Website update with the `specpilot serve` docs, then the announcement and LinkedIn post (BL-059)

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
