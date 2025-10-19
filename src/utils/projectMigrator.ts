import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface MigrationOptions {
  from: string;
  to: string;
}

export interface MigrationResult {
  filesMigrated: number;
  filesMerged: number;
  filesCreated: number;
  warnings: string[];
}

export interface MigrationCheck {
  needed: boolean;
  reason: 'no_source' | 'already_migrated' | 'ready' | string;
  message?: string;
}

export class ProjectMigrator {
  async checkMigrationNeeded(projectDir: string, sourceType: string, targetType: string): Promise<MigrationCheck> {
    const sourceDir = join(projectDir, this.getSourceDirName(sourceType));
    const targetDir = join(projectDir, this.getTargetDirName(targetType));
    
    // Check if source exists
    if (!existsSync(sourceDir)) {
      return {
        needed: false,
        reason: 'no_source',
        message: `Source structure "${sourceType}" not found. The directory ${sourceDir} does not exist.`
      };
    }
    
    // Check if target already exists
    if (existsSync(targetDir)) {
      return {
        needed: false,
        reason: 'already_migrated',
        message: `Target structure "${targetType}" already exists at ${targetDir}.`
      };
    }
    
    return {
      needed: true,
      reason: 'ready',
      message: 'Migration can proceed'
    };
  }

  async validateSource(projectDir: string, sourceType: string): Promise<boolean> {
    const sourceDir = join(projectDir, this.getSourceDirName(sourceType));
    return existsSync(sourceDir);
  }

