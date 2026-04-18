# SpecPilot Comprehensive Guide

> **Note**: This is the full documentation. For quick reference, see [`README.md`](../README.md).

## Table of Contents

- [Why SpecPilot?](#why-specpilot)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Supported Languages & Frameworks](#supported-languages--frameworks)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)
- [Team Collaboration](#team-collaboration)
- [Enterprise Integration](#enterprise-integration)
- [API Usage](#api-usage)
- [Contributing](#contributing)
- [Development Setup](#development-setup)
- [Comparison with GitHub Spec Kit](#comparison-with-github-spec-kit)
- [Version History](#version-history)

## Why SpecPilot?

### The Problem with Traditional Development

Traditional software development often starts with code, leading to:

- **Unclear Requirements**: Features built without clear specifications
- **Scope Creep**: Projects expanding beyond original intent
- **Technical Debt**: Poor architecture decisions made early
- **Communication Gaps**: Misalignment between stakeholders
- **Maintenance Issues**: Code that's hard to understand and modify

### Specification-Driven Development (SDD)

SpecPilot implements **Specification-Driven Development (SDD)** - a methodology where specifications come first:

```
Specifications → Architecture → Code → Tests → Deployment
```

**Key Benefits:**

- **Clarity**: Everyone understands what needs to be built
- **Consistency**: Standardized project structure across teams
- **Quality**: Built-in validation and testing frameworks
- **Scalability**: Easy to onboard new team members
- **Maintainability**: Clear documentation and structure

### Why SDD is the Future

SDD addresses modern development challenges:

- **AI Integration**: Specifications provide clear context for AI assistants
- **Remote Teams**: Clear documentation reduces communication overhead
- **Rapid Prototyping**: Quick specification validation before coding
- **Regulatory Compliance**: Built-in audit trails and documentation
- **Knowledge Transfer**: Institutional knowledge preserved in specifications

## Installation

### Prerequisites

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0

### Global Installation

```bash
npm install -g specpilot
```

### Verify Installation

```bash
specpilot --version
specpilot --help
```

### Local Development

```bash
git clone https://github.com/girishr/SpecPilot.git
cd SpecPilot
npm install
npm run build
npm link  # For local testing
```

## Quick Start

### 1. Initialize a New Project

```bash
# Create a new TypeScript React project
specpilot init my-app --lang typescript --framework react

# Create a Python FastAPI project
specpilot init api-project --lang python --framework fastapi
```

### 2. Review Generated Structure

```bash
cd my-app
ls -la .specs/
```

### 3. Use AI Onboarding (Recommended)

```bash
# Open the onboarding prompt
open .specs/development/prompts.md

# Copy the prompt and paste into your AI assistant
# The AI will populate all specification files
```

### 4. Start Development

```bash
# Validate specifications
specpilot validate

# Begin coding based on your specs
```

## Commands Reference

> **Tip — command aliases:** Every command has a short alias for faster typing.
>
> | Command     | Alias |
> | ----------- | ----- |
> | `init`      | `i`   |
> | `validate`  | `v`   |
> | `migrate`   | `m`   |
> | `list`      | `ls`  |
> | `refine`    | `ref` |
> | `archive`   | `ar`  |
> | `add-specs` | `add` |
> | `backfill`  | `bf`  |
>
> Example: `specpilot i my-app` is identical to `specpilot init my-app`.

### Core Commands

#### `specpilot init <project-name> [options]`

Initialize a new SDD project with complete specification structure.

```bash
# Basic initialization
specpilot init my-project

# With language and framework
specpilot init my-app --lang typescript --framework react

# Preview files that would be created without writing anything
specpilot init my-project --dry-run

# With prompts for customization
specpilot init my-project --prompts

# Skip interactive prompts
specpilot init my-project --no-prompts
```

**Options:**

- `--lang, -l <language>`: Programming language (typescript, javascript, python) · default: `typescript`
- `--framework, -f <framework>`: Framework (react, express, fastapi, django, etc.)
- `--dir, -d <directory>`: Target directory · default: `.`
- `--specs-name <name>`: Custom name for the specs folder · default: `.specs`
- `--no-prompts`: Skip all interactive prompts
- `--dry-run`: List all files that would be created without writing anything

#### `specpilot add-specs`

Add `.specs` structure to an existing project.

```bash
# In your existing project directory
cd existing-project
specpilot add-specs

# Skip codebase analysis
specpilot add-specs --no-analysis

# Deep analysis of existing code
specpilot add-specs --deep-analysis
```

**Options:**

- `--lang, -l <language>`: Programming language (typescript, javascript, python)
- `--framework, -f <framework>`: Framework (react, express, fastapi, django, etc.)
- `--no-analysis`: Skip automatic codebase analysis
- `--deep-analysis`: Perform comprehensive code analysis
- `--no-prompts`: Skip all interactive prompts

#### `specpilot validate [options]`

Validate specification files and project structure.

```bash
# Basic validation
specpilot validate

# Verbose output
specpilot validate --verbose

# Auto-fix common issues
specpilot validate --fix
```

**Options:**

- `--fix`: Automatically fix common issues (missing files, stale dates)
- `--verbose`: Detailed validation output

#### `specpilot list [options]`

List available templates and languages.

```bash
# List all templates
specpilot list

# Verbose template information
specpilot list --verbose
```

**Options:**

- `--lang <language>`: Filter templates by language
- `--verbose`: Show detailed template information

#### `specpilot migrate [options]`

Convert a legacy `.project-spec` folder to the current `.specs/` structure. This command is rarely needed — only if you have a project from an old SpecPilot version.

```bash
# Migrate from old structure (rarely needed)
specpilot migrate --from complex --to simple --backup
```

**Options:**

- `--from <structure>`: Source structure type · default: `complex`
- `--to <structure>`: Target structure type · default: `simple`
- `--backup`: Create a backup before migrating

**When to use migrate:**

- You have an old `.project-spec` folder from a previous SpecPilot version
- You're upgrading between SpecPilot structure versions
- You need to convert between specification formats

**When NOT to use migrate:**

- Starting a new project (use `init` instead)
- Adding specs to existing code (use `add-specs` instead)
- Your project has no specification folder yet

#### `specpilot refine <description> [options]`

Refine project specifications with new requirements.

```bash
# Refine specifications with new description
specpilot refine "A REST API for user management" --update

# Interactive specification input
specpilot refine --prompts

# Skip diff preview — write without confirmation
specpilot refine "new feature" --no-prompts
```

**Options:**

- `--update, -u`: Regenerate specifications with new context
- `--dir, -d <directory>`: Project directory · default: `.`
- `--specs-name <name>`: Custom name for the specs folder · default: `.specs`
- `--no-prompts`: Skip diff preview — write files without confirmation

#### `specpilot archive [options]`

Archive oversized `.specs/` files to keep them readable. Triggers automatically when `development/prompts.md` exceeds 300 lines or the `## Completed` section of `planning/tasks.md` exceeds 150 lines.

```bash
# Archive in current project directory
specpilot archive

# Preview what would be archived without writing anything
specpilot archive --dry-run
```

**Options:**

- `--dry-run`: Preview changes without writing any files

**What it archives:**

- `development/prompts.md` → older entries moved to `development/prompts-archive.md`
- `planning/tasks.md` Completed section → older entries moved to `planning/tasks-archive.md`

#### `specpilot backfill [options]`

Backfill missing SpecPilot mandates into a project that already has `.specs/`. Run this after upgrading SpecPilot to pick up new mandates added in later releases. Operates on `.specs/project/project.yaml` and `.github/copilot-instructions.md` — never overwrites or deletes existing user-authored content.

```bash
# Backfill in current project directory
specpilot backfill

# Preview what would change without writing anything
specpilot backfill --dry-run
```

**Options:**

- `--dir, -d <directory>`: Project directory · default: `.`
- `--specs-name <name>`: Custom name for the specs folder · default: `.specs`
- `--dry-run`: Preview changes without writing any files

**When to use backfill:**

- After upgrading SpecPilot to a newer version that added new mandates
- When your existing `project.yaml` is missing critical or process mandates
- When `.github/copilot-instructions.md` is out of date or missing

**When NOT to use backfill:**

- Starting a new project (use `init` instead)
- Adding specs to a project that has none (use `add-specs` instead)
- Converting an old folder structure (use `migrate` instead)

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Enable debug logging
DEBUG=specpilot specpilot init my-project

# Verbose output
specpilot validate --verbose

# Check available templates
specpilot list --verbose
```

## Supported Languages & Frameworks

### TypeScript

| Framework | Template     | Description                    |
| --------- | ------------ | ------------------------------ |
| Generic   | `typescript` | Basic TypeScript project       |
| React     | `react`      | React SPA with TypeScript      |
| Express   | `express`    | Node.js REST API with Express  |
| Next.js   | `next`       | Full-stack Next.js application |
| Nest.js   | `nest`       | Scalable server-side framework |
| Vue       | `vue`        | Progressive UI framework       |
| Angular   | `angular`    | Enterprise SPA framework       |

### JavaScript

| Framework | Template     | Description                   |
| --------- | ------------ | ----------------------------- |
| Generic   | `javascript` | Basic JavaScript project      |
| React     | `react`      | React SPA with JavaScript     |
| Express   | `express`    | Node.js REST API with Express |

> Note: no framework prompt is shown for JavaScript — pass `--framework` explicitly if needed.

### Python

| Framework | Template    | Description                   |
| --------- | ----------- | ----------------------------- |
| Generic   | `python`    | Basic Python project          |
| FastAPI   | `fastapi`   | Modern REST API with FastAPI  |
| Django    | `django`    | Full-stack Django application |
| Flask     | `flask`     | Lightweight REST API          |
| Streamlit | `streamlit` | Data Science / ML apps        |

## Project Structure

SpecPilot generates a comprehensive `.specs/` folder structure:

```
.specs/
├── architecture/
│   ├── api.yaml              # CLI / REST API / GraphQL interface spec
│   └── architecture.md       # Architecture decisions & patterns
├── development/
│   ├── context.md            # Development memory & learnings
│   ├── docs.md               # Dev guidelines, spec conventions, checklist
│   └── prompts.md            # AI interaction log — MANDATED, update every session
├── planning/
│   ├── roadmap.md            # Release milestones, objectives & risks
│   └── tasks.md              # Sprint tracker (backlog / current / completed)
├── project/
│   ├── project.yaml          # Project config, rules, and AI context (MANDATED)
│   └── requirements.md       # Functional & non-functional requirements
└── quality/
    └── tests.md              # Test strategy, coverage targets, acceptance criteria
```

Also generated at project root:

- **`.github/copilot-instructions.md`** — AI mandate enforcement file; read automatically by GitHub Copilot, Cursor, and most AI tools on every interaction. Contains project name/stack, critical mandates, process mandates, and a Re-Anchor Prompt reference.

### Key Files Explained

#### `project.yaml`

Central configuration file containing:

- Project metadata (name, version, language, framework)
- AI context and operational mandates
- Cross-references to other specification files

#### `requirements.md`

Functional and non-functional requirements:

- User stories and acceptance criteria
- Business rules and constraints
- Performance and security requirements

#### `architecture.md`

Technical architecture decisions:

- System components and relationships
- Design patterns and principles
- Technology stack rationale

#### `prompts.md` (MANDATED)

Complete record of all AI interactions:

- Prompts given to AI assistants
- Responses and code generated
- Context and reasoning
- Decision tracking

## Configuration

SpecPilot is designed to be **configuration-free**. All project-specific settings are stored in `project.yaml` within each project's `.specs/` folder.

### No Global Configuration

Unlike many CLI tools, SpecPilot does not require global configuration files. Each project is self-contained with its own specification structure.

### Project-Specific Settings

Configuration is handled through the generated `project.yaml`:

```yaml
name: my-project
language: typescript
framework: react
version: 1.0.0
lastUpdated: 2025-10-30
contributors: [developer-name]
```

### Custom Templates (Not Supported)

SpecPilot currently does not support custom templates. All templates are built-in and maintained by the SpecPilot team.

### IDE & Agent Configuration

During project initialization, SpecPilot prompts you to select your AI IDE or agent. This configures automatically generated files to integrate `.specs/` context into your chosen environment.

**All IDE/Agent selections** also generate:

- `.github/copilot-instructions.md` — critical mandates injected into every AI request automatically (GitHub Copilot, Cursor, and most AI tools read this file on every interaction). Contains project name/stack, 5 critical mandates, process mandates, and a Re-Anchor instruction.

**Desktop IDEs** additionally generate workspace settings:

- `.vscode/settings.json` for VSCode
- `.cursor/settings.json` for Cursor
- `.windsurf/settings.json` for Windsurf
- `.kiro/settings.json` for Kiro
- `.antigravity/settings.json` for Antigravity

These files include:

- Workspace folder configuration
- File associations for markdown/YAML
- Extensions recommendations
- AI context paths pointing to `.specs/` folder

**Cloud Agents** generate instruction files:

- `.claude/skills/specpilot-project/SKILL.md` for Cowork (Claude)
  - Provides project context in Skills format
  - Includes SDD principles and development guidelines
  - Links to onboarding prompts and key reference files

- `CODEX_INSTRUCTIONS.md` for Codex (OpenAI)
  - Provides project overview and architecture guidance
  - Includes development mandates and best practices
  - Links to `.specs/` folder structure and key files

**To reconfigure your IDE/Agent:**
Re-run `specpilot init` for the project and select a different IDE/Agent when prompted:

```bash
specpilot init my-project --lang typescript --framework react
# When prompted for IDE/Agent, select your preferred option
```

Supported values: `vscode`, `cursor`, `windsurf`, `kiro`, `antigravity`, `cowork`, `codex`

## Troubleshooting

### Common Issues

#### Permission Errors

```bash
# Fix permission issues
sudo chown -R $USER ~/.npm-global
npm config set prefix '~/.npm-global'
```

#### Template Not Found

```bash
# List available templates
specpilot list

# Check language/framework support
specpilot list --verbose
```

#### Validation Failures

```bash
# Run with detailed error output
specpilot validate --verbose

# Auto-fix common issues
specpilot validate --fix
```

#### Migration Issues

**Error: "Source structure 'complex' not found"**

This means you're trying to migrate from a structure that doesn't exist in your project.

```bash
# Check what's in your project directory
ls -la

# For NEW projects, use:
specpilot init my-project

# For EXISTING projects without specs:
specpilot add-specs

# Only use migrate if you have an old .project-spec folder:
specpilot migrate --from complex --to simple --backup
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=specpilot specpilot init my-project

# Verbose output
specpilot validate --verbose

# Check what templates are available
specpilot list --verbose
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/specs-validation.yml
name: Validate Specs
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm install -g specpilot
      - run: specpilot validate --verbose
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - validate

validate_specs:
  stage: validate
  image: node:18
  before_script:
    - npm install -g specpilot
  script:
    - specpilot validate --verbose
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Validate Specs') {
            steps {
                sh 'npm install -g specpilot'
                sh 'specpilot validate --verbose'
            }
        }
    }
}
```

## Team Collaboration

### Shared Repository Structure

```bash
# Initialize project for team collaboration
specpilot init team-project --lang typescript --framework react

# Share specs folder structure with team
git add .specs/
git commit -m "feat: add specification-driven development structure"

# Team members can validate specs consistently
specpilot validate --verbose
```

### Branch Strategy

```bash
# Feature branch workflow
git checkout -b feature/user-auth
specpilot refine "Add user authentication system" --update
# Implement feature based on updated specs
git add .
git commit -m "feat: implement user authentication"

# Validate before merging
specpilot validate --verbose
```

### Code Reviews

Use specifications for effective code reviews:

```bash
# Review specifications before code
open .specs/project/requirements.md
open .specs/architecture/architecture.md

# Validate implementation matches specs
specpilot validate --verbose
```

## Enterprise Integration

> **Note**: SpecPilot is currently a CLI-first tool. Organizations can wrap SpecPilot with internal tooling and scripts. Use `specpilot list` to explore built-in templates and `specpilot --help` for available commands.

### Internal Tooling Integration

```bash
# Use in shell scripts
specpilot init my-project --lang typescript --no-prompts
specpilot validate --fix
```

### Custom Workflows

Organizations can build custom workflows around SpecPilot:

```bash
#!/bin/bash
# custom-init.sh
PROJECT_NAME=$1
FRAMEWORK=$2

specpilot init "$PROJECT_NAME" --lang typescript --framework "$FRAMEWORK"
# Add company-specific customizations
cp company-templates/README.md "$PROJECT_NAME/"
# ... additional setup
```

### Compliance and Auditing

SpecPilot supports compliance requirements through:

- **Complete audit trails** in `prompts.md`
- **Version-controlled specifications** in git
- **Structured documentation** for regulatory requirements
- **Validation checks** to ensure compliance

## API Usage

> **Note**: Programmatic API support is not currently available. SpecPilot is designed as a CLI-first tool.

### Shell Script Integration

```bash
# Use in shell scripts
specpilot init my-project --lang typescript --no-prompts
specpilot validate --fix
```

### Programmatic Usage (Future)

API support is planned for future versions. For now, use CLI commands in scripts and automation.

## Contributing

This project follows specification-driven development principles. Please review our [`.specs/`](.specs/) folder for detailed contribution guidelines, architecture decisions, and development context.

### Quick Contribution Guide

1. **Read the specs**: Review [`.specs/project/requirements.md`](.specs/project/requirements.md) and [`.specs/architecture/architecture.md`](.specs/architecture/architecture.md)
2. **Check current tasks**: See [`.specs/planning/tasks.md`](.specs/planning/tasks.md) for open issues
3. **Follow conventions**: Use the metadata format documented in [`.specs/development/docs.md`](.specs/development/docs.md)
4. **Update specs**: Modify relevant spec files when making changes
5. **Validate**: Run `specpilot validate` before committing

### Development Setup

```bash
# Clone and setup
git clone https://github.com/girishr/SpecPilot.git
cd SpecPilot
npm install

# Run in development mode
npm run dev -- init test-project --lang typescript

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Test CLI locally
node cli.js init my-test --lang python
```

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint configuration
- **Testing**: Jest — 73 tests across 5 suites
- **Commits**: Conventional commit format

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes following SDD principles
4. Update specifications if needed
5. Add tests for new functionality
6. Ensure all tests pass
7. Update documentation
8. Submit pull request

## Comparison with GitHub Spec Kit

For a detailed side-by-side comparison of SpecPilot and [GitHub Spec Kit](https://github.com/github/spec-kit), see the dedicated **[comparison guide](comparison.md)**.

The comparison covers:

- Core philosophy and workflow differences
- Generated artifacts
- When to choose SpecPilot vs Spec Kit
- Whether the two tools can be used together

## Version History

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.

## License

MIT License - see [LICENSE](../LICENSE) file for details.

---

_Built with specification-driven development principles for serious production projects._
