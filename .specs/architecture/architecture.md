---
fileID: ARCH-001
lastUpdated: 2025-10-05
version: 1.0
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, api.yaml, tasks.md]
---

# System Architecture

## Overview [ARCH-002]

The SpecPilot SDD CLI is a Node.js/TypeScript CLI tool that generates specification-driven development structures for projects. It follows a template-based approach to create consistent, customizable `.specs/` directories.

## Core Components [ARCH-003]

- **CLI Parser**: Command-line argument processing [ARCH-003.1]
- **Template Engine**: File generation from templates [ARCH-003.2]
- **Validator**: Spec file validation and linting [ARCH-003.3]
- **Migrator**: Version migration and updates [ARCH-003.4]

## Design Decisions [ARCH-004]

- **Template Storage**: Local templates for offline operation [ARCH-004.1]
- **Structure Flexibility**: Customizable spec folder names [ARCH-004.2]
- **Language Agnostic**: Support for multiple programming languages [ARCH-004.3]
- **Developer Control**: Guidelines, not prescriptions [ARCH-004.4]

## Technology Stack [ARCH-005]

- **Runtime**: Node.js [ARCH-005.1]
- **Language**: TypeScript [ARCH-005.2]
- **CLI Framework**: Commander.js [ARCH-005.3]
- **Template Engine**: Handlebars [ARCH-005.4]
- **Package Manager**: NPM [ARCH-005.5]

## Data Flow [ARCH-006]

1. User runs CLI command with parameters [ARCH-006.1]
2. CLI parses arguments and selects templates [ARCH-006.2]
3. Template engine generates file structure [ARCH-006.3]
4. Validator checks generated specs [ARCH-006.4]
5. Migration system handles version updates [ARCH-006.5]
