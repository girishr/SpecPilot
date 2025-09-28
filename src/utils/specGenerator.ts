import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';

export interface SpecGeneratorOptions {
  projectName: string;
  language: string;
  framework?: string;
  targetDir: string;
  specsName: string;
  author?: string;
  description?: string;
}

export class SpecGenerator {
  constructor(private templateEngine: TemplateEngine) {}
  
  async generateSpecs(options: SpecGeneratorOptions): Promise<void> {
    const specsDir = join(options.targetDir, options.specsName);
    
    // Create .specs directory
    mkdirSync(specsDir, { recursive: true });
    
    const context: TemplateContext = {
      projectName: options.projectName,
      language: options.language,
      framework: options.framework,
      author: options.author || 'Your Name',
      description: options.description || `A ${options.language} project${options.framework ? ` using ${options.framework}` : ''}`
    };
    
    // Generate all 8 core spec files
    await this.generateProjectYaml(specsDir, context);
    await this.generateArchitectureMd(specsDir, context);
    await this.generateRequirementsMd(specsDir, context);
    await this.generateApiYaml(specsDir, context);
    await this.generateTestsMd(specsDir, context);
    await this.generateTasksMd(specsDir, context);
    await this.generateContextMd(specsDir, context);
    await this.generatePromptsMd(specsDir, context);
    await this.generateDocsMd(specsDir, context);
    await this.generateSpecUpdateTemplateMd(specsDir, context);
  }
  
  private async generateProjectYaml(specsDir: string, context: TemplateContext): Promise<void> {
    const template = this.templateEngine.getBuiltinTemplate(
      context.language, 
      context.framework, 
      'project.yaml'
    );
    const content = this.templateEngine.renderFromString(template, context);
    writeFileSync(join(specsDir, 'project.yaml'), content);
  }
  
  private async generateArchitectureMd(specsDir: string, context: TemplateContext): Promise<void> {
    const template = this.templateEngine.getBuiltinTemplate(
      context.language, 
      context.framework, 
      'architecture.md'
    );
    const content = this.templateEngine.renderFromString(template, context);
    writeFileSync(join(specsDir, 'architecture.md'), content);
  }
  
  private async generateRequirementsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} Requirements

## Project Overview
{{description}}

## Functional Requirements

### Core Features
1. **Feature 1**: [Describe the primary functionality]
   - User can [specific action]
   - System should [expected behavior]
   - Success criteria: [measurable outcome]

2. **Feature 2**: [Describe secondary functionality]
   - User can [specific action]
   - System should [expected behavior]
   - Success criteria: [measurable outcome]

## Non-Functional Requirements

### Performance
- Response time: < 200ms for API calls
- Throughput: Support [X] concurrent users
- Scalability: Horizontal scaling capability

### Security
- Authentication and authorization
- Data encryption at rest and in transit
- Input validation and sanitization

### Reliability
- 99.9% uptime availability
- Graceful error handling
- Automated backup and recovery

### Usability
- Intuitive user interface
- Responsive design for mobile devices
- Accessibility compliance (WCAG 2.1)

## Technical Requirements

### ${context.language} Specific
${this.getTechnicalRequirements(context.language, context.framework)}

## User Stories

### Epic 1: Core Functionality
- **US-001**: As a [user type], I want to [action] so that [benefit]
  - **AC1**: Given [precondition], when [action], then [expected result]
  - **AC2**: Given [precondition], when [action], then [expected result]

### Epic 2: Additional Features
- **US-002**: As a [user type], I want to [action] so that [benefit]
  - **AC1**: Given [precondition], when [action], then [expected result]

## Acceptance Criteria
All features must:
- Have comprehensive test coverage (>90%)
- Pass security review
- Meet performance benchmarks
- Include proper documentation

