import { keepReport, SpecGenerator } from '../utils/specGenerator';
import { writeNew } from '../utils/ideConfigGenerator';
import { refineCommand } from '../commands/refine';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';
import { existsSync, lstatSync, readFileSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import inquirer from 'inquirer';

describe('SpecGenerator', () => {
  let specGenerator: SpecGenerator;
  let testDir: string;

  beforeEach(() => {
    specGenerator = new SpecGenerator();
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
      apiParadigm: 'rest' as const,
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
    expect(content).toContain('Code Philosophy — Write Only What Needed');
    expect(content).toContain('Code Rules');
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
    // CS-071: Common Commands and AI Agent Guidelines removed
    expect(content).not.toContain('## Common Commands');
    expect(content).not.toContain('## AI Agent Guidelines');
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

  // BL-073: an existing file outside .specs/ is kept, never overwritten, and reported

  test('copilot-instructions.md present → kept byte for byte, no question asked, listed in kept', async () => {
    const githubDir = join(testDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const copilotPath = join(githubDir, 'copilot-instructions.md');
    const original = '# Existing instructions\n\nSome existing content';
    writeFileSync(copilotPath, original);
    const promptSpy = jest.spyOn(inquirer, 'prompt');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { kept } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    expect(promptSpy).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(readFileSync(copilotPath, 'utf-8')).toBe(original);
    expect(kept).toEqual(['.github/copilot-instructions.md']);
  });

  test('fresh folder → kept is empty and .gitattributes is created, not appended', async () => {
    const { kept, appended } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });
    expect(kept).toEqual([]);
    expect(appended).toBe(0);
    expect(keepReport({ kept, appended })).toEqual([]);
  });

  test('existing .vscode/settings.json → kept untouched, extensions.json still created', async () => {
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const settings = join(testDir, '.vscode', 'settings.json');
    writeFileSync(settings, '{ "mine": true }\n');

    const { kept } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    expect(readFileSync(settings, 'utf-8')).toBe('{ "mine": true }\n');
    expect(existsSync(join(testDir, '.vscode', 'extensions.json'))).toBe(true);
    expect(kept).toEqual(['.vscode/settings.json']);
  });

  test('existing specpilot-* command file → kept untouched and listed', async () => {
    const dir = join(testDir, '.claude', 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'specpilot-status.md'), 'my edited command\n');

    const { kept } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'claude-code' });

    expect(readFileSync(join(dir, 'specpilot-status.md'), 'utf-8')).toBe('my edited command\n');
    expect(kept).toEqual(['.claude/commands/specpilot-status.md']);
  });

  test('dangling symbolic link at a target → not written through, listed as kept', async () => {
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const target = join(testDir, 'outside-target.json');
    symlinkSync(target, join(testDir, '.vscode', 'settings.json'));

    const { kept } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    expect(existsSync(target)).toBe(false);
    expect(lstatSync(join(testDir, '.vscode', 'settings.json')).isSymbolicLink()).toBe(true);
    expect(kept).toEqual(['.vscode/settings.json']);
  });

  test('existing .gitattributes → missing merge=union lines appended and counted, not kept', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, '.gitattributes'), '*.png binary\n.specs/planning/tasks.md merge=union\n');

    const result = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    expect(result.appended).toBe(2);
    expect(result.kept).not.toContain('.gitattributes');
    expect(readFileSync(join(testDir, '.gitattributes'), 'utf-8')).toBe(
      '*.png binary\n.specs/planning/tasks.md merge=union\n.specs/development/prompts*.md merge=union\nCHANGELOG.md merge=union\n',
    );
    expect(keepReport(result)).toEqual(['Appended 2 lines to .gitattributes']);
  });

  test('keepReport → kept line names the paths in order; one appended line is singular', () => {
    expect(keepReport({ kept: ['CLAUDE.md', '.claude/commands/specpilot-status.md'], appended: 1 })).toEqual([
      'Kept as they were: CLAUDE.md, .claude/commands/specpilot-status.md. Run specpilot backfill to add missing SpecPilot sections to the instruction and command files.',
      'Appended 1 line to .gitattributes',
    ]);
  });

  test('writeNew → creates a missing file, keeps an existing one (EEXIST), rethrows any other error', () => {
    mkdirSync(testDir, { recursive: true });
    const file = join(testDir, 'f.txt');
    expect(writeNew(file, 'one')).toBe(true);
    expect(writeNew(file, 'two')).toBe(false);
    expect(readFileSync(file, 'utf-8')).toBe('one');
    expect(() => writeNew(join(testDir, 'missing-dir', 'f.txt'), 'x')).toThrow(/ENOENT/);
  });

  test('refine --update keeps an existing .vscode/settings.json and prints the kept line', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });
    const settings = join(testDir, '.vscode', 'settings.json');
    writeFileSync(settings, '{ "mine": true }\n');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await refineCommand('A new description', { dir: testDir, specsName: '.specs', prompts: false, update: true });

    expect(readFileSync(settings, 'utf-8')).toBe('{ "mine": true }\n');
    const out = log.mock.calls.map(c => stripVTControlCharacters(String(c[0])));
    expect(out.some(l => l.startsWith('Kept as they were: .vscode/settings.json, .vscode/extensions.json, .github/copilot-instructions.md, '))).toBe(true);
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

  // CS-070: api.yaml conditional generation

  test('api.yaml generated with REST section when apiParadigm=rest', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, apiParadigm: 'rest' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('openapi:');
    expect(content).not.toContain('cli:');
    expect(content).not.toContain('graphql:');
  });

  test('api.yaml generated with CLI section when apiParadigm=cli', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, apiParadigm: 'cli' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('cli:');
    expect(content).not.toContain('openapi:');
    expect(content).not.toContain('graphql:');
  });

  test('api.yaml generated with GraphQL section when apiParadigm=graphql', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, apiParadigm: 'graphql' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('graphql:');
    expect(content).not.toContain('openapi:');
    expect(content).not.toContain('cli:');
  });

  test('api.yaml skipped entirely when apiParadigm=none', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, apiParadigm: 'none' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(false);
  });

  test('api.yaml infers rest from express framework under --no-prompts', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, framework: 'express' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('openapi:');
  });

  test('api.yaml infers none from react framework under --no-prompts', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, framework: 'react' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(false);
  });

  test('explicit apiParadigm overrides framework inference', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, framework: 'react', apiParadigm: 'graphql' });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('graphql:');
  });

  test('api.yaml defaults to rest when no framework and no apiParadigm', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir });

    const apiPath = join(testDir, '.specs', 'architecture', 'api.yaml');
    expect(existsSync(apiPath)).toBe(true);
    const content = readFileSync(apiPath, 'utf-8');
    expect(content).toContain('openapi:');
  });

  // CS-059: CLAUDE.md generation for Claude Code

  test('CLAUDE.md absent, claude-code → writes full router file', async () => {
    await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'claude-code' });

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

  test('CLAUDE.md present → kept byte for byte, no question asked, listed in kept', async () => {
    mkdirSync(testDir, { recursive: true });
    const original = '# My existing CLAUDE.md\n\nExisting content';
    writeFileSync(join(testDir, 'CLAUDE.md'), original);
    const promptSpy = jest.spyOn(inquirer, 'prompt');

    const { kept } = await specGenerator.generateSpecs({ ...baseOptions, targetDir: testDir, ide: 'claude-code' });

    expect(promptSpy).not.toHaveBeenCalled();
    expect(readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')).toBe(original);
    expect(kept).toEqual(['CLAUDE.md']);
  });
});