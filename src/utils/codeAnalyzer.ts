import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname } from 'path';

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
  directories: string[];
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

  async analyzeCodebase(projectDir: string = process.cwd()): Promise<AnalysisResult> {
    return {
      todos: this.findTodos(projectDir),
      tests: this.analyzeTests(projectDir),
      architecture: this.extractArchitecture(projectDir)
    };
  }

  private findTodos(dir: string, todos: TodoItem[] = []): TodoItem[] {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        
        try {
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item)) {
              this.findTodos(fullPath, todos);
            }
          } else if (this.codeExtensions.includes(extname(item))) {
            const content = readFileSync(fullPath, 'utf-8');
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
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    } catch (error) {
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
        const content = readFileSync(join(dir, file), 'utf-8');
        
        // Count test cases
        const testMatches = content.match(/\b(test|it|describe)\s*\(/g);
        if (testMatches) {
          testCount += testMatches.length;
        }
        
        // Categorize tests
        if (file.includes('e2e') || file.includes('integration')) {
          hasE2E = true;
        } else if (file.includes('integration')) {
          hasIntegration = true;
        } else {
          hasUnit = true;
        }
      } catch (error) {
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

  private findTestFiles(dir: string, testFiles: string[]): void {
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        
        try {
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item)) {
              this.findTestFiles(fullPath, testFiles);
            }
          } else if (this.isTestFile(item)) {
            testFiles.push(fullPath.replace(dir + '/', ''));
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
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
      const packageJsonPath = join(dir, 'package.json');
      if (statSync(packageJsonPath).isFile()) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        if (deps.jest) return 'jest';
        if (deps.mocha) return 'mocha';
        if (deps.vitest) return 'vitest';
        if (deps.jasmine) return 'jasmine';
        if (deps.cypress) return 'cypress';
        if (deps.playwright) return 'playwright';
      }
    } catch (error) {
      // No package.json or can't read it
    }
    
    // Check for Python test frameworks
    try {
      const requirementsPath = join(dir, 'requirements.txt');
      if (statSync(requirementsPath).isFile()) {
        const content = readFileSync(requirementsPath, 'utf-8');
        if (content.includes('pytest')) return 'pytest';
        if (content.includes('unittest')) return 'unittest';
      }
    } catch (error) {
      // No requirements.txt
    }
    
    return undefined;
  }

  private extractArchitecture(dir: string): ArchitectureInfo {
    const components: string[] = [];
    const directories: string[] = [];
    const fileTypes: Record<string, number> = {};
    
    this.scanDirectory(dir, components, directories, fileTypes);
    
    return {
      components: [...new Set(components)],
      directories: directories.filter(d => !this.excludeDirs.includes(d)),
      fileTypes
    };
  }

  private scanDirectory(
    dir: string,
    components: string[],
    directories: string[],
    fileTypes: Record<string, number>,
    depth: number = 0
  ): void {
    if (depth > 3) return; // Limit recursion depth
    
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        
        try {
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            if (!this.excludeDirs.includes(item)) {
              directories.push(item);
              this.scanDirectory(fullPath, components, directories, fileTypes, depth + 1);
            }
          } else {
            const ext = extname(item);
            if (this.codeExtensions.includes(ext)) {
              fileTypes[ext] = (fileTypes[ext] || 0) + 1;
              
              // Extract component names (files that might be components)
              if (item.match(/component|service|controller|model|view|page/i)) {
                components.push(item.replace(ext, ''));
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }
}
