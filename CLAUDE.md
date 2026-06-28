# CLAUDE.md — SpecPilot SDD CLI

> Primary instructions file for Claude Code.
> Keep lean — router to `.specs/` files, not a dumping ground.
> Full project context: `.specs/project/project.yaml`.

## Project

- **Name:** SpecPilot SDD CLI
- **Stack:** TypeScript / Node.js / Commander.js
- **Specs location:** `.specs/`

## 🔴 Critical Mandates — Never violate, no exceptions

1. No commit unless asked.
2. No push unless asked.
3. No deploy/publish/release unless asked.
4. No `.specs/` structure changes — content only.
5. Update specs after change:
   - Trivial → `planning/tasks.md`
   - Feature → `project/requirements.md` + `planning/tasks.md`
   - Architectural → all affected files + `CHANGELOG.md`
6. Never reference file contents without reading first. If unread, say so.
7. Never write code or change files unless asked. Ask first.
8. Spec-first gate (scale to task size):
   - Trivial → no gate
   - Feature → read 1–2 relevant `.specs/` files before coding
   - Architectural → update all affected specs, present Spec Report, wait for `yes, proceed`

## 🟡 Process Mandates

- **Spec-First:** Update `.specs/` before writing code.
- **Log all AI interactions** in `.specs/development/prompts.md` with timestamps.
- **Document decisions** in `.specs/development/context.md`.

## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.

## Context — read on demand by task type

| Task type | Read |
|---|---|
| Session start | `.specs/project/project.yaml` |
| Feature / bug | + `project/requirements.md`, `planning/tasks.md` |
| Architecture | + `architecture/architecture.md` |
| Tests | + `quality/tests.md` |
| Security | + `security/threat-model.md`, `security/security-decisions.md` |
| Planning | + `planning/tasks.md`, `planning/roadmap.md` |

## Re-Anchor

If you lose context mid-session, read `.specs/project/project.yaml` to restore full project context.
For a ready-made re-anchor prompt, see `.specs/development/prompts.md → ## Re-Anchor Prompt`.
