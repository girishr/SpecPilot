import { lstatSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { readSmall } from './projectDetector';
import { MAX_SCAN_FILES } from './specPaths';

// The analysis's bounds (BL-136, REQ-002.D.6): entries looked at with `lstat`, so no link is followed.
const MAX_DEPTH = 20;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_RUN_BYTES = 8 * MAX_FILE_BYTES;

/** What one walk may still visit. */
interface Budget {
  entries: number;
}

export interface TodoItem {
  file: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'HACK' | 'NOTE';
  text: string;
}

export interface TestInfo {
  framework?: string;
  testFiles: string[];
  testCount: number;
  hasE2E: boolean;
  hasUnit: boolean;
  hasIntegration: boolean;
}

export interface ArchitectureInfo {
  components: string[];
  directories: string; // Changed to string (the tree as text)
  fileTypes: Record<string, number>;
}

export interface AnalysisResult {
  todos: TodoItem[];
  tests: TestInfo;
  architecture: ArchitectureInfo;
}

export class CodeAnalyzer {
  private excludeDirs = ['node_modules', 'dist', 'build', '.git', '__pycache__', 'venv', '.venv', 'env'];
  private codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];

  /** Bytes one `analyzeCodebase()` run may still read, and what it already read (each file counted once). */
  private bytesLeft = MAX_RUN_BYTES;
  private reads = new Map<string, string | null>();

  async analyzeCodebase(projectDir: string = process.cwd()): Promise<AnalysisResult> {
    this.bytesLeft = MAX_RUN_BYTES;
    this.reads = new Map();
    return {
      todos: this.findTodos(projectDir),
      tests: this.analyzeTests(projectDir),
      architecture: this.extractArchitecture(projectDir)
    };
  }

  /** A code file's text: a regular file of at most 1 MB while the run's byte budget lasts, else null. */
  private read(path: string): string | null {
    if (this.reads.has(path)) return this.reads.get(path)!;
    const text = this.bytesLeft > 0 ? readSmall(path, Math.min(MAX_FILE_BYTES, this.bytesLeft)) : null;
    if (text !== null) this.bytesLeft -= Buffer.byteLength(text, 'utf-8');
    this.reads.set(path, text);
    return text;
  }

  private findTodos(dir: string, todos: TodoItem[] = [], depth = 0, budget: Budget = { entries: MAX_SCAN_FILES }): TodoItem[] {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        if (budget.entries-- <= 0) break;
        const fullPath = join(dir, item);
        
        try {
          const stat = lstatSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item) && depth < MAX_DEPTH) {
              this.findTodos(fullPath, todos, depth + 1, budget);
            }
          } else if (stat.isFile() && this.codeExtensions.includes(extname(item))) {
            const content = this.read(fullPath);
            if (content === null) continue;
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
              const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|NOTE):?\s*(.+)/i) ||
                              line.match(/#\s*(TODO|FIXME|HACK|NOTE):?\s*(.+)/i);
              
              if (todoMatch) {
                todos.push({
                  file: fullPath.replace(dir + '/', ''),
                  line: index + 1,
                  type: todoMatch[1].toUpperCase() as 'TODO' | 'FIXME' | 'HACK' | 'NOTE',
                  text: todoMatch[2].trim()
                });
              }
            });
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }
    } catch {
      // Skip directories that can't be read
    }
    
    return todos;
  }

  private analyzeTests(dir: string): TestInfo {
    const testFiles: string[] = [];
    let testCount = 0;
    let hasE2E = false;
    let hasUnit = false;
    let hasIntegration = false;
    let framework: string | undefined;

    this.findTestFiles(dir, testFiles);
    
    // Detect test framework
    if (testFiles.some(f => f.includes('.spec.') || f.includes('.test.'))) {
      framework = this.detectTestFramework(dir);
    }
    
    // Count tests and categorize
    testFiles.forEach(file => {
      try {
        const content = this.read(join(dir, file));
        if (content === null) return;
        
        // Count test cases
        const testMatches = content.match(/\b(test|it|describe)\s*\(/g);
        if (testMatches) {
          testCount += testMatches.length;
        }
        
        // Categorize tests
        if (file.includes('e2e')) {
          hasE2E = true;
        } else if (file.includes('integration')) {
          hasIntegration = true;
        } else {
          hasUnit = true;
        }
      } catch {
        // Skip files that can't be read
      }
    });
    
    return {
      framework,
      testFiles,
      testCount,
      hasE2E,
      hasUnit,
      hasIntegration
    };
  }

  private findTestFiles(dir: string, testFiles: string[], depth = 0, budget: Budget = { entries: MAX_SCAN_FILES }): void {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        if (budget.entries-- <= 0) break;
        const fullPath = join(dir, item);
        
        try {
          const stat = lstatSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item) && depth < MAX_DEPTH) {
              this.findTestFiles(fullPath, testFiles, depth + 1, budget);
            }
          } else if (stat.isFile() && this.isTestFile(item)) {
            testFiles.push(fullPath.replace(dir + '/', ''));
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  private isTestFile(filename: string): boolean {
    return filename.includes('.test.') ||
           filename.includes('.spec.') ||
           filename.includes('_test.') ||
           filename.startsWith('test_');
  }

  private detectTestFramework(dir: string): string | undefined {
    try {
      const text = readSmall(join(dir, 'package.json'));
      if (text !== null) {
        const pkg = JSON.parse(text);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        if (deps.jest) return 'jest';
        if (deps.mocha) return 'mocha';
        if (deps.vitest) return 'vitest';
        if (deps.jasmine) return 'jasmine';
        if (deps.cypress) return 'cypress';
        if (deps.playwright) return 'playwright';
      }
    } catch {
      // No package.json or can't read it
    }
    
    // Check for Python test frameworks
    try {
      const content = readSmall(join(dir, 'requirements.txt'));
      if (content !== null) {
        if (content.includes('pytest')) return 'pytest';
        if (content.includes('unittest')) return 'unittest';
      }
    } catch {
      // No requirements.txt
    }
    
    return undefined;
  }

  private extractArchitecture(dir: string): ArchitectureInfo {
    const components: string[] = [];
    const fileTypes: Record<string, number> = {};
    const directories = this.buildDirectoryTree(dir, components, fileTypes);
    
    return {
      components: [...new Set(components)],
      directories,
      fileTypes
    };
  }

  private buildDirectoryTree(
    dir: string,
    components: string[],
    fileTypes: Record<string, number>,
    depth: number = 0,
    prefix: string = '',
    budget: Budget = { entries: MAX_SCAN_FILES }
  ): string {
    let result = '';
    
    if (depth > 3) return result; // Limit recursion depth
    
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        if (budget.entries-- <= 0) break;
        const fullPath = join(dir, item);
        
        try {
          const stat = lstatSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item)) {
              result += `${prefix}${item}/\n`;
              result += this.buildDirectoryTree(fullPath, components, fileTypes, depth + 1, prefix + '  ', budget);
            }
          } else if (stat.isFile()) {
            const ext = extname(item);
            if (this.codeExtensions.includes(ext)) {
              fileTypes[ext] = (fileTypes[ext] || 0) + 1;
              
              // Extract component names (files that might be components)
              if (item.match(/component|service|controller|model|view|page/i)) {
                components.push(item.replace(ext, ''));
              }
            }
            // Add files to tree
            result += `${prefix}${item}\n`;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Skip directories that can't be read
    }
    
    return result;
  }
}
