# Development & Deployment Documentation

## Development Guidelines

### Code Standards

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with recommended rules
- **Formatting**: Prettier with consistent style
- **Testing**: Jest for unit and integration tests
- **Documentation**: JSDoc for public APIs

### Development Workflow

1. **Specification First**: Document requirements in `.specs/`
2. **Test-Driven**: Write tests before implementation
3. **Incremental**: Small, focused commits
4. **Review**: Self-review before pushing changes
5. **Documentation**: Update specs as code evolves
6. **MANDATE: Track ALL AI Prompts**: Update `.specs/prompts.md` with every AI interaction, including timestamps and context

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
