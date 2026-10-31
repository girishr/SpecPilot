---
fileID: PROMPT-001
lastUpdated: 2026-10-31 (BL-142 logged)
version: 2.202
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
- 2026-10-31: the developer: `Approve, then commit` for BL-138: row marked `Approved 2026-10-31`; feature commit `44d16ce`, completion commit, `--no-ff` merge into `main`, `prompts.md` archived as its own commit, Jest 1891/1891 and browser 91/91 on `main`, branch deleted. Not pushed
- 2026-10-31: BL-139 started on `chore/bl-139-local-principals-scope` from `main` (`bcf7b0e`); the scope question went to the architect: DECIDE, (a) and (b) out of scope, (c) in scope (context.md). Applied to the security files, the README's Limits and `tasks.md` (BL-140, BL-141 to Won't do; BL-145 narrowed), to spec-review
- 2026-10-31: BL-139 spec-reviewer ESCALATE with nothing to fix (Architectural; the scope call is the developer's on the card); its wording nit on SEC-004.20 taken; BL-139 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-139: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-31: BL-142 started on `fix/bl-142-origin-prior-occupant` from `main` (`5df8d55`); measured leftover workers and a cached script in headless Chromium (scratch servers); Spec Report (REQ-002.H.61, context.md), to spec-review
- 2026-10-31: BL-142 spec-reviewer ESCALATE (Architectural; six fixes applied); architect DECIDE (a) ship (1) to (4), status open until BL-145, (b) framed loads accepted; spec-reviewer FIX twice (Host order, zero projects, tests), applied; PASS
- 2026-10-31: BL-142 built: 21 tests first, Jest 1901/1901, browser 102/102 three times, lint 0 errors. To spec-review. Nothing committed
- 2026-10-31: BL-142 spec-reviewer ESCALATE with nothing to fix on the build (token delivery; the pass-through reload reading for the card); BL-142 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-142: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
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

## Archive Policy

This file has a **100-line limit**. When it exceeds 100 lines, run `specpilot archive` to move older detailed entries to [prompts-archive.md](prompts-archive.md). The most recent entries are always kept here.

> Archived entries: [prompts-archive.md](prompts-archive.md) (PROMPT-003 and PROMPT-004 archived 2026-03-07)
