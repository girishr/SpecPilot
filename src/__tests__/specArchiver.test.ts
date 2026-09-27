import { SpecArchiver, planCompletedArchive } from '../utils/specArchiver';
import { SpecValidator } from '../utils/specValidator';
import { SLASH_COMMANDS } from '../utils/slashCommandGenerator';
import { execFileSync } from 'child_process';
import { findSectionBounds } from '../utils/markdownSections';
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

  // ─── prompts.md over 100 ────────────────────────────────────────────────────

  it('archives prompts.md when over 100 lines — creates fresh archive file', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(120));
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

    // prompts.md was trimmed to at most 100 lines
    const trimmedLines = readFileSync(
      join(specsDir, 'development', 'prompts.md'),
      'utf-8'
    ).split('\n');
    expect(trimmedLines.length).toBeLessThanOrEqual(100);
    expect(trimmedLines.length).toBeLessThan(120);
  });

  it('does not archive prompts.md when at exactly 100 lines', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(100));

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.find(e => e.file === 'development/prompts.md')).toBeUndefined();
  });

  it('respects front-matter preamble when trimming prompts.md', async () => {
    const specsDir = createSpecsDir(testDir);
    const preamble = '---\ntitle: Prompts\n---';
    // 3 preamble lines + 120 body lines = 123 total
    const content = preamble + '\n' + makeLines(120);
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

  it('never archives the Re-Anchor Prompt / Latest Entries boilerplate', async () => {
    const specsDir = createSpecsDir(testDir);
    const boilerplate = [
      '---',
      'title: Prompts',
      '---',
      '',
      '# Development Prompts Log',
      '',
      '## Re-Anchor Prompt [PROMPT-000]',
      '',
      '> Paste this into your AI agent when: ...',
      '',
      '```',
      'CRITICAL RULES — re-read these before continuing:',
      '1. NEVER commit, push, or deploy unless explicitly asked.',
      '```',
      '',
      '## Latest Entries [PROMPT-002]',
    ].join('\n');
    // 16 boilerplate lines + 120 bullet entries so total exceeds PROMPTS_LINE_LIMIT
    const entries = makeLines(120, '- Entry');
    writeFileSync(join(specsDir, 'development', 'prompts.md'), boilerplate + '\n' + entries);

    await archiver.archive(testDir, { dryRun: false });

    const retained = readFileSync(join(specsDir, 'development', 'prompts.md'), 'utf-8');
    expect(retained).toContain('## Re-Anchor Prompt [PROMPT-000]');
    expect(retained).toContain('CRITICAL RULES');
    expect(retained).toContain('## Latest Entries [PROMPT-002]');

    const archiveContent = readFileSync(
      join(specsDir, 'development', 'prompts-archive.md'),
      'utf-8'
    );
    expect(archiveContent).not.toContain('Re-Anchor Prompt');
    expect(archiveContent).not.toContain('CRITICAL RULES');
    expect(archiveContent).not.toContain('## Latest Entries');
  });

  // ─── Archive file append ────────────────────────────────────────────────────

  it('appends to existing prompts-archive.md instead of overwriting', async () => {
    const specsDir = createSpecsDir(testDir);
    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    writeFileSync(
      archivePath,
      '## Archived on 2026-01-01 00:00:00\n\nOld archived content here\n\n---\n\n'
    );
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(120));

    await archiver.archive(testDir, { dryRun: false });

    const archiveContent = readFileSync(archivePath, 'utf-8');
    expect(archiveContent).toContain('Old archived content here');
    // Two separate archived blocks
    const blockCount = (archiveContent.match(/^## Archived on/gm) || []).length;
    expect(blockCount).toBe(2);
  });

  // ─── tasks.md Completed over 25 ────────────────────────────────────────────

  it('archives tasks.md Completed section when over 25 lines', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(30)
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
    expect(newLineCount).toBeLessThan(30);
    // Earlier entries were archived
    expect(newContent).not.toContain('[CD-001]');
  });

  it('does not archive tasks.md when Completed section is within limit', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(20)
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
        '> **Line limit**: 25 lines.',
        '',
        makeCompletedEntries(30),
      ].join('\n')
    );

    await archiver.archive(testDir, { dryRun: false });

    const newContent = readFileSync(join(specsDir, 'planning', 'tasks.md'), 'utf-8');
    expect(newContent).toContain('## Completed');
    expect(newContent).toContain('> Older entries archived');
    expect(newContent).toContain('> **Line limit**: 25 lines.');
  });

  it('never archives sections that follow ## Completed', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      [
        '# Tasks',
        '',
        '## Completed',
        '',
        makeCompletedEntries(40),
        '',
        '## Multi-Dev Notes',
        '',
        '- IMPORTANT: coordinate before touching the parser',
      ].join('\n')
    );

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.length).toBeGreaterThan(0);

    // The trailing section must survive in the active file...
    const newContent = readFileSync(join(specsDir, 'planning', 'tasks.md'), 'utf-8');
    expect(newContent).toContain('## Multi-Dev Notes');
    expect(newContent).toContain('- IMPORTANT: coordinate before touching the parser');

    // ...and must never leak into the archive, which gets only numbered entries.
    const archived = readFileSync(join(specsDir, 'planning', 'tasks-archive.md'), 'utf-8');
    expect(archived).not.toContain('## Multi-Dev Notes');
    expect(archived).not.toContain('IMPORTANT: coordinate');
  });

  it('measures the Completed section to the next heading, not EOF', async () => {
    const specsDir = createSpecsDir(testDir);
    // 10 entries is well within the 25-line limit; a long trailing section must
    // not inflate the measured size and trigger a needless archive.
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      [
        '# Tasks',
        '',
        '## Completed',
        '',
        makeCompletedEntries(10),
        '',
        '## Multi-Dev Notes',
        '',
        ...Array.from({ length: 40 }, (_, i) => `- note ${i + 1}`),
      ].join('\n')
    );

    const result = await archiver.archive(testDir, { dryRun: false });
    expect(result.entries.find((e) => e.file === 'planning/tasks.md')).toBeUndefined();
    expect(existsSync(join(specsDir, 'planning', 'tasks-archive.md'))).toBe(false);
  });

  // ─── Both files over limit ──────────────────────────────────────────────────

  it('archives both files when both are over their limits', async () => {
    const specsDir = createSpecsDir(testDir);
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLines(120));
    writeFileSync(
      join(specsDir, 'planning', 'tasks.md'),
      '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(30)
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
    const originalContent = makeLines(120);
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
    expect(entry.linesMoved).toBe(350 - 80); // 270 lines moved (350 - keep 80)
  });
});

