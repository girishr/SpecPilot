---
fileID: ARCH-001
lastUpdated: 2025-10-16
version: 1.1
contributors: [girishr]
relatedFiles: [project.yaml, requirements.md, api.yaml, tasks.md]
---

# System Architecture

## Overview [ARCH-002]

The SpecPilot SDD CLI is a Node.js/TypeScript CLI tool that generates specification-driven development structures for both new and existing projects. It follows a template-based approach with intelligent codebase analysis to create consistent, customizable `.specs/` directories.

## Core Components [ARCH-003]

- **CLI Parser**: Command-line argument processing with Commander.js [ARCH-003.1]
- **Template Engine**: File generation from Handlebars templates [ARCH-003.2]
- **Spec Generator**: Creates .specs folder structure with metadata [ARCH-003.3]
- **Validator**: Spec file validation with cross-reference checking [ARCH-003.4]
- **Migrator**: Version migration and structure updates [ARCH-003.5]
- **Project Detector**: Auto-detects language/framework from existing files [ARCH-003.6]
- **Code Analyzer**: Scans codebase for TODOs, tests, and architecture [ARCH-003.7]

## Design Decisions [ARCH-004]

- **Template Storage**: Built-in templates for consistent generation [ARCH-004.1]
- **Structure Flexibility**: Customizable spec folder names [ARCH-004.2]
- **Language Support**: TypeScript and Python with framework detection [ARCH-004.3]
- **Developer Control**: Guidelines, not prescriptions [ARCH-004.4]
- **Existing Projects**: add-specs command with intelligent analysis [ARCH-004.5]
- **Metadata First**: YAML front-matter for all spec files [ARCH-004.6]
- **Git Mandates**: Explicit prompts required for all git operations [ARCH-004.7]

## Technology Stack [ARCH-005]

- **Runtime**: Node.js [ARCH-005.1]
- **Language**: TypeScript [ARCH-005.2]
- **CLI Framework**: Commander.js [ARCH-005.3]
- **Template Engine**: Handlebars [ARCH-005.4]
- **Package Manager**: NPM [ARCH-005.5]

## Data Flow [ARCH-006]

### Init Command Flow [ARCH-006.1]
1. User runs `specpilot init` with parameters
2. CLI parses arguments and validates project name
3. Checks for existing .specs folder (CS-004)
4. Prompts for framework and developer name (CS-005)
5. Template engine generates subfolder structure
6. Spec files created with YAML metadata and cross-references
7. Validator confirms structure integrity

### Add-Specs Command Flow [ARCH-006.2]
1. User runs `specpilot add-specs` in existing project
2. Project Detector scans for package.json, requirements.txt, etc.
3. Auto-detects language, framework, dependencies
4. Code Analyzer scans for TODOs, tests, components (unless --no-analysis)
5. Prompts for missing information
6. Spec Generator creates .specs with analysis data
7. Reports discovered items (TODOs, tests, components)
