---
title: Requirements
project: SpecPilot SDD CLI
language: typescript
framework: node
lastUpdated: 2026-03-07
sourceOfTruth: project/project.yaml
fileID: REQ-001
version: 1.3
contributors: [girishr]
relatedFiles:
  [architecture/architecture.md, architecture/api.yaml, planning/tasks.md]
---

# SpecPilot SDD CLI Requirements

## Functional Requirements [REQ-002]

### Core Commands [REQ-002.A]

- `specpilot init <name>` — initialize new project with `.specs/` structure [REQ-002.A.1]
- `specpilot add-specs` — add `.specs/` to an existing project with codebase analysis [REQ-002.A.2]
- `specpilot validate [--fix] [--verbose]` — validate spec files, cross-references, and front-matter; auto-fix common issues [REQ-002.A.3]
- `specpilot list [--verbose]` — list available built-in templates [REQ-002.A.4]
- `specpilot migrate` — migrate from old `.project-spec` structure to current `.specs/` layout [REQ-002.A.5]
- `specpilot specify <description>` — update spec files with new requirements; show line-level diff and prompt for confirmation before writing [REQ-002.A.6]

### Project Initialization [REQ-002.B]

- Prompt for project context: what it does, target users, expected scale, constraints (1 mandatory, 3 optional) [REQ-002.B.1]
- Prompt for developer name and embed in generated specs [REQ-002.B.2]
- Prompt for IDE/Agent selection and generate appropriate config files [REQ-002.B.3]
- Prevent duplicate initialization with informative errors [REQ-002.B.4]
- Allow custom spec folder naming [REQ-002.B.5]
- Support `--no-prompts` flag to skip all interactive prompts [REQ-002.B.6]

### Language & Framework Support [REQ-002.C]

- Support TypeScript, JavaScript, and Python languages [REQ-002.C.1]
- Auto-detect language and framework from project files (package.json, requirements.txt, etc.) [REQ-002.C.2]
- Framework-specific template content (React, Express, Next.js, FastAPI, Django, Data Science, CLI) [REQ-002.C.3]

### Codebase Analysis (add-specs) [REQ-002.D]

- Scan codebase for TODOs/FIXMEs with file name and line numbers [REQ-002.D.1]
- Detect test frameworks (Jest, Pytest, Mocha, etc.) and count test cases [REQ-002.D.2]
- Extract architecture information (components, directories) [REQ-002.D.3]
- Display folder structure as nested tree with proper indentation (max depth 3) [REQ-002.D.4]
- Support `--no-analysis` and `--deep-analysis` flags [REQ-002.D.5]

### IDE & Agent Configuration [REQ-002.E]

- Generate `.github/copilot-instructions.md` unconditionally for every project regardless of IDE choice — contains project name/stack, tiered critical mandates, and Re-Anchor Prompt reference [REQ-002.E.1]
- Generate workspace settings for desktop IDEs: VSCode (`.vscode/`), Cursor (`.cursor/`), Windsurf (`.windsurf/`), Kiro (`.kiro/`), Antigravity (`.antigravity/`) [REQ-002.E.2]
- Generate agent instruction files for cloud agents: Cowork (`.claude/skills/specpilot-project/SKILL.md`), Codex (`CODEX_INSTRUCTIONS.md`) [REQ-002.E.3]
- IDE settings include: search inclusion for `.specs/`, markdown/YAML formatting, extensions recommendations [REQ-002.E.4]

### Generated Spec Quality [REQ-002.F]

- All generated spec files must include YAML front-matter with `fileID`, `lastUpdated`, `version`, `contributors`, `relatedFiles` [REQ-002.F.1]
- Generated `project.yaml` rules must use tiered structure: 🔴 critical / 🟡 process / 🟢 preferences [REQ-002.F.2]
- Generated `prompts.md` must include a Re-Anchor Prompt section for AI context recovery mid-session [REQ-002.F.3]
- Dual onboarding prompts: new projects get planning-focused prompt with baked-in project context; existing projects get codebase-analysis prompt [REQ-002.F.4]

## Non-Functional Requirements [REQ-003]

- Fast initialization (< 5 seconds) [REQ-003.1]
- Minimal memory footprint [REQ-003.2]
- Offline operation capability [REQ-003.3]
- Project name validated against allowlist regex to prevent template injection [REQ-003.4]

## Assumptions [REQ-004]

- Node.js >= 16 is available on the developer's machine [REQ-004.1]
- npm >= 8 is available for global installation [REQ-004.2]
- Projects are organized with a single root directory containing source files [REQ-004.3]
- Developers have write access to the project directory [REQ-004.4]
- AI IDE/agent is optional — SpecPilot works without any AI tooling [REQ-004.5]
- Internet access is not required at runtime (all templates are built-in) [REQ-004.6]

## Cross-References

- Architecture: ../architecture/architecture.md
- API/CLI interface: ../architecture/api.yaml
- Project config: ./project.yaml

---

_Last updated: 2026-03-07_
