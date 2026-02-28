import { ProjectMigrator } from '../utils/projectMigrator';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

describe('ProjectMigrator', () => {
  let migrator: ProjectMigrator;
  let testDir: string;

  beforeEach(() => {
    migrator = new ProjectMigrator();
    testDir = join(os.tmpdir(), `specpilot-migrator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── checkMigrationNeeded ─────────────────────────────────────────────────

  describe('checkMigrationNeeded', () => {
    it('returns no_source when source directory does not exist', async () => {
      const result = await migrator.checkMigrationNeeded(testDir, 'complex', 'simple');
      expect(result.needed).toBe(false);
      expect(result.reason).toBe('no_source');
      expect(result.message).toBeDefined();
    });

    it('returns already_migrated when both source and target exist', async () => {
      mkdirSync(join(testDir, '.project-spec'), { recursive: true });
      mkdirSync(join(testDir, '.specs'), { recursive: true });

      const result = await migrator.checkMigrationNeeded(testDir, 'complex', 'simple');
      expect(result.needed).toBe(false);
      expect(result.reason).toBe('already_migrated');
    });

    it('returns ready when source exists but target does not', async () => {
      mkdirSync(join(testDir, '.project-spec'), { recursive: true });

      const result = await migrator.checkMigrationNeeded(testDir, 'complex', 'simple');
      expect(result.needed).toBe(true);
      expect(result.reason).toBe('ready');
    });

    it('works for simple → complex direction', async () => {
      mkdirSync(join(testDir, '.specs'), { recursive: true });

      const result = await migrator.checkMigrationNeeded(testDir, 'simple', 'complex');
      expect(result.needed).toBe(true);
      expect(result.reason).toBe('ready');
    });
  });

  // ─── validateSource ───────────────────────────────────────────────────────

  describe('validateSource', () => {
    it('returns false when source directory does not exist', async () => {
      expect(await migrator.validateSource(testDir, 'complex')).toBe(false);
      expect(await migrator.validateSource(testDir, 'simple')).toBe(false);
    });

    it('returns true when .project-spec directory exists', async () => {
      mkdirSync(join(testDir, '.project-spec'), { recursive: true });
      expect(await migrator.validateSource(testDir, 'complex')).toBe(true);
    });

    it('returns true when .specs directory exists', async () => {
      mkdirSync(join(testDir, '.specs'), { recursive: true });
      expect(await migrator.validateSource(testDir, 'simple')).toBe(true);
    });
  });

  // ─── migrate ──────────────────────────────────────────────────────────────

  describe('migrate', () => {
    it('throws when source directory does not exist', async () => {
      await expect(migrator.migrate(testDir, { from: 'complex', to: 'simple' }))
        .rejects.toThrow();
    });

    it('maps flat files into correct subfolders when migrating complex → simple', async () => {
      const sourceDir = join(testDir, '.project-spec');
      mkdirSync(sourceDir, { recursive: true });

      writeFileSync(join(sourceDir, 'project.yaml'),    'name: test\nversion: "1.0"\nlanguage: typescript');
      writeFileSync(join(sourceDir, 'requirements.md'), '# Requirements\nUser Stories here.\n');
      writeFileSync(join(sourceDir, 'architecture.md'), '# Architecture\n## Overview\n');
      writeFileSync(join(sourceDir, 'tasks.md'),        '# Tasks\nIn Progress: setup\n');

      const result = await migrator.migrate(testDir, { from: 'complex', to: 'simple' });

      const targetDir = join(testDir, '.specs');
      expect(existsSync(targetDir)).toBe(true);
      expect(existsSync(join(targetDir, 'project',      'project.yaml'))).toBe(true);
      expect(existsSync(join(targetDir, 'project',      'requirements.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'architecture', 'architecture.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'planning',     'tasks.md'))).toBe(true);
      expect(result.filesMigrated).toBeGreaterThan(0);
    });

    it('creates missing required files after migration', async () => {
      const sourceDir = join(testDir, '.project-spec');
      mkdirSync(sourceDir, { recursive: true });
      // Only provide project.yaml; everything else should be created
      writeFileSync(join(sourceDir, 'project.yaml'), 'name: x\nversion: "1.0"\nlanguage: typescript');

      const result = await migrator.migrate(testDir, { from: 'complex', to: 'simple' });

      // createMissingSimpleFiles should fill in the gaps
      expect(result.filesCreated).toBeGreaterThan(0);
      expect(existsSync(join(testDir, '.specs', 'development', 'prompts.md'))).toBe(true);
    });

    it('merges content when target file already exists', async () => {
      const sourceDir = join(testDir, '.project-spec');
      const targetDir = join(testDir, '.specs');

      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(join(targetDir, 'project'), { recursive: true });
      mkdirSync(join(targetDir, 'architecture'), { recursive: true });
      mkdirSync(join(targetDir, 'planning'), { recursive: true });
      mkdirSync(join(targetDir, 'quality'), { recursive: true });
      mkdirSync(join(targetDir, 'development'), { recursive: true });

      writeFileSync(join(sourceDir, 'requirements.md'), 'SOURCE CONTENT');
      writeFileSync(join(targetDir, 'project', 'requirements.md'), 'EXISTING CONTENT');

      const result = await migrator.migrate(testDir, { from: 'complex', to: 'simple' });

      const merged = readFileSync(join(targetDir, 'project', 'requirements.md'), 'utf-8');
      expect(merged).toContain('EXISTING CONTENT');
      expect(merged).toContain('SOURCE CONTENT');
      expect(result.filesMerged).toBeGreaterThan(0);
    });
  });
});
