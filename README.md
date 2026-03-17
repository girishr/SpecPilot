# SpecPilot

[![npm version](https://img.shields.io/npm/v/specpilot.svg)](https://www.npmjs.com/package/specpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool for initializing specification-driven development projects with flexible, production-ready structures.

## Quick Start

```bash
# Install globally
npm install -g specpilot

# Create a new project
specpilot init my-project --lang typescript --framework react

# Add specs to existing project
cd existing-project
specpilot add-specs

# Validate specifications
specpilot validate
```

### 🚀 Next Steps to Populate Your Specs with AI

After creating a project, follow these steps to populate your specifications using AI:

1. **Open the generated guide**: Check `.specs/README.md` for full guidance
2. **Copy the onboarding prompt**: Use the prompt from `.specs/development/prompts.md`
3. **Paste into your AI agent**: ChatGPT, Claude, or other AI assistants
4. **Review generated spec files**: Examine the AI-generated requirements and architecture

This AI-assisted approach ensures comprehensive, high-quality specifications tailored to your project needs.

## Commands

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `init <name>`           | Initialize new SDD project                          |
| `init <name> --dry-run` | Preview files that would be created without writing |
| `add-specs`             | Add specs to existing project                       |
| `validate`              | Validate specification files                        |
| `archive`               | Archive oversized `prompts.md` / `tasks.md` entries |
| `list`                  | Show available templates                            |
| `migrate`               | Migrate between spec versions                       |
| `refine [desc]`         | Refine project specifications                       |

### Examples

```bash
# Initialize with specific language/framework
specpilot init api --lang python --framework fastapi

# Preview files that would be created without writing anything
specpilot init api --dry-run

# Refine specifications
specpilot refine "REST API for user management" --update

# Validate with auto-fix
specpilot validate --fix
```

## Supported Languages & Frameworks

### TypeScript

- **React**: SPA applications
- **Express**: REST APIs
- **Next.js**: Full-stack apps
- **Nest.js**: Scalable server-side apps
- **Vue**: Progressive UI framework
- **Angular**: Enterprise SPA framework

### JavaScript

- **React**: SPA applications
- **Express**: REST APIs

> Note: no framework prompt is shown for JavaScript — pass `--framework` explicitly if needed.

### Python

- **FastAPI**: Modern REST APIs
- **Django**: Full-stack applications
- **Flask**: Lightweight REST APIs
- **Streamlit**: Data Science / ML apps

## Project Structure

SpecPilot generates a `.specs/` folder with organized subdirectories:

```
.specs/
├── architecture/
│   ├── api.yaml              # CLI / REST API / GraphQL interface spec
│   └── architecture.md       # System design decisions and patterns
├── development/
│   ├── context.md            # Development memory, decisions, learnings
│   ├── docs.md               # Dev guidelines, spec conventions, checklist
│   └── prompts.md            # AI interaction log — MANDATED, update every session
├── planning/
│   ├── roadmap.md            # Release milestones and objectives
│   └── tasks.md              # Sprint tracker (backlog / current / completed)
├── project/
│   ├── project.yaml          # Project config, rules, and AI context (MANDATED)
│   └── requirements.md       # Functional & non-functional requirements
└── quality/
    └── tests.md              # Test strategy, coverage targets, acceptance criteria
```

> Also generated at project root: `.github/copilot-instructions.md` (AI mandate enforcement)

## Configuration

SpecPilot requires no global configuration. Each project is self-contained with settings in `project.yaml`.

### IDE & Agent Support

SpecPilot generates AI agent configuration files during project initialization. When you run `specpilot init`, you'll be prompted to select your AI IDE/Agent:

**Desktop IDEs (Workspace Settings):**

- **VSCode** - Industry standard with Copilot integration
- **Cursor** - AI-first code editor with enhanced AI context
- **Windsurf** - Advanced AI coding assistant
- **Kiro** - Specialized AI development environment
- **Antigravity** - AI-powered IDE with context awareness

**Cloud-Based AI Agents (Instruction Files):**

- **Cowork** - Anthropic Claude agent with Skills framework
- **Codex** - OpenAI Codex agent with instruction context

**Generated Configuration Files:**

For **all** IDE/Agent selections: `.github/copilot-instructions.md`

- Critical mandates injected into every AI request automatically
- Read on every interaction by GitHub Copilot, Cursor, and most AI tools
- Contains project name/stack, 5 critical mandates, and a Re-Anchor Prompt reference

For desktop IDEs: `.vscode/settings.json` (or `.cursor/`, `.windsurf/`, etc.)

- IDE-specific workspace folder setup for code + .specs
- Extensions recommendations for development
- AI context configuration for better spec integration

For cloud agents:

- **Cowork**: `.claude/skills/specpilot-project/SKILL.md` with project context and development guidelines
- **Codex**: `CODEX_INSTRUCTIONS.md` at project root with architecture overview and mandates

The generated settings/instructions automatically configure your AI agent to:

- Include `.specs/` folder in AI context
- Understand project structure and requirements
- Follow specification-driven development principles
- Access development guidelines and onboarding prompts

**Example:**

```bash
# During init, you'll be prompted to select your IDE/Agent
specpilot init my-project --lang typescript --framework react
# Respond with your preferred IDE/Agent:
# - vscode, cursor, windsurf, kiro, antigravity (desktop)
# - cowork, codex (cloud agents)
```

## Troubleshooting

### Common Issues

#### Permission Errors

```bash
sudo chown -R $USER ~/.npm-global
npm config set prefix '~/.npm-global'
```

#### Template Not Found

```bash
specpilot list --verbose
```

#### Validation Failures

```bash
specpilot validate --verbose --fix
```

#### Migration Issues

**Error: "Source structure 'complex' not found"**

```bash
# For NEW projects, use:
specpilot init my-project

# For EXISTING projects without specs:
specpilot add-specs

# Only use migrate if you have an old .project-spec folder
specpilot migrate --from complex --to simple --backup
```

### Debug Mode

```bash
DEBUG=specpilot specpilot <command>
```

## Why SpecPilot?

SpecPilot implements **Specification-Driven Development (SDD)** where specifications come first:

```
Specifications → Architecture → Code → Tests → Deployment
```

**Benefits:**

- **Clarity**: Everyone understands what needs to be built
- **Consistency**: Standardized structure across projects
- **Quality**: Built-in validation and testing
- **AI-Ready**: Clear context for AI assistants
- **Maintainable**: Comprehensive documentation

## Contributing

This project follows SDD principles. See [`.specs/`](.specs/) for contribution guidelines.

### Development Setup

```bash
git clone https://github.com/girishr/SpecPilot.git
cd SpecPilot
npm install
npm run build
npm link  # For local testing
```

### Quick Contribution Guide

1. Review [`.specs/project/requirements.md`](.specs/project/requirements.md)
2. Check [`.specs/planning/tasks.md`](.specs/planning/tasks.md)
3. Update specs when making changes
4. Run `specpilot validate` before committing

## Documentation

- **[Full Guide](docs/GUIDE.md)**: Comprehensive documentation
- **[CHANGELOG](CHANGELOG.md)**: Version history
- **[Issues](https://github.com/girishr/SpecPilot/issues)**: Bug reports & feature requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

_Built with specification-driven development principles for serious production projects._
