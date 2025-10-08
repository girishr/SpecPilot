import { SpecGenerator } from '../utils/specGenerator';
import { TemplateEngine } from '../utils/templateEngine';
import { join } from 'path';
import { existsSync, readFileSync, rmSync } from 'fs';

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
      'project/project-plan.md'
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
});