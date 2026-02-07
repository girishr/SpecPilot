# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-02-07

### Added

- **IDE Workspace Settings Generation** (CS-008): Complete support for 5 AI-first code editors
  - VSCode configuration with Copilot integration settings
  - Cursor IDE settings with cursor-specific AI context configuration
  - Windsurf IDE workspace settings with windsurf-specific AI features
  - Kiro IDE configuration with kiro-specific context awareness
  - Antigravity IDE settings with antigravity-specific AI integration
  - IDE selection prompt during project initialization
  - Automatic generation of IDE-specific workspace folders for code and .specs
  - IDE-specific `extensions.json` with workspace recommendations
  - Workspace folder configuration for seamless .specs integration in AI context

### Changed

- Enhanced project initialization to prompt user for preferred AI IDE
- Improved spec generator with IDE-specific configuration routing

## [1.3.0] - 2025-11-07

### Added

- **Gemini-Style Graphical CLI Interface**: Complete visual overhaul with ASCII art logos
  - Added `blessed` dependency for advanced terminal UI capabilities
  - Implemented comprehensive logo display system in `logger.ts`
  - Added ASCII art SpecPilot logo with vertical layout for professional presentation
  - Integrated logos across all CLI commands (init, validate, list, migrate, specify, add-specs)
  - Strategic logo placement before prompts and results for enhanced user experience

### Changed

- **CLI User Experience**: Upgraded from basic text output to branded, graphical interface
  - All commands now display SpecPilot logo before key interactions
  - Improved visual consistency across the entire CLI application
  - Enhanced professional appearance similar to Gemini Code interface

### Fixed

- **Package.json Formatting**: Added missing newline at end of file for proper formatting

## [1.2.2] - 2025-10-27

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

### Added

- **CS-010**: JavaScript language support - Added JavaScript templates and detection for Node.js projects
- **AI Onboarding**: Added AI onboarding prompt to prompts.md for new projects
- **CS-011**: Enhanced folder structure display - Architecture.md now shows nested directory trees instead of flat lists

### Changed

- **Project Detection**: Improved language detection to distinguish between TypeScript and JavaScript projects
- **Template Engine**: Added JavaScript-specific templates alongside existing TypeScript templates

### Fixed

- **Architecture Display**: Folder structures now display as proper nested trees with indentation
- **Language Support**: JavaScript projects are now properly detected and templated

## [Unreleased]

### Planned

- CS-008: Add workspace settings (.vscode/settings.json) to configure AI IDEs for .specs context
- CS-006: Project description prompting and integration
- Custom template directory support
- Interactive template creation wizard
- Additional language templates (Go, Rust, C#)
- Enhanced validation rules

## [1.2.2] - 2025-10-27

### Fixed

- **Specify Command**: Fixed file path references to use correct subfolder structure
  - Updated project.yaml path from `.specs/project.yaml` to `.specs/project/project.yaml`
  - Updated requirements.md path to `.specs/project/requirements.md`
  - Updated context.md path to `.specs/development/context.md`
  - Updated prompts.md path to `.specs/development/prompts.md`
  - Resolves "project.yaml not found" error when running specify in valid projects
- **CS-012**: Enhanced migrate command with better error messages and guidance
  - Added migration necessity detection to prevent confusion
  - Provides helpful suggestions when migrate is used incorrectly
  - Detects when target structure already exists
  - Clear documentation on when to use init vs add-specs vs migrate

### Changed

- **Documentation**: Updated CHANGELOG.md with missing version entries (1.2.1, 1.2.0, 1.1.4)
- **README**: Fixed unclosed code block causing rendering issues in documentation

## [1.2.1] - 2025-10-26

### Added

- **AI Onboarding Enhancement**: Comprehensive AI onboarding prompt in generated `.specs/prompts.md`
- **Project Documentation**: Added `.specs/README.md` with detailed onboarding guidance for AI assistants
- **Enhanced CLI Messages**: Improved success messages with detailed next steps and project information

### Changed

- **Onboarding Experience**: CLI now provides comprehensive guidance for new users and AI assistants
- **Documentation**: Enhanced project specs with operational mandates and AI interaction guidelines

### Fixed

- **README.md Rendering**: Fixed unclosed code block causing rendering issues in documentation

## [1.2.0] - 2025-10-26

### Added

- **AI Onboarding Prompt**: Standardized AI onboarding prompt added to all generated `.specs/prompts.md` files
- **Enhanced Project Guidance**: Improved CLI success messages with detailed next steps for specification-driven development

### Changed

- **Onboarding Process**: Streamlined first-time user experience with comprehensive AI assistant guidance
- **Documentation Standards**: Updated all generated specs to include AI interaction best practices

## [1.1.4] - 2025-10-25

### Added

- **Project Onboarding Documentation**: Added `.specs/README.md` with comprehensive AI prompt guidance
- **Enhanced AI Integration**: Improved prompts.md with standardized onboarding content for AI assistants

### Changed

- **CLI Success Messages**: Enhanced with detailed next steps and project structure guidance
- **Documentation**: Improved AI assistant integration documentation

## [1.1.3] - 2025-10-12