## Constraints and Assumptions
- **Budget**: [if applicable]
- **Timeline**: [project deadlines]
- **Technology**: Must use ${context.language}${context.framework ? ` with ${context.framework}` : ''}
- **Compliance**: [regulatory requirements]

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'requirements.md'), rendered);
  }
  
  private getTechnicalRequirements(language: string, framework?: string): string {
    if (language === 'typescript') {
      return `- TypeScript strict mode enabled
- Modern ES2020+ features
- Node.js LTS version
${framework === 'react' ? '- React 18+ with hooks' : ''}
${framework === 'express' ? '- Express.js with middleware' : ''}
- Comprehensive type definitions`;
    }
    
    if (language === 'python') {
      return `- Python 3.9+ compatibility
- Type hints throughout codebase
- Virtual environment management
${framework === 'django' ? '- Django 4.0+ framework' : ''}
${framework === 'fastapi' ? '- FastAPI with async support' : ''}
- PEP 8 code style compliance`;
    }
    
    if (language === 'java') {
      return `- Java 17+ LTS version
- Maven or Gradle build system
${framework === 'spring-boot' ? '- Spring Boot 3.0+' : ''}
- JUnit 5 for testing
- SonarQube code quality`;
    }
    
    return `- ${language} best practices
- Comprehensive testing
- Code quality standards`;
  }
  
  private async generateApiYaml(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} API Specification

openapi: 3.0.3
info:
  title: {{projectName}} API
  description: {{description}}
  version: 1.0.0
  contact:
    name: {{author}}

servers:
  - url: http://localhost:3000/api
    description: Development server
  - url: https://api.{{lowercase projectName}}.com
    description: Production server

paths:
  /health:
    get:
      summary: Health check endpoint
      description: Returns the health status of the API
      responses:
        '200':
          description: API is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "healthy"
                  timestamp:
                    type: string
                    format: date-time

  # Add your API endpoints here
  /users:
    get:
      summary: Get users
      description: Retrieve a list of users
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                type: object
                properties:
                  users:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  total:
                    type: integer

components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        created_at:
          type: string
          format: date-time

    Error:
      type: object
      required:
        - message
        - code
      properties:
        message:
          type: string
        code:
          type: string
        details:
          type: object

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - BearerAuth: []

---
# Data Models and Schemas

## Database Schema (if applicable)

