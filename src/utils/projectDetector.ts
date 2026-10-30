import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { cloneUrlError } from './gitClone';

export interface ProjectInfo {
  name: string;
  version: string;
  language: string;
  framework?: string;
  author?: string;
  description?: string;
  dependencies: string[];
  /** A platform id of the setup chat, from direct evidence only (BL-PM-016); the CLI does not read it. */
  platform?: string;
  /** BL-095 (REQ-002.H.39): from files only, each absent without direct evidence. */
  packageManager?: string;
  testFramework?: string;
  repository?: string;
  license?: string;
}

/** Largest `.git/config` or LICENSE file read for detection (REQ-002.H.39). */
const MAX_DETECT_BYTES = 64 * 1024;
const LICENSE_SHAPE = /^[A-Za-z0-9.+()\- ]{1,64}$/;
const NODE_LOCKS: [string, string][] = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']];
const PYTHON_LOCKS: [string, string][] = [['uv.lock', 'uv'], ['poetry.lock', 'poetry'], ['Pipfile.lock', 'pipenv']];
const NODE_TESTS: [string, string][] = [['vitest', 'vitest'], ['jest', 'jest'], ['mocha', 'mocha'], ['@playwright/test', 'playwright'], ['cypress', 'cypress']];
const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE'];
const LICENSE_LINES: [RegExp, string][] = [[/^MIT License$/i, 'MIT'], [/^Apache License$/i, 'Apache-2.0'], [/^GNU GENERAL PUBLIC LICENSE$/i, 'GPL'], [/^ISC License$/i, 'ISC'], [/^BSD .*License$/i, 'BSD']];

/**
 * A file's text when `lstat` shows a regular file of at most `max` bytes, else null: no link is followed. Every
 * manifest is read through it since BL-136, and the code analyzer reads through it with its own limit.
 */
export function readSmall(path: string, max = MAX_DETECT_BYTES): string | null {
  try {
    const st = lstatSync(path);
    return st.isFile() && st.size <= max ? readFileSync(path, 'utf-8') : null;
  } catch {
    return null;
  }
}

/** The first `url =` of `[remote "origin"]` in `.git/config`, when `.git` is a real folder and the clone check accepts it. */
function originUrl(dir: string): string | undefined {
  try {
    if (!lstatSync(join(dir, '.git')).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const lines = (readSmall(join(dir, '.git', 'config')) ?? '').split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*\[remote "origin"\]\s*$/.test(l));
  if (start < 0) return undefined;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) return undefined;
    const m = /^\s*url\s*=\s*(.*?)\s*$/.exec(line);
    if (m) return cloneUrlError(m[1]) === null ? m[1] : undefined;
  }
  return undefined;
}

/** `package.json`'s license string verbatim, else the first LICENSE file's first line matched to one of five families. */
function licenseOf(dir: string, pkgLicense: unknown): string | undefined {
  let value: string | undefined;
  if (typeof pkgLicense === 'string') value = pkgLicense;
  else {
    const file = LICENSE_FILES.map(f => readSmall(join(dir, f))).find(t => t !== null);
    const first = file?.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).find(l => l !== '');
    value = first ? LICENSE_LINES.find(([re]) => re.test(first))?.[1] : undefined;
  }
  return value && LICENSE_SHAPE.test(value) ? value : undefined;
}

export class ProjectDetector {
  async detectProject(projectDir: string = process.cwd()): Promise<ProjectInfo | null> {
    const info = this.detectBase(projectDir);
    return info && { ...info, ...this.detectMore(projectDir, info) };
  }

