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
      'development/docs.md',
      'development/onboarding.md',
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
    expect(content).toContain('No commit unless asked');
    expect(content).toContain('No push unless asked');
    expect(content).toContain('No deploy/publish/release unless asked');
    expect(content).toContain('No `.specs/` structure changes');
    expect(content).toContain('Update specs after change');
    expect(content).toContain('Spec Report');
    expect(content).toContain('yes, proceed');
    expect(content).toContain('.specs/project/project.yaml');
  });

  test('should generate project.yaml pointing to AI agent config for mandates', async () => {
    const options = {
      projectName: 'test-project',
      language: 'typescript',
      targetDir: testDir,
      specsName: '.specs'
    };

    await specGenerator.generateSpecs(options);

    const projectYamlPath = join(testDir, '.specs', 'project', 'project.yaml');
    const content = readFileSync(projectYamlPath, 'utf-8');

    expect(content).toContain('Rules and mandates: see your AI agent configuration file');
    expect(content).not.toContain('MANDATE:');
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
    expect(content).toContain('No commit unless asked');
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
    expect(content).toContain('No commit unless asked');
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
    expect(content).toContain('No commit unless asked');
    expect(content).toContain('Spec Report');
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

  // CS-068: onboarding.md + greenfield/brownfield prompt selection

  test('onboarding.md defaults to greenfield when no projectType set', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('Greenfield');
    expect(content).toContain('new project');
    expect(content).toContain('Begin drafting now.');
    expect(content).not.toContain('Begin your analysis now.');
  });

  test('onboarding.md uses greenfield prompt when projectType=greenfield', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, projectType: 'greenfield' });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('Greenfield');
    expect(content).toContain('Begin drafting now.');
  });

  test('onboarding.md uses brownfield prompt when projectType=brownfield', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, projectType: 'brownfield' });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('Brownfield');
    expect(content).toContain('Begin your analysis now.');
    expect(content).not.toContain('Begin drafting now.');
  });

  test('onboarding.md defaults to brownfield when mode=existing and no projectType', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, mode: 'existing' });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('Brownfield');
    expect(content).toContain('Begin your analysis now.');
  });

  test('explicit projectType overrides mode-based default', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, mode: 'existing', projectType: 'greenfield' });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('Greenfield');
    expect(content).toContain('Begin drafting now.');
  });

  test('onboarding.md contains self-destruct instruction', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const content = readFileSync(join(testDir, '.specs', 'development', 'onboarding.md'), 'utf-8');
    expect(content).toContain('One-time file — delete after use');
    expect(content).toContain('delete `.specs/development/onboarding.md`');
  });

  test('generateSpecs returns onboardingPrompt string', async () => {
    const result = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    expect(typeof result.onboardingPrompt).toBe('string');
    expect(result.onboardingPrompt.length).toBeGreaterThan(100);
  });

  test('generateSpecs returns greenfield prompt text', async () => {
    const result = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, projectType: 'greenfield' });
    expect(result.onboardingPrompt).toContain('Begin drafting now.');
  });

  test('generateSpecs returns brownfield prompt text', async () => {
    const result = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, projectType: 'brownfield' });
    expect(result.onboardingPrompt).toContain('Begin your analysis now.');
  });

  test('prompts.md no longer contains onboarding prompt sections', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const content = readFileSync(join(testDir, '.specs', 'development', 'prompts.md'), 'utf-8');
    expect(content).not.toContain('Begin drafting now.');
    expect(content).not.toContain('Begin your analysis now.');
    expect(content).not.toContain('Onboarding Prompt');
    expect(content).not.toContain('specification co-pilot for a new project');
  });

  test('README points to onboarding.md not prompts.md for quick start', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const readme = readFileSync(join(testDir, '.specs', 'README.md'), 'utf-8');
    expect(readme).toContain('onboarding.md');
    expect(readme).not.toContain('Onboarding Prompt" section');
  });

  // CS-059: CLAUDE.md generation for Cowork IDE

  test('CLAUDE.md absent, cowork → writes full router file', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'cowork', noPrompts: true });

    const claudePath = join(testDir, 'CLAUDE.md');
    expect(existsSync(claudePath)).toBe(true);

    const content = readFileSync(claudePath, 'utf-8');
    expect(content).toContain('test-project');
    expect(content).toContain('No commit unless asked');
    expect(content).toContain('No push unless asked');
    expect(content).toContain('Spec Report');
    expect(content).toContain('.specs/project/project.yaml');
    expect(content).toContain('Re-Anchor');
  });

  test('CLAUDE.md present, noPrompts=true → auto-skips, file unchanged', async () => {
    mkdirSync(testDir, { recursive: true });
    const original = '# My existing CLAUDE.md\n\nExisting content';
    writeFileSync(join(testDir, 'CLAUDE.md'), original);

    const promptSpy = jest.spyOn(inquirer, 'prompt');

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'cowork', noPrompts: true });

    expect(promptSpy).not.toHaveBeenCalled();
    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe(original);
  });

  test('CLAUDE.md present, prompt=skip → leaves file unchanged', async () => {
    mkdirSync(testDir, { recursive: true });
    const original = '# My existing CLAUDE.md\n\nExisting content';
    writeFileSync(join(testDir, 'CLAUDE.md'), original);

    jest.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ action: 's' });

    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'cowork', noPrompts: false });

    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe(original);
  });
});