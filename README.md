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
# Should output: 1.2.2 (or current version)

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
specpilot init my-project --lang javascript --framework express
specpilot init my-project --lang python --framework fastapi
specpilot init my-project --lang python --framework django

# Use a custom specs folder name
specpilot init my-project --specs-name .project-specs

# Skip interactive prompts
specpilot init my-project --no-prompts
```

### Additional Commands

```bash
# Add .specs folder to an existing project
specpilot add-specs
specpilot add-specs --lang typescript --framework react
specpilot add-specs --no-analysis  # Skip codebase analysis
specpilot add-specs --no-prompts   # Non-interactive mode

# Validate project specs
specpilot validate --verbose
specpilot validate --fix

# List available templates
specpilot list

# Migrate legacy structures (only if you have old .project-spec folder)
# Note: Only use this if you're upgrading from an older SpecPilot version
specpilot migrate --from complex --to simple --backup

# Generate or update specs from a natural language description
specpilot specify "A simple REST API for todos" --update
```

#### When to Use Which Command

- **`specpilot init <name>`** - Starting a brand new project from scratch
- **`specpilot add-specs`** - Adding specifications to an existing codebase
- **`specpilot migrate`** - Upgrading from old .project-spec structure (legacy)
- **`specpilot validate`** - Checking your specs for errors
- **`specpilot specify`** - Generating specs from natural language description

> Tip: Run `specpilot --help` or `specpilot <command> --help` for full options.

## Configuration

### Global Configuration

> **Note**: Global configuration file support (`~/.specpilot-config.yaml`) is not currently implemented. Configuration is done through command-line options and project-level `.specs/project/project.yaml` files.

**Current configuration options via CLI:**

```bash
# Configure via command-line options
specpilot init my-project --lang typescript --framework react --specs-name .specs
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

#### TypeScript / JavaScript

- **Generic**: Basic TypeScript/JavaScript project structure
- **React**: React application with modern tooling
- **Express**: REST API server setup

#### Python

- **Generic**: Basic Python project structure
- **FastAPI**: Modern API development
- **Django**: Web application framework

> **Note**: SpecPilot uses built-in templates that are embedded in the code for reliability and consistency. Run `specpilot list` to see all currently available templates.

### Custom Templates

> **Note**: SpecPilot currently uses built-in templates that are embedded in the code for optimal reliability and consistency. Custom external template support is not currently implemented.

If you need different project structures, you can:

1. Use `specpilot init` to create the base `.specs` structure
2. Manually customize the generated files in `.specs/` to match your needs
3. Use the built-in templates as a starting point and extend them in your project

## Features

- **Flexible Structure**: Generates `.specs` with customizable, production-ready layout
- **Language Support**: Built-in templates for TypeScript, JavaScript, and Python
- **Existing Project Support**: Add `.specs` to existing projects with `add-specs` command
- **Intelligent Analysis**: Auto-detect language/framework, scan TODOs/FIXMEs, analyze tests
- **Spec Validation**: Built-in validation with optional auto-fix
- **AI Integration**: Comprehensive AI onboarding prompt in `.specs/development/prompts.md`
- **Migration Support**: Helps transition from legacy `.project-spec` structures with helpful error messages
- **Template Listing**: Discover available language/framework combinations
- **Developer Attribution**: Prompts for developer name and personalizes generated specs

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

## Configuration examples

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

**When to use migrate:**

- You have an old `.project-spec` folder from a previous SpecPilot version
- You're upgrading between SpecPilot structure versions
- You need to convert between specification formats

**When NOT to use migrate:**

- Starting a new project (use `init` instead)
- Adding specs to existing code (use `add-specs` instead)
- Your project has no specification folder yet

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
3. **Use the AI onboarding prompt**: Open `.specs/development/prompts.md` and copy the comprehensive onboarding prompt to have your AI agent populate all spec files
4. **Customize the specifications** in `.specs/project/project.yaml`
5. **Document your architecture** in `.specs/architecture/architecture.md`
6. **Track all development prompts** in `.specs/development/prompts.md`
7. **Plan your work** in `.specs/planning/tasks.md` and `.specs/planning/roadmap.md`
8. **Define tests** in `.specs/quality/tests.md`
9. **Start building** your production code in `src/`

### Best Practices

- **Start with specifications**: Define what you're building before coding
- **Use the AI onboarding prompt**: Found in `.specs/development/prompts.md` to help AI agents populate your specs with project-specific details
- **Keep prompts updated**: Log all AI interactions in `.specs/development/prompts.md` for complete traceability
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
          node-version: "18"
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

> **Note**: SpecPilot is currently a CLI-first tool. Organizations can wrap SpecPilot with internal tooling and scripts. Use `specpilot list` to explore built-in templates and `specpilot --help` for available commands.

### API Usage

> **Note**: Programmatic API support is not currently available. SpecPilot is designed as a CLI-first tool.

**Use in shell scripts:**

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
