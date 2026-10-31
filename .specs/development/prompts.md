---
fileID: PROMPT-001
lastUpdated: 2026-10-29 (BL-126 logged)
version: 2.200
contributors: [girishr]
relatedFiles:
  [development/context.md, development/prompts-archive.md, project/project.yaml]
---

# Development Prompts Log

This file contains all AI-assisted development prompts and responses for the SpecPilot SDD CLI project, organized chronologically.

## Re-Anchor Prompt [PROMPT-000]

> Paste this into your AI agent when: the session has been running > 1 hour, you've made > 20 exchanges, or the AI seems to have forgotten project rules.

```
You are working on SpecPilot (TypeScript / Node.js / Commander.js).

CRITICAL RULES — re-read these before continuing:
1. NEVER commit, push, or deploy unless I explicitly ask you to.
2. NEVER modify .specs/ folder structure or file names — only update file contents.
3. After EVERY code change, proactively update all affected .specs/ files without being asked.
4. Spec-First Development — update .specs/ before writing code.
5. Log this and all AI interactions in .specs/development/prompts.md.

For full project context, read .specs/project/project.yaml.
```

## Latest Entries [PROMPT-002]
- 2026-10-31: the developer: `Start BL-138 and continue till 144.` (each item still stops in Review for the card and the typed `commit`; the next starts after its merge). Branch `fix/bl-138-md-linear-patterns` from `main` (`f2706b0`); Spec Report written (REQ-002.H.60, context.md), to spec-reviewer before code
- 2026-10-31: BL-138 spec-reviewer FIX on the report (the exact link rule, the `[`-in-target and lone-`|` exceptions, four more quadratic line patterns with U+2028, tests): applied; the four patterns taken into BL-138 (same file, same threat), the new shape checked equal in `node`
- 2026-10-31: BL-138 spec-reviewer PASS on the fixed report; built: 6 tests first (the browser test took 17.7 s on `main`), Jest 1891/1891, browser 91/91 three times. Nothing committed
- 2026-10-31: BL-138 spec-reviewer PASS on the build; BL-138 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Start BL-137`. Branch `fix/bl-137-yaml-schema-cap` from `main` (`6b66389`); Spec Report written (REQ-002.A.3, context.md), to spec-reviewer before code
- 2026-10-30: BL-137 spec-reviewer FIX on the report (CORE is JSON in js-yaml 4, the merge and tag effects, the cap's unit, the size error as a constant, `flattenRules` over aliases, two more spec files, more tests): applied
- 2026-10-30: BL-137 spec-reviewer PASS on the fixed report; built: 13 tests first, Jest 1886/1886, golden unchanged, scratch-repo `validate` check clean. Nothing committed
- 2026-10-30: BL-137 spec-reviewer PASS on the build; its optional length guard before encoding taken; BL-137 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-137: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: after the BL-137 merge `validate` on `main` warned that the `## Completed` section of `tasks.md` exceeds 40 lines; the developer: `Archive now`: `specpilot archive` on `main` moved 13 lines (rows 221 to 233) to `tasks-archive.md`; `validate` clean. Not pushed
- 2026-10-30: the developer: `Start BL-136`. Branch `fix/bl-136-analyzer-walk-bounds` from `main` (`79c9fbb`); Spec Report written (REQ-002.D.6, context.md), to spec-reviewer before code
- 2026-10-30: BL-136 spec-reviewer FIX on the report (a total byte cap, wording, the root readdir, the full empty-package.json effect, more tests, three more spec edits, golden note): applied; 8 MB per run taken
- 2026-10-30: BL-136 tests first: a nested test file is never counted on `main` (paths stored relative to the subfolder): not BL-136's change, filed as BL-149 (Backlog); the normal-input test puts its test file at the root
- 2026-10-30: BL-136 built: 11 tests first, Jest 1873/1873, golden unchanged, scratch-repo `add-specs` check clean. Nothing committed
- 2026-10-30: BL-136 spec-reviewer PASS on the build; BL-136 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-136: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: `Start BL-135`. Branch `fix/bl-135-task-write-folders` from `main` (`cf4488c`); Spec Report written (REQ-002.H task moves, context.md), to spec-reviewer before code
- 2026-10-30: BL-135 spec-reviewer FIX on the report (architecture.md and SEC-004.10 on the build list, two more tests, the MCP case's wording): applied
- 2026-10-30: BL-135 spec-reviewer PASS on the fixed report; built: 5 tests first, Jest 1862/1862, validate with no warning. Nothing committed
- 2026-10-30: BL-135 spec-reviewer PASS on the build; BL-135 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-135: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: `Start BL-134`. Branch `fix/bl-134-validator-read-guard` from `main` (`fc3fb09`); Spec Report written (REQ-002.A, context.md), to spec-reviewer before code
- 2026-10-30: BL-134 spec-reviewer FIX on the report (the CLI change for a linked `.specs`, the folder-case text, read sites by line, the YAML fallback, threat-model rows, more tests, prompts.md order): applied; the 2026-10-29 push line moved below the 2026-10-30 BL-077 line it preceded (out of date order since the BL-077 merge); the line limit put to the developer
- 2026-10-30: BL-134 spec-reviewer ESCALATE on the prompts.md line-limit warning (over on `main` before the branch); architect DECIDE: archive at merge, as for BL-PM-014 and BL-077, recorded in context.md
- 2026-10-30: BL-134 spec-reviewer PASS after the architect; built: 9 tests first, Jest 1857/1857, scratch-repo check clean. Nothing committed
- 2026-10-30: BL-134 spec-reviewer FIX on the build (a mitigated fingerprint still listed as open), fixed, PASS; BL-134 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-134: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, `prompts.md` archived on `main` as its own commit (architect decision), tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: `Start BL-133`. Branch `fix/bl-133-terminal-control-chars` from `main` (`2b61296`); Spec Report written (REQ-002.A.11, context.md), to spec-reviewer before code
- 2026-10-30: BL-133 spec-reviewer FIX on the report (two missed sinks, the `displayWithLogo` rule, exact outputs, more tests, the residual): applied
- 2026-10-30: BL-133 spec-reviewer PASS on the fixed report; built: 9 tests first, Jest 1846/1846, scratch-repo `validate` check clean. Nothing committed
- 2026-10-30: BL-133 spec-reviewer FIX on the build (two `validate` sinks untested): 2 tests added, both fail with the filter removed; Jest 1848/1848
- 2026-10-30: BL-133 spec-reviewer PASS on the build; BL-133 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-133: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: `Start BL-132`. Branch `fix/bl-132-windows-program-paths` from `main` (`4a15328`); Spec Report written (REQ-002.A.8, REQ-002.H.1, context.md), to spec-reviewer before code
- 2026-10-30: BL-132 spec-reviewer FIX on the report (clone cwd, `browserCommand` signature, reftable, control characters in the branch, test seam, threat-model line): applied; the clone's cwd filed as BL-148 (Backlog) rather than widening the row
- 2026-10-30: BL-132 spec-reviewer PASS on the fixed report; built: 9 tests first, Jest 1837/1837, lint 0 errors. Nothing committed
- 2026-10-30: BL-132 spec-reviewer PASS on the build (one optional threat-model rewording taken); BL-132 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-132: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: `Start BL-131`. Branch `fix/bl-131-skill-project-name` from `main` (`a30381e`); Spec Report written (REQ-002.H.40, REQ-002.I.5, context.md), to spec-reviewer before code
- 2026-10-30: BL-131 spec-reviewer FIX on the report (periods, `fm` trailing `:`/space, security-decisions, more tests), fixed, PASS; `dq` added after the PASS and re-checked, PASS. Built: 4 tests first (all failed on `main`), Jest 1828/1828, golden unchanged. Nothing committed
- 2026-10-30: BL-131 spec-reviewer FIX on the build (`onboarding.md` front matter raw, the test's skip, a doc-comment order), fixed, PASS; BL-131 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-131: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: the developer: fix the security audit's bugs in the required order, starting now. BL-130 first (top of Current Sprint): branch `fix/bl-130-no-follow-writer` from `main`; Spec Report written (REQ-002.E.18, the architecture note, context.md), to spec-reviewer before code
- 2026-10-30: BL-130 spec-reviewer ESCALATE (class, in-project links, `migrate`); architect DECIDE: Feature with the helpers in `specPaths.ts`, every link refused, `migrate` filed as BL-147; applied to the specs
- 2026-10-30: BL-130 built on `fix/bl-130-no-follow-writer`: the no-follow writer in `specPaths.ts`, every caller the row names routed through it; 31 tests written first (22 failed on `main`); build and lint clean, Jest 1824/1824; scratch-repo manual check refused the linked archive file. Nothing committed
- 2026-10-30: BL-130 spec-reviewer FIX on the build (the SEC-002.12 residual line), fixed, re-run PASS; BL-130 moved to Review by hand (MCP not connected). Branch left checked out, nothing committed
- 2026-10-30: the developer: `Approve, then commit` for BL-130: row marked `Approved 2026-10-30`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-30: on the developer's typed `push`: `main` pushed (`d2fe0bd..feefb74`, four commits: BL-077 feature, completion and merge, the prompts.md archive); `origin/main` = local `main` checked. This line is uncommitted on the tree.
- 2026-10-30: BL-077 approved on the card, then `commit`: feature commit `153f182`, completion commit `94affc9` (row 245, CD-girishr-154), `--no-ff` merge `4788e8b` into `main`; `specpilot archive` moved 30 lines of `prompts.md` to `prompts-archive.md` (the developer's `Archive at merge`); on `main` build clean, Jest 1793/1793, browser 90/90. Not pushed
- 2026-10-29: on the developer's typed `push`: `main` pushed (`e422b24..d2fe0bd`, one commit: Type and Priority on every Backlog and Current Sprint row); `origin/main` = local `main` checked. This line is uncommitted on the tree.
- 2026-10-29: `Archive at merge`: the developer's call on the `prompts.md` line-limit warning: `specpilot archive` for `prompts.md` runs as part of the BL-077 merge, after approval on the card and the typed `commit`
- 2026-10-29: BL-077 built on `fix/bl-077-ide-folder-links`: `folderError()` shared by `generateSpecs()` and guided setup; 8 tests written first (7 failed before the change); build and eslint clean, Jest 1793/1793; spec-reviewer PASS; BL-077 moved to Review. Nothing committed
- 2026-10-29: `ok lets do 077.`, then `try now. But work on a new branch`: BL-077 Spec Report on `fix/bl-077-ide-folder-links` from `main` (`d2fe0bd`): REQ-002.E.17 added and E.15's BL-077 sentence pointed at it, ARCH-004.41, SEC-002.12 mitigation, the SEC-005 open question, CHANGELOG `Fixed`, context.md decision; classed Feature. A first branch made earlier this session was deleted unused when `main` turned out to hold another session's uncommitted edits
- 2026-10-29: `can you run thru all the tasks and assign a prio and type?`, then `Keep them`: Type and Priority set on all 48 Backlog and Current Sprint rows (Sprint: bug 13, feat 8, chore 5; P1 5, P2 11, P3 10. Backlog: bug 7, feat 11, chore 4; P1 1, P2 7, P3 14); rows that named their own (the audit rows, BL-077, BL-124, BL-128) kept it, the rest the assistant's call; IDs and descriptions unchanged, no malformed rows. Uncommitted on `main`.
- 2026-10-29: on the developer's typed `push` after the BL-126 merge: `main` pushed (`1e6912d..e422b24`, five commits: the security audit log, BL-126 feature, completion and merge, the test fix; Jest 1785/1785, browser 90/90 on `main`, read by eye); `origin/main` = local `main` checked; branch `docs/security-audit-run-1` kept (not created in this session). This line is uncommitted on the tree.
- 2026-10-29: after the BL-126 merge `npm test` on `main` failed 1/1785: `specServer.test.ts` rebuilt this repo's Backlog, Current Sprint and Review rows in the two-column shape; on `Yes, fix the test` it rebuilds them typed (`| ID | Type | Priority | Description |`); Jest 1785/1785, committed on `main`, then `npm run test:browser`.
- 2026-10-29: BL-126 approved on the card, then `commit`: feature commit `629a0bd` on `docs/security-audit-run-1`, completion commit (row 244, CD-girishr-153), then the `--no-ff` merge into `main` (it also carries the unmerged audit commit `375f588`) and `npm test` and `npm run test:browser` on `main`; push waits for the developer's word.
- 2026-10-29: `give the Backlog, Current Sprint and Review tables ID, Type, Priority and Description columns ... keeping every task's ID and text` (BL-126): the three tables in this repo's tasks.md rewritten to `| ID | Type | Priority | Description |` with empty Type and Priority cells, 49 rows; checked byte for byte against HEAD with the two cells taken out, and parsed by `readSpecs()` (no malformed rows); then `Yes, move it`: BL-126 from Backlog to Review. On `docs/security-audit-run-1`, uncommitted; `specpilot validate` was run read-only on the real `.specs/` (should have been a scratch copy).
- 2026-10-28: `move all the BL to CS. at the top`: the 18 audit rows (BL-077, BL-130 to BL-146) moved from Backlog to the top of Current Sprint in that order, IDs kept; other rows untouched. Branch `docs/security-audit-run-1`, nothing committed
- 2026-10-28: `add these rows to tasks.md under ## Backlog`: BL-130 to BL-146 added to Backlog (plain `| ID | Description |` shape, type and priority in the text), each attributed to SEC-002.12 to SEC-002.15 and the audit item; BL-077 gained its audit attribution and P1. Branch `docs/security-audit-run-1`, nothing committed
- 2026-10-28: `did you check the threat-model and security-decisions files ... If not log in there ... How can we verify these findings ... convert the finding to tasks ... with attribution`: compared the 15 needs-validation leads of the security audit (run-1, `~/security-audit-skill/SpecPilot/run-1/`) with both files: 2 already accepted in part (SEC-002.5 residual (j)), 13 new or contradicting a stated premise; logged as SEC-002.12 to SEC-002.15 in threat-model.md, the Attack Surface row for existing project files corrected, six open questions in SEC-005; task list proposed in chat, not yet added to tasks.md. Branch `docs/security-audit-run-1`, nothing committed
- 2026-10-28: `security audit this codebase /security-audit`: deep, source-only audit (no target code run: no OS memory limit on this Mac), output outside the repo in `~/security-audit-skill/SpecPilot/run-1/` on the developer's choice; 32 coverage units, 16 candidates, 15 needs-validation, 1 rejected, 0 confirmed; repo untouched
- 2026-10-27: `Take a look at ...handoff-specpilot-cli-design-step.md and report back before starting ... read SpecPilot.Init only, don't change it. repot back the changes needed, new tasks and specpfile changes.` (2026-10-25): read the handoff, the chat core, the request checks, the render path, the setup tools and Init's `cs-092-design-assets` (read only); reported the changes, BL-129 and the spec files, with the gate-as-text recommendation. `yes proceed`: `feat/bl-129-design-step` from `main`; found that BL-103 removed the page's chat, so the step reaches the user through the two setup tools and `ui/` does not change; BL-129 filed in Backlog; REQ-002.I.8 (and the I.4 table row, the H.42 count), the planned tests in tests.md, six defaults in context.md; Spec Report. spec-reviewer FIX (the gate's max and refusal order, `designNotes` one line against Init's multi-line, ARCH-004.57's count) applied; FIX (a string over 3 characters is refused by length first) applied; PASS. Waiting for `yes, proceed` (the handoff's gate).

## Archive Policy

This file has a **100-line limit**. When it exceeds 100 lines, run `specpilot archive` to move older detailed entries to [prompts-archive.md](prompts-archive.md). The most recent entries are always kept here.

> Archived entries: [prompts-archive.md](prompts-archive.md) (PROMPT-003 and PROMPT-004 archived 2026-03-07)
