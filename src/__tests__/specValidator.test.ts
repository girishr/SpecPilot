import { SpecValidator } from '../utils/specValidator';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

const CURRENT_YEAR = new Date().getFullYear().toString();

/**
 * Creates a fully valid .specs directory that satisfies every check in
 * SpecValidator: required files, project.yaml structure, mandate rules,
 * YAML front-matter on all .md files, and cross-reference strings.
 */
function createValidSpecsDir(baseDir: string): string {
  const specsDir = join(baseDir, '.specs');
  ['project', 'architecture', 'planning', 'quality', 'development'].forEach(sub =>
    mkdirSync(join(specsDir, sub), { recursive: true })
  );

  // project.yaml — needs name, version, language, and a MANDATE rule for prompts.md
  writeFileSync(join(specsDir, 'project', 'project.yaml'), [
    'name: my-app',
    'version: "1.0.0"',
    'language: typescript',
    'description: A test application',
    'rules:',
    '  - "Follow best practices"',
    '  - "MANDATE: Update prompts.md with all AI interactions for prompt tracking"',
  ].join('\n'));

  // architecture.md — needs front-matter + sections: Overview, Architecture, Components, Decisions
  writeFileSync(join(specsDir, 'architecture', 'architecture.md'), [
    '---',
    'title: Architecture',
    '---',
    '# Architecture',
    '## Overview',
    'High-level overview.',
    '## Architecture',
    'Layered architecture.',
    '## Components',
    '- Web layer',
    '- Service layer',
    '## Decisions',
    '- ADR-001: Use TypeScript',
  ].join('\n'));

  // api.yaml — not a .md so no front-matter check
  writeFileSync(join(specsDir, 'architecture', 'api.yaml'),
    'openapi: 3.0.0\ninfo:\n  title: API\n  version: 1.0.0\npaths: {}\n'
  );

  // requirements.md — front-matter + refs: architecture.md, api.yaml, project.yaml
  // + "User Stories" or "Functional Requirements" to avoid warning
  writeFileSync(join(specsDir, 'project', 'requirements.md'), [
    '---',
    'title: Requirements',
    '---',
    '# Requirements',
    '<!-- refs: architecture.md api.yaml project.yaml -->',
    '## User Stories',
    '- As a user I want to see the dashboard.',
    '## Functional Requirements',
    '- FR-001: The system shall...',
  ].join('\n'));

  // tests.md — front-matter + refs: requirements.md, project.yaml + task status markers
  writeFileSync(join(specsDir, 'quality', 'tests.md'), [
    '---',
    'title: Tests',
    '---',
    '# Tests',
    '<!-- refs: requirements.md project.yaml -->',
    '## Status',
    'In Progress: unit tests',
    'Completed: integration setup',
  ].join('\n'));

  // tasks.md — front-matter + refs: roadmap.md, requirements.md, project.yaml + status markers
  writeFileSync(join(specsDir, 'planning', 'tasks.md'), [
    '---',
    'title: Tasks',
    '---',
    '# Tasks',
    '<!-- refs: roadmap.md requirements.md project.yaml -->',
    '## Status',
    'In Progress: feature A',
    'Completed: project init',
  ].join('\n'));

  // context.md — front-matter + refs: docs.md, roadmap.md, project.yaml
  writeFileSync(join(specsDir, 'development', 'context.md'), [
    '---',
    'title: Context',
    '---',
    '# Development Context',
    '<!-- refs: docs.md roadmap.md project.yaml -->',
    'Working context for AI assistants.',
  ].join('\n'));

  // prompts.md — front-matter + refs: context.md, project.yaml
  //            + length > 100, contains CURRENT_YEAR, contains "MANDATE" + "AI interaction"
  const promptsBody = [
    '---',
    'title: Prompts',
    '---',
    '# AI Interaction Log',
    `Last updated: ${CURRENT_YEAR}-01-01`,
    '<!-- refs: context.md project.yaml -->',
    '**MANDATE**: Track all AI interactions.',
    '',
    `## ${CURRENT_YEAR}-01-01 — Initial setup`,
    'AI interaction: Initialized the project.',
    'This file documents all AI interactions for full development traceability.',
    'All prompts and responses are recorded here for audit purposes.',
  ].join('\n');
  // Pad to ensure length > 100
  writeFileSync(join(specsDir, 'development', 'prompts.md'), promptsBody.padEnd(200, '\n'));

  // docs.md — front-matter + refs: context.md, roadmap.md, tasks.md, project.yaml
  writeFileSync(join(specsDir, 'development', 'docs.md'), [
    '---',
    'title: Docs',
    '---',
    '# Documentation',
    '<!-- refs: context.md roadmap.md tasks.md project.yaml -->',
    'Developer documentation.',
  ].join('\n'));

  // project-plan.md — front-matter + refs: roadmap.md, tasks.md
  writeFileSync(join(specsDir, 'project', 'project-plan.md'), [
    '---',
    'title: Project Plan',
    '---',
    '# Project Plan',
    '<!-- refs: roadmap.md tasks.md -->',
    'Project planning overview.',
  ].join('\n'));

  return specsDir;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SpecValidator', () => {
  let validator: SpecValidator;
  let testDir: string;

  beforeEach(() => {
    validator = new SpecValidator();
    testDir = join(os.tmpdir(), `specpilot-validator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── Missing .specs directory ─────────────────────────────────────────────

  it('returns isValid=false when no .specs directory exists', async () => {
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('No .specs directory found in project');
  });

  it('recognises alternative directory names (.project-spec)', async () => {
    mkdirSync(join(testDir, '.project-spec'), { recursive: true });
    // No files inside — but the dir is found
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const notFoundError = result.errors.find(e => e === 'No .specs directory found in project');
    expect(notFoundError).toBeUndefined();
  });

  // ─── Missing required files ───────────────────────────────────────────────

  it('reports errors for all missing required files', async () => {
    const specsDir = join(testDir, '.specs');
    ['project', 'architecture', 'planning', 'quality', 'development'].forEach(sub =>
      mkdirSync(join(specsDir, sub), { recursive: true })
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.isValid).toBe(false);
    const missingErrors = result.errors.filter(e => e.startsWith('Missing required file'));
    expect(missingErrors.length).toBe(10); // all 10 required files missing
  });

  it('counts only files that exist in filesChecked', async () => {
    const specsDir = join(testDir, '.specs');
    mkdirSync(join(specsDir, 'project'), { recursive: true });
    // Only create project.yaml (but without mandatory fields so still fails)
    writeFileSync(join(specsDir, 'project', 'project.yaml'), 'name: x\nversion: "1.0"\nlanguage: ts');

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.filesChecked).toBe(1);
  });

  // ─── project.yaml validation ──────────────────────────────────────────────

  it('fails when project.yaml is missing required fields', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'description: oops only\n');

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.isValid).toBe(false);
    const fieldErrors = result.errors.filter(e => e.includes('missing required field'));
    // name, version, language all missing
    expect(fieldErrors.length).toBeGreaterThanOrEqual(3);
  });

  it('warns when project.yaml has no rules section', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'),
      'name: x\nversion: "1.0.0"\nlanguage: typescript\n'
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const ruleWarn = result.warnings.find(w => w.includes('rules section'));
    expect(ruleWarn).toBeDefined();
  });

  it('fails when project.yaml rules lack the prompt mandate', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'), [
      'name: my-app',
      'version: "1.0.0"',
      'language: typescript',
      'rules:',
      '  - "Do your best"',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('MANDATE'))).toBe(true);
    expect(result.fixable).toContain('add-mandates');
  });

  it('passes mandate check when rules contain MANDATE + prompts.md reference', async () => {
    createValidSpecsDir(testDir);
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const mandateErrors = result.errors.filter(e => e.includes('MANDATE'));
    expect(mandateErrors).toHaveLength(0);
  });

  // ─── autoFix ──────────────────────────────────────────────────────────────

  it('autoFix adds mandate to project.yaml when add-mandates is requested', async () => {
    createValidSpecsDir(testDir);
    // Replace rules with one that has no mandate
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'), [
      'name: my-app',
      'version: "1.0.0"',
      'language: typescript',
      'rules:',
      '  - "Write tests"',
    ].join('\n'));

    const fixed = await validator.autoFix(testDir, ['add-mandates']);
    expect(fixed).toContain('add-mandates');

    // Re-validate — mandate error should now be gone
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const mandateErrors = result.errors.filter(e => e.includes('MANDATE') && e.includes('project.yaml'));
    expect(mandateErrors).toHaveLength(0);
  });

  it('autoFix silently skips unknown fix tokens', async () => {
    createValidSpecsDir(testDir);
    const fixed = await validator.autoFix(testDir, ['unknown-fix-token']);
    expect(fixed).not.toContain('unknown-fix-token');
  });

  it('autoFix returns empty array when no .specs dir exists', async () => {
    const fixed = await validator.autoFix(testDir, ['add-mandates']);
    expect(fixed).toHaveLength(0);
  });

  // ─── Content quality warnings ─────────────────────────────────────────────

  it('warns when architecture.md is missing required sections', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'architecture', 'architecture.md'),
      '---\ntitle: Arch\n---\n# Architecture\n\nSparse content with no key sections.\n'
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const archWarn = result.warnings.find(w => w.includes('architecture.md missing sections'));
    expect(archWarn).toBeDefined();
  });

  it('warns when requirements.md contains placeholder text', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'requirements.md'), [
      '---',
      'title: Requirements',
      '---',
      '# Requirements',
      '<!-- refs: architecture.md api.yaml project.yaml -->',
      '[Placeholder content goes here]',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('placeholder'));
    expect(warn).toBeDefined();
  });

  it('warns when requirements.md lacks user stories or functional requirements', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'requirements.md'), [
      '---',
      'title: Requirements',
      '---',
      '# Requirements',
      '<!-- refs: architecture.md api.yaml project.yaml -->',
      'Just some text with no user stories section.',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('user stories') || w.includes('functional requirements'));
    expect(warn).toBeDefined();
  });

  it('warns when tasks.md has no status markers', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), [
      '---',
      'title: Tasks',
      '---',
      '# Tasks',
      '<!-- refs: roadmap.md requirements.md project.yaml -->',
      '- Task 1',
      '- Task 2',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('task status'));
    expect(warn).toBeDefined();
  });

  // ─── Mandate tracking ─────────────────────────────────────────────────────

  it('increments mandatesVerified for compliant project.yaml and prompts.md', async () => {
    createValidSpecsDir(testDir);
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.mandatesVerified).toBeGreaterThan(0);
  });

  it('warns when prompts.md has minimal content (< 100 chars)', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'development', 'prompts.md'),
      `---\ntitle: P\n---\n# Prompts\n<!-- refs: context.md project.yaml -->\nShort.\n`
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('minimal content'));
    expect(warn).toBeDefined();
  });
});
