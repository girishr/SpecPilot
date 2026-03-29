import { SpecGenerator } from '../utils/specGenerator';
import { TemplateEngine } from '../utils/templateEngine';
import { join } from 'path';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import inquirer from 'inquirer';

describe('SpecGenerator', () => {
  let specGenerator: SpecGenerator;
  let testDir: string;

  beforeEach(() => {
    const templateEngine = new TemplateEngine();
    specGenerator = new SpecGenerator(templateEngine);
    testDir = join(__dirname, 'test-output');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  test('should generate all spec files', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      framework: 'react',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const specsDir = join(testDir, '.specs');
    expect(existsSync(specsDir)).toBe(true);

    const requiredFiles = [
      'project/project.yaml',
      'architecture/architecture.md',
      'project/requirements.md',
      'architecture/api.yaml',
      'quality/tests.md',
      'planning/tasks.md',
      'development/context.md',
      'development/prompts.md',
      'development/docs.md'
    ];

    for (const file of requiredFiles) {
      const filePath = join(specsDir, file);
      expect(existsSync(filePath)).toBe(true);
      
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('test-project');
      if (file.endsWith('.md')) {
        expect(content.startsWith('---')).toBe(true);
      }
    }
  });

  test('should generate .github/copilot-instructions.md with critical mandates', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const copilotPath = join(testDir, '.github', 'copilot-instructions.md');
    expect(existsSync(copilotPath)).toBe(true);

    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toContain('test-project');
    expect(content).toContain('NEVER commit');
    expect(content).toContain('NEVER push');
    expect(content).toContain('NEVER deploy');
    expect(content).toContain('NEVER modify');
    expect(content).toContain('ALWAYS update');
    expect(content).toContain('.specs/project/project.yaml');
  });

  test('should include mandate in prompts.md', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const promptsPath = join(testDir, '.specs', 'development', 'prompts.md');
    const content = readFileSync(promptsPath, 'utf-8');
    
    expect(content).toContain('MANDATE');
    expect(content).toContain('AI interactions');
    expect(content).toContain('prompts.md');
  });

  test('should include application structure placeholder when analysis missing', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const architecturePath = join(testDir, '.specs', 'architecture', 'architecture.md');
    const content = readFileSync(architecturePath, 'utf-8');

    expect(content).toContain('[ADD YOUR APPLICATION STRUCTURE TREE HERE]');
  });

  test('should generate security/threat-model.md with front-matter', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const filePath = join(testDir, '.specs', 'security', 'threat-model.md');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('fileID: SEC-001');
    expect(content).toContain('# Threat Model');
    expect(content).toContain('## Threat Model [SEC-002]');
    expect(content).toContain('## Attack Surface Summary [SEC-003]');
    expect(content).toContain('## Out of Scope [SEC-004]');
  });

  test('should generate security/security-decisions.md with front-matter', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const filePath = join(testDir, '.specs', 'security', 'security-decisions.md');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('fileID: SEC-002');
    expect(content).toContain('# Security Decisions');
    expect(content).toContain('## Decisions [SEC-002.1]');
    expect(content).toContain('ADR-001');
    expect(content).toContain('ADR-002');
  });

  // CS-047: Handle existing copilot-instructions.md during add-specs

  const baseOptions = {
    projectName: 'test-project',
    language: 'typescript',
    specsName: '.specs',
  };

  test('copilot-instructions.md absent → writes full file', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const copilotPath = join(testDir, '.github', 'copilot-instructions.md');
    expect(existsSync(copilotPath)).toBe(true);
    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toContain('NEVER commit');
    expect(content).toContain('test-project');
  });

  test('copilot-instructions.md present, prompt=overwrite → overwrites file', async () => {
    const githubDir = join(testDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const copilotPath = join(githubDir, 'copilot-instructions.md');
    writeFileSync(copilotPath, '# Existing instructions\n\nSome existing content');

    jest.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ action: 'o' });

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, noPrompts: false });

    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toContain('NEVER commit');
    expect(content).not.toContain('Some existing content');
  });

  test('copilot-instructions.md present, prompt=append → appends SpecPilot section', async () => {
    const githubDir = join(testDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const copilotPath = join(githubDir, 'copilot-instructions.md');
    writeFileSync(copilotPath, '# Existing instructions\n\nSome existing content');

    jest.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ action: 'a' });

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, noPrompts: false });

    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toContain('Some existing content');
    expect(content).toContain('SpecPilot Mandates');
    expect(content).toContain('NEVER commit');
  });

  test('copilot-instructions.md present, prompt=skip → leaves file unchanged', async () => {
    const githubDir = join(testDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const copilotPath = join(githubDir, 'copilot-instructions.md');
    const original = '# Existing instructions\n\nSome existing content';
    writeFileSync(copilotPath, original);

    jest.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ action: 's' });

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, noPrompts: false });

    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toBe(original);
  });

  test('copilot-instructions.md present, noPrompts=true → auto-skips, file unchanged', async () => {
    const githubDir = join(testDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const copilotPath = join(githubDir, 'copilot-instructions.md');
    const original = '# Existing instructions\n\nSome existing content';
    writeFileSync(copilotPath, original);

    const promptSpy = jest.spyOn(inquirer, 'prompt');

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, noPrompts: true });

    expect(promptSpy).not.toHaveBeenCalled();
    const content = readFileSync(copilotPath, 'utf-8');
    expect(content).toBe(original);
  });
});