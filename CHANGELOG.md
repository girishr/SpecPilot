# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-09-21

### Added

- Initial release of SpecPilot SDD CLI
- **Core Commands**:
  - `sdd-init <project>` - Initialize new SDD projects
  - `sdd-init validate` - Validate specifications and mandates
  - `sdd-init migrate` - Migrate from complex to simplified structure
  - `sdd-init list` - Show available templates
- **Template System**:

  - TypeScript templates (Generic, React, Express, Next.js, CLI)
  - Python templates (Generic, FastAPI, Django, Data Science)
  - Java templates (Generic, Spring Boot)
  - Framework-specific content generation

- **Specification Files Generation**:

  - Simplified 8-file `.specs/` structure
  - `project.yaml` - Configuration + rules + AI context
  - `architecture.md` - Architecture decisions + patterns
  - `requirements.md` - Functional/non-functional requirements
  - `api.yaml` - OpenAPI specifications
  - `tests.md` - Test strategy + coverage plans
  - `tasks.md` - Task tracking (backlog/sprint/completed)
  - `context.md` - Development memory + learnings
  - `prompts.md` - **MANDATED** AI interaction tracking
  - `docs.md` - Development guidelines + deployment

- **Key Features**:
  - Automatic prompt tracking mandate enforcement
  - Migration from complex to simplified structures
  - Validation with auto-fix capabilities
  - Comprehensive template system
  - Production-ready project initialization

### Technical Details

- Built with TypeScript and Node.js
- Uses Commander.js for CLI functionality
- Handlebars for templating
- Comprehensive test suite with Jest
- NPM-ready packaging

### Breaking Changes

- None (initial release)

## [Unreleased]

### Planned

- Additional language templates (Go, Rust, C#)
- Custom template directory support
- Interactive template creation wizard
- CI/CD integration templates
- Enhanced validation rules