// ─── Table-shaped ## Completed (BL-057) ────────────────────────────────────────

/**
 * 43 body rows shaped like the real tasks.md: `#` and ID cells repeat, and descriptions
 * contain `|` inside backticks. Rows 25 and 26 are a duplicate `#`/ID pair that straddles
 * the archive boundary (25 moves, 26 stays); row 25 also ends in trailing spaces.
 */
function makeTableRows(): string[] {
  return Array.from({ length: 43 }, (_, i) => {
    if (i === 3 || i === 4) return `| 95 | [CD-girishr-013] [CS-07${i}] | Conditional \`'rest' | 'cli'\` row ${i} |`;
    if (i === 25 || i === 26) return `| 124 | [CD-girishr-033] | Duplicate pair row ${i} |${i === 25 ? '  ' : ''}`;
    return `| ${78 + i} | [CD-${100 + i}] [CS-0${i}] | Task row ${i} |`;
  });
}

const TABLE_HEADER = ['| # | ID | Description |', '|---|---|---|'];

function makeTableTasks(rows: string[], trailing: string[] = []): string {
  return [
    '# Task Tracking',
    '',
    '## Completed',
    '',
    '> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).',
    '> **Line limit**: The Completed section has a 25-line limit.',
    '',
    ...TABLE_HEADER,
    ...rows,
    '',
    ...trailing,
  ].join('\n');
}

