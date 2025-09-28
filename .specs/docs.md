# Development & Deployment Documentation

## Development Guidelines

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

```markdown
## Spec Update: [Brief Description]

### Files Updated

- [ ] tasks.md: [What changed]
- [ ] context.md: [Decisions/learnings added]
- [ ] [other files]: [Changes made]

### Context

[Why these updates were needed]

### Impact

[How this affects the project]
```

##### **CI/CD Integration**

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
