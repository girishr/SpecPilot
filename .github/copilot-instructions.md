# AI Coding Instructions — SpecPilot

> This file is automatically read by GitHub Copilot, Cursor, and other AI tools on every request.
> Keep this file short — only critical mandates. Full context is in `.specs/project/project.yaml`.

## Project

- **Name:** SpecPilot
- **Stack:** TypeScript / Node.js / Commander.js
- **Specs location:** `.specs/`

## 🔴 Critical Mandates — Never violate, no exceptions

1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.
2. **NEVER push** to git unless the developer explicitly asks. Always ask first.
3. **NEVER deploy, publish, or release** the project unless the developer explicitly asks. Always ask first.
4. **NEVER modify** the `.specs/` folder structure, subfolder names, or file names. Only update file contents.
5. **ALWAYS update** affected `.specs/` files after every code change — without being asked:
   - Structural changes → `architecture/architecture.md`
   - Feature changes → `project/requirements.md`
   - Test changes → `quality/tests.md`
   - Task status → `planning/tasks.md`
   - Completed work → `CHANGELOG.md`

## 🟡 Process Mandates

- **Spec-First:** Update `.specs/` before writing code.
- **Log all AI interactions** in `.specs/development/prompts.md` with timestamps.
- **Document decisions** in `.specs/development/context.md`.

## Re-Anchor

If you lose context mid-session, read `.specs/project/project.yaml` to restore full project context.
For a ready-made re-anchor prompt, see `.specs/development/prompts.md → ## Re-Anchor Prompt`.
