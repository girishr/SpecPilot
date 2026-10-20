import { SpecValidator, tasksChecks } from '../utils/specValidator';
import { SpecGenerator } from '../utils/specGenerator';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

const CURRENT_YEAR = new Date().getFullYear().toString();

/**
 * Creates a fully valid .specs directory that satisfies every check in
 * SpecValidator: required files, project.yaml structure, mandate rules,
 * YAML front-matter on all .md files, and cross-reference strings.
 */
function createValidSpecsDir(baseDir: string): string {
  const specsDir = join(baseDir, '.specs');
  ['project', 'architecture', 'planning', 'quality', 'development', 'security'].forEach(sub =>
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
    '## Backlog',
    '## Current Sprint',
    '## Completed',
  ].join('\n'));

  // context.md — front-matter + refs: roadmap.md, project.yaml
  writeFileSync(join(specsDir, 'development', 'context.md'), [
    '---',
    'title: Context',
    '---',
    '# Development Context',
    '<!-- refs: roadmap.md project.yaml -->',
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

  // security/threat-model.md
  writeFileSync(join(specsDir, 'security', 'threat-model.md'), [
    '---',
    'title: Threat Model',
    '---',
    '# Threat Model',
    'Security threat model placeholder.',
  ].join('\n'));

  // security/security-decisions.md
  writeFileSync(join(specsDir, 'security', 'security-decisions.md'), [
    '---',
    'title: Security Decisions',
    '---',
    '# Security Decisions',
    'Security decision log placeholder.',
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
    expect(missingErrors.length).toBe(9); // all 9 required files missing (api.yaml is optional, BL-107)
  });

  // ─── api.yaml is optional (BL-107, REQ-002.F.11) ──────────────────────────

  it('does not require api.yaml, offer to create it, or ask requirements.md to reference it while it is missing', async () => {
    createValidSpecsDir(testDir);
    rmSync(join(testDir, '.specs', 'architecture', 'api.yaml'));
    writeFileSync(join(testDir, '.specs', 'project', 'requirements.md'), readFileSync(join(testDir, '.specs', 'project', 'requirements.md'), 'utf-8').replace(' api.yaml', ''));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.errors.filter(e => e.includes('api.yaml'))).toEqual([]);
    expect(result.warnings.filter(w => w.includes('api.yaml'))).toEqual([]);
    expect(result.fixable).not.toContain('create-architecture/api.yaml');
    await validator.validate(testDir, { fix: true, verbose: false });
    expect(existsSync(join(testDir, '.specs', 'architecture', 'api.yaml'))).toBe(false);
  });

  it('still expects requirements.md to reference api.yaml when api.yaml exists', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'requirements.md'), readFileSync(join(testDir, '.specs', 'project', 'requirements.md'), 'utf-8').replace(' api.yaml', ''));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.warnings).toContain('project/requirements.md should reference architecture/api.yaml');
  });

  it('a project generated with API paradigm None validates with no errors', async () => {
    await new SpecGenerator().generateSpecs({ projectName: 'no-api', language: 'python', apiParadigm: 'none', targetDir: testDir, specsName: '.specs' });
    expect(existsSync(join(testDir, '.specs', 'architecture', 'api.yaml'))).toBe(false);
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter(w => w.includes('api.yaml'))).toEqual([]);
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

  it.each([
    ['no rules key (generated since 2.0.0)', ''],
    ['a commented # rules:', '# rules:\n'],
    ['a nested rules:', 'build:\n  rules: []\n'],
  ])('neither warns nor fails on the rules checks for %s (BL-066)', async (_what, extra) => {
    createValidSpecsDir(testDir);
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'),
      'name: x\nversion: "1.0.0"\nlanguage: typescript\n' + extra
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.warnings.find(w => w.includes('rules section'))).toBeUndefined();
    expect(result.errors.find(e => e.includes('prompt tracking'))).toBeUndefined();
  });

  it.each([['a null rules:', 'rules:\n'], ['rules: []', 'rules: []\n']])(
    'warns and fails as before for %s, which counts as present (BL-066)',
    async (_what, extra) => {
      createValidSpecsDir(testDir);
      writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'),
        'name: x\nversion: "1.0.0"\nlanguage: typescript\n' + extra
      );

      const result = await validator.validate(testDir, { fix: false, verbose: false });
      expect(result.warnings.find(w => w.includes('rules section'))).toBeDefined();
      expect(result.errors).toContain('Missing MANDATE for prompt tracking in project.yaml rules');
    },
  );

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
    expect(result.fixPrompts.some(p => p.issue.includes('MANDATE'))).toBe(true);
  });

  it('passes mandate check when rules contain MANDATE + prompts.md reference', async () => {
    createValidSpecsDir(testDir);
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const mandateErrors = result.errors.filter(e => e.includes('MANDATE'));
    expect(mandateErrors).toHaveLength(0);
  });

  // ─── autoFix ──────────────────────────────────────────────────────────────

  it('autoFix never rewrites project.yaml, preserving comments and quoting', async () => {
    createValidSpecsDir(testDir);
    const original = [
      '# IMPORTANT: rules live in the AI agent config',
      'name: my-app',
      'version: "1.0.0"',
      'language: typescript',
    ].join('\n');
    writeFileSync(join(testDir, '.specs', 'project', 'project.yaml'), original);

    // `add-mandates` is no longer a supported token; project.yaml must be untouched
    const fixed = await validator.autoFix(testDir, ['add-mandates']);
    expect(fixed).toHaveLength(0);
    expect(readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8')).toBe(original);
  });

  it('autoFix silently skips unknown fix tokens', async () => {
    createValidSpecsDir(testDir);
    const fixed = await validator.autoFix(testDir, ['unknown-fix-token']);
    expect(fixed).not.toContain('unknown-fix-token');
  });

  it('autoFix ignores create-* tokens that are not required files', async () => {
    createValidSpecsDir(testDir);
    const fixed = await validator.autoFix(testDir, ['create-prompts-entry', 'create-../evil.md']);
    expect(fixed).toHaveLength(0);
    expect(existsSync(join(testDir, '.specs', 'prompts-entry'))).toBe(false);
  });

  it('autoFix returns empty array when no .specs dir exists', async () => {
    const fixed = await validator.autoFix(testDir, ['create-development/prompts.md']);
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

  // ─── tasks.md section headings (BL-111) ───────────────────────────────────

  const tasksWith = (...lines: string[]) => [
    '---', 'title: Tasks', '---', '# Tasks', '<!-- refs: roadmap.md requirements.md project.yaml -->', 'In Progress: feature A', ...lines,
  ].join('\n');
  const tasksPath = (dir: string) => join(dir, '.specs', 'planning', 'tasks.md');
  const headingWarnings = (r: { warnings: string[] }) => r.warnings.filter(w => w.includes('has no `## '));

  it('warns when tasks.md lacks a section heading, naming the ## headings it has, and offers no fix for a different text', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(tasksPath(testDir), tasksWith('## Backlog', '## Current Sprint', '## Done', '## Backlog items'));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(headingWarnings(result)).toEqual([
      'planning/tasks.md has no `## Completed` section (`## ` headings found: `## Backlog`, `## Current Sprint`, `## Done`, `## Backlog items`).',
    ]);
    expect(result.fixable).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('says so when tasks.md has no ## heading at all, and tasksChecks lists the same warnings', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(tasksPath(testDir), tasksWith('- Task 1'));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const expected = ['## Backlog', '## Current Sprint', '## Completed'].map(h => `planning/tasks.md has no \`${h}\` section (\`## \` headings found: none).`);
    expect(headingWarnings(result)).toEqual(expected);
    expect(tasksChecks(readFileSync(tasksPath(testDir), 'utf-8'))).toEqual(expected);
  });

  it('a heading in another case or at another level is a rename that --fix applies to that line alone', async () => {
    createValidSpecsDir(testDir);
    const before = tasksWith('## backlog', '', '  ### Current Sprint  ', '', '## Completed', '').replace(/\n/g, '\r\n');
    writeFileSync(tasksPath(testDir), before);
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(headingWarnings(result)).toEqual([
      'planning/tasks.md has no `## Backlog` section (`## ` headings found: `## backlog`, `## Completed`); `specpilot validate --fix` renames `## backlog` to `## Backlog`.',
      'planning/tasks.md has no `## Current Sprint` section (`## ` headings found: `## backlog`, `## Completed`); `specpilot validate --fix` renames `### Current Sprint` to `## Current Sprint`.',
    ]);
    expect(result.fixable).toEqual(['rename-heading:## backlog:## Backlog', 'rename-heading:### Current Sprint:## Current Sprint']);

    const fixed = await validator.autoFix(testDir, result.fixable);
    expect(fixed).toEqual(result.fixable);
    expect(readFileSync(tasksPath(testDir), 'utf-8')).toBe(before.replace('## backlog', '## Backlog').replace('  ### Current Sprint  ', '  ## Current Sprint  '));
    const again = await validator.validate(testDir, { fix: false, verbose: false });
    expect(headingWarnings(again)).toEqual([]);
    expect(again.fixable).toEqual([]);
  });

  it('a `## backlog` the reader lists as both missing and unknown still gets the rename warning (BL-112)', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(tasksPath(testDir), tasksWith('## backlog', '## Current Sprint', '## Completed'));
    const content = readFileSync(tasksPath(testDir), 'utf-8');
    expect(tasksChecks(content)).toEqual([
      'planning/tasks.md has no `## Backlog` section (`## ` headings found: `## backlog`, `## Current Sprint`, `## Completed`); `specpilot validate --fix` renames `## backlog` to `## Backlog`.',
    ]);
  });

  it('a known section with lines but no table warns, without a fix, and tasksChecks does not carry it (BL-116)', async () => {
    createValidSpecsDir(testDir);
    const nine = Array.from({ length: 9 }, (_, i) => `[BL-00${i + 1}-handle] Task ${i + 1}`).join('\n');
    writeFileSync(tasksPath(testDir), tasksWith('## Backlog', '', nine, '', '## Current Sprint', '', '[TODO]', '', '## Completed', '', '1. [CD-001] Initialise .specs directory (2026-10-20)'));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.warnings.filter(w => w.includes('no table'))).toEqual([
      'planning/tasks.md `## Backlog` has 9 lines but no table, so the Tasks board shows none of them; make the section a table with ID and Description columns, one row per task.',
      'planning/tasks.md `## Completed` has 1 line but no table, so the Tasks board does not show it; make the section a table with #, ID and Description columns, one row per task.',
    ]);
    expect(headingWarnings(result)).toEqual([]);
    expect(result.fixable).toEqual([]);
    expect(tasksChecks(readFileSync(tasksPath(testDir), 'utf-8')).filter(w => w.includes('no table'))).toEqual([]);
  });

  it('two candidates for one heading stay a warning with no fix', async () => {
    createValidSpecsDir(testDir);
    writeFileSync(tasksPath(testDir), tasksWith('## backlog', '### Backlog', '## Current Sprint', '## Completed'));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(headingWarnings(result)).toEqual([
      'planning/tasks.md has no `## Backlog` section (`## ` headings found: `## backlog`, `## Current Sprint`, `## Completed`); 2 headings match it (`## backlog`, `### Backlog`), so rename one by hand.',
    ]);
    expect(result.fixable).toEqual([]);
  });

  it('autoFix ignores a rename token for a heading that is present or whose match has changed', async () => {
    createValidSpecsDir(testDir);
    const content = tasksWith('## backlog', '## Current Sprint', '## Completed');
    writeFileSync(tasksPath(testDir), content);
    const fixed = await validator.autoFix(testDir, [
      'rename-heading:## Current Sprint:## Current Sprint',
      'rename-heading:### Backlog:## Backlog',
      'rename-heading:## backlog:## Completed',
      'rename-heading:## backlog',
    ]);
    expect(fixed).toEqual([]);
    expect(readFileSync(tasksPath(testDir), 'utf-8')).toBe(content);
  });

  it('the tasks.md that --fix creates gives no heading warning', async () => {
    createValidSpecsDir(testDir);
    rmSync(tasksPath(testDir));
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    expect(result.fixable).toContain('create-planning/tasks.md');
    await validator.autoFix(testDir, result.fixable);
    const again = await validator.validate(testDir, { fix: false, verbose: false });
    expect(headingWarnings(again)).toEqual([]);
    expect(again.warnings.filter(w => w.includes('no table'))).toEqual([]); // BL-116: the stub's tables
    const stub = readFileSync(tasksPath(testDir), 'utf-8');
    expect(stub).toContain('## Backlog\n\n| ID | Description |\n|---|---|\n');
    expect(stub).toContain('## Current Sprint\n\n| ID | Description |\n|---|---|\n');
    expect(stub).toContain('## Completed\n\n| # | ID | Description |\n|---|---|---|\n');
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

  // ─── Stale date warnings ──────────────────────────────────────────────────

  it('warns when a .md spec file has lastUpdated older than 90 days', async () => {
    createValidSpecsDir(testDir);
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 100);
    const staleDateStr = staleDate.toISOString().split('T')[0];
    writeFileSync(join(testDir, '.specs', 'architecture', 'architecture.md'), [
      '---',
      `lastUpdated: ${staleDateStr}`,
      '---',
      '# Architecture',
      '## Overview',
      '## Architecture',
      '## Components',
      '## Decisions',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('architecture/architecture.md') && w.includes('days old'));
    expect(warn).toBeDefined();
  });

  it('warns on stale planning/roadmap.md even though it is not a required file', async () => {
    createValidSpecsDir(testDir);
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 100);
    writeFileSync(join(testDir, '.specs', 'planning', 'roadmap.md'), [
      '---',
      `lastUpdated: ${staleDate.toISOString().split('T')[0]}`,
      '---',
      '# Roadmap',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('planning/roadmap.md') && w.includes('days old'));
    expect(warn).toBeDefined();
  });

  it('does not warn when lastUpdated is within 90 days', async () => {
    createValidSpecsDir(testDir);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const recentDateStr = recentDate.toISOString().split('T')[0];
    writeFileSync(join(testDir, '.specs', 'architecture', 'architecture.md'), [
      '---',
      `lastUpdated: ${recentDateStr}`,
      '---',
      '# Architecture',
      '## Overview',
      '## Architecture',
      '## Components',
      '## Decisions',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('architecture/architecture.md') && w.includes('days old'));
    expect(warn).toBeUndefined();
  });

  it('does not warn when front-matter has no lastUpdated field', async () => {
    createValidSpecsDir(testDir);
    // architecture.md has front-matter but no lastUpdated key — no stale warning
    writeFileSync(join(testDir, '.specs', 'architecture', 'architecture.md'), [
      '---',
      'title: Architecture',
      '---',
      '# Architecture',
      '## Overview',
      '## Architecture',
      '## Components',
      '## Decisions',
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('architecture/architecture.md') && w.includes('days old'));
    expect(warn).toBeUndefined();
  });

  // ─── Line limit warnings ───────────────────────────────────────────────────

  it('warns when prompts.md exceeds 100 lines', async () => {
    createValidSpecsDir(testDir);
    const lines = Array.from({ length: 110 }, (_, i) => `Line ${i + 1}: AI interaction log entry.`);
    writeFileSync(join(testDir, '.specs', 'development', 'prompts.md'),
      `---\ntitle: Prompts\n---\n# Prompts\n<!-- refs: context.md project.yaml -->\n**MANDATE**: Track AI interactions.\nLast updated: ${CURRENT_YEAR}-01-01\nAI interaction: something.\n` + lines.join('\n')
    );

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('prompts.md') && w.includes('limit: 100'));
    expect(warn).toBeDefined();
    expect(warn).toContain('specpilot archive');
  });

  it('does not warn when prompts.md is under 100 lines', async () => {
    createValidSpecsDir(testDir);
    // Default valid prompts.md from createValidSpecsDir is well under 100 lines
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('prompts.md') && w.includes('limit: 100'));
    expect(warn).toBeUndefined();
  });

  it('warns when tasks.md Completed section exceeds 40 lines', async () => {
    createValidSpecsDir(testDir);
    const completedLines = Array.from({ length: 50 }, (_, i) => `${i + 1}. [CD-${String(i + 100).padStart(3, '0')}] Completed task ${i + 1}`);
    writeFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), [
      '---',
      'title: Tasks',
      '---',
      '# Tasks',
      '<!-- refs: roadmap.md requirements.md project.yaml -->',
      '## Current Sprint',
      'In Progress: feature A',
      'Completed: project init',
      '',
      '## Completed',
      ...completedLines,
    ].join('\n'));

    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('tasks.md') && w.includes('limit: 40'));
    expect(warn).toBeDefined();
    expect(warn).toContain('specpilot archive');
  });

  it('does not warn when tasks.md Completed section is under 40 lines', async () => {
    createValidSpecsDir(testDir);
    // Default valid tasks.md from createValidSpecsDir has no ## Completed section (short)
    const result = await validator.validate(testDir, { fix: false, verbose: false });
    const warn = result.warnings.find(w => w.includes('tasks.md') && w.includes('limit: 40'));
    expect(warn).toBeUndefined();
  });
});