  async createBackup(projectDir: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = join(projectDir, `backup-${timestamp}`);
    
    mkdirSync(backupDir, { recursive: true });
    
    // Copy all files and directories
    const items = readdirSync(projectDir);
    for (const item of items) {
      if (item.startsWith('backup-')) continue; // Skip existing backups
      
      const sourcePath = join(projectDir, item);
      const targetPath = join(backupDir, item);
      
      const stat = statSync(sourcePath);
      if (stat.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, targetPath);
      }
    }
  }

  async migrate(projectDir: string, options: MigrationOptions): Promise<MigrationResult> {
    const result: MigrationResult = {
      filesMigrated: 0,
      filesMerged: 0,
      filesCreated: 0,
      warnings: []
    };

    const sourceDir = join(projectDir, this.getSourceDirName(options.from));
    const targetDir = join(projectDir, this.getTargetDirName(options.to));

    if (!existsSync(sourceDir)) {
      throw new Error(`Source directory ${sourceDir} does not exist`);
    }

    // Create target directory
    mkdirSync(targetDir, { recursive: true });

    // Migrate files based on source type
    if (options.from === 'complex' || options.from === 'project-spec') {
      await this.migrateFromComplex(sourceDir, targetDir, result);
    } else {
      await this.migrateFromSimple(sourceDir, targetDir, result);
    }

    return result;
  }

  private getSourceDirName(sourceType: string): string {
    switch (sourceType) {
      case 'complex':
      case 'project-spec':
        return '.project-spec';
      case 'simple':
        return '.specs';
      default:
        return sourceType;
    }
  }

  private getTargetDirName(targetType: string): string {
    switch (targetType) {
      case 'simple':
        return '.specs';
      case 'complex':
        return '.project-spec';
      default:
        return targetType;
    }
  }

  private async migrateFromComplex(sourceDir: string, targetDir: string, result: MigrationResult): Promise<void> {
    const files = readdirSync(sourceDir, { recursive: true });
    
    for (const file of files) {
      if (typeof file !== 'string') continue;
      
      const sourcePath = join(sourceDir, file);
      const stat = statSync(sourcePath);
      
      if (stat.isDirectory()) continue; // Skip directories
      
      const fileName = file.split('/').pop() || file;
      const targetPath = this.mapComplexToSimpleFile(fileName, targetDir);
      
      if (targetPath) {
        try {
          // Check if target file already exists
          if (existsSync(targetPath)) {
            await this.mergeFileContent(sourcePath, targetPath);
            result.filesMerged++;
          } else {
            copyFileSync(sourcePath, targetPath);
            result.filesMigrated++;
          }
        } catch (error) {
          result.warnings.push(`Failed to migrate ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Create any missing files
    await this.createMissingSimpleFiles(targetDir, result);
  }

  private async migrateFromSimple(sourceDir: string, targetDir: string, result: MigrationResult): Promise<void> {
    // For now, just copy all files
    const files = readdirSync(sourceDir);
    
    for (const file of files) {
      const sourcePath = join(sourceDir, file);
      const targetPath = join(targetDir, file);
      
      if (existsSync(targetPath)) {
        result.warnings.push(`Target file ${file} already exists, skipping`);
        continue;
      }
      
      copyFileSync(sourcePath, targetPath);
      result.filesMigrated++;
    }
  }

  private mapComplexToSimpleFile(fileName: string, targetDir: string): string | null {
    const mapping: Record<string, string> = {
      // Direct mappings
      'project.yaml': join(targetDir, 'project.yaml'),
      'architecture.md': join(targetDir, 'architecture.md'),
      'requirements.md': join(targetDir, 'requirements.md'),
      'api.yaml': join(targetDir, 'api.yaml'),
      'tests.md': join(targetDir, 'tests.md'),
      'tasks.md': join(targetDir, 'tasks.md'),
      'context.md': join(targetDir, 'context.md'),
      'prompts.md': join(targetDir, 'prompts.md'),
      'docs.md': join(targetDir, 'docs.md'),
      
      // Complex structure mappings
      'config/project.yaml': join(targetDir, 'project.yaml'),
      'specs/architecture/architecture.md': join(targetDir, 'architecture.md'),
      'specs/features/requirements.md': join(targetDir, 'requirements.md'),
      'specs/technical/api.yaml': join(targetDir, 'api.yaml'),
      'specs/technical/tests.md': join(targetDir, 'tests.md'),
      'tools/tasks.md': join(targetDir, 'tasks.md'),
      'docs/context.md': join(targetDir, 'context.md'),
      'docs/prompts.md': join(targetDir, 'prompts.md'),
      'docs/docs.md': join(targetDir, 'docs.md'),
    };

    return mapping[fileName] || null;
  }

  private async mergeFileContent(sourcePath: string, targetPath: string): Promise<void> {
    const sourceContent = readFileSync(sourcePath, 'utf-8');
    const targetContent = readFileSync(targetPath, 'utf-8');
    
    // Simple merge strategy: append source content to target with separator
    const mergedContent = targetContent + '\n\n---\n\n' + sourceContent;
    writeFileSync(targetPath, mergedContent);
  }

  private async createMissingSimpleFiles(targetDir: string, result: MigrationResult): Promise<void> {
    const requiredFiles = [
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

    for (const file of requiredFiles) {
      const filePath = join(targetDir, file);
      if (!existsSync(filePath)) {
        await this.createDefaultFile(filePath, file);
        result.filesCreated++;
      }
    }
  }

  private async createDefaultFile(filePath: string, fileName: string): Promise<void> {
    let content = '';
    
    switch (fileName) {
      case 'project.yaml':
        content = `# Project Configuration
name: "migrated-project"
version: "1.0.0"
language: "typescript"
description: "Migrated from complex structure"

rules:
  - "MANDATE: Update .specs/prompts.md with ALL AI interactions and development prompts by default"
  - "MANDATE: Maintain chronological prompt history for complete development traceability"`;
        break;
        
      case 'prompts.md':
        content = `# Development Prompts Log

## Overview
This file contains ALL AI interactions and development prompts, maintaining complete traceability of the development process.

**🚨 MANDATE**: This file MUST be updated with every AI interaction during development.

## Migration Note
This file was created during migration from complex to simplified structure.

---
*Last updated: ${new Date().toISOString().split('T')[0]}*`;
        break;
        
      default:
        content = `# ${fileName.replace('.md', '').replace('.yaml', '')}

[Content migrated from complex structure]

---
*Last updated: ${new Date().toISOString().split('T')[0]}*`;
    }
    
    writeFileSync(filePath, content);
  }

  private copyDirectory(source: string, target: string): void {
    mkdirSync(target, { recursive: true });
    const files = readdirSync(source);
    
    for (const file of files) {
      const sourcePath = join(source, file);
      const targetPath = join(target, file);
      
      const stat = statSync(sourcePath);
      if (stat.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, targetPath);
      }
    }
  }
}