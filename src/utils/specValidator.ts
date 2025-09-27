import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  filesChecked: number;
  mandatesVerified: number;
}

export class SpecValidator {
  private requiredFiles = [
    'project.yaml',
    'architecture.md',
    'requirements.md',
    'api.yaml',
    'tests.md',
    'tasks.md',
    'context.md',
    'prompts.md',
    'docs.md'
  ];

  async validate(projectDir: string, options: ValidationOptions): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fixable: [],
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
      } catch (error) {
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
    const projectYamlPath = join(specsDir, 'project.yaml');
    
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
      if (!projectData.rules || !Array.isArray(projectData.rules)) {
        result.warnings.push('project.yaml should have a rules section');
      }

      // Validate mandates exist
      const hasMandates = this.checkMandatesInRules(projectData.rules || []);
      if (!hasMandates.hasPromptMandate) {
        result.errors.push('Missing MANDATE for prompt tracking in project.yaml rules');
        result.fixable.push('add-mandates');
        result.isValid = false;
      } else {
        result.mandatesVerified++;
      }

    } catch (error) {
      result.errors.push(`Failed to parse project.yaml: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }
  }

  private checkMandatesInRules(rules: string[]): { hasPromptMandate: boolean } {
    const promptMandatePattern = /MANDATE.*prompt.*tracking|MANDATE.*prompts\.md/i;
    
    return {
      hasPromptMandate: rules.some(rule => promptMandatePattern.test(rule))
    };
  }

  private async validateMandates(specsDir: string, result: ValidationResult): Promise<void> {
    // Check if prompts.md exists and has content
    const promptsPath = join(specsDir, 'prompts.md');
    
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
    const archPath = join(specsDir, 'architecture.md');
    
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
    const reqPath = join(specsDir, 'requirements.md');
    
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
    const tasksPath = join(specsDir, 'tasks.md');
    
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
    let content = '';

    switch (fileName) {
      case 'project.yaml':
        content = this.getDefaultProjectYaml();
        break;
      case 'prompts.md':
        content = this.getDefaultPromptsContent();
        break;
      case 'architecture.md':
        content = this.getDefaultArchitecture();
        break;
      case 'requirements.md':
        content = this.getDefaultRequirements();
        break;
      default:
        content = `# ${fileName.replace('.md', '').replace('.yaml', '')} File\n\n[Content to be added]`;
    }

    writeFileSync(filePath, content);
  }

  private async addMandatesToProjectYaml(specsDir: string): Promise<void> {
    const projectYamlPath = join(specsDir, 'project.yaml');
    
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

      for (const mandate of mandates) {
        if (!projectData.rules.some((rule: string) => rule.includes('MANDATE') && rule.includes('prompt'))) {
          projectData.rules.push(mandate);
        }
      }

      const updatedContent = yaml.dump(projectData, { lineWidth: 120, indent: 2 });
      writeFileSync(projectYamlPath, updatedContent);

    } catch (error) {
      throw new Error(`Failed to update project.yaml: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createInitialPromptsEntry(specsDir: string): Promise<void> {
    const promptsPath = join(specsDir, 'prompts.md');
    const content = this.getDefaultPromptsContent();
    writeFileSync(promptsPath, content);
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
}