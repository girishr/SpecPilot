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

| Command          | Description                   |
| ---------------- | ----------------------------- |
| `init <name>`    | Initialize new SDD project    |
| `add-specs`      | Add specs to existing project |
| `validate`       | Validate specification files  |
| `list`           | Show available templates      |
| `migrate`        | Migrate between spec versions |
| `specify <desc>` | Update project specifications |

### Examples

```bash
# Initialize with specific language/framework
specpilot init api --lang python --framework fastapi

# Update specifications
specpilot specify "REST API for user management" --update

# Validate with auto-fix
specpilot validate --fix
```

## Supported Languages & Frameworks

### TypeScript

- **React**: SPA applications
- **Express**: REST APIs
- **Next.js**: Full-stack apps
- **CLI**: Command-line tools

### JavaScript

- **React**: SPA applications
- **Express**: REST APIs
- **Next.js**: Full-stack apps
- **CLI**: Command-line tools

### Python

- **FastAPI**: Modern REST APIs
- **Django**: Full-stack applications
- **Data Science**: ML/Data Science projects

## Project Structure

SpecPilot generates a `.specs/` folder with organized subdirectories:

```
.specs/
├── project/          # Project config & requirements
├── architecture/     # System design & API specs
├── planning/         # Roadmap & task tracking
├── quality/          # Testing & documentation
└── development/      # AI prompts & context
```

### Key Files

- **`project.yaml`**: Project configuration and rules
- **`requirements.md`**: Functional/non-functional requirements
- **`architecture.md`**: System architecture decisions
- **`prompts.md`**: AI interaction tracking (MANDATED)
- **`tasks.md`**: Task management (backlog/sprint/completed)

## Configuration

SpecPilot requires no global configuration. Each project is self-contained with settings in `project.yaml`.

### IDE Workspace Settings

SpecPilot generates IDE-specific workspace settings during project initialization. When you run `specpilot init`, you'll be prompted to select your AI IDE:

**Supported IDEs:**

- **VSCode** - Industry standard with Copilot integration
- **Cursor** - AI-first code editor with enhanced AI context
- **Windsurf** - Advanced AI coding assistant
- **Kiro** - Specialized AI development environment
- **Antigravity** - AI-powered IDE with context awareness

**Generated Configuration Files:**

- `.vscode/settings.json` (or `.cursor/`, `.windsurf/`, etc.)
- IDE-specific workspace folder setup for code + .specs
- Extensions recommendations for development
- AI context configuration for better spec integration

The generated settings automatically configure your IDE to:

- Include `.specs/` folder in AI context
- Enable markdown and YAML formatting
- Configure workspace folders for source code and specifications
- Integrate with your preferred AI assistant

**Example:**

```bash
# During init, you'll be prompted to select your IDE
specpilot init my-project --lang typescript --framework react
# Respond with your preferred IDE (vscode, cursor, windsurf, kiro, antigravity)
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
