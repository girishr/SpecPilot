import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import * as yaml from 'js-yaml';

export interface ValidationOptions {
  fix: boolean;
  verbose: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fixable: string[];
  fixPrompts: Array<{ issue: string; prompt: string }>;
  filesChecked: number;
  mandatesVerified: number;
}

export class SpecValidator {
  private requiredFiles = [
    'project/project.yaml',
    'architecture/architecture.md',
    'project/requirements.md',
    'architecture/api.yaml',
    'quality/tests.md',
    'planning/tasks.md',
    'development/context.md',
    'development/prompts.md',
    'development/docs.md',
    'security/threat-model.md',
    'security/security-decisions.md'
  ];

  async validate(projectDir: string, options: ValidationOptions): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fixable: [],
      fixPrompts: [],
      filesChecked: 0,
      mandatesVerified: 0
    };

    // Find .specs directory
    const specsDir = this.findSpecsDir(projectDir);
    if (!specsDir) {
      result.errors.push('No .specs directory found in project');
      result.isValid = false;
      return result;
    }

    // Validate required files exist
    for (const file of this.requiredFiles) {
      const filePath = join(specsDir, file);
      if (!existsSync(filePath)) {
        result.errors.push(`Missing required file: ${file}`);
        result.fixable.push(`create-${file}`);
        result.isValid = false;

        // For security files, also emit a fill-in prompt so the user knows what goes in each section
        if (file === 'security/threat-model.md') {
          result.fixPrompts.push({
            issue: 'security/threat-model.md is missing',
            prompt:
              'Run `specpilot validate --fix` first to create `.specs/security/threat-model.md` with the starter template.\n' +
              'Then open the file and ask your AI assistant:\n' +
              '  "Read `.specs/security/threat-model.md`. For each [TODO] placeholder:\n' +
              '   • SEC-001.1 Overview — describe what this system does, what it reads/writes, and what it does NOT do.\n' +
              '   • SEC-002 Threats — identify real threats: injection, path traversal, supply-chain, auth bypass, etc.\n' +
              '   • SEC-003 Attack Surface — list all external entry points (CLI args, env vars, file paths, stdin).\n' +
              '   • SEC-004 Out of Scope — call out what is explicitly out of scope (OS-level, container isolation, etc.).\n' +
              '   Base answers on `project/project.yaml`, `architecture/architecture.md`, and the actual source code.\n' +
              '   Preserve YAML front-matter and section structure exactly."'
          });
        } else if (file === 'security/security-decisions.md') {
          result.fixPrompts.push({
            issue: 'security/security-decisions.md is missing',
            prompt:
              'Run `specpilot validate --fix` first to create `.specs/security/security-decisions.md` with the starter template.\n' +
              'Then open the file and ask your AI assistant:\n' +
              '  "Read `.specs/security/security-decisions.md` and `.specs/security/threat-model.md`.\n' +
              '   For each ADR entry, fill in the [TODO] placeholders with real decisions:\n' +
              '   • What security decision was made (e.g. input validation strategy, auth mechanism, dependency policy)?\n' +
              '   • Why this approach over alternatives?\n' +
              '   • What are the trade-offs?\n' +
              '   • Which threat from threat-model.md does this address?\n' +
              '   Base answers on the actual implementation in src/. Preserve structure and front-matter exactly."'
          });
        }
      } else {
        result.filesChecked++;
      }
    }

  // Validate project.yaml structure
  await this.validateProjectYaml(specsDir, result);

    // Validate mandate compliance
    await this.validateMandates(specsDir, result);

    // Validate file content quality
    await this.validateContentQuality(specsDir, result, options.verbose);

  // Validate metadata and cross references
  await this.validateMetadataAndCrossRefs(specsDir, result);

    // Warn if any .md spec files have a stale lastUpdated date (> 90 days)
    await this.validateStaleDates(specsDir, result);

    // Warn if prompts.md or tasks.md Completed section exceed line limits
    await this.validateLineLimits(specsDir, result);

    return result;
  }

  async autoFix(projectDir: string, fixable: string[]): Promise<string[]> {
    const fixed: string[] = [];
    const specsDir = this.findSpecsDir(projectDir);
    
    if (!specsDir) {
      return fixed;
    }

    for (const fix of fixable) {
      try {
        if (fix.startsWith('create-')) {
          const fileName = fix.replace('create-', '');
          await this.createMissingFile(specsDir, fileName);
          fixed.push(fix);
        } else if (fix === 'add-mandates') {
          await this.addMandatesToProjectYaml(specsDir);
          fixed.push(fix);
        } else if (fix === 'create-prompts-entry') {
          await this.createInitialPromptsEntry(specsDir);
          fixed.push(fix);
        }
      } catch {
        // Skip fixes that fail
        continue;
      }
    }

    return fixed;
  }

  private findSpecsDir(projectDir: string): string | null {
    const candidates = ['.specs', '.project-spec', 'specs', 'specifications'];
    
    for (const candidate of candidates) {
      const fullPath = join(projectDir, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }

  private async validateProjectYaml(specsDir: string, result: ValidationResult): Promise<void> {
    const projectYamlPath = join(specsDir, 'project', 'project.yaml');
    
    if (!existsSync(projectYamlPath)) {
      return; // Already handled by file existence check
    }

    try {
      const content = readFileSync(projectYamlPath, 'utf-8');
      const projectData = yaml.load(content) as any;

      if (!projectData) {
        result.errors.push('project.yaml is empty or invalid');
        result.isValid = false;
        return;
      }

      // Check required fields
  const requiredFields = ['name', 'version', 'language'];
      for (const field of requiredFields) {
        if (!projectData[field]) {
          result.errors.push(`project.yaml missing required field: ${field}`);
          result.isValid = false;
        }
      }

      // Check for rules section
      const flatRules = this.flattenRules(projectData.rules);
      if (!projectData.rules || flatRules.length === 0) {
        result.warnings.push('project.yaml should have a rules section');
      }

      // Validate mandates exist
      const hasMandates = this.checkMandatesInRules(flatRules);
      if (!hasMandates.hasPromptMandate) {
        result.errors.push('Missing MANDATE for prompt tracking in project.yaml rules');
        result.fixPrompts.push({
          issue: 'Missing MANDATE for prompt tracking in project.yaml rules',
          prompt:
            'In `.specs/project/project.yaml`, ensure the `rules.process` section contains a mandate for tracking AI prompts. Add this to the process array:\n' +
            '  "MANDATE: Track ALL AI interactions — update .specs/development/prompts.md with every AI prompt, including timestamps and context."\n' +
            'Preserve the existing YAML structure, comments, and formatting exactly.'
        });
        result.isValid = false;
      } else {
        result.mandatesVerified++;
      }

    } catch (error) {
      result.errors.push(`Failed to parse project.yaml: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }
  }

  private flattenRules(rules: unknown): string[] {
    if (!rules) return [];
    if (Array.isArray(rules)) return rules as string[];
    if (typeof rules === 'object') {
      return Object.values(rules as Record<string, unknown>)
        .flatMap(v => Array.isArray(v) ? v as string[] : []);
    }
    return [];
  }

  private checkMandatesInRules(rules: string[]): { hasPromptMandate: boolean } {
    return {
      hasPromptMandate: rules.some(rule =>
        /mandate/i.test(rule) && /prompts/i.test(rule)
      )
    };
  }

  private async validateMandates(specsDir: string, result: ValidationResult): Promise<void> {
    // Check if prompts.md exists and has content
    const promptsPath = join(specsDir, 'development', 'prompts.md');
    
    if (!existsSync(promptsPath)) {
      result.errors.push('prompts.md is missing - this violates prompt tracking mandate');
      result.isValid = false;
      return;
    }

    try {
      const content = readFileSync(promptsPath, 'utf-8');
      
      if (content.trim().length < 100) {
        result.warnings.push('prompts.md appears to have minimal content - ensure AI interactions are being tracked');
      }

      // Check for recent updates (basic heuristic)
      if (!content.includes(new Date().getFullYear().toString())) {
        result.warnings.push('prompts.md may not be up to date - ensure recent AI interactions are documented');
      }

      // Check for mandate compliance indicators
      if (content.includes('MANDATE') && content.includes('AI interaction')) {
        result.mandatesVerified++;
      }

    } catch (error) {
      result.errors.push(`Failed to read prompts.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }
  }

  private async validateContentQuality(specsDir: string, result: ValidationResult, verbose: boolean): Promise<void> {
    // Check architecture.md has key sections
    await this.validateArchitectureContent(specsDir, result, verbose);
    
    // Check requirements.md completeness
    await this.validateRequirementsContent(specsDir, result, verbose);
    
    // Check tasks.md is being maintained
    await this.validateTasksContent(specsDir, result, verbose);
  }

  private async validateArchitectureContent(specsDir: string, result: ValidationResult, verbose: boolean): Promise<void> {
  const archPath = join(specsDir, 'architecture', 'architecture.md');
    
    if (!existsSync(archPath)) return;

    try {
      const content = readFileSync(archPath, 'utf-8');
      
      const requiredSections = ['Overview', 'Architecture', 'Components', 'Decisions'];
      const missingSections = requiredSections.filter(section => 
        !content.toLowerCase().includes(section.toLowerCase())
      );

      if (missingSections.length > 0) {
        result.warnings.push(`architecture.md missing sections: ${missingSections.join(', ')}`);
      }

    } catch (error) {
      if (verbose) {
        result.warnings.push(`Could not validate architecture.md content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async validateRequirementsContent(specsDir: string, result: ValidationResult, verbose: boolean): Promise<void> {
  const reqPath = join(specsDir, 'project', 'requirements.md');
    
    if (!existsSync(reqPath)) return;

    try {
      const content = readFileSync(reqPath, 'utf-8');
      
      if (content.includes('[Placeholder') || content.includes('[To be')) {
        result.warnings.push('requirements.md contains placeholder text that should be updated');
      }

      if (!content.includes('User Stories') && !content.includes('Functional Requirements')) {
        result.warnings.push('requirements.md should include user stories or functional requirements');
      }

    } catch (error) {
      if (verbose) {
        result.warnings.push(`Could not validate requirements.md content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async validateTasksContent(specsDir: string, result: ValidationResult, verbose: boolean): Promise<void> {
  const tasksPath = join(specsDir, 'planning', 'tasks.md');
    
    if (!existsSync(tasksPath)) return;

    try {
      const content = readFileSync(tasksPath, 'utf-8');
      
      // Check if tasks are being tracked
      const hasInProgress = content.includes('In Progress') || content.includes('in-progress');
      const hasCompleted = content.includes('Completed') || content.includes('completed');
      
      if (!hasInProgress && !hasCompleted) {
        result.warnings.push('tasks.md should track task status (In Progress, Completed, etc.)');
      }

    } catch (error) {
      if (verbose) {
        result.warnings.push(`Could not validate tasks.md content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async createMissingFile(specsDir: string, fileName: string): Promise<void> {
    const filePath = join(specsDir, fileName);
    let content: string;

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    switch (fileName) {
      case 'project/project.yaml':
        content = this.getDefaultProjectYaml();
        break;
      case 'development/prompts.md':
        content = this.getDefaultPromptsContent();
        break;
      case 'architecture/architecture.md':
        content = this.getDefaultArchitecture();
        break;
      case 'project/requirements.md':
        content = this.getDefaultRequirements();
        break;
      case 'security/threat-model.md':
        content = this.getDefaultThreatModelMd();
        break;
      case 'security/security-decisions.md':
        content = this.getDefaultSecurityDecisionsMd();
        break;
      default:
        content = `# ${fileName.split('/').pop()?.replace('.md', '').replace('.yaml', '')} File\n\n[Content to be added]`;
    }

    writeFileSync(filePath, content);
  }

  private async addMandatesToProjectYaml(specsDir: string): Promise<void> {
    const projectYamlPath = join(specsDir, 'project', 'project.yaml');
    
    try {
      const content = readFileSync(projectYamlPath, 'utf-8');
      const projectData = yaml.load(content) as any;

      if (!projectData.rules) {
        projectData.rules = [];
      }

      const mandates = [
        "MANDATE: Update .specs/prompts.md with ALL AI interactions and development prompts by default",
        "MANDATE: Maintain chronological prompt history for complete development traceability"
      ];

      const flatRules = this.flattenRules(projectData.rules);
      for (const mandate of mandates) {
        if (!flatRules.some((rule: string) => rule.includes('MANDATE') && rule.includes('prompt'))) {
          // Push into process sub-array if rules is nested, else push to flat array
          if (Array.isArray(projectData.rules)) {
            projectData.rules.push(mandate);
          } else if (typeof projectData.rules === 'object' && projectData.rules !== null) {
            const nested = projectData.rules as Record<string, string[]>;
            if (!Array.isArray(nested['process'])) nested['process'] = [];
            nested['process'].push(mandate);
          }
          flatRules.push(mandate); // keep flatRules in sync to avoid duplicate pushes
        }
      }

      const updatedContent = yaml.dump(projectData, { lineWidth: 120, indent: 2 });
      writeFileSync(projectYamlPath, updatedContent);

    } catch (error) {
      throw new Error(`Failed to update project.yaml: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }
  }

  private async createInitialPromptsEntry(specsDir: string): Promise<void> {
    const promptsPath = join(specsDir, 'development', 'prompts.md');
    const content = this.getDefaultPromptsContent();
    writeFileSync(promptsPath, content);
  }

  private async validateMetadataAndCrossRefs(specsDir: string, result: ValidationResult): Promise<void> {
    const checks: Array<{ file: string; crossRefs?: string[] }> = [
      { file: 'project/requirements.md', crossRefs: ['architecture/architecture.md', 'architecture/api.yaml', 'project/project.yaml'] },
      { file: 'planning/tasks.md', crossRefs: ['planning/roadmap.md', 'project/requirements.md', 'project/project.yaml'] },
      { file: 'planning/roadmap.md', crossRefs: ['planning/tasks.md', 'project/requirements.md'] },
      { file: 'development/docs.md', crossRefs: ['development/context.md', 'planning/roadmap.md', 'planning/tasks.md', 'project/project.yaml'] },
      { file: 'development/context.md', crossRefs: ['development/docs.md', 'planning/roadmap.md', 'project/project.yaml'] },
      { file: 'development/prompts.md', crossRefs: ['development/context.md', 'project/project.yaml'] },
      { file: 'quality/tests.md', crossRefs: ['project/requirements.md', 'project/project.yaml'] }
    ];

    for (const { file, crossRefs } of checks) {
      const p = join(specsDir, file);
      if (!existsSync(p)) continue;
      const content = readFileSync(p, 'utf-8');
      if (file.endsWith('.md')) {
        if (!/^---\n[\s\S]*?\n---/m.test(content)) {
          result.errors.push(`${file} is missing YAML front-matter metadata.`);
          result.fixPrompts.push({
            issue: `${file} is missing YAML front-matter metadata`,
            prompt:
              `In \`.specs/${file}\`, add a YAML front-matter block at the very top of the file:\n` +
              `\`\`\`\n---\nfileID: [FILE-ID]\nlastUpdated: YYYY-MM-DD\nversion: 1.0\n---\n\`\`\`\n` +
              `Preserve all existing content below the front-matter block.`
          });
          result.isValid = false;
        }
        if (crossRefs) {
          for (const ref of crossRefs) {
            const needle = ref.split('/').pop()!; // check by filename presence
            if (!content.includes(needle)) {
              result.warnings.push(`${file} should reference ${ref}`);
              result.fixPrompts.push({
                issue: `${file} should reference ${ref}`,
                prompt:
                  `In \`.specs/${file}\`, add \`${ref}\` to the \`relatedFiles\` front-matter list. ` +
                  `Preserve all existing content and formatting.`
              });
            }
          }
        }
      }
    }
  }

  private getDefaultProjectYaml(): string {
    return `# Project Configuration
name: "project-name"
version: "1.0.0"
language: "typescript"
description: "Project description"

# Project Rules and AI Context
rules:
  - "Follow best practices and coding standards"
  - "Write comprehensive tests for all functionality"
  - "Document all public APIs and interfaces"
  - "MANDATE: Update .specs/prompts.md with ALL AI interactions and development prompts by default"
  - "MANDATE: Maintain chronological prompt history for complete development traceability"

# Development Context for AI
ai_context:
  - "This is a specification-driven development project"
  - "All changes should be documented in appropriate .specs/ files"
  - "Follow the established architecture patterns"
`;
  }

  private getDefaultPromptsContent(): string {
    return `# Development Prompts Log

## Overview
This file contains ALL AI interactions and development prompts, maintaining complete traceability of the development process.

**🚨 MANDATE**: This file MUST be updated with every AI interaction during development.

## Latest Entries

### Project Setup (${new Date().toISOString().split('T')[0]})

#### Prompt: Initial Validation
**Prompt**: "Validate project specifications and fix any issues"

**Context**: Running specpilot validation to ensure project compliance

**Response**: 
- Validated project structure
- Ensured mandate compliance
- Created missing specification files

**Files Modified**: Various .specs/ files

**Next Actions**: Continue development following specifications

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

---
*Last updated: ${new Date().toISOString().split('T')[0]}*`;
  }

  private getDefaultArchitecture(): string {
    return `# Project Architecture

## Overview
This document outlines the architecture and design decisions for this project.

## Architecture Patterns
- **Architecture Style**: [To be defined]
- **Data Flow**: [To be defined]

## Core Components
[To be documented]

## Design Decisions
[To be added as decisions are made]

---
*Last updated: ${new Date().toISOString().split('T')[0]}*`;
  }

  private getDefaultRequirements(): string {
    return `# Project Requirements

## Project Overview
[Project description to be added]

## Functional Requirements
[To be defined]

## Non-Functional Requirements
[To be defined]

## User Stories
[To be added]

---
*Last updated: ${new Date().toISOString().split('T')[0]}*`;
  }

  private getDefaultThreatModelMd(): string {
    const today = new Date().toISOString().split('T')[0];
    return `---
fileID: SEC-001
lastUpdated: ${today}
version: 1.0
contributors: [author]
relatedFiles: [security/security-decisions.md, architecture/architecture.md, project/requirements.md]
---

# Threat Model

## Overview [SEC-001.1]

> Describe the attack surface: what the system does, what it reads/writes, and what it does NOT do.

[TODO: Summarise the system\'s threat surface — input sources, outputs, and offline/online constraints.]

## Threat Model [SEC-002]

### [Threat Name] [SEC-002.1]

| Field | Detail |
|---|---|
| **Description** | [TODO: Describe the threat] |
| **Impact** | [TODO: High / Medium / Low] |
| **Likelihood** | [TODO: High / Medium / Low / Very low] |
| **Entry point** | [TODO: Where does attacker-controlled data enter?] |
| **Mitigation** | [TODO: What control prevents or limits this threat?] |
| **Residual risk** | [TODO: What risk remains after mitigation?] |

### [Threat Name] [SEC-002.2]

| Field | Detail |
|---|---|
| **Description** | [TODO: Describe the threat] |
| **Impact** | [TODO: High / Medium / Low] |
| **Likelihood** | [TODO: High / Medium / Low / Very low] |
| **Entry point** | [TODO: Where does attacker-controlled data enter?] |
| **Mitigation** | [TODO: What control prevents or limits this threat?] |
| **Residual risk** | [TODO: What risk remains after mitigation?] |

## Attack Surface Summary [SEC-003]

| Entry Point | Data Type | Validated? | Used In |
|---|---|---|---|
| [TODO: entry point] | [TODO: type] | [TODO: ✅ / ⚠️ / ❌] | [TODO: component] |

## Out of Scope [SEC-004]

- [TODO: List threats explicitly out of scope]

---

_Last updated: ${today}_`;
  }

  private getDefaultSecurityDecisionsMd(): string {
    const today = new Date().toISOString().split('T')[0];
    return `---
fileID: SEC-002
lastUpdated: ${today}
version: 1.0
contributors: [author]
relatedFiles: [security/threat-model.md, architecture/architecture.md]
---

# Security Decisions

> Record security-relevant architectural decisions here in ADR style.
> Each entry should capture: what was decided, why, and any trade-offs.

## Decisions [SEC-002.1]

### [Decision title] [ADR-001]

| Field | Detail |
|---|---|
| **Decision** | [TODO: What was decided?] |
| **Status** | [TODO: Accepted / Proposed / Deprecated] |
| **Context** | [TODO: What problem does this solve?] |
| **Rationale** | [TODO: Why was this approach chosen over alternatives?] |
| **Trade-offs** | [TODO: What are the downsides or limitations?] |
| **Related threat** | [TODO: Which threat in threat-model.md does this address?] |

### [Decision title] [ADR-002]

| Field | Detail |
|---|---|
| **Decision** | [TODO: What was decided?] |
| **Status** | [TODO: Accepted / Proposed / Deprecated] |
| **Context** | [TODO: What problem does this solve?] |
| **Rationale** | [TODO: Why was this approach chosen over alternatives?] |
| **Trade-offs** | [TODO: What are the downsides or limitations?] |
| **Related threat** | [TODO: Which threat in threat-model.md does this address?] |

## Cross-References
- Threat model: ./threat-model.md
- Architecture: ../architecture/architecture.md

---
*Last updated: ${today}*`;
  }

  private async validateStaleDates(specsDir: string, result: ValidationResult): Promise<void> {
    const mdFiles = this.requiredFiles.filter(f => f.endsWith('.md'));
    const today = new Date();

    for (const file of mdFiles) {
      const filePath = join(specsDir, file);
      if (!existsSync(filePath)) continue;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/m);
        if (!fmMatch) continue;

        const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
        if (!fm || !fm['lastUpdated']) continue;

        const updated = new Date(String(fm['lastUpdated']));
        if (isNaN(updated.getTime())) continue;

        const diffDays = Math.floor((today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 90) {
          result.warnings.push(
            `${file}: lastUpdated is ${diffDays} days old (threshold: 90 days). Consider updating it to reflect recent changes.`
          );
        }
      } catch {
        // Skip files that cannot be parsed
      }
    }
  }

  private async validateLineLimits(specsDir: string, result: ValidationResult): Promise<void> {
    // Check prompts.md total line count
    const promptsPath = join(specsDir, 'development', 'prompts.md');
    if (existsSync(promptsPath)) {
      const lines = readFileSync(promptsPath, 'utf-8').split('\n');
      if (lines.length > 300) {
        result.warnings.push(
          `development/prompts.md has ${lines.length} lines (limit: 300). Run \`specpilot archive\` to move older entries to prompts-archive.md.`
        );
      }
    }

    // Check tasks.md Completed section line count
    const tasksPath = join(specsDir, 'planning', 'tasks.md');
    if (existsSync(tasksPath)) {
      const content = readFileSync(tasksPath, 'utf-8');
      const completedIdx = content.indexOf('\n## Completed');
      if (completedIdx !== -1) {
        const sectionLines = content.slice(completedIdx + 1).split('\n').length;
        if (sectionLines > 150) {
          result.warnings.push(
            `planning/tasks.md Completed section has ${sectionLines} lines (limit: 150). Run \`specpilot archive\` to move older entries to tasks-archive.md.`
          );
        }
      }
    }
  }
}