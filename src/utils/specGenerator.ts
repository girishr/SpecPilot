import { join } from 'path';
import { mkdirSync } from 'fs';
import { TemplateEngine, TemplateContext } from './templateEngine';
import { SpecFileGenerator } from './specFileGenerator';
import { IdeConfigGenerator } from './ideConfigGenerator';
import { AgentConfigGenerator } from './agentConfigGenerator';

export interface SpecGeneratorOptions {
  projectName: string;
  language: string;
  framework?: string;
  targetDir: string;
  specsName: string;
  author?: string;
  description?: string;
  ide?: string;
  mode?: 'new' | 'existing';
  projectContext?: {
    whatItDoes: string;
    targetUsers: string;
    expectedScale: string;
    constraints: string;
  };
  analysis?: {
    todos: Array<{ file: string; line: number; text: string; type: string }>;
    tests: {
      framework?: string;
      testFiles: string[];
      testCount: number;
      hasE2E: boolean;
      hasUnit: boolean;
      hasIntegration: boolean;
    };
    architecture: {
      components: string[];
      directories: string;
      fileTypes: Record<string, number>;
    };
  };
}

const AGENT_IDES = new Set(['cowork', 'codex']);

export class SpecGenerator {
  private specFileGenerator: SpecFileGenerator;
  private ideConfigGenerator: IdeConfigGenerator;
  private agentConfigGenerator: AgentConfigGenerator;

  constructor(private templateEngine: TemplateEngine) {
    this.specFileGenerator = new SpecFileGenerator(templateEngine);
    this.ideConfigGenerator = new IdeConfigGenerator();
    this.agentConfigGenerator = new AgentConfigGenerator(templateEngine);
  }

  async generateSpecs(options: SpecGeneratorOptions): Promise<void> {
    const specsDir = join(options.targetDir, options.specsName);
    mkdirSync(specsDir, { recursive: true });
    const subfolders = ['project', 'architecture', 'planning', 'quality', 'development', 'security'];
    subfolders.forEach(sub => mkdirSync(join(specsDir, sub), { recursive: true }));
    const context: TemplateContext = {
      projectName: options.projectName,
      language: options.language,
      framework: options.framework,
      author: options.author || 'Your Name',
      description: options.description || ('A ' + options.language + ' project' + (options.framework ? ' using ' + options.framework : '')),
      lastUpdated: new Date().toISOString().split('T')[0],
      contributors: [options.author || 'Your Name'],
      architecture: options.analysis && options.analysis.architecture,
      ide: options.ide || 'vscode',
      mode: options.mode || 'new',
      projectContext: options.projectContext,
    };
    await this.specFileGenerator.generateAll(specsDir, context);
    const ide = (options.ide || 'vscode').toLowerCase();
    if (AGENT_IDES.has(ide)) {
      await this.agentConfigGenerator.generate(options.targetDir, context, ide);
    } else {
      await this.ideConfigGenerator.generate(options.targetDir, context, ide);
    }
    // Always generate .github/copilot-instructions.md regardless of IDE choice —
    // it is read automatically by Copilot, Cursor, and other AI tools on every request.
    await this.ideConfigGenerator.generateCopilotInstructions(options.targetDir, context);
  }
}
