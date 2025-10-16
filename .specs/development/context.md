---
fileID: CTX-001
lastUpdated: 2025-10-16
version: 1.1
contributors: [girishr]
relatedFiles: [development/docs.md, planning/roadmap.md, project/project.yaml]
---

# Project Context & Memory

## Current State [CTX-002]

- **Phase**: Active Development (v1.1.2)
- **Status**: Production-ready with continuous enhancements
- **Recent Implementations**: CS-004, CS-005, CS-009 (Existing project support, developer attribution, codebase analysis)
- **Next Steps**: CS-006 (project description), CS-007 (AI Guide), CS-008 (IDE settings), CS-001-003 (template system)

## Key Decisions [CTX-003]

- **Structure**: Subfolder-organized `.specs/` with metadata headers [CTX-003.1]
- **Language**: TypeScript with Node.js runtime [CTX-003.2]
- **Approach**: Specification-driven development with developer freedom [CTX-003.3]
- **Templates**: Built-in templates with intelligent defaults [CTX-003.4]
- **Validation**: Integrated with cross-reference checking [CTX-003.5]
- **Developer Control**: Guidelines work better than prescriptions [CTX-003.6]
- **Existing Projects**: add-specs command with codebase analysis [CTX-003.7]
- **Git Mandates**: Require explicit developer prompts for all git operations [CTX-003.8]

## Established Patterns [CTX-004]

- **File Organization**: Subfolder structure under `.specs/` (project/, architecture/, planning/, quality/, development/) [CTX-004.1]
- **Naming Convention**: Consistent kebab-case for files [CTX-004.2]
- **Documentation**: Markdown with YAML front-matter metadata [CTX-004.3]
- **Version Control**: Git with conventional commits [CTX-004.4]
- **Code Style**: TypeScript strict mode with ESLint [CTX-004.5]
- **Stable IDs**: REQ-###, ARCH-###, TASK-### format for traceability [CTX-004.6]
- **Cross-References**: Relative paths between related spec files [CTX-004.7]

## Known Issues [CTX-005]

- **Template Complexity**: Need to balance flexibility with simplicity [CTX-005.1]
- **Migration Strategy**: Version compatibility across updates [CTX-005.2]
- **Validation Scope**: Determine optimal validation depth [CTX-005.3]
- **Performance**: Ensure fast initialization times [CTX-005.4]

## Lessons Learned [CTX-006]

- **Start Simple**: Complex structures lead to maintenance burden [CTX-006.1]
- **Developer Control**: Guidelines work better than prescriptions [CTX-006.2]
- **AI Integration**: Prompts tracking provides valuable context [CTX-006.3]
- **Iterative Design**: Refine structure based on actual usage [CTX-006.4]
- **Documentation First**: Specs before code improves clarity [CTX-006.5]
- **Existing Projects**: Detecting and analyzing existing codebases provides immediate value [CTX-006.6]
- **Metadata Matters**: YAML front-matter enables powerful validation and cross-referencing [CTX-006.7]
- **TODO Discovery**: Parsing existing TODOs/FIXMEs helps with task prioritization [CTX-006.8]
- **Git Mandates**: Explicit prompts prevent accidental commits and maintain developer control [CTX-006.9]

## Development Insights [CTX-007]

- **Specification-Driven**: Writing specs first clarifies requirements [CTX-007.1]
- **Prompt Tracking**: Complete audit trail improves continuity [CTX-007.2]
- **Structure Evolution**: Start minimal, expand as needed [CTX-007.3]
- **Tool Purpose**: Helper tool, not replacement for developer expertise [CTX-007.4]
- **Production Focus**: Design for serious development workflows [CTX-007.5]