const stamp = (s: string) => s.replace(/## Archived on .*/g, '## Archived on <T>');

/** The bash script embedded in the specpilot-archive slash command, exactly as generated. */
function archiveScript(): string {
  const body = SLASH_COMMANDS.find(c => c.name === 'archive')!.body;
  return /```bash\n([\s\S]*?)```/.exec(body)![1];
}

describe('SpecArchiver — table-shaped Completed (BL-057)', () => {
  let testDir: string;
  let specsDir: string;
  let tasksPath: string;
  let archivePath: string;

  beforeEach(() => {
    testDir = join(os.tmpdir(), `specpilot-archiver-table-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    specsDir = createSpecsDir(testDir);
    tasksPath = join(specsDir, 'planning', 'tasks.md');
    archivePath = join(specsDir, 'planning', 'tasks-archive.md');
  });

  afterEach(() => rmSync(testDir, { recursive: true, force: true }));

  it('moves the oldest body rows by position, keeps header and separator, rows byte-identical', async () => {
    const rows = makeTableRows();
    writeFileSync(tasksPath, makeTableTasks(rows));

    const result = await new SpecArchiver().archive(testDir, { dryRun: false });

    // 8 non-row lines (heading, 2 blanks, 2 notes, header, separator, trailing "") → keep 17, move 26
    expect(result.entries).toEqual([{ file: 'planning/tasks.md', archiveFile: 'planning/tasks-archive.md', linesMoved: 26 }]);
    expect(readFileSync(tasksPath, 'utf-8')).toBe(makeTableTasks(rows.slice(26)));
    expect(stamp(readFileSync(archivePath, 'utf-8'))).toBe(
      `## Archived on <T>\n\n${[...TABLE_HEADER, ...rows.slice(0, 26)].join('\n')}\n\n---\n\n`,
    );
  });

  it('moves the right one of rows that share a # value and ID', async () => {
    const rows = makeTableRows();
    writeFileSync(tasksPath, makeTableTasks(rows));

    await new SpecArchiver().archive(testDir, { dryRun: false });

    const active = readFileSync(tasksPath, 'utf-8');
    const archived = readFileSync(archivePath, 'utf-8');
    // Both `| 95 |` rows are old enough to move.
    expect(archived).toContain(rows[3]);
    expect(archived).toContain(rows[4]);
    // The `| 124 |` pair straddles the boundary: position 25 moves (with its trailing spaces), 26 stays.
    expect(archived).toContain(`${rows[25]}\n\n---`);
    expect(active).not.toContain('Duplicate pair row 25');
    expect(active).toContain(rows[26]);
    expect(archived).not.toContain('Duplicate pair row 26');
  });

  it('keeps a section after ## Completed out of the archive', async () => {
    const rows = makeTableRows();
    const trailing = ['## Multi-Dev Notes', '', '| Not | A | Task |', '|---|---|---|', '| x | y | z |', ''];
    writeFileSync(tasksPath, makeTableTasks(rows, trailing));

    const result = await new SpecArchiver().archive(testDir, { dryRun: false });

    expect(result.entries[0].linesMoved).toBe(26);
    expect(readFileSync(tasksPath, 'utf-8')).toBe(makeTableTasks(rows.slice(26), trailing));
    expect(readFileSync(archivePath, 'utf-8')).not.toContain('Multi-Dev Notes');
  });

  it('dry-run reports the rows it would move and writes nothing', async () => {
    const content = makeTableTasks(makeTableRows());
    writeFileSync(tasksPath, content);

    const result = await new SpecArchiver().archive(testDir, { dryRun: true });

    expect(result.entries[0].linesMoved).toBe(26);
    expect(readFileSync(tasksPath, 'utf-8')).toBe(content);
    expect(existsSync(archivePath)).toBe(false);
  });

  it('leaves list-shaped sections exactly as before (golden output)', async () => {
    const entries = makeCompletedEntries(30).split('\n');
    writeFileSync(tasksPath, ['## Completed', '', '> note', ...entries, '', '## Notes', 'x'].join('\n'));

    const result = await new SpecArchiver().archive(testDir, { dryRun: false });

    // 31 entry lines (30 entries + the blank before ## Notes); keep the last 20 → move 11
    expect(result.entries[0].linesMoved).toBe(11);
    expect(readFileSync(tasksPath, 'utf-8')).toBe(
      ['## Completed', '', '> note', ...entries.slice(11), '', '## Notes', 'x'].join('\n'),
    );
    expect(stamp(readFileSync(archivePath, 'utf-8'))).toBe(
      `## Archived on <T>\n\n${entries.slice(0, 11).join('\n')}\n\n---\n\n`,
    );
  });

  it.each([
    ['table', () => makeTableTasks(makeTableRows())],
    ['list', () => '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(30) + '\n'],
  ])('round trip (%s): validate warns before archive and not after', async (_shape, make) => {
    writeFileSync(tasksPath, make());
    const validator = new SpecValidator();
    const completedWarning = async () =>
      (await validator.validate(testDir, { fix: false, verbose: false })).warnings.find(
        w => w.includes('tasks.md') && w.includes('limit: 25'),
      );

    expect(await completedWarning()).toBeDefined();
    await new SpecArchiver().archive(testDir, { dryRun: false });
    expect(await completedWarning()).toBeUndefined();
    const lines = readFileSync(tasksPath, 'utf-8').split('\n');
    expect(planCompletedArchive(lines)).toBeNull();
    // Not just "nothing left to move": the section really is back within the 25-line limit.
    const bounds = findSectionBounds(lines, '## Completed')!;
    expect(bounds.end - bounds.start).toBeLessThanOrEqual(25);
  });

  it('validate does not tell you to archive when archive would move nothing', async () => {
    // Over 25 lines, but only 20 entries: nothing to archive, so no warning.
    writeFileSync(tasksPath, ['## Completed', ...Array(10).fill('> note'), ...makeCompletedEntries(20).split('\n')].join('\n'));
    const { warnings } = await new SpecValidator().validate(testDir, { fix: false, verbose: false });
    expect(warnings.find(w => w.includes('tasks.md') && w.includes('limit: 25'))).toBeUndefined();
  });

  // ─── The specpilot-archive slash command's bash archive_tasks() ──────────────

  it.each([
    ['table', () => makeTableTasks(makeTableRows())],
    ['table with a trailing section', () => makeTableTasks(makeTableRows(), ['## Multi-Dev Notes', '', 'keep me', ''])],
    ['list', () => '# Tasks\n\n## Completed\n\n' + makeCompletedEntries(30) + '\n'],
    ['list with a trailing section', () => '## Completed\n\n> note\n' + makeCompletedEntries(40) + '\n\n## Notes\nkeep me\n'],
  ])('bash archive_tasks() matches the CLI byte for byte (%s)', async (_shape, make) => {
    const content = make();
    writeFileSync(tasksPath, content);
    await new SpecArchiver().archive(testDir, { dryRun: false });
    const cliTasks = readFileSync(tasksPath, 'utf-8');
    const cliArchive = stamp(readFileSync(archivePath, 'utf-8'));

    // Fresh copy of the same fixture, run through the extracted script. testDir is not a
    // git repo, so the script's branch guard never prompts.
    rmSync(archivePath);
    writeFileSync(tasksPath, content);
    const out = execFileSync('bash', ['-c', archiveScript()], { cwd: testDir, encoding: 'utf-8' });

    expect(out).toContain('Moved');
    expect(readFileSync(tasksPath, 'utf-8')).toBe(cliTasks);
    expect(stamp(readFileSync(archivePath, 'utf-8'))).toBe(cliArchive);
  });
});