### Users Table
\`\`\`sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

## Message Formats

### Event Schema (if using event-driven architecture)
\`\`\`json
{
  "event_type": "user.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "payload": {
    "user_id": "uuid",
    "email": "user@example.com"
  }
}
\`\`\`

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'api.yaml'), rendered);
  }
  
  private async generateTestsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} Test Strategy

## Overview
This document outlines the testing strategy and approach for {{projectName}}.

## Test Pyramid

### Unit Tests (70%)
- **Scope**: Individual functions, classes, and modules
- **Framework**: ${this.getTestFramework(context.language)}
- **Coverage Target**: >90%
- **Location**: Alongside source code in \`__tests__\` directories

### Integration Tests (20%)
- **Scope**: Component interactions and external dependencies
- **Framework**: ${this.getIntegrationTestFramework(context.language)}
- **Coverage**: Critical user paths and API endpoints
- **Location**: \`tests/integration/\`

### End-to-End Tests (10%)
- **Scope**: Complete user workflows
- **Framework**: ${this.getE2ETestFramework(context.language, context.framework)}
- **Coverage**: Critical business scenarios
- **Location**: \`tests/e2e/\`

## Test Categories

### Functional Testing
- ✅ **Feature tests**: Core functionality works as expected
- ✅ **API tests**: All endpoints return correct responses
- ✅ **Data validation**: Input validation and sanitization
- ✅ **Error handling**: Proper error responses and logging

### Non-Functional Testing
- ✅ **Performance**: Response times and throughput
- ✅ **Security**: Authentication, authorization, and input validation
- ✅ **Load**: System behavior under expected load
- ✅ **Stress**: System behavior under extreme conditions

## Test Data Management
- **Test fixtures**: Predefined data sets for consistent testing
- **Data factories**: Generate test data programmatically
- **Database seeding**: Set up test databases with known state
- **Cleanup**: Ensure tests don't interfere with each other

## Continuous Integration

### Pre-commit Hooks
- Run linting and basic tests
- Ensure code quality standards

### CI Pipeline
1. **Static Analysis**: Code quality and security scanning
2. **Unit Tests**: Fast feedback on individual components
3. **Integration Tests**: Verify component interactions
4. **E2E Tests**: Validate complete user workflows
5. **Performance Tests**: Monitor regression in performance

## Test Environment

### Local Development
- Docker containers for dependencies
- Test database separate from development
- Mock external services

### CI/CD Environment
- Isolated test databases
- Service mocks and stubs
- Parallel test execution

## Acceptance Criteria

All features must have:
- [ ] Unit tests covering happy path and edge cases
- [ ] Integration tests for external dependencies
- [ ] API tests for all endpoints
- [ ] Error scenario tests
- [ ] Performance benchmarks

## Test Automation

### Testing Checklist
- [ ] All tests pass locally before commit
- [ ] CI pipeline passes before merge
- [ ] Code coverage meets threshold
- [ ] Performance tests within acceptable limits
- [ ] Security tests pass

### Monitoring
- Track test execution time
- Monitor flaky test patterns
- Regular review of test coverage
- Performance trend analysis

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tests.md'), rendered);
  }
  
  private getTestFramework(language: string): string {
    const frameworks = {
      typescript: 'Jest with ts-jest',
      python: 'pytest',
      java: 'JUnit 5'
    };
    return frameworks[language as keyof typeof frameworks] || 'Framework specific to language';
  }
  
  private getIntegrationTestFramework(language: string): string {
    const frameworks = {
      typescript: 'Jest with supertest',
      python: 'pytest with requests',
      java: 'Spring Boot Test'
    };
    return frameworks[language as keyof typeof frameworks] || 'Integration testing framework';
  }
  
  private getE2ETestFramework(language: string, framework?: string): string {
    if (framework === 'react' || framework === 'next') return 'Playwright or Cypress';
    if (language === 'python') return 'Selenium with pytest';
    if (language === 'java') return 'Selenium WebDriver';
    return 'Playwright or Selenium';
  }
  
  private async generateTasksMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} Task Management

## Project Status: 🟡 In Progress

## Current Sprint

### In Progress
- [ ] **Setup project foundation**
  - Initialize ${context.language} project structure
  - Configure development environment
  - Set up basic CI/CD pipeline

### Ready for Development  
- [ ] **Implement core features**
  - Define main application logic
  - Set up data models and schemas
  - Create API endpoints (if applicable)

### Blocked
- [ ] **External integrations**
  - Waiting for third-party API access
  - Pending security review approval

## Backlog

### Phase 1: Foundation
- [ ] Project setup and configuration
- [ ] Development environment setup  
- [ ] Basic project structure
- [ ] Initial documentation

### Phase 2: Core Development
- [ ] Implement primary features
- [ ] Database setup and migrations
- [ ] API development
- [ ] User interface (if applicable)

### Phase 3: Testing & Quality
- [ ] Unit test implementation
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Security review

### Phase 4: Deployment
- [ ] Production environment setup
- [ ] Deployment pipeline
- [ ] Monitoring and logging
- [ ] Documentation finalization

## Completed

### ✅ Project Initialization
- [x] Created project specifications
- [x] Set up ${context.language} development environment
- [x] Initial .specs/ structure created
- [x] Basic project configuration

## Notes

### Development Guidelines
- All tasks should be linked to requirements in requirements.md
- Update this file regularly during development
- Use proper branch naming: feature/task-description
- Ensure all tasks have acceptance criteria

### Estimation Guide
- **Small**: 1-2 days
- **Medium**: 3-5 days  
- **Large**: 1-2 weeks
- **Extra Large**: Break into smaller tasks

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'tasks.md'), rendered);
  }
  
  private async generateContextMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} Development Context

## Project Memory

### Key Decisions Made
- **{{currentDate}}**: Initialized project with ${context.language}${context.framework ? ` and ${context.framework}` : ''}
- **{{currentDate}}**: Chose specification-driven development approach
- **{{currentDate}}**: Set up simplified .specs/ structure (8 files)

### Architecture Patterns
- **Primary Pattern**: [To be determined based on requirements]
- **Data Flow**: [To be defined during architecture phase]
- **State Management**: [Framework-specific approach]

### Development Patterns

#### Code Organization
- Follow ${context.language} best practices
- Maintain clear separation of concerns
- Use dependency injection where applicable
- Implement proper error handling

#### Testing Strategy
- Test-driven development (TDD) preferred
- Comprehensive test coverage (>90%)
- Mock external dependencies
- Use factories for test data

## Common Issues and Solutions

### Issue: [Placeholder - will be filled during development]
- **Problem**: [Description of the issue]
- **Solution**: [How it was resolved]
- **Prevention**: [How to avoid in future]

### Issue: Development Environment Setup
- **Problem**: Inconsistent development environments across team
- **Solution**: Use Docker containers and/or detailed setup documentation
- **Prevention**: Automated environment setup scripts

## Lessons Learned

### Development Process
- Start with specifications before coding
- Regular validation of requirements
- Maintain up-to-date documentation
- **MANDATE**: Always update prompts.md with AI interactions

### Technical Learnings
- [To be populated during development]
- Focus on maintainable, readable code
- Proper error handling from the beginning
- Performance considerations early in design
- **MANDATE**: Update .specs/ folder files with every development milestone and code change

## Team Knowledge

### Onboarding Guide
1. Review all .specs/ files
2. Set up local development environment
3. Run existing tests to verify setup
4. Review coding standards and practices
5. Understand deployment process

### Contact Information
- **Project Lead**: {{author}}
- **Technical Lead**: [To be assigned]
- **Product Owner**: [To be assigned]

## External Resources

### Documentation Links
- [Framework documentation]
- [Language-specific resources]
- [Third-party service documentation]

### Tools and Services
- **Version Control**: Git
- **CI/CD**: [To be configured]
- **Monitoring**: [To be set up]
- **Deployment**: [To be configured]

## Change Log

### {{currentDate}}
- Initial project setup with SpecPilot SDD CLI
- Created basic .specs/ structure
- Configured ${context.language} development environment

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'context.md'), rendered);
  }
  
  private async generatePromptsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# Development Prompts Log

## Overview
This file contains ALL AI interactions and development prompts for {{projectName}}, maintaining complete traceability of the development process.

**🚨 MANDATE**: This file MUST be updated with every AI interaction during development.

## Latest Entries

### Project Initialization ({{currentDate}})

#### Prompt: Initial Project Setup
**Prompt**: "Create a new ${context.language} project${context.framework ? ` using ${context.framework}` : ''} with specification-driven development structure"

**Context**: Starting new project with SpecPilot SDD CLI tool

**Response**: 
- Generated complete .specs/ directory structure
- Created 8 core specification files
- Set up ${context.language} project foundation
- Implemented mandate for prompt tracking

**Files Modified**: All .specs/ files created

**Next Actions**: Begin development according to requirements.md

---

## Development Sessions

### Session 1: Project Foundation
**Date**: {{currentDate}}
**Duration**: [To be filled]
**Participants**: {{author}}, AI Assistant

#### Prompts and Responses

1. **Setup Request**
   - **Prompt**: "Initialize {{projectName}} with ${context.language}"
   - **Response**: Created project structure and specifications
   - **Outcome**: Foundation established

#### Decisions Made
- Use specification-driven development approach
- Implement simplified .specs/ structure
- Enforce prompt tracking mandate

#### Issues Encountered
- None during initialization

---

## Template for Future Entries

### Session [N]: [Session Title]
**Date**: [YYYY-MM-DD]
**Duration**: [Time spent]
**Participants**: [Team members, AI interactions]

#### Prompts and Responses

1. **[Prompt Category]**
   - **Prompt**: "[Exact prompt text]"
   - **Context**: "[Why this prompt was needed]"
   - **Response**: "[Summary of AI response]"
   - **Code Generated**: "[File paths and brief description]"
   - **Outcome**: "[Result of the interaction]"

#### Decisions Made
- [List any architectural or design decisions]
- [Include rationale for each decision]

#### Issues Encountered
- [Any problems that came up]
- [Solutions implemented]

#### Files Modified
- [List of files changed]
- [Brief description of changes]

#### Next Steps
- [What needs to be done next]
- [Any follow-up prompts planned]

---

## Prompt Categories

### 🏗️ Architecture & Design
- System design decisions
- Architecture patterns
- Technology choices

### 💻 Implementation
- Code generation requests
- Bug fixes
- Feature implementations

### 🧪 Testing
- Test creation
- Test strategy discussions
- Bug investigations

### 📚 Documentation
- Documentation updates
- API documentation
- User guides

### 🚀 Deployment
- CI/CD setup
- Production deployments
- Infrastructure changes

### 🐛 Debugging
- Problem investigation
- Error resolution
- Performance issues

---

## Usage Guidelines

### For Team Members
1. **Always update when using AI**: No exceptions
2. **Include full context**: Not just the prompt, but why it was needed
3. **Record outcomes**: What was actually implemented or decided
4. **Link to code changes**: Reference specific files and commits
5. **Maintain chronological order**: Latest entries at the top

### For AI Assistants
1. **Remind about this file**: Always mention updating prompts.md
2. **Provide structured responses**: Use the template format
3. **Include relevant context**: Reference previous decisions when applicable
4. **Track dependencies**: Note when prompts relate to previous work

### Quality Standards
- ✅ All AI interactions documented
- ✅ Chronological order maintained
- ✅ Full context provided for each prompt
- ✅ Outcomes and decisions recorded
- ✅ Files and changes referenced

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'prompts.md'), rendered);
  }
  
  private async generateDocsMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# {{projectName}} Development Documentation

## Project Overview
This document provides comprehensive development and deployment guidelines for {{projectName}}.

## Getting Started

### Prerequisites
${this.getPrerequisites(context.language, context.framework)}

### Installation
\`\`\`bash
# Clone the repository
git clone [repository-url]
cd {{projectName}}

# Install dependencies
${this.getInstallCommand(context.language)}

# Set up environment
${this.getEnvironmentSetup(context.language)}
\`\`\`

### Development Workflow

#### 1. Specification Review
- Review .specs/requirements.md for current requirements
- Check .specs/architecture.md for technical decisions
- Understand API contracts in .specs/api.yaml

#### 2. Development Process
1. Create feature branch: \`git checkout -b feature/description\`
2. Update specifications if needed
3. Implement feature following TDD approach
4. Update tests and documentation
5. Submit pull request with specification updates

#### 3. Code Standards
${this.getCodeStandards(context.language)}

#### 4. Testing Requirements
- Unit tests: >90% coverage
- Integration tests for external dependencies
- End-to-end tests for critical paths
- Performance benchmarks for key operations

### 🚨 MANDATORY: AI Interaction Tracking
6. **MANDATE: Track ALL AI Prompts**: Update .specs/prompts.md with every AI interaction, including timestamps and context
   - **Required for all team members**
   - **Include full prompt and response context**
   - **Maintain chronological order**
   - **Link to code changes and decisions**

### Spec Update Mandate & Enforcement

#### **MANDATE: .specs Folder Updates**
All developers MUST update relevant \`.specs/\` files before each commit. This is non-negotiable for maintaining specification-driven development integrity.

#### **Pre-Commit Spec Update Checklist**
Before each commit, verify and update:

- [ ] **\`tasks.md\`**: Move completed tasks, update progress status
- [ ] **\`context.md\`**: Add lessons learned, important decisions, challenges overcome
- [ ] **\`docs.md\`**: Update procedures if development processes changed
- [ ] **\`prompts.md\`**: Log all AI interactions (automated, but verify completeness)
- [ ] **\`requirements.md\`**: Update if new features or changes affect requirements
- [ ] **\`architecture.md\`**: Update if code structure or design patterns changed
- [ ] **\`api.yaml\`**: Update if CLI interface or commands modified
- [ ] **\`tests.md\`**: Update if testing approach or coverage changed
- [ ] **File Metadata**: Update footer sections (dates, counts, status summaries) in all modified files

#### **Enforcement Mechanisms**

##### **Pre-Commit Hook**
A git hook script enforces spec updates:

\`\`\`bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Checking .specs/ folder updates..."

# Check if any .specs files were modified
SPECS_CHANGED=\$(git diff --cached --name-only | grep "^\.specs/" | wc -l)

if [ "\$SPECS_CHANGED" -eq "0" ]; then
    echo "⚠️  WARNING: No .specs/ files changed in this commit"
    echo "   Consider updating relevant specification files"
    echo "   Press Ctrl+C to abort and update specs, or Enter to continue"
    read -p ""
fi

echo "✅ Pre-commit check complete"
\`\`\`

##### **Spec Update Template**
Use this template when updating specs:

\`\`\`markdown
## Spec Update: [Brief Description of Changes]

### Files Updated
- [ ] tasks.md: [What changed]
- [ ] context.md: [Decisions/learnings added]
- [ ] [other files]: [Changes made]

### Context
[Why these updates were needed]

### Impact
[How this affects the project]
\`\`\`

##### **CI/CD Integration**
Future enhancement: Add automated checks in CI pipeline to validate spec completeness.

#### **Violation Consequences**

- Code reviews will check for spec updates
- Incomplete specs may require commit amendments
- Repeated violations may affect contribution permissions

## Project Structure

\`\`\`
${this.getProjectStructure(context.language, context.framework)}
\`\`\`

## Available Scripts

${this.getAvailableScripts(context.language, context.framework)}

## Environment Configuration

### Development
\`\`\`env
NODE_ENV=development
DATABASE_URL=postgresql://localhost/{{lowercase projectName}}_dev
API_KEY=dev-api-key
LOG_LEVEL=debug
\`\`\`

### Production  
\`\`\`env
NODE_ENV=production
DATABASE_URL=${this.getDatabaseUrl(context.language)}
API_KEY=prod-api-key
LOG_LEVEL=info
\`\`\`

## API Documentation

### Base URL
- **Development**: \`http://localhost:3000\`
- **Production**: \`https://api.{{lowercase projectName}}.com\`

### Authentication
${this.getAuthenticationDocs(context.framework)}

### Rate Limiting
- 100 requests per minute per IP
- 1000 requests per hour per authenticated user

## Database

### Migrations
\`\`\`bash
${this.getMigrationCommands(context.language, context.framework)}
\`\`\`

### Backup and Recovery
\`\`\`bash
${this.getBackupCommands(context.language)}
\`\`\`

## Deployment

### CI/CD Pipeline
1. **Code Quality**: Linting, type checking, security scanning
2. **Testing**: Unit, integration, and e2e tests
3. **Build**: Compile and package application
4. **Deploy**: Automated deployment to staging/production

### Production Deployment
\`\`\`bash
# Build for production
${this.getBuildCommand(context.language)}

# Deploy to production
${this.getDeployCommand(context.language)}
\`\`\`

### Monitoring and Logging
- **Application Logs**: Structured JSON logging
- **Error Tracking**: [Error tracking service]
- **Performance Monitoring**: [APM service]
- **Health Checks**: \`/api/health\` endpoint

## Troubleshooting

### Common Issues

#### Development Environment
**Issue**: Dependencies not installing
**Solution**: 
\`\`\`bash
${this.getTroubleshootingCommands(context.language)}
\`\`\`

#### Database Connection
**Issue**: Cannot connect to database
**Solutions**:
- Verify database is running
- Check connection string in environment
- Ensure proper permissions

#### Build Failures
**Issue**: Build process fails
**Solutions**:
- Check for TypeScript/syntax errors
- Verify all dependencies are installed
- Clear build cache and rebuild

## AI Integration Guidelines

### Development with AI Assistants
- **MANDATE: Automatic prompt logging** - Log all AI interactions to .specs/prompts.md
- **MANDATE: Complete context inclusion** - Include full prompt and response
- **MANDATE: Chronological order** - Maintain timeline of all interactions
- **MANDATE: Full traceability** - Link prompts to specific development phases

### Best Practices
1. Provide clear context in prompts
2. Reference existing specifications
3. Ask for code that follows project standards
4. Request tests along with implementation
5. Always update documentation

## Team Collaboration

### Code Reviews
- All changes require peer review
- Focus on specification compliance
- Verify test coverage and quality
- Check for security vulnerabilities

### Communication
- Use project management tool for task tracking
- Update .specs/tasks.md regularly
- Document decisions in .specs/context.md
- Maintain .specs/prompts.md for AI interactions

## Resources

### Documentation
- [${context.language} Documentation](${this.getLanguageDocsUrl(context.language)})
${context.framework ? `- [${context.framework} Documentation](${this.getFrameworkDocsUrl(context.framework)})` : ''}
- [Project API Documentation](./api.yaml)

### Tools
- **IDE**: VSCode with recommended extensions
- **Testing**: ${this.getTestFramework(context.language)}
- **Linting**: ${this.getLintingTools(context.language)}
- **Version Control**: Git with conventional commits

---
*Last updated: {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'docs.md'), rendered);
  }
  
  private async generateSpecUpdateTemplateMd(specsDir: string, context: TemplateContext): Promise<void> {
    const content = `# Spec Update Template

