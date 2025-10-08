# SpecPilot SDD CLI

A CLI tool for initializing specification-driven development projects with flexible, production-ready structures.

## Quick Start

```bash
# Install globally
npm install -g specpilot

# Initialize your first project
specpilot init my-project --lang typescript --framework react

# Start coding with full control
cd my-project
# Your .specs/ folder is ready with guidelines, not prescriptions
```

## Description

`SpecPilot SDD CLI` is designed to give developers the freedom to decide and control their projects, not prescribe the entire implementation. My goal with this project is to provide a helping tool that offers basic guidelines for serious developers writing production code for critical development tasks who need better control over their project, its architecture, and its structure.

The tool generates customizable `.specs` directories that serve as flexible frameworks for specification-driven development, integrating seamlessly with AI-assisted coding workflows. It provides structure and guidance without dictating implementation, allowing you to maintain full ownership of your production code while establishing robust foundations for scalable, maintainable projects.

## Why SpecPilot?

### The Problem with Traditional Development

Most software projects start with good intentions but end up with unclear requirements, inconsistent architecture, and difficult maintenance. Developers spend 50%+ of their time on planning, debugging, and refactoring.

### The SpecPilot Solution

SpecPilot brings **Specification-Driven Development (SDD)** to your workflow - a methodology where you define what you're building _before_ you start coding.

### 🏗️ **Analogy: Building a House**

**Traditional Coding**: Like building a house without blueprints - you start hammering nails and hope it turns out right.

**With SpecPilot**: Like getting detailed architectural plans first - you know exactly what rooms you need, where the plumbing goes, and how everything connects before breaking ground.

### 💡 **Example: Building a Task Management App**

**Without SpecPilot:**

```bash
mkdir my-app && cd my-app
npm init -y
# Now what? Start coding randomly, figure out structure later...
```

**With SpecPilot:**

```bash
npm install -g specpilot
specpilot init task-manager --lang typescript --framework react
cd task-manager
# Instantly get:
# - Complete project structure with API specs
# - Test plans and validation rules
# - AI prompt tracking for accountability
# - Development guidelines and best practices
```

### 🌟 **Why SDD is the Future**

- **70% of software projects fail** due to poor planning - SDD reduces this by 60%
- **AI-assisted coding** becomes reliable when guided by specifications
- **Team collaboration** improves with shared understanding
- **Enterprise-ready** approach for serious production projects

**SpecPilot gives you a professional project foundation in seconds, so you can focus on building great features instead of figuring out folder structures.**

## Installation

```bash
npm install -g specpilot
```

## Usage Examples

### Basic Project Initialization

```bash
# Initialize with default settings (.specs folder)
specpilot init my-project

# Specify language and framework
specpilot init my-project --lang typescript --framework react
specpilot init my-project --lang typescript --framework express
specpilot init my-project --lang python --framework fastapi
specpilot init my-project --lang python --framework django

# Use a custom specs folder name
specpilot init my-project --specs-name .project-specs

# Skip interactive prompts
specpilot init my-project --no-prompts
```

### Additional Commands

```bash
# Validate project specs
specpilot validate --verbose
specpilot validate --fix

# List available templates
specpilot list

# Migrate legacy structures (when applicable)
specpilot migrate --from complex --to simple --backup

# Generate or update specs from a natural language description
specpilot specify "A simple REST API for todos" --update
```

> Tip: Run `specpilot --help` or `specpilot <command> --help` for full options.

## Configuration

### Global Configuration

Create `~/.specpilot-config.yaml` for global defaults:

```yaml
defaults:
  specDir: ".specs"
  author: "Your Name"
  license: "MIT"
  aiTracking: true

templates:
  typescript:
    framework: "express"
  python:
    framework: "fastapi"

validation:
  strict: true
  autoFix: true
```

### Project Configuration

After initialization, customize `.specs/project/project.yaml`:

```yaml
project:
  name: "my-project"
  description: "My awesome project"
  language: "typescript"
  framework: "react"
  version: "1.1.1"

rules:
  - "Follow specification-driven development"
  - "Maintain comprehensive documentation"
  - "Use TypeScript strict mode"

ai-context:
  - "Track all development prompts"
  - "Maintain architectural decisions"
```

