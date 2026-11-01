---
fileID: PROMPT-001
lastUpdated: 2026-11-01 (v2.20.0 shipped)
version: 2.209
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
- 2026-11-01: the developer ran step 4: `git push origin main v2.20.0` (`b8ff4dc..8cbfb8b`, the tag); the first `npm publish` failed with 404 (`npm whoami` 401: not logged in), `npm login` in the browser, the second published `+ specpilot@2.20.0` after the browser 2FA check; `gh release create` live (16:20 UTC). Checked `origin/main` at `8cbfb8b`, the tag on origin, `npm view specpilot dist-tags` latest 2.20.0, `gh release view v2.20.0`; row 262 reworded, row 263 added.
- 2026-11-01: the developer: `Approve, then commit` for BL-151: feature `aacbc82`, row 261, `--no-ff` merge, Jest 1936/1936 and browser 111/111 on `main`, branch deleted. v2.20.0 prepared again on `main` per `docs/RELEASING.md` (by hand, not from the parked patch; engines left at `>=16.0.0`, the Node 18.2 need noted in the CHANGELOG): version, specs, CHANGELOG promoted, roadmap line, release row 262; checks, commit and annotated tag; not pushed or published (the developer ships by hand).
- 2026-11-01: the developer: `push` (`8a5f333..b8ff4dc`); `relase`: v2.20.0 proposed (engines left at `>=16.0.0` unless the developer says otherwise); `yes proceed`: the release prepared on `main`, checks run; browser run 3 of 3 failed one BL-144 test (`Timed out ... waiting for the slots released`); nothing committed or tagged. The developer: `Fix the flake first`: the release edits parked as a patch outside the repo, `main` restored; BL-151 filed and started on `chore/bl-151-events-test-race`.
- 2026-11-01: BL-151 Spec Report (TESTS-002.4); spec-reviewer FIX (name the regression test's trigger, where the freed-slot proof lies, Type chore), applied; PASS. Built: the regression test first, 3 of 3 failures with the old `=== 0` wait; then `<= 1`; `events.browser.test.ts` 7/7 three times.
- 2026-11-01: the developer: `Approve, then commit` for BL-146: done (feature `70f7dfd`, merge, `prompts.md` archived, Jest 1936/1936 and browser 110/110 on `main`, branch deleted). BL-145: Linux checks and WebKit measurements run; Firefox would not start; the developer: `Yes, record and file`: branch `chore/bl-145-audit-validation`, results in the specs, BL-150 filed. To spec-review. Nothing committed
- 2026-11-01: BL-145 spec-reviewer FIX twice (WebKit's `Clear-Site-Data` behaviour left out, the frame sentence, the growth ratio, the Chromium contrast, the saved WebKit output), applied; PASS; BL-145 moved to Review by hand. Branch left checked out, nothing committed
- 2026-11-01: the developer: `Approve, then commit` for BL-145: row marked `Approved 2026-11-01`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-11-01: the developer: `can we move to 145 and 146?`; BL-145: Playwright Firefox and WebKit chosen (the download outside the repo waits for a typed `yes, proceed`), the Linux sandbox and Windows VM steps given (the developer installs Colima themself), results in the repo's specs only. BL-146 started on `chore/bl-146-audit-hardening` from `main` (`8a5f333`); Spec Report (REQ-002.H.64); spec-reviewer ESCALATE on item (2), fixes applied; architect DECIDE: (2) dropped (already fails closed, no caller); applied, to spec-review
- 2026-11-01: BL-146 spec-reviewer PASS on the report; built, 15 tests first. The first browser runs hung: a `close()` bug (a page's stream reopening on a busy socket); the developer chose to fold the fix into BL-146; fixed with `closeAllConnections()`, a 20-stop browser test first. Jest 1935/1935, browser 110/110 three times. Firefox and WebKit downloaded on the developer's typed yes; the developer installed Colima and pulled `node:22` themself. To spec-review. Nothing committed
- 2026-11-01: BL-146 spec-reviewer FIX on the build twice (Node 18.2 guard, 422, the new-target swap test, architecture), applied; Jest 1936/1936, browser 110/110 three times; PASS; BL-146 moved to Review by hand. Branch left checked out, nothing committed
- 2026-11-01: the developer: `Approve, then commit` for BL-146: row marked `Approved 2026-11-01`; feature commit, completion commit, `--no-ff` merge into `main`, `prompts.md` archived, tests on `main`, branch deleted. Not pushed
- 2026-10-31: the developer: `Approve, then commit` for BL-138: row marked `Approved 2026-10-31`; feature commit `44d16ce`, completion commit, `--no-ff` merge into `main`, `prompts.md` archived as its own commit, Jest 1891/1891 and browser 91/91 on `main`, branch deleted. Not pushed
- 2026-10-31: BL-139 started on `chore/bl-139-local-principals-scope` from `main` (`bcf7b0e`); the scope question went to the architect: DECIDE, (a) and (b) out of scope, (c) in scope (context.md). Applied to the security files, the README's Limits and `tasks.md` (BL-140, BL-141 to Won't do; BL-145 narrowed), to spec-review
- 2026-10-31: BL-139 spec-reviewer ESCALATE with nothing to fix (Architectural; the scope call is the developer's on the card); its wording nit on SEC-004.20 taken; BL-139 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-139: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-31: BL-142 started on `fix/bl-142-origin-prior-occupant` from `main` (`5df8d55`); measured leftover workers and a cached script in headless Chromium (scratch servers); Spec Report (REQ-002.H.61, context.md), to spec-review
- 2026-10-31: BL-142 spec-reviewer ESCALATE (Architectural; six fixes applied); architect DECIDE (a) ship (1) to (4), status open until BL-145, (b) framed loads accepted; spec-reviewer FIX twice (Host order, zero projects, tests), applied; PASS
- 2026-10-31: BL-142 built: 21 tests first, Jest 1901/1901, browser 102/102 three times, lint 0 errors. To spec-review. Nothing committed
- 2026-10-31: BL-142 spec-reviewer ESCALATE with nothing to fix on the build (token delivery; the pass-through reload reading for the card); BL-142 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-142: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-31: BL-143 started on `fix/bl-143-frame-ancestors` from `main` (`c576afe`); measured that a frame from another port or site wiped `localStorage` through BL-142's `Clear-Site-Data`; Spec Report folds the fix in (REQ-002.H.62); spec-reviewer FIX twice, applied; PASS
- 2026-10-31: BL-143 built: 11 tests first, Jest 1910/1910, browser 104/104 on 12 of 13 runs (one uncaptured failure, not reproduced). To spec-review. Nothing committed
- 2026-10-31: BL-143 spec-reviewer PASS on the build (the flake reported as 12 of 13, not as green); its optional frame-count guard taken; BL-143 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-143: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-31: BL-144 started on `fix/bl-144-event-stream-origin` from `main` (`a89debb`); measured the stream's fetch metadata and the 503 behaviour in headless Chromium; Spec Report (REQ-002.H.63); spec-reviewer FIX (allowlist, place, body, tests), applied; PASS
- 2026-10-31: BL-144 built: 15 tests first, Jest 1920/1920, browser 109/109 three times, lint 0 errors. To spec-review. Nothing committed
- 2026-10-31: BL-144 spec-reviewer PASS on the build; BL-144 moved to Review by hand. Branch left checked out, nothing committed
- 2026-10-31: the developer: `Approve, then commit` for BL-144: row marked `Approved 2026-10-31`; feature commit, completion commit, `--no-ff` merge into `main`, tests on `main`, branch deleted. Not pushed
- 2026-10-31: the developer: `push`: `main` pushed to origin (`feefb74..8a5f333`)
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

## Archive Policy

This file has a **100-line limit**. When it exceeds 100 lines, run `specpilot archive` to move older detailed entries to [prompts-archive.md](prompts-archive.md). The most recent entries are always kept here.

> Archived entries: [prompts-archive.md](prompts-archive.md) (PROMPT-003 and PROMPT-004 archived 2026-03-07)
