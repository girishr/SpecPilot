---
fileID: DOC-001
lastUpdated: 2025-10-05
version: 1.0
contributors: [girishr]
relatedFiles:
  [
    project/project.yaml,
    development/context.md,
    planning/roadmap.md,
    planning/tasks.md,
  ]
---

# Development & Deployment Documentation

## Specification File Conventions [DOC-001.1]

### Metadata Header Format

All specification files in the `.specs/` folder must include a YAML front-matter metadata header at the top of the file. This header provides essential information for tracking, versioning, and cross-referencing.

**Required Fields:**

- `fileID`: Unique identifier for the file (e.g., `REQ-001`, `ARCH-002`, `DOC-003`)
- `lastUpdated`: Date of last modification in YYYY-MM-DD format
- `version`: Semantic version number (e.g., `1.0`, `1.1.1`)
- `contributors`: Array of contributor names (e.g., `[girishr]`)
- `relatedFiles`: Array of related specification files using subfolder paths (e.g., `[project/project.yaml, architecture/architecture.md]`)

**Example:**

```yaml
---
fileID: REQ-001
lastUpdated: 2025-10-05
version: 1.0
contributors: [girishr]
relatedFiles:
  [project/project.yaml, architecture/architecture.md, planning/tasks.md]
---
```

### Stable ID Format for Sections and Items

All major sections and items within specification files must have numbered, stable IDs to enable consistent referencing and tracking.

**ID Format:**

- **File-level IDs**: `[PREFIX-NNN]` where PREFIX is a 3-4 letter code (e.g., `REQ` for requirements, `ARCH` for architecture, `DOC` for documentation)
- **Section-level IDs**: `[PREFIX-NNN.S]` where S is a subsection number (e.g., `REQ-001.1`, `ARCH-002.2`)
- **Item-level IDs**: `[PREFIX-NNN.I]` where I is an item number within a section

**Examples:**

- File ID: `REQ-001` (Requirements file)
- Section ID: `REQ-002` (Functional Requirements section)
- Subsection ID: `REQ-002.1` (Specific requirement item)
- Cross-reference: See [ARCH-003.2] for API details

**Guidelines:**

- IDs must be stable and not change when content is reordered
- Use sequential numbering starting from 001
- Reserve prefixes consistently across the project
- Update IDs only when restructuring major sections

## Development Guidelines [DOC-002]

### Code Standards

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with recommended rules
- **Formatting**: Prettier with consistent style
- **Testing**: Jest for unit and integration tests
- **Documentation**: JSDoc for public APIs

### Development Workflow

1. **MANDATE: Update .specs/ Files**: Before commits, update relevant specification files
2. **MANDATE: Spec-First Development**: All changes start with specification updates
3. **MANDATE: Context Preservation**: Document all important decisions and learnings
4. **MANDATE: Progress Tracking**: Keep tasks.md current with actual development status
5. **Specification First**: Document requirements in `.specs/`
6. **Test-Driven**: Write tests before implementation
7. **Incremental**: Small, focused commits
8. **Review**: Self-review before pushing changes
9. **Documentation**: Update specs as code evolves
10. **MANDATE: Track ALL AI Prompts**: Update `.specs/prompts.md` with every AI interaction, including timestamps and context

### Spec Update Mandate & Enforcement

#### **MANDATE: .specs Folder Updates**

All developers MUST update relevant `.specs/` files before each commit. This is non-negotiable for maintaining specification-driven development integrity.

#### **Pre-Commit Spec Update Checklist**

Before each commit, verify and update:

- [ ] **`tasks.md`**: Move completed tasks, update progress status
- [ ] **`context.md`**: Add lessons learned, important decisions, challenges overcome
- [ ] **`docs.md`**: Update procedures if development processes changed
- [ ] **`prompts.md`**: Log all AI interactions (automated, but verify completeness)
- [ ] **`requirements.md`**: Update if new features or changes affect requirements
- [ ] **`architecture.md`**: Update if code structure or design patterns changed
- [ ] **`api.yaml`**: Update if CLI interface or commands modified
- [ ] **`tests.md`**: Update if testing approach or coverage changed
- [ ] **File Metadata**: Update footer sections (dates, counts, status summaries) in all modified files

#### **Enforcement Mechanisms**

##### **Pre-Commit Hook**

A git hook script enforces spec updates:

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Checking .specs/ folder updates..."

# Check if any .specs files were modified
SPECS_CHANGED=$(git diff --cached --name-only | grep "^\.specs/" | wc -l)

if [ "$SPECS_CHANGED" -eq "0" ]; then
    echo "⚠️  WARNING: No .specs/ files changed in this commit"
    echo "   Consider updating relevant specification files"
    echo "   Press Ctrl+C to abort and update specs, or Enter to continue"
    read -p ""
fi

echo "✅ Pre-commit check complete"
```

##### **Spec Update Template**

Use this template when updating specs:

## Spec Update: [Brief Description]

### Files Updated

- [ ] tasks.md: [What changed]
- [ ] context.md: [Decisions/learnings added]
- [ ] [other files]: [Changes made]

### Context

[Why these updates were needed]

### Impact

[How this affects the project]

#### CI/CD Integration

Future enhancement: Add automated checks in CI pipeline to validate spec completeness.

#### **Violation Consequences**

- Code reviews will check for spec updates
- Incomplete specs may require commit amendments
- Repeated violations may affect contribution permissions

### AI Integration Guidelines

- **Automatic Prompt Logging**: All AI conversations must be logged in `.specs/prompts.md`
- **Complete Context**: Include full prompts, responses, and decision rationale
- **Chronological Order**: Maintain timeline of all development interactions
- **Traceability**: Enable complete audit trail of AI-assisted development

- **main**: Production-ready code
- **develop**: Integration branch
- **feature/\***: Feature development
- **hotfix/\***: Critical bug fixes

### Commit Convention

```text
type(scope): description
Types: feat, fix, docs, style, refactor, test, chore
```

## Deployment Guidelines

### NPM Package

- **Package Name**: `specpilot`
- **Version Strategy**: Semantic versioning
- **Build Process**: TypeScript compilation
- **Distribution**: NPM registry

### Release Process

1. **Version Bump**: Update version in package.json
2. **Changelog**: Document changes
3. **Testing**: Run full test suite
4. **Build**: Create distribution package
5. **Publish**: Deploy to NPM

### Environment Setup

```bash
# Development
npm install
npm run build
npm test

# Global Installation
npm install -g specpilot

# Usage
specpilot my-project --lang typescript
```

## API Documentation

### CLI Commands

- `specpilot [project]`: Initialize new project
- `specpilot --list-templates`: Show available templates
- `specpilot --validate`: Validate project specs
- `specpilot --migrate`: Migrate to newer version

### Configuration

Project configuration stored in `.specs/project.yaml`:

```yaml
project:
  name: "my-project"
  language: "typescript"
  framework: "react"
```

## Troubleshooting

### Common Issues

- **Permission Errors**: Ensure write access to target directory
- **Template Not Found**: Check language/framework support
- **Validation Failures**: Review spec file formatting

### Debug Mode

```bash
DEBUG=specpilot specpilot my-project
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes following guidelines
4. Add tests for new functionality
5. Submit pull request

## Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: This `.specs/docs.md` file