## Templates

### Available Templates

#### TypeScript

- React
- Express

#### Python

- FastAPI
- Django

### Custom Templates

Create custom templates in `~/.specpilot-templates/`:

```text
~/.specpilot-templates/
├── my-custom-template/
│   ├── template.yaml
│   ├── .specs/
│   └── src/
```

## Features

- **Flexible Structure**: Generates `.specs` with customizable, production-ready layout
- **Language Support**: Templates for TypeScript and Python
- **Spec Validation**: Built-in validation with optional auto-fix
- **AI Integration**: Dedicated prompts tracking for development cycles
- **Migration Support**: Helps transition older structures
- **Template Listing**: Discover available language/framework combinations

## Project Structure

After initialization, your project will have:

```text
project-root/
├── .specs/
│   ├── project/          # project.yaml, requirements.md, project-plan.md
│   ├── architecture/     # architecture.md, api.yaml
│   ├── planning/         # tasks.md, roadmap.md
│   ├── quality/          # tests.md
│   └── development/      # docs.md, context.md, prompts.md
├── src/
└── README.md
```

## Troubleshooting

### Common Issues

#### Permission Errors

```bash
# Fix permission issues
sudo chown -R $USER ~/.npm-global
npm config set prefix '~/.npm-global'
```

````text
# Configuration examples

#### Template Not Found

```bash
# List available templates
specpilot list
```

#### Validation Failures

```bash
# Run with detailed error output
specpilot --validate --verbose

# Auto-fix common issues
specpilot --validate --fix
```

#### Migration Issues

```bash
# Show CLI version
specpilot --version

# Migrate legacy structure
specpilot migrate --from complex --to simple --backup
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=specpilot specpilot my-project

# Verbose output
specpilot my-project --verbose

# Dry run (show what would be created)
specpilot my-project --dry-run
```

### Getting Help

```bash
# Show help
specpilot --help

# Command-specific help
specpilot init --help
specpilot validate --help
specpilot list --help
specpilot migrate --help
specpilot specify --help
```

## Getting Started

1. **Initialize your project**: `specpilot init my-project --lang typescript`
2. **Review the generated `.specs` structure** - This provides your flexible framework
3. **Customize the specifications** in `.specs/project/project.yaml`
4. **Document your architecture** in `.specs/architecture/architecture.md`
5. **Track all development prompts** in `.specs/development/prompts.md`
6. **Plan your work** in `.specs/planning/tasks.md` and `.specs/planning/roadmap.md`
7. **Define tests** in `.specs/quality/tests.md`
8. **Start building** your production code in `src/`

### Best Practices

- **Start with specifications**: Define what you're building before coding
- **Keep prompts updated**: Log all AI interactions for future reference
- **Validate regularly**: Use `specpilot --validate` during development
- **Customize templates**: Adapt the structure to your team's needs
- **Version control everything**: Include `.specs/` in your git repository

## How to Contribute

We welcome contributions! Please:

1. Fork the repo and create a feature branch
2. Follow the existing code style and add tests for new features
3. Update documentation for new functionality
4. Submit a pull request with a clear description

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## MIT License

MIT License - see [LICENSE](LICENSE) file for details.

## Extended Configuration

### CI/CD Integration

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
      - run: npm install -g specpilot
      - run: specpilot --validate --strict
```

### Team Collaboration

```bash
# Initialize for team with shared templates
specpilot team-project --lang typescript --template team-standard

# Sync team templates
specpilot --sync-templates --from git@github.com:company/templates.git

# Validate against team standards
specpilot --validate --team-rules
```

### Enterprise Integration

Your organization can wrap SpecPilot with internal tooling and templates. For now, use `specpilot list` to explore built-ins.

### API Usage

Programmatic API is not currently supported. Use the CLI commands documented above.

## Contributing

This project follows specification-driven development. See `.specs` for contribution guidelines and development setup.

### Development Setup

```bash
# Clone and setup
git clone https://github.com/specpilot/specpilot.git
cd specpilot
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT License - see LICENSE file for details.

---

_Built with specification-driven development principles for serious production projects._
