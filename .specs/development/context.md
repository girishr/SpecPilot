---
fileID: CTX-001
lastUpdated: 2026-09-29
version: 2.7
contributors: [girishr]
relatedFiles: [planning/roadmap.md, project/project.yaml]
---

# Project Context & Memory

## Current State [CTX-002]

- **Phase**: Active Development (current version v2.3.0; BL-053 `specpilot serve` task moves, the first write path, in progress on `feat/serve-p3`, target 2.4.0)
- **Status**: Production-ready with continuous enhancements
- **Recent Implementations**: Kotlin/Swift language support, conditional api.yaml generation, onboarding.md split from prompts.md, mandatory devPrefix ID conventions, terse spec templates, Code Philosophy + Code Rules in generated AI instruction files (CS-074), Cursor output renamed to `specpilot.mdc`, 8 `specpilot-*` slash commands + CLI-side backfill (v2.2.0), validator/archiver/backfiller audit fixes (v2.2.1), terse-mandate backfill fingerprints (v2.2.2), `init` read-pause gates (v2.2.3), table-shaped `## Completed` archiving with a validator/archiver shared planner and the `specpilot-archive` bash fix (v2.2.4), `specpilot serve` read-only local UI with live reload (v2.3.0)
- **Next Steps**: See tasks.md Current Sprint

## Key Decisions [CTX-003]

- **Structure**: Subfolder-organized `.specs/` with metadata headers [CTX-003.1]
- **Language**: TypeScript with Node.js runtime [CTX-003.2]
- **Approach**: Specification-driven development with developer freedom [CTX-003.3]
- **Templates**: Built-in templates with intelligent defaults [CTX-003.4]
- **Validation**: Integrated with cross-reference checking [CTX-003.5]
- **Developer Control**: Guidelines work better than prescriptions [CTX-003.6]
- **Existing Projects**: add-specs command with codebase analysis [CTX-003.7]
- **Git Mandates**: Require explicit developer prompts for all git operations [CTX-003.8]
- **Folder Structure Display**: Show nested tree instead of flat list in architecture.md [CTX-003.9]
- **AI IDE Integration**: Support for GitHub Copilot, Cursor, Windsurf, Antigravity, Claude Code, and Codex; existing-project updates via non-destructive backfill [CTX-003.10]
- **Visual CLI**: Gemini-style graphical interface with ASCII branding [CTX-003.11]
- **Module Split**: specGenerator.ts split into specFileGenerator, ideConfigGenerator, agentConfigGenerator for maintainability [CTX-003.12]
- **Template Simplification**: Removed TemplateRegistry abstraction; inlined catalog as constant [CTX-003.13]
- **Dual Onboarding**: Separate prompts for new projects (planning-focused) and existing projects (analysis-focused); onboarding.md written separately, deleted after first use [CTX-003.14]
- **Diff Preview**: refine command shows changes before writing, with confirmation prompt [CTX-003.15]
- **IDE Settings**: Fabricated setting keys removed; aspirational keys marked clearly [CTX-003.16]
- **Existing-Project Backfills**: `specpilot backfill` for non-destructive backfills — detects missing mandates and inserts only what's absent; never overwrites user-authored content [CTX-003.17]
- **Migrate Scope**: `specpilot migrate` for legacy structure conversion only; do not position as a general version-update command [CTX-003.18]
- **Aggressive Archive Thresholds**: archive `tasks.md` once `## Completed` exceeds 25 lines; archive `prompts.md` once file exceeds 100 lines [CTX-003.19]
- **IDE-Native Backfill Scope**: `specpilot backfill` inspects IDE files on disk and patches missing mandate blocks without requiring an IDE-selection prompt; SKILL.md reported stale rather than auto-patched [CTX-003.20]
- **Spec File Purpose Metadata**: generated markdown spec files include a one-line `description:` front-matter field; generated `api.yaml` carries a `# Purpose:` header comment [CTX-003.21]
- **Code Philosophy + Code Rules**: all generated AI instruction files include a 7-item YAGNI/minimal-code decision ladder and 7 behavioral coding rules in caveman style; injected at generation time and backfilled into existing files via `specpilot backfill` [CTX-003.22]
- **Shared Section Bounds (BL-050)**: the "`## ` section ends at the next `## ` heading, not EOF" rule lives once in `markdownSections.ts` `findSectionBounds()`; CD-girishr-034 had to patch it in two TypeScript places "identically", which is the drift this removes. The bash copy in the `specpilot-archive` slash command stays separate — it runs in the user's shell and cannot import TypeScript [CTX-003.23]
- **Pure Spec Reader (BL-050)**: `specReader.ts` takes file contents, never paths, and imports neither `fs` nor `path`, so it can move into `@specpilot/spec-core` (BL-032) unchanged. Front matter is parsed by hand for the five metadata keys rather than with `js-yaml`: this repo's own `tasks.md` has `lastUpdated: 2026-09-05 (BL-049 cross-ref: …)`, whose bare `: ` makes `js-yaml` throw, and the default schema would turn `2026-07-26` into a `Date` and `version: 5.10` into `5.1`. Table rows are split on the first N−1 pipes only, with the last cell taking the rest of the row, because Completed descriptions contain literal `|` inside backticks (e.g. `'rest' | 'cli'`) [CTX-003.24]
- **Validator and archiver share one Completed plan (BL-057)**: validate said "run `specpilot archive`" on this repo while archive did nothing, because the table-shaped Completed section had no numbered lines. Fixing the archiver alone would not have closed it: keeping 20 rows leaves 28 section lines (8 non-row lines: heading, 2 blanks, 2 blockquotes, header, separator, and the trailing `""` that `split('\n')` yields), so validate would warn straight after archiving. Rather than two measures that must be kept equal by hand, `validateLineLimits()` calls `planCompletedArchive()` and warns only when it would move something; for tables the keep count is sized so the section lands at ≤ 25 lines. List behaviour is left byte-identical because other projects rely on it [CTX-003.25]
- **Serve UI shows file text only (BL-051)**: the approved mockup mixed file content with hand-written analysis — "needs you" badges, "in sync" / "out of date" pills, a "From SpecPilot / Yours" split that no file records (generated command files carry no marker), and a "What Goes In Them" list whose eight bullets are not this repo's `rules.critical`. The served UI keeps the mockup's layout and interactions but only shows what `readSpecs()` and the files say, raw text where parsing fails; board rows clamp with CSS instead of cutting at the first clause. The page carries no inline code and no external fonts, because `default-src 'self'` forbids both [CTX-003.26]
- **Live reload polls, and stays silent (BL-052)**: polling `stat()` over the allowlisted set instead of `fs.watch`, because recursive watch is unreliable on Linux before Node 20 and polling a few dozen files is cheap; inode joins mtime and size because an atomic save can keep both. The page gains no connection indicator or "updated" marker: those would be states the files do not contain [CTX-003.27]
- **A task move is a line move (BL-053)**: the server never re-renders the table; it removes one line and inserts the identical line, so the diff is one line and hand formatting survives. Backlog and Current Sprint share `ID | Description`, and the file's own Notes keep the BL ID when a row moves to Current Sprint, so no cell changes. When a move cannot keep every other byte (a section with no table, or a row that is the file's last line without a trailing newline) it is refused, not approximated [CTX-003.28]

