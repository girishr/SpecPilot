import { SpecArchiver } from '../utils/specArchiver';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

function createSpecsDir(baseDir: string): string {
  const specsDir = join(baseDir, '.specs');
  ['development', 'planning'].forEach(sub =>
    mkdirSync(join(specsDir, sub), { recursive: true })
  );
  return specsDir;
}

/** Generate `n` lines: "Prefix 1", "Prefix 2", ... */
function makeLines(n: number, prefix = 'Line'): string {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join('\n');
}

/** Generate `n` numbered completed entries: "1. [CD-001] Task 1", ... */
function makeCompletedEntries(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    `${i + 1}. [CD-${String(i + 1).padStart(3, '0')}] Completed task ${i + 1}`
  ).join('\n');
}

describe('SpecArchiver', () => {
  let archiver: SpecArchiver;
  let testDir: string;

  beforeEach(() => {
    archiver = new SpecArchiver();
    testDir = join(
      os.tmpdir(),
      `specpilot-archiver-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── No .specs dir ──────────────────────────────────────────────────────────

  it('throws when .specs directory does not exist', async () => {
    await expect(archiver.archive(testDir, { dryRun: false })).rejects.toThrow(
      'No .specs directory found'
    );
  });

  // ─── No-op when under limits ────────────────────────────────────────────────

  it('returns empty entries when both files are within limits', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(50));
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(20)
    );

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries).toHaveLength(0);
  });

  it('no-op when neither prompts.md nor tasks.md exist', async () => {
    createSpecsDir(testDir);
    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries).toHaveLength(0);
  });

  // ─── prompts.md over 300 ────────────────────────────────────────────────────

  it('archives prompts.md when over 300 lines — creates fresh archive file', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(350));
    const archivePath = join(specsDir, 'development', 'prompts-archive.md');

    const result = await archiver.archive(testDir, { dryRun: false });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].file).toBe('development/prompts.md');
    expect(result.entries[0].archiveFile).toBe('development/prompts-archive.md');
    expect(result.entries[0].linesMoved).toBeGreaterThan(0);

    // Archive file was created
    expect(existsSync(archivePath)).toBe(true);
    const archiveContent = readFileSync(archivePath, 'utf-8');
    expect(archiveContent).toContain('## Archived on');

    // prompts.md was trimmed to at most 300 lines
    const trimmedLines = readFileSync(
      join(specsDir, 'development', 'prompts.md'),
      'utf-8'
    ).split('\n');
    expect(trimmedLines.length).toBeLessThanOrEqual(300);
    expect(trimmedLines.length).toBeLessThan(350);
  });

  it('does not archive prompts.md when at exactly 300 lines', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(300));

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.find(e => e.file === 'development/prompts.md')).toBeUndefined();
  });

  it('respects front-matter preamble when trimming prompts.md', async () => {
    const specsDir = createSpecsDir(testDir);
    const preamble = '---\ntitle: Prompts\n---';
    // 3 preamble lines + 350 body lines = 353 total
    const content = preamble + '\n' + makeLines(350);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), content);

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries[0].linesMoved).toBeGreaterThan(0);

    const retained = readFileSync(
      join(specsDir, 'development', 'prompts.md'),
      'utf-8'
    );
    // Front-matter must still be there
    expect(retained.startsWith('---\ntitle: Prompts\n---')).toBe(true);
  });

  // ─── Archive file append ────────────────────────────────────────────────────

  it('appends to existing prompts-archive.md instead of overwriting', async () => {
    const specsDir = createSpecsDir(testDir);
    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    writeFileSync(
      archivePath,
      '## Archived on 2026-01-01 00:00:00\n\nOld archived content here\n\n---\n\n'
    );
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(350));

    await archiver.archive(testDir, { dryRun: false });

    const archiveContent = readFileSync(archivePath, 'utf-8');
    expect(archiveContent).toContain('Old archived content here');
    // Two separate archived blocks
    const blockCount = (archiveContent.match(/^## Archived on/gm) || []).length;
    expect(blockCount).toBe(2);
  });

  // ─── tasks.md Completed over 150 ───────────────────────────────────────────

  it('archives tasks.md Completed section when over 150 lines', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(200)
    );
    const archivePath = join(specsDir, 'planning', 'tasks-archive.md');

    const result = await archiver.archive(testDir, { dryRun: false });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].file).toBe('planning/tasks.md');
    expect(result.entries[0].archiveFile).toBe('planning/tasks-archive.md');
    expect(result.entries[0].linesMoved).toBeGreaterThan(0);

    // tasks-archive.md created with timestamp header
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf-8')).toContain('## Archived on');

    // tasks.md was trimmed
    const newContent = readFileSync(join(specsDir, 'planning', 'tasks.md'), 'utf-8');
    const newLineCount = newContent.split('\n').length;
    expect(newLineCount).toBeLessThan(200);
    // Earlier entries were archived
    expect(newContent).not.toContain('[CD-001]');
  });

  it('does not archive tasks.md when Completed section is within limit', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(30)
    );

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.find(e => e.file === 'planning/tasks.md')).toBeUndefined();
  });

  it('no-op for tasks.md when there is no ## Completed section', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Backlog\n\n1. Some task\n2. Another task'
    );

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.find(e => e.file === 'planning/tasks.md')).toBeUndefined();
  });

  it('preserves ## Completed heading and notes when archiving tasks.md', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      [
        '# Tasks',
        '',
        '## Completed',
        '',
        '> Older entries archived in tasks-archive.md.',
        '> **Line limit**: 150 lines.',
        '',
        makeCompletedEntries(200),
      ].join('\n')
    );

    await archiver.archive(testDir, { dryRun: false });

    const newContent = readFileSync(join(specsDir, 'planning', 'tasks.md'), 'utf-8');
    expect(newContent).toContain('## Completed');
    expect(newContent).toContain('> Older entries archived');
    expect(newContent).toContain('> **Line limit**: 150 lines.');
  });

  // ─── Both files over limit ──────────────────────────────────────────────────

  it('archives both files when both are over their limits', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(350));
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(200)
    );

    const result = await archiver.archive(testDir, { dryRun: false });

    expect(result.entries).toHaveLength(2);
    const files = result.entries.map(e => e.file);
    expect(files).toContain('development/prompts.md');
    expect(files).toContain('planning/tasks.md');
  });

  // ─── Dry run ────────────────────────────────────────────────────────────────

  it('dry-run does not write any files', async () => {
    const specsDir = createSpecsDir(testDir);
    const promptsPath = join(specsDir, 'development', 'prompts.md');
    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    const originalContent = makeLines(350);
    writeFileSync(promptsPath, originalContent);

    const result = await archiver.archive(testDir, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].linesMoved).toBeGreaterThan(0);

    // Archive file NOT created
    expect(existsSync(archivePath)).toBe(false);
    // Original file NOT modified
    expect(readFileSync(promptsPath, 'utf-8')).toBe(originalContent);
  });

  // ─── Report format ──────────────────────────────────────────────────────────

  it('report entries contain correct file, archiveFile, and positive linesMoved', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(350));

    const result = await archiver.archive(testDir, { dryRun: true });

    const entry = result.entries[0];
    expect(entry.file).toBe('development/prompts.md');
    expect(entry.archiveFile).toBe('development/prompts-archive.md');
    expect(typeof entry.linesMoved).toBe('number');
    expect(entry.linesMoved).toBeGreaterThan(0);
    expect(entry.linesMoved).toBe(350 - 250); // 100 lines moved (350 - keep 250)
  });
});
