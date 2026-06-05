import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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

    // Try to detect Kotlin project
    const gradleKtsPath = join(projectDir, 'build.gradle.kts');
    const settingsGradleKtsPath = join(projectDir, 'settings.gradle.kts');
    const gradlePath = join(projectDir, 'build.gradle');
    if (existsSync(gradleKtsPath) || existsSync(settingsGradleKtsPath) || existsSync(gradlePath)) {
      return this.detectKotlinProject(projectDir);
    }

    // Try to detect Swift project
    const packageSwiftPath = join(projectDir, 'Package.swift');
    if (existsSync(packageSwiftPath)) {
      return this.detectSwiftProject(projectDir, packageSwiftPath);
    }
    const entries = existsSync(projectDir) ? readdirSync(projectDir) : [];
    const hasXcodeProject = entries.some(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'));
    if (hasXcodeProject) {
      return this.detectSwiftProject(projectDir, null);
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
    
    // Check for TypeScript-specific fields or config
    if (pkg.types || pkg.typings) {
      return 'typescript';
    }
    
    // Default to JavaScript for Node.js projects without TypeScript
    return 'javascript';
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

  private detectKotlinProject(projectDir: string): ProjectInfo {
    const gradleKtsPath = join(projectDir, 'build.gradle.kts');
    const settingsGradleKtsPath = join(projectDir, 'settings.gradle.kts');
    const gradlePath = join(projectDir, 'build.gradle');

    let content = '';
    let projectName = 'unknown-project';
    let version = '1.0.0';

    // Read settings file first for project name
    if (existsSync(settingsGradleKtsPath)) {
      const settingsContent = readFileSync(settingsGradleKtsPath, 'utf-8');
      const nameMatch = settingsContent.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) projectName = nameMatch[1];
      content += settingsContent;
    }

    if (existsSync(gradleKtsPath)) {
      const buildContent = readFileSync(gradleKtsPath, 'utf-8');
      const versionMatch = buildContent.match(/version\s*=\s*["']([^"']+)["']/);
      if (versionMatch) version = versionMatch[1];
      content += buildContent;
    } else if (existsSync(gradlePath)) {
      const buildContent = readFileSync(gradlePath, 'utf-8');
      const nameMatch = buildContent.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
      if (nameMatch && projectName === 'unknown-project') projectName = nameMatch[1];
      const versionMatch = buildContent.match(/version\s*=\s*["']([^"']+)["']/);
      if (versionMatch) version = versionMatch[1];
      content += buildContent;
    }

    return {
      name: projectName,
      version,
      language: 'kotlin',
      framework: this.detectKotlinFramework(content),
      description: '',
      dependencies: []
    };
  }

  private detectKotlinFramework(content: string): string | undefined {
    const lower = content.toLowerCase();
    if (lower.includes('spring-boot') || lower.includes('org.springframework')) return 'spring';
    if (lower.includes('io.ktor')) return 'ktor';
    if (lower.includes('androidx.compose') || lower.includes('compose')) return 'compose';
    if (lower.includes('com.android.application') || lower.includes('com.android.library')) return 'android';
    return undefined;
  }

  private detectSwiftProject(projectDir: string, packageSwiftPath: string | null): ProjectInfo {
    let projectName = 'unknown-project';
    let version = '1.0.0';
    let content = '';

    if (packageSwiftPath && existsSync(packageSwiftPath)) {
      content = readFileSync(packageSwiftPath, 'utf-8');
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      if (nameMatch) projectName = nameMatch[1];
    } else {
      // Derive name from .xcodeproj or .xcworkspace filename
      const entries = readdirSync(projectDir);
      const xcEntry = entries.find(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'));
      if (xcEntry) projectName = xcEntry.replace(/\.(xcodeproj|xcworkspace)$/, '');
    }

    return {
      name: projectName,
      version,
      language: 'swift',
      framework: this.detectSwiftFramework(content),
      description: '',
      dependencies: []
    };
  }

  private detectSwiftFramework(content: string): string | undefined {
    const lower = content.toLowerCase();
    if (lower.includes('vapor')) return 'vapor';
    if (lower.includes('swiftui')) return 'swiftui';
    return 'ios';
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