## Established Patterns [CTX-004]

- **File Organization**: Subfolder structure under `.specs/` (project/, architecture/, planning/, quality/, development/, security/) [CTX-004.1]
- **Naming Convention**: Consistent kebab-case for files [CTX-004.2]
- **Documentation**: Markdown with YAML front-matter metadata [CTX-004.3]
- **Version Control**: Git with conventional commits [CTX-004.4]
- **Code Style**: TypeScript strict mode with ESLint [CTX-004.5]
- **Stable IDs**: REQ-###, ARCH-###, TASK-### format for traceability [CTX-004.6]
- **Cross-References**: Relative paths between related spec files [CTX-004.7]

## Lessons Learned [CTX-006]

- **Start Simple**: Complex structures lead to maintenance burden [CTX-006.1]
- **Developer Control**: Guidelines work better than prescriptions [CTX-006.2]
- **Existing Projects**: Detecting and analyzing existing codebases provides immediate value [CTX-006.6]
- **Code Review Value**: Systematic code review caught dead code, security gaps, and architecture debt [CTX-006.13]
- **Module Boundaries**: Splitting large files (1,298 → 3 focused modules) reduces merge conflicts and cognitive load [CTX-006.14]
- **Test Investment**: Going from 3 to 188 tests caught real alignment issues [CTX-006.15]
- **Aspirational vs Real**: Marking unconfirmed IDE settings as ASPIRATIONAL prevents user trust erosion [CTX-006.16]
- **Specs Drift**: CLI surface changes should update `architecture/api.yaml`, `planning/roadmap.md`, and `development/context.md` in the same pass so generated-command docs and project memory do not lag behind implementation [CTX-006.17]
