import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

export interface ProjectInfo {
  name: string;
  version: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  dependencies: string[];
}

export class ProjectDetector {
  async detectProject(projectDir: string = process.cwd()): Promise<ProjectInfo | null> {
    // Try to detect Node.js/TypeScript project
    const packageJsonPath = join(projectDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      return this.detectNodeProject(packageJsonPath);
    }

    // Try to detect Python project
    const setupPyPath = join(projectDir, 'setup.py');
    const pyprojectPath = join(projectDir, 'pyproject.toml');
    const requirementsPath = join(projectDir, 'requirements.txt');
    
    if (existsSync(pyprojectPath)) {
      return this.detectPythonProject(pyprojectPath, 'pyproject.toml');
    } else if (existsSync(setupPyPath)) {
      return this.detectPythonProject(setupPyPath, 'setup.py');
    } else if (existsSync(requirementsPath)) {
      return this.detectPythonProject(requirementsPath, 'requirements.txt');
    }

    return null;
  }

  private detectNodeProject(packageJsonPath: string): ProjectInfo {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    return {
      name: pkg.name || 'unknown-project',
      version: pkg.version || '1.0.0',
      language: this.detectLanguage(pkg),
      framework: this.detectFramework(pkg),
      author: this.extractAuthor(pkg.author),
      description: pkg.description || '',
      dependencies: Object.keys(pkg.dependencies || {})
    };
  }

  private detectPythonProject(filePath: string, fileType: string): ProjectInfo {
    const content = readFileSync(filePath, 'utf-8');
    
    if (fileType === 'pyproject.toml') {
      // Basic TOML parsing for name and version
      const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
      const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
      
      return {
        name: nameMatch ? nameMatch[1] : 'unknown-project',
        version: versionMatch ? versionMatch[1] : '1.0.0',
        language: 'python',
        framework: this.detectPythonFramework(content),
        description: '',
        dependencies: this.extractPythonDependencies(content)
      };
    } else if (fileType === 'requirements.txt') {
      // Parse requirements.txt
      return {
        name: 'unknown-project',
        version: '1.0.0',
        language: 'python',
        framework: this.detectPythonFramework(content),
        description: '',
        dependencies: content.split('\n').filter(line => line.trim() && !line.startsWith('#'))
      };
    } else {
      // setup.py - basic parsing
      const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
      const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
      
      return {
        name: nameMatch ? nameMatch[1] : 'unknown-project',
        version: versionMatch ? versionMatch[1] : '1.0.0',
        language: 'python',
        framework: this.detectPythonFramework(content),
        description: '',
        dependencies: this.extractPythonDependencies(content)
      };
    }
  }

  private detectLanguage(pkg: any): string {
    // Check if TypeScript is in devDependencies
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
      return 'typescript';
    }
    // Default to typescript for Node.js projects (most common case)
    return 'typescript';
  }

  private detectFramework(pkg: any): string | undefined {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    // React
    if (deps.react) return 'react';
    
    // Next.js
    if (deps.next) return 'next';
    
    // Vue
    if (deps.vue) return 'vue';
    
    // Angular
    if (deps['@angular/core']) return 'angular';
    
    // Express
    if (deps.express) return 'express';
    
    // NestJS
    if (deps['@nestjs/core']) return 'nest';
    
    return undefined;
  }

  private detectPythonFramework(content: string): string | undefined {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('fastapi')) return 'fastapi';
    if (lowerContent.includes('django')) return 'django';
    if (lowerContent.includes('flask')) return 'flask';
    if (lowerContent.includes('streamlit')) return 'streamlit';
    
    return undefined;
  }

  private extractAuthor(author: any): string | undefined {
    if (typeof author === 'string') {
      return author;
    } else if (typeof author === 'object' && author.name) {
      return author.name;
    }
    return undefined;
  }

  private extractPythonDependencies(content: string): string[] {
    const deps: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Extract package name (before ==, >=, etc.)
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
        if (match) {
          deps.push(match[1]);
        }
      }
    }
    
    return deps;
  }
}
