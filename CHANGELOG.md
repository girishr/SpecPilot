# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-09-21

### Added

- Initial release of SpecPilot SDD CLI
- **Core Commands**:
  - `specpilot <project>` - Initialize new SDD projects
  - `specpilot validate` - Validate specifications and mandates
  - `specpilot migrate` - Migrate from complex to simplified structure
  - `specpilot list` - Show available templates
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

## [1.1.1] - 2025-10-11

### Added

- **CS-009**: Comprehensive metadata conventions and stable ID system
- YAML front-matter metadata headers for all spec files
- Stable ID format for sections and items (REQ-001, ARCH-002, etc.)
- Enhanced spec validation with cross-reference checking
- Complete `.specs/` subfolder structure (project/, architecture/, planning/, quality/, development/)
- Comprehensive documentation in `.specs/development/docs.md`

### Changed

- **README**: Added table of contents, prerequisites, and improved examples
- **Validator**: Updated to handle subfolder structure and validate metadata
- **Templates**: Aligned with current TypeScript/Python support
- **Documentation**: Removed references to unsupported features

### Fixed

- Cross-references now use correct subfolder paths
- Validation properly detects missing files in subfolder structure
- Command examples updated to match actual CLI interface

## [1.1.2] - 2025-10-12

### Added

- **CS-004**: Existing .specs folder detection - Prevents duplicate project initialization with informative error messages
- **CS-005**: Developer name prompting - Prompts for developer name during init and replaces "Your Name" placeholders in generated specs
- **CS-009**: Enhanced `add-specs` command - Adds .specs folder to existing projects with intelligent codebase analysis
- **Project Detector**: Auto-detects language/framework from package.json, requirements.txt, setup.py, pyproject.toml
- **Code Analyzer**: Scans codebase for TODOs/FIXMEs, analyzes tests, extracts architecture information
- **Codebase Analysis**: Automatic TODO/FIXME parsing with line numbers and file locations
- **Test Detection**: Identifies test frameworks (Jest, Pytest, Mocha, etc.) and counts test cases
- **Architecture Extraction**: Analyzes project structure, components, and file types

### Changed

- **Git Mandates**: Added project rules requiring developer prompts for all git commit/push operations
- **Init Command**: Now prompts for developer name and displays existing project info if .specs already exists
- **CLI Commands**: Added `add-specs` command (alias: `add`) with options for --no-analysis and --deep-analysis
- **Project Detection**: Defaults to TypeScript for Node.js projects when language cannot be explicitly determined

### Fixed

- Existing project initialization now provides helpful next steps instead of silently failing
- Developer attribution in generated spec files now uses actual developer name
- Language detection improved for JavaScript/TypeScript projects

### Technical Details

- New utilities: `projectDetector.ts`, `codeAnalyzer.ts`
- New command: `src/commands/add-specs.ts`
- Analysis features: TODO parsing, test framework detection, component extraction
- Smart directory exclusion: node_modules, dist, .git, **pycache**, venv

## [1.1.3] - 2025-10-12

## [Unreleased]

### Planned

- CS-006: Project description prompting and integration
- CS-005: Developer name prompting and replacement
- CS-004: Existing .specs folder detection
- CS-001-003: Complete template system implementation
- Custom template directory support
- Interactive template creation wizard
- Additional language templates (Go, Rust, C#)
- Enhanced validation rules
