# SpecPilot SDD CLI

A CLI tool for initializing specification-driven development projects with flexible, production-ready structures.

## Table of Contents

- [Quick Start](#quick-start)
- [Description](#description)
- [Why SpecPilot?](#why-specpilot)
  - [The Problem with Traditional Development](#the-problem-with-traditional-development)
  - [The SpecPilot Solution](#the-specpilot-solution)
  - [🏗️ Analogy: Building a House](#️-analogy-building-a-house)
  - [💡 Example: Building a Task Management App](#-example-building-a-task-management-app)
  - [🌟 Why SDD is the Future](#-why-sdd-is-the-future)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage Examples](#usage-examples)
  - [Basic Project Initialization](#basic-project-initialization)
  - [Additional Commands](#additional-commands)
- [Configuration](#configuration)
  - [Global Configuration](#global-configuration)
  - [Project Configuration](#project-configuration)
- [Templates](#templates)
  - [Available Templates](#available-templates)
  - [Custom Templates](#custom-templates)
- [Features](#features)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debug Mode](#debug-mode)
  - [Getting Help](#getting-help)
- [Getting Started](#getting-started)
  - [Best Practices](#best-practices)
- [How to Contribute](#how-to-contribute)
- [Version History](#version-history)
- [MIT License](#mit-license)
- [Extended Configuration](#extended-configuration)
  - [CI/CD Integration](#cicd-integration)
  - [Team Collaboration](#team-collaboration)
  - [Enterprise Integration](#enterprise-integration)
  - [API Usage](#api-usage)
- [Contributing](#contributing)
  - [Development Setup](#development-setup)
- [License](#license)

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

## Prerequisites

- **Node.js**: 16.0.0 or higher (18+ recommended)
- **npm**: 8.0.0 or higher (or yarn 1.22+)
- **Git**: For version control (recommended)
- **Operating System**: Windows, macOS, or Linux

## Installation

```bash
npm install -g specpilot
```

### Verify Installation

```bash
specpilot --version
# Should output: 1.1.1 (or current version)

specpilot --help
# Shows available commands
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

- **Generic**: Basic TypeScript project structure
- **React**: React application with modern tooling
- **Express**: REST API server setup

#### Python

- **Generic**: Basic Python project structure
- **FastAPI**: Modern API development
- **Django**: Web application framework

> **Note**: Run `specpilot list` to see all currently available templates and their status.

### Custom Templates

> **Coming Soon**: Custom template support is planned for future releases. Currently, SpecPilot uses built-in templates optimized for specification-driven development.

**Planned custom template structure:**

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
specpilot validate --verbose

# Auto-fix common issues
specpilot validate --fix
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
DEBUG=specpilot specpilot init my-project

# Verbose output
specpilot validate --verbose

# Check what templates are available
specpilot list --verbose
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
- **Validate regularly**: Use `specpilot validate` during development
- **Follow the subfolder structure**: Organize specs in `project/`, `architecture/`, `planning/`, `quality/`, `development/`
- **Use stable IDs**: Reference requirements and tasks by their IDs (e.g., `REQ-001`, `TASK-002`)
- **Version control everything**: Include `.specs/` in your git repository
- **Update metadata**: Keep `lastUpdated` and `version` fields current in spec files

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
        with:
          node-version: '18'
      - run: npm install -g specpilot
      - run: specpilot validate --verbose
```

### Team Collaboration

```bash
# Initialize project for team collaboration
specpilot init team-project --lang typescript --framework react

# Share specs folder structure with team
git add .specs/
git commit -m "feat: add specification-driven development structure"

# Team members can validate specs consistently
specpilot validate --verbose
```

### Enterprise Integration

Your organization can wrap SpecPilot with internal tooling and templates. For now, use `specpilot list` to explore built-ins.

### API Usage

> **Coming Soon**: Programmatic API support is planned for future releases. Currently, SpecPilot is designed as a CLI-first tool.

**Planned programmatic usage:**
```javascript
// Future API (not yet available)
const { initProject, validateSpecs } = require("specpilot");

await initProject({
  name: "my-project",
  language: "typescript",
  framework: "react"
});
```

For now, use the CLI commands or shell integration:
```bash
# Use in shell scripts
specpilot init my-project --lang typescript --no-prompts
specpilot validate --fix
```

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

## License

MIT License - see LICENSE file for details.

---

_Built with specification-driven development principles for serious production projects._
````
