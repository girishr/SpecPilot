import { Command } from 'commander';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TemplateEngine } from '../utils/templateEngine';
import { SpecGenerator } from '../utils/specGenerator';
import { Logger } from '../utils/logger';

export interface SpecifyOptions {
  dir: string;
  specsName: string;
  prompts: boolean;
  update: boolean;
}

export async function specifyCommand(description: string | undefined, options: SpecifyOptions) {
  const logger = new Logger();

  try {
    logger.info('📝 Processing specification description...');

    // Get description if not provided
    let projectDescription = description;
    if (!projectDescription && options.prompts) {
      const response = await inquirer.prompt([{
        type: 'input',
        name: 'description',
        message: 'Describe what you want to build:',
        validate: (input: string) => input.length > 0 || 'Description is required'
      }]);
      projectDescription = response.description;
    }

    if (!projectDescription) {
      logger.error('❌ No description provided. Use --help for usage information.');
      process.exit(1);
    }

    // Find .specs directory
    const specsDir = join(options.dir, options.specsName);
    if (!existsSync(specsDir)) {
      logger.error(`❌ Specs directory not found: ${specsDir}`);
      logger.info('💡 Run "specpilot init" first to create the project structure.');
      process.exit(1);
    }

    // Read existing project.yaml to get current context
    const projectYamlPath = join(specsDir, 'project.yaml');
    if (!existsSync(projectYamlPath)) {
      logger.error('❌ project.yaml not found. Please ensure this is a valid SDD project.');
      process.exit(1);
    }

    const projectYaml = readFileSync(projectYamlPath, 'utf-8');
    const projectName = extractProjectName(projectYaml);
    const language = extractLanguage(projectYaml);
    const framework = extractFramework(projectYaml);

    logger.info(`🔍 Found project: ${projectName} (${language}${framework ? ` + ${framework}` : ''})`);

    // Update requirements.md with the new description
    const requirementsPath = join(specsDir, 'requirements.md');
    if (existsSync(requirementsPath)) {
      const currentContent = readFileSync(requirementsPath, 'utf-8');
      const updatedContent = updateRequirementsWithDescription(currentContent, projectDescription, options.update);
      writeFileSync(requirementsPath, updatedContent);
      logger.success('✅ Updated requirements.md with new description');
    }

    // Update context.md with the specification
    const contextPath = join(specsDir, 'context.md');
    if (existsSync(contextPath)) {
      const currentContent = readFileSync(contextPath, 'utf-8');
      const updatedContent = updateContextWithSpecification(currentContent, projectDescription);
      writeFileSync(contextPath, updatedContent);
      logger.success('✅ Updated context.md with specification details');
    }

    // Update prompts.md to log this interaction
    const promptsPath = join(specsDir, 'prompts.md');
    if (existsSync(promptsPath)) {
      const currentContent = readFileSync(promptsPath, 'utf-8');
      const updatedContent = updatePromptsLog(currentContent, projectDescription);
      writeFileSync(promptsPath, updatedContent);
      logger.success('✅ Logged specification in prompts.md');
    }

    // If update flag is set, regenerate specs with new context
    if (options.update) {
      logger.info('🔄 Regenerating specifications with updated context...');

      const templateEngine = new TemplateEngine();
      const specGenerator = new SpecGenerator(templateEngine);

      await specGenerator.generateSpecs({
        projectName: projectName || 'updated-project',
        language: language || 'typescript',
        framework: framework,
        targetDir: options.dir,
        specsName: options.specsName,
        description: projectDescription
      });

      logger.success('✅ Regenerated specifications with new description');
    }

    logger.success(`🎯 Specification processed successfully!`);
    logger.info(`📁 Specs location: ${specsDir}`);
    logger.info(`📋 Description: "${projectDescription}"`);

    // Show next steps
    console.log(chalk.cyan('\n📖 Next steps:'));
    console.log(`  # Review updated specifications in ${options.specsName}/`);
    console.log(`  specpilot validate  # Validate your specifications`);
    console.log(`  # Continue development based on the updated requirements`);

  } catch (error) {
    logger.error(`❌ Failed to process specification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function extractProjectName(yamlContent: string): string | undefined {
  const match = yamlContent.match(/name:\s*(.+)/);
  return match ? match[1].trim() : undefined;
}

function extractLanguage(yamlContent: string): string | undefined {
  const match = yamlContent.match(/language:\s*(.+)/);
  return match ? match[1].trim() : undefined;
}

function extractFramework(yamlContent: string): string | undefined {
  const match = yamlContent.match(/framework:\s*(.+)/);
  return match ? match[1].trim() : undefined;
}

function updateRequirementsWithDescription(currentContent: string, description: string, replace: boolean = false): string {
  const descriptionSection = `## Project Overview
${description}

## Functional Requirements
`;

  if (replace || !currentContent.includes('## Project Overview')) {
    // Replace or add the project overview section
    const lines = currentContent.split('\n');
    const overviewIndex = lines.findIndex(line => line.includes('## Project Overview'));

    if (overviewIndex !== -1) {
      // Find the end of the overview section
      let endIndex = overviewIndex + 1;
      while (endIndex < lines.length && !lines[endIndex].startsWith('## ')) {
        endIndex++;
      }
      // Replace the overview section
      lines.splice(overviewIndex, endIndex - overviewIndex, ...descriptionSection.split('\n'));
    } else {
      // Add after title
      const titleIndex = lines.findIndex(line => line.startsWith('# '));
      if (titleIndex !== -1) {
        lines.splice(titleIndex + 1, 0, '', descriptionSection);
      }
    }

    return lines.join('\n');
  } else {
    // Append to existing overview
    return currentContent.replace(
      /(## Project Overview[\s\S]*?)(\n## |\n*$)/,
      `$1\n\n### Additional Context\n${description}$2`
    );
  }
}

function updateContextWithSpecification(currentContent: string, description: string): string {
  const specEntry = `### Latest Specification Update
**Date**: ${new Date().toISOString().split('T')[0]}
**Description**: ${description}
**Source**: specpilot specify command

`;

  // Add to the Project Memory section
  if (currentContent.includes('## Project Memory')) {
    return currentContent.replace(
      /(## Project Memory[\s\S]*?)(\n## |\n*$)/,
      `$1\n${specEntry}$2`
    );
  } else {
    // Add new section
    return currentContent + '\n\n## Project Memory\n' + specEntry;
  }
}

function updatePromptsLog(currentContent: string, description: string): string {
  const promptEntry = `### Specification Update (${new Date().toISOString().split('T')[0]})

#### Prompt: Project Specification
**Prompt**: "${description}"

**Context**: User provided specification description via specpilot specify command

**Response**: 
- Updated requirements.md with project description
- Updated context.md with specification details
- Logged interaction in prompts.md

**Files Modified**: requirements.md, context.md, prompts.md

**Next Actions**: Review and validate updated specifications

---

`;

  // Add to the Latest Entries section
  if (currentContent.includes('## Latest Entries')) {
    return currentContent.replace(
      /(## Latest Entries[\s\S]*?)(\n## |\n*$)/,
      `$1\n${promptEntry}$2`
    );
  } else {
    // Add after Overview
    return currentContent.replace(
      /(## Overview[\s\S]*?)(\n## |\n*$)/,
      `$1\n\n## Latest Entries\n${promptEntry}$2`
    );
  }
}