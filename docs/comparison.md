# SpecPilot vs GitHub Spec Kit

> A transparent comparison to help you choose the right spec-driven development tool.

Both SpecPilot and [GitHub Spec Kit](https://github.com/github/spec-kit) embrace spec-driven development (SDD) — the principle that clear specifications should come before code. They differ significantly in philosophy, workflow, and the problems they are optimised for.

## At a Glance

| | SpecPilot | GitHub Spec Kit |
|---|---|---|
| **Language / runtime** | TypeScript / Node.js | Python |
| **Install via** | `npm install -g specpilot` | `uv tool install specify-cli` |
| **Primary workflow** | CLI scaffolds a persistent `.specs/` folder; AI optional | AI-agent slash commands drive the entire workflow |
| **AI dependency** | None — works fully offline & without AI | Designed to be used with an AI agent (Copilot, Claude, etc.) |
| **Spec storage** | Structured `.specs/` folder committed alongside code | Spec files generated per-session by the AI agent |
| **Configuration** | `project.yaml` — project-scoped, no global config | Project principles defined via `/speckit.constitution` |
| **Backed by** | Independent open-source project | GitHub (official) |
| **Stars** | — | ~69 k |
| **License** | MIT | MIT |

---

## Core Philosophy

### SpecPilot: spec folder as a first-class project artifact

SpecPilot treats the `.specs/` folder as a permanent, version-controlled part of your repository — just like `src/` or `tests/`. You scaffold it once with `specpilot init` and it evolves alongside your code. AI tools are optional accelerators, not a prerequisite.

- Specifications live in the repo so every team member, CI pipeline, and reviewer can access them
- Works completely offline — all templates are built-in
- AI-agnostic: ChatGPT, Claude, Copilot, or no AI at all
- Persistent spec files create a long-term audit trail for architectural decisions, security, and compliance

### GitHub Spec Kit: AI agents as the spec-creation engine

Spec Kit's workflow is centred on directing an AI agent through a sequence of slash commands (`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`). The AI agent reads your intent and produces a working implementation. Spec Kit is purpose-built for this human-AI co-creation loop.

- Deep integration with GitHub Copilot, Claude, Codex, and other AI agents
- Extensive community extension ecosystem for custom workflows
- Focused on taking a feature from idea → implementation in a single guided session
- Backed by GitHub's engineering and community

---

## Workflow Comparison

### SpecPilot workflow

```bash
# 1. Scaffold spec structure for a new project
specpilot init my-app --lang typescript --framework react

# 2. (Optional) Populate specs with your AI assistant
#    Copy the onboarding prompt from .specs/development/prompts.md
#    and paste it into ChatGPT, Claude, Copilot, etc.

# 3. Validate specs as you develop
specpilot validate

# 4. Add specs to an existing project
specpilot add-specs

# 5. Refine specs when requirements change
specpilot refine "add real-time notifications" --update
```

### GitHub Spec Kit workflow

```bash
# 1. Install and initialise
uv tool install specify-cli
specify init my-app --ai copilot

# 2. Define project principles (AI agent command)
/speckit.constitution  Focus on code quality and test coverage

# 3. Describe the feature to build (AI agent command)
/speckit.specify  Build a user authentication system with OAuth

# 4. Create an implementation plan (AI agent command)
/speckit.plan  Use Next.js with Prisma and PostgreSQL

# 5. Break down and execute (AI agent commands)
/speckit.tasks
/speckit.implement
```

---

## Generated Artifacts

### SpecPilot

SpecPilot generates a structured `.specs/` folder:

```
.specs/
├── architecture/
│   ├── api.yaml              # Interface spec (CLI / REST / GraphQL)
│   └── architecture.md       # Design decisions & patterns
├── development/
│   ├── context.md            # Dev memory & decisions
│   ├── docs.md               # Guidelines & conventions
│   └── prompts.md            # AI interaction log (MANDATED)
├── planning/
│   ├── roadmap.md            # Milestones & objectives
│   └── tasks.md              # Sprint tracker
├── project/
│   ├── project.yaml          # Project config & AI context
│   └── requirements.md       # Functional & non-functional requirements
├── quality/
│   └── tests.md              # Test strategy & acceptance criteria
└── security/
    ├── security-decisions.md # ADR-style security decisions
    └── threat-model.md       # Threat inventory
```

Also generates `.github/copilot-instructions.md` and IDE-specific workspace settings.

### GitHub Spec Kit

Spec Kit generates spec documents during a session: a constitution file, a feature specification, a technical plan, and a task list. These files guide the AI agent toward a working implementation within the same session.

---

## When to Choose SpecPilot

- You want specs to live **in your repository** as a long-term, version-controlled asset
- Your team uses **multiple AI tools** (or none at all) and you need an AI-agnostic workflow
- You need **offline-capable** project initialisation — no internet required at runtime
- You are working on a long-lived product where **architecture decisions, security records, and audit trails** matter
- You want a **CLI-first** tool for Node.js / Python / TypeScript projects with rich framework templates
- You value **structured, consistent spec files** with YAML front-matter and cross-references across all your projects

## When to Choose GitHub Spec Kit

- Your workflow revolves around an AI agent and you want a **tight human-AI co-creation loop**
- You want to go from **idea to working implementation** in a single guided session
- You want the largest **community extension ecosystem** and community presets
- Your team is already deeply invested in GitHub's AI tooling (Copilot, Codex, Claude)
- You prefer a Python-based toolchain

---

## Can I use both?

Yes. Some teams find value in using SpecPilot to establish and maintain a persistent `.specs/` structure, and referencing those spec files as context when running Spec Kit's AI agent commands. The two tools are complementary rather than mutually exclusive.

---

## Further Reading

- [SpecPilot Full Guide](GUIDE.md)
- [GitHub Spec Kit Repository](https://github.com/github/spec-kit)
- [Spec Kit Documentation](https://github.github.io/spec-kit/)
- [SpecPilot on npm](https://www.npmjs.com/package/specpilot)
