---
fileID: TASKS-001
lastUpdated: 2025-10-17
version: 1.1
contributors: [girishr]
relatedFiles: [roadmap.md, project.yaml, requirements.md]
---

# Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-###: Completed items

Notes

- IDs are stable; do not change once assigned (even if reordered or moved between sections).
- Reference tasks by ID in commits, prompts, PRs, and discussions.
- When moving an item from Backlog to Current Sprint, retain its original BL ID or create a CS mirror that references the BL ID.

## Backlog

1. [BL-001] Plan v1.1.0 features (additional templates, performance optimizations)
2. [BL-002] Gather user feedback and feature requests
3. [BL-003] Create video tutorials for SDD approach
4. [BL-004] Build community around SpecPilot
5. [BL-005] Monitor NPM download metrics
6. [BL-006] Set up GitHub repository with proper documentation
7. [BL-007] Create issue templates and contribution guidelines
8. [BL-008] Implement automatic enforcement of project mandates (git hooks for spec validation, automatic prompt logging, pre-commit checks)

## Current Sprint

1. [CS-001] Implement complete template system - templates folder is currently empty, preventing project generation
2. [CS-002] Use the templates folder to create the files for the respective spec files that will be generated
3. [CS-003] Limit first release to TypeScript/JavaScript and Python only (removed Go and Java support)
4. [CS-004] Add existing .specs folder detection - prevent creating new project if folder already contains .specs; alert user with project info from existing .specs files (project.yaml, requirements.md)
5. [CS-005] Prompt for developer's name so that wherever "Your Name" appears in spec files, it will be replaced with the developer's name
6. [CS-006] Prompt for a project description (optional) or use the value given by the user for "Describe what you want to build" as the project description in various spec files
7. [CS-007] Create .specs/AI_GUIDE.md to help AI assistants understand the .specs folder structure and usage
8. [CS-008] Add workspace settings (.vscode/settings.json) to configure AI IDEs for .specs context. Prompt the user to select his IDE and then generate the workspace setting based on it. The current IDEs to include are vscode, Cursor, Windsurf and Kiro.
9. [CS-009] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects
10. [CS-010] Support for Javascript

## Completed

1. [CD-001] Define project requirements
2. [CD-002] Design CLI command structure
3. [CD-003] Create initial folder structure
4. [CD-004] Write project README
5. [CD-005] Consolidate development prompts
6. [CD-006] Simplify directory structure
7. [CD-007] Set up TypeScript project structure
8. [CD-008] Implement CLI argument parsing
9. [CD-009] Create basic template generation
10. [CD-010] Add error handling
11. [CD-011] Write unit tests for core functions
12. [CD-012] Implement basic CLI commands
13. [CD-013] Create template system
14. [CD-014] Add validation features
15. [CD-015] Build migration system
16. [CD-016] Write comprehensive tests
17. [CD-017] Create documentation
18. [CD-018] Publish to NPM
19. [CD-019] Add spec update mandate to SpecPilot templates
20. [CD-020] Add metadata update mandate to SpecPilot templates
21. [CD-021] Publish SpecPilot v1.1.0 to NPM
22. [CD-022] Fix CLI list command to display templates correctly
23. [CD-023] Fix issue with command specpilot validate ⚠️ Warnings: • architecture.md missing sections: Overview, Components, Decisions
24. [CD-024] Force user to input a project name
25. [CD-025] Remove Java support from codebase and limit to TypeScript/Python only
26. [CD-026] Optimize .specs structure: introduce subfolders (project/, architecture/, planning/, quality/, development/), add YAML front-matter metadata and cross-references to all generated specs, update validator for new structure and metadata validation, update tests for subfolder structure - CS-008 completed
27. [CD-027] Update all .specs file templates and generator logic so every generated spec file includes: A metadata header (e.g., fileID, lastUpdated, version, contributors, relatedFiles), Numbered, stable IDs for all major sections/items (e.g., REQ-001, ARCH-002, DOC-003.1), Document this convention in .specs/docs.md and validate output - CS-009 completed
28. [CD-028] Create project-plan.md file in .specs folder with project timeline, milestones, and task execution dates - CS-007 completed
29. [CD-029] Add existing .specs folder detection - prevent creating new project if folder already contains .specs; alert user with project info from existing .specs files (project.yaml, requirements.md) - CS-004 completed
30. [CD-030] Prompt for developer's name so that wherever "Your Name" appears in spec files, it will be replaced with the developer's name - CS-005 completed
31. [CD-031] Implement enhanced `add-specs` command with codebase analysis, TODO parsing, architecture extraction, and test strategy generation for existing projects - CS-009 completed
32. [CD-032] Fix generator to use placeholder for application structure in architecture.md output - CS-011 completed
