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
- 2026-11-08: the developer: `approved. commit.` for BL-155: feature `b188f89`, row 266, `--no-ff` merge `6bee97f`; on `main` Jest 1972/1972, the browser suite 1 failed of 114 then 114/114: the detail-panel test, which also fails on `2be8887`; branch deleted. `File and fix first`: BL-163 on `chore/bl-163-panel-slide-race`; Spec Report, spec-reviewer PASS; built (the first regression test was blocked by the CSP; the Send back test's own reload race fixed too); browser 115/115 three times. To spec-review. Nothing committed.
- 2026-11-05: the developer: `approved. commit` for BL-154: feature `2322ec1`, row 265, `--no-ff` merge `2be8887`, Jest 1972/1972 and browser 113/113 on `main`, branch deleted. BL-155 on `fix/bl-155-menu-labels`: Spec Report (the developer stopped the first write, then `continue`); spec-reviewer ESCALATE; architect DECIDE, no label; BL-162 filed; spec-reviewer FIX, applied; built; browser 114/114 three times, Jest 1972/1972. To spec-review. Nothing committed.
- 2026-11-05: the developer: `153 is approved`, `commit`: feature `b23b6c0`, BL-153 to Won't do, `--no-ff` merge `f84bc79`, Jest 1949/1949 and browser 113/113 on `main`, branch deleted. BL-154 on `fix/bl-154-backfill-copilot`: Spec Report, spec-reviewer FIX (the warning's `add-specs` remedy, the summary line, dead code, docs) then PASS; built; Jest 1972/1972. To spec-review. Nothing committed.
- 2026-11-05: the developer: `commit` for BL-152: feature `a9d53c7`, `docs(tasks)` `364c2bb` for BL-154 to BL-161, row 264, `--no-ff` merge, Jest 1949/1949 and browser 113/113 on `main`, branch deleted; not pushed. `continue`: BL-153 on `chore/bl-153-cursor-check`; its premise failed (three callers of the allowed set; a link to `CLAUDE.md` counts on the default allowlist); architect DECIDE: not folded, comment and spec notes corrected. Nothing committed.
- 2026-11-03: BL-152 built, spec-reviewer FIX (README Limits sentence, tests.md names) then PASS; moved to Review. The developer: absent instruction files read `not in this repo`, which looks like something is missing when the file is only not needed for the project's IDE: BL-161 filed in Backlog. Nothing committed.
- 2026-11-03: the developer: `move all to CS` (BL-153 to BL-160 to Current Sprint), then `ok now start fixing it based on the order`: BL-152 built on `fix/bl-152-ide-files-listed` from its reviewed spec; Jest 1949/1949, browser 113/113 three times. To spec-review. Nothing committed.
- 2026-11-03: the developer said `Not now` to the BL-152 build, then asked for an audit of where SpecPilot assumes Claude Code (or Copilot) over the IDE chosen at setup (`#8/skills` showing `.claude/skills/` for a Cursor project). Found: the chosen IDE is never stored; `backfill` adds Copilot files to a Cursor project (reproduced on a scratch copy with a temp HOME); fixed `.claude/` labels in the left menu; a Claude-only Skills view; Claude-specific MCP config text; a Copilot fallback with no `--ide` option; Claude wording in other IDEs' command files. `Yes, file them`: BL-154 to BL-160 in Backlog (item 4 is BL-152). Nothing committed.
- 2026-11-03: the developer asked why the Instructions view shows no `.cursor` files, whether that is a security issue (answer: no for the generated files, yes for whole IDE folders such as `.cursor/mcp.json`), and which other IDE files go unlisted; then reported `CLI-Testing/scratch1/test`'s 8 Cursor commands showing as 0 at `#8/commands` (confirmed in the page). `Yes, file and report`: branch `fix/bl-152-ide-files-listed`, BL-152 filed in Current Sprint, Spec Report (Architectural, SEC-004.8) with REQ-002.H.65; spec-reviewer ESCALATE; architect DECIDE (option (a), defaults kept, BL-153 filed); applied; spec-reviewer PASS. No code; nothing committed.
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