  /**
   * BL-095 (REQ-002.H.39): package manager, test framework, repository URL and license, each from direct
   * evidence at the folder's root only; files are read, no process is started.
   */
  private detectMore(dir: string, info: ProjectInfo): Pick<ProjectInfo, 'packageManager' | 'testFramework' | 'repository' | 'license'> {
    const pkgPath = join(dir, 'package.json');
    const node = existsSync(pkgPath); // a package.json makes it a Node project (detectBase)
    const pkg = node ? JSON.parse(readSmall(pkgPath) ?? '{}') : {};
    const locks = node ? NODE_LOCKS : info.language === 'python' ? PYTHON_LOCKS : [];
    const packageManager = locks.find(([file]) => existsSync(join(dir, file)))?.[1];
    let testFramework: string | undefined;
    if (node) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      testFramework = NODE_TESTS.find(([name]) => deps[name])?.[1];
    } else if (info.language === 'python') {
      const text = ['pyproject.toml', 'setup.py', 'requirements.txt'].map(f => join(dir, f)).filter(f => existsSync(f)).map(f => readSmall(f) ?? '')[0] ?? '';
      if (/(^|[^A-Za-z0-9_.-])pytest(?![A-Za-z0-9_-])/m.test(text)) testFramework = 'pytest';
    } else if (info.language === 'kotlin') {
      const gradle = ['build.gradle.kts', 'build.gradle'].map(f => join(dir, f)).filter(f => existsSync(f)).map(f => readSmall(f) ?? '').join('\n');
      if (/junit/i.test(gradle)) testFramework = 'junit';
    }
    const repository = originUrl(dir);
    const license = licenseOf(dir, node ? pkg.license : undefined);
    return { ...(packageManager ? { packageManager } : {}), ...(testFramework ? { testFramework } : {}), ...(repository ? { repository } : {}), ...(license ? { license } : {}) };
  }

  private detectBase(projectDir: string): ProjectInfo | null {
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
    const pkg = JSON.parse(readSmall(packageJsonPath) ?? '{}');
    
    return {
      name: pkg.name || 'unknown-project',
      version: pkg.version || '1.0.0',
      language: this.detectLanguage(pkg),
      framework: this.detectFramework(pkg),
      author: this.extractAuthor(pkg.author),
      description: pkg.description || '',
      dependencies: Object.keys(pkg.dependencies || {}),
      platform: this.detectNodePlatform(pkg),
    };
  }

  /** The platform a package.json shows directly (REQ-002.H.35): nothing for react alone. */
  private detectNodePlatform(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): string | undefined {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['react-native'] || deps.expo) return 'rn';
    if (deps.next) return 'nextjs';
    if ((deps.vite || deps['react-scripts']) && deps.react) return 'react';
    if (deps.vite && deps.vue) return 'vue';
    return undefined;
  }

  private detectPythonProject(filePath: string, fileType: string): ProjectInfo {
    const content = readSmall(filePath) ?? '';
    
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
      const settingsContent = readSmall(settingsGradleKtsPath) ?? '';
      const nameMatch = settingsContent.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) projectName = nameMatch[1];
      content += settingsContent;
    }

    if (existsSync(gradleKtsPath)) {
      const buildContent = readSmall(gradleKtsPath) ?? '';
      const versionMatch = buildContent.match(/version\s*=\s*["']([^"']+)["']/);
      if (versionMatch) version = versionMatch[1];
      content += buildContent;
    } else if (existsSync(gradlePath)) {
      const buildContent = readSmall(gradlePath) ?? '';
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

    const xcEntry = readdirSync(projectDir).find(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'));
    if (packageSwiftPath && existsSync(packageSwiftPath)) {
      content = readSmall(packageSwiftPath) ?? '';
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      if (nameMatch) projectName = nameMatch[1];
    } else {
      // Derive name from .xcodeproj or .xcworkspace filename
      if (xcEntry) projectName = xcEntry.replace(/\.(xcodeproj|xcworkspace)$/, '');
    }

    // An Xcode project, also beside a Package.swift, is the only evidence of iOS (REQ-002.H.35).
    return {
      name: projectName,
      version,
      language: 'swift',
      framework: this.detectSwiftFramework(content),
      description: '',
      dependencies: [],
      ...(xcEntry ? { platform: 'ios' } : {}),
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