## Spec Update: [Brief Description of Changes]

### Date
[YYYY-MM-DD]

### Files Updated
- [ ] \`tasks.md\`: [What changed - e.g., moved completed tasks, updated progress]
- [ ] \`context.md\`: [Decisions/learnings added - e.g., lessons from implementation]
- [ ] \`docs.md\`: [Procedure updates - e.g., new development workflow steps]
- [ ] \`prompts.md\`: [AI interactions logged - e.g., architecture discussions]
- [ ] \`requirements.md\`: [New/changed requirements - e.g., added feature specs]
- [ ] \`architecture.md\`: [Design changes - e.g., new component structure]
- [ ] \`api.yaml\`: [Interface changes - e.g., new CLI commands]
- [ ] \`tests.md\`: [Testing updates - e.g., new test coverage requirements]
- [ ] \`project.yaml\`: [Project config changes - e.g., new rules added]

### Context
[Why these updates were needed - e.g., new feature implementation, bug fix, architecture change]

### Impact
[How this affects the project - e.g., improves maintainability, adds functionality, fixes issues]

### Related Commits
- [Commit hash or description if applicable]

### Next Steps
[Any follow-up actions needed based on these spec updates]

---
*Generated by SpecPilot on {{currentDate}}*`;
    
    const rendered = this.templateEngine.renderFromString(content, context);
    writeFileSync(join(specsDir, 'spec-update-template.md'), rendered);
  }
  
  private getPrerequisites(language: string, framework?: string): string {
    if (language === 'typescript') {
      return `- Node.js 18+ LTS
- npm or yarn package manager
- Git for version control
${framework === 'react' ? '- Modern web browser for development' : ''}`;
    }
    
    if (language === 'python') {
      return `- Python 3.9+
- pip package manager
- Virtual environment (venv or conda)
- Git for version control`;
    }
    
    if (language === 'java') {
      return `- Java 17+ JDK
- Maven 3.8+ or Gradle 7+
- Git for version control
- IDE (IntelliJ IDEA or Eclipse recommended)`;
    }
    
    return `- ${language} development environment
- Package manager
- Git for version control`;
  }
  
  private getInstallCommand(language: string): string {
    if (language === 'typescript') return 'npm install';
    if (language === 'python') return 'pip install -r requirements.txt';
    if (language === 'java') return 'mvn install';
    return '# Install dependencies';
  }
  
  private getEnvironmentSetup(language: string): string {
    if (language === 'typescript') return 'cp .env.example .env';
    if (language === 'python') return 'python -m venv venv && source venv/bin/activate';
    if (language === 'java') return '# Set JAVA_HOME if needed';
    return '# Set up environment variables';
  }
  
  private getCodeStandards(language: string): string {
    if (language === 'typescript') {
      return `- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Prefer functional programming patterns
- Comprehensive JSDoc comments`;
    }
    
    if (language === 'python') {
      return `- Follow PEP 8 style guide
- Use type hints throughout
- Docstrings for all functions/classes
- Use Black for code formatting
- Maximum line length: 88 characters`;
    }
    
    if (language === 'java') {
      return `- Follow Google Java Style Guide
- Use Checkstyle for enforcement
- Comprehensive Javadoc comments
- Prefer composition over inheritance
- Use modern Java features (17+)`;
    }
    
    return `- Follow ${language} best practices
- Consistent code formatting
- Comprehensive documentation`;
  }
  
  private getProjectStructure(language: string, framework?: string): string {
    if (language === 'typescript' && framework === 'react') {
      return `├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   ├── utils/
│   └── types/
├── public/
├── tests/
└── .specs/`;
    }
    
    if (language === 'typescript' && framework === 'express') {
      return `├── src/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── utils/
├── tests/
└── .specs/`;
    }
    
    return `├── src/
│   ├── [source files]
├── tests/
└── .specs/`;
  }
  
  private getAvailableScripts(language: string, framework?: string): string {
    if (language === 'typescript') {
      return `\`\`\`bash
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run test suite
npm run lint       # Run linting
npm run type-check # TypeScript type checking
\`\`\``;
    }
    
    return `\`\`\`bash
# Add project-specific scripts here
\`\`\``;
  }
  
  private getDatabaseUrl(language: string): string {
    return 'postgresql://user:pass@host/db';
  }
  
  private getAuthenticationDocs(framework?: string): string {
    return `Bearer token authentication required for protected endpoints.
Include in header: \`Authorization: Bearer <token>\``;
  }
  
  private getMigrationCommands(language: string, framework?: string): string {
    return `# Run migrations
# Add database migration commands here`;
  }
  
  private getBackupCommands(language: string): string {
    return `# Create backup
# Add backup commands here`;
  }
  
  private getBuildCommand(language: string): string {
    if (language === 'typescript') return 'npm run build';
    if (language === 'python') return 'python -m build';
    if (language === 'java') return 'mvn package';
    return '# Build command';
  }
  
  private getDeployCommand(language: string): string {
    return '# Deploy command - configure based on deployment target';
  }
  
  private getTroubleshootingCommands(language: string): string {
    if (language === 'typescript') {
      return `rm -rf node_modules package-lock.json
npm install`;
    }
    return '# Troubleshooting commands';
  }
  
  private getLanguageDocsUrl(language: string): string {
    const urls = {
      typescript: 'https://www.typescriptlang.org/docs/',
      python: 'https://docs.python.org/',
      java: 'https://docs.oracle.com/en/java/'
    };
    return urls[language as keyof typeof urls] || '#';
  }
  
  private getFrameworkDocsUrl(framework?: string): string {
    const urls: Record<string, string> = {
      react: 'https://react.dev/',
      express: 'https://expressjs.com/',
      django: 'https://docs.djangoproject.com/',
      fastapi: 'https://fastapi.tiangolo.com/',
      'spring-boot': 'https://spring.io/projects/spring-boot'
    };
    return urls[framework || ''] || '#';
  }
  
  private getLintingTools(language: string): string {
    if (language === 'typescript') return 'ESLint + Prettier';
    if (language === 'python') return 'flake8 + black';
    if (language === 'java') return 'Checkstyle + SpotBugs';
    return 'Language-specific linting tools';
  }
}