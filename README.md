# SpecPilot SDD CLI

A CLI tool for initializing specification-driven development projects with flexible, production-ready structures.

## Quick Start

```bash
# Install globally
npm install -g specpilot

# Initialize your first project
specpilot my-project --lang typescript --framework react

# Start coding with full control
cd my-project
# Your .specs/ folder is ready with guidelines, not prescriptions
```

## Description

`SpecPilot SDD CLI` is designed to give developers the freedom to decide and control their projects, not prescribe the entire implementation. My goal with this project is to provide a helping tool that offers basic guidelines for serious developers writing production code for critical development tasks who need better control over their project, its architecture, and its structure.

The tool generates customizable `.specs` directories that serve as flexible frameworks for specification-driven development, integrating seamlessly with AI-assisted coding workflows. It provides structure and guidance without dictating implementation, allowing you to maintain full ownership of your production code while establishing robust foundations for scalable, maintainable projects.

### Key Principles

- **Developer Freedom**: You control the architecture and implementation decisions
- **Production Focus**: Built for serious development tasks and enterprise-grade projects
- **AI Integration**: Includes dedicated `.specs/prompts/` folder to track all development prompts throughout your coding cycle
- **Flexible Structure**: Customizable specifications that adapt to your workflow

## Installation

```bash
npm install -g specpilot
```

## Usage Examples

### Basic Project Initialization

```bash
# Initialize with default settings (.specs folder)
specpilot my-project

# Specify language and framework
specpilot my-project --lang typescript --framework react
specpilot my-project --lang python --framework django
specpilot my-project --lang java --framework spring

# Use custom spec directory name
specpilot my-project --spec-dir .project-specs
specpilot my-project --spec-dir docs/specifications

# Interactive mode (guided setup)
specpilot --interactive
```

### Advanced Usage

```bash
# Initialize with specific template
specpilot my-api --lang typescript --framework express --template rest-api

# Initialize for team collaboration
specpilot team-project --lang python --framework fastapi --collaboration

# Initialize with custom author and license
specpilot my-lib --lang typescript --author "Your Name" --license MIT
```

### Validation and Management

```bash
# Validate project specs
specpilot --validate

# Validate with strict rules and auto-fix
specpilot --validate --strict --fix

# Check for migration needs
specpilot --migrate

# Show migration history
specpilot --migrate --show-history

# List available templates
specpilot --list-templates

# Show template details
specpilot --template-info typescript-react
```

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

After initialization, customize `.specs/project.yaml`:

```yaml
project:
  name: "my-project"
  description: "My awesome project"
  language: "typescript"
  framework: "react"
  version: "1.0.0"

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
- **Library**: NPM package development
- **CLI**: Command-line tool development

#### Python

- **Generic**: Basic Python project structure
- **FastAPI**: Modern API development
- **Django**: Web application framework
- **Data Science**: Jupyter, pandas, scikit-learn setup
- **CLI**: Python command-line tools

#### Java

- **Generic**: Maven/Gradle project structure
- **Spring Boot**: Microservices development
- **Android**: Mobile app development

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

- **Flexible Structure**: Generates `.specs` directories with customizable layouts
- **Language Support**: Templates for TypeScript, Python, Java, and more
- **Spec Validation**: Built-in validation with auto-fix capabilities
- **AI Integration**: Dedicated prompts tracking for development cycles
- **GitHub Ready**: Structures optimized for version control and collaboration
- **Migration Support**: Handles structure updates across versions
- **Custom Templates**: Support for organization-specific templates
- **Team Collaboration**: Built-in support for team development workflows

## Project Structure

After initialization, your project will have:

```text
project-root/
├── .specs/                    # Specification-driven structure
│   ├── config/               # Project configuration
│   ├── architecture/         # System design docs
│   ├── requirements/         # Feature and user story specs
│   ├── api/                  # API specifications
│   ├── tests/                # Test plans and criteria
│   ├── tasks/                # Task tracking
│   ├── prompts/              # AI development prompts
│   └── docs/                 # Development guidelines
├── src/                      # Your source code
└── README.md                 # This file
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
```bash
# List available templates
specpilot --list-templates

# Update templates
specpilot --update-templates
````

#### Validation Failures

```bash
# Run with detailed error output
specpilot --validate --verbose

# Auto-fix common issues
specpilot --validate --fix
```

#### Migration Issues

````bash
```bash
# Check current version
specpilot --version

# Force migration
specpilot --migrate --force

# Rollback migration
specpilot --migrate --rollback
````

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
```

## Getting Started

1. **Initialize your project**: `specpilot my-project --lang typescript`
2. **Review the generated `.specs` structure** - This provides your flexible framework
3. **Customize the specifications** in `.specs/project.yaml` according to your needs
4. **Document your architecture** in `.specs/architecture.md` (you control the design)
5. **Track all development prompts** in `.specs/prompts.md` throughout your coding cycle
6. **Define your requirements** in `.specs/requirements.md` and `.specs/tests.md`
7. **Start building** your production code in `src/` with full control over implementation

### Best Practices

- **Start with specifications**: Define what you're building before coding
- **Keep prompts updated**: Log all AI interactions for future reference
- **Validate regularly**: Use `specpilot --validate` during development
- **Customize templates**: Adapt the structure to your team's needs
- **Version control everything**: Include `.specs/` in your git repository

## How to Contribute

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository** and create a feature branch
2. **Follow the existing code style** and add tests for new features
3. **Update documentation** for any new functionality
4. **Submit a pull request** with a clear description of changes

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/specpilot/specpilot.git
cd specpilot

# Install dependencies
npm install

# Run in development mode
npm run dev -- my-test-project --lang typescript

# Run tests
npm test

# Build for production
npm run build
```

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

```bash
# Use corporate templates
specforge --template-repo https://internal.company.com/templates

# Apply company policies
specforge --apply-policies company-standards

# Generate compliance reports
specforge --compliance-report --output report.json
```

### API Usage

```javascript
// Use SpecPilot SDD CLI programmatically
const { initProject, validateSpecs } = require("specpilot");

// Initialize project
await initProject({
  name: "my-project",
  language: "typescript",
  framework: "react",
  specDir: ".specs",
});

// Validate specifications
const result = await validateSpecs("./my-project");
if (!result.valid) {
  console.error("Validation errors:", result.errors);
}
```

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
