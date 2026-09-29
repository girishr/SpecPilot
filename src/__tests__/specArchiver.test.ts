import { SpecArchiver, lastDate, planCompletedArchive } from '../utils/specArchiver';
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

/** `n` dated log entries, oldest first: "- Entry 1 (2020-01-01)", ... */
function makeEntries(n: number, prefix = 'Entry'): string[] {
  return Array.from({ length: n }, (_, i) => `- ${prefix} ${i + 1} (${new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10)})`);
}

/** A prompts.md log of `total` lines: a "## Latest Entries" heading and dated entries, oldest first. */
function makeLog(total: number): string {
  return ['## Latest Entries', ...makeEntries(total - 1)].join('\n');
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
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLog(120));
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
    const content = preamble + '\n' + makeLog(120);
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
    const entries = makeEntries(120).join('\n');
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
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLog(120));

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
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLog(120));
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
    const originalContent = makeLog(120);
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
    writeFileSync(join(specsDir, 'development', 'prompts.md'), makeLog(350));

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

// ─── prompts.md: keep the newest entries, whichever order the log runs (BL-061) ──

const BOILER = ['---', 'title: Prompts', '---', '', '# Development Prompts Log', '', '## Re-Anchor Prompt', '', '> keep me', ''];
const AFTER = ['', '## Archive Policy', '', 'This file has a 100-line limit.', ''];
/** "- Entry N ... (Month D, YYYY) [PROMPT-N]" with a date N days after 2025-01-01, month written out. */
function datedEntry(i: number, style: 'long' | 'short' | 'iso' = 'long'): string {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
  const long = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const short = ['Jan.', 'Feb', 'Mar.', 'Apr', 'May', 'Jun', 'Jul.', 'Aug', 'Sept.', 'Oct', 'Nov.', 'Dec'];
  const when =
    style === 'iso' ? d.toISOString().slice(0, 10)
    : `${(style === 'long' ? long : short)[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return `- Entry ${i} — did something on 2024-01-0${(i % 9) + 1} as noted (${when}) [PROMPT-${i}]`;
}
function listLog(ids: number[], style?: 'long' | 'short' | 'iso'): string {
  return [...BOILER, '## Latest Entries', ...ids.map(i => datedEntry(i, style)), ...AFTER].join('\n');
}
const range = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => (a <= b ? a + k : a - k));

describe('lastDate (BL-061)', () => {
  it.each([
    ['(September 3, 2025)', 20250903], ['Sept 3, 2025', 20250903], ['Sept. 3, 2025', 20250903], ['Sep 3, 2025', 20250903],
    ['Sep. 30, 2026', 20260930], ['Jan. 2, 2026', 20260102], ['Jan 2, 2026', 20260102], ['May 5, 2026', 20260505],
    ['June 1, 2026', 20260601], ['Jun. 1, 2026', 20260601], ['Dec 31, 2025', 20251231], ['2026-09-29', 20260929],
    ['on 2024-01-01, then (October 3, 2025)', 20251003], ['XJan 2, 2026', null], ['Mayday 5, 2026', null],
    ['12026-09-29', null], ['2026-13-01', null], ['no date here', null],
  ])('%j → %j', (text, key) => {
    expect(lastDate(text)).toBe(key);
  });
});

describe('SpecArchiver — prompts.md entry order (BL-061)', () => {
  let testDir: string;
  let promptsPath: string;
  let archivePath: string;
  beforeEach(() => {
    testDir = join(os.tmpdir(), `specpilot-prompts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const specsDir = createSpecsDir(testDir);
    promptsPath = join(specsDir, 'development', 'prompts.md');
    archivePath = join(specsDir, 'development', 'prompts-archive.md');
  });
  afterEach(() => rmSync(testDir, { recursive: true, force: true }));
  const run = () => new SpecArchiver().archive(testDir, { dryRun: false });
  const entriesIn = (text: string) => (text.match(/\[PROMPT-(\d+)\]/g) ?? []).map(m => +m.slice(8, -1));

  it('newest first: moves the oldest entries from the bottom, keeps the newest, never touches the sections around the log', async () => {
    const before = listLog(range(90, 1)) + '\n';
    writeFileSync(promptsPath, before);
    const result = await run();
    const kept = readFileSync(promptsPath, 'utf-8');
    const archived = readFileSync(archivePath, 'utf-8');
    expect(kept.split('\n').length).toBeLessThanOrEqual(80);
    expect(Math.min(...entriesIn(kept))).toBeGreaterThan(Math.max(...entriesIn(archived)));
    expect(entriesIn(kept)[0]).toBe(90); // the newest stays on top
    expect(kept).toContain('## Re-Anchor Prompt');
    expect(kept).toContain('## Archive Policy');
    expect(archived).not.toMatch(/Re-Anchor|Archive Policy|Latest Entries/);
    // Byte-identical: the archive block is exactly the removed lines, in order.
    const removed = before.split('\n').filter(l => !kept.split('\n').includes(l));
    expect(stamp(archived)).toBe(`## Archived on <T>\n\n${removed.join('\n')}\n\n---\n\n`);
    expect(result.entries[0].linesMoved).toBe(removed.length);
  });

  it('oldest first: moves the oldest entries from the top', async () => {
    writeFileSync(promptsPath, listLog(range(1, 90)) + '\n');
    await run();
    const kept = entriesIn(readFileSync(promptsPath, 'utf-8'));
    const archived = entriesIn(readFileSync(archivePath, 'utf-8'));
    expect(archived[0]).toBe(1);
    expect(kept[kept.length - 1]).toBe(90);
    expect(Math.max(...archived)).toBeLessThan(Math.min(...kept));
  });

  it.each([['long'], ['short'], ['iso']] as const)('reads %s dates, including abbreviated months with and without a dot', async style => {
    writeFileSync(promptsPath, listLog(range(300, 211), style) + '\n'); // spans Jul–Oct, newest first
    await run();
    expect(entriesIn(readFileSync(promptsPath, 'utf-8'))[0]).toBe(300);
    expect(entriesIn(readFileSync(archivePath, 'utf-8'))).toContain(211);
  });

  it('uses the last date in an entry, not an earlier one it mentions', async () => {
    // Each entry mentions an older 2024 date first; only the trailing date orders the log.
    writeFileSync(promptsPath, listLog(range(90, 1)) + '\n');
    await run();
    expect(entriesIn(readFileSync(promptsPath, 'utf-8'))[0]).toBe(90);
  });

  it('refuses undated entries and changes nothing', async () => {
    const content = [...BOILER, '## Latest Entries', ...Array.from({ length: 100 }, (_, i) => `- Undated entry ${i}`), ...AFTER].join('\n');
    writeFileSync(promptsPath, content);
    const result = await run();
    expect(result.entries).toEqual([]);
    expect(result.refused).toEqual([{ file: 'development/prompts.md', reason: 'SpecPilot cannot tell which development/prompts.md entries are oldest: fewer than two entries carry different dates.' }]);
    expect(readFileSync(promptsPath, 'utf-8')).toBe(content);
    expect(existsSync(archivePath)).toBe(false);
  });

  it('refuses mixed order, naming both entries, and changes nothing', async () => {
    const ids = range(90, 1);
    [ids[40], ids[41]] = [ids[41], ids[40]]; // one inversion
    const content = listLog(ids) + '\n';
    writeFileSync(promptsPath, content);
    const result = await run();
    expect(result.refused[0].reason).toMatch(/dates run both ways: "- Entry 49 — .*" \(2025-02-19\) comes right before "- Entry 50 — .*" \(2025-02-20\) in a log that otherwise runs newest first\./);
    expect(readFileSync(promptsPath, 'utf-8')).toBe(content);
    expect(existsSync(archivePath)).toBe(false);
  });

  it('allows undated entries and equal dates between dated ones', async () => {
    const lines = listLog(range(90, 1)).split('\n');
    lines.splice(30, 0, '- An undated note');
    lines.splice(31, 0, lines[31].replace('[PROMPT-', '[PROMPT-9999 same-day twin of ').replace(/\[PROMPT-9999[^\]]*\]/, '[PROMPT-9999]'));
    writeFileSync(promptsPath, lines.join('\n') + '\n');
    const result = await run();
    expect(result.refused).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it('does nothing at exactly 100 lines and moves the oldest at 101', async () => {
    const at = (n: number) => {
      // CLI line count = split('\n').length; BOILER(10) + heading(1) + entries + AFTER(5)
      const ids = range(n - 16, 1);
      return listLog(ids);
    };
    writeFileSync(promptsPath, at(100));
    expect(at(100).split('\n')).toHaveLength(100);
    expect((await run()).entries).toEqual([]);
    writeFileSync(promptsPath, at(101));
    const r = await run();
    expect(r.entries[0].linesMoved).toBeGreaterThan(0);
    expect(entriesIn(readFileSync(archivePath, 'utf-8'))).toContain(1); // the oldest goes first
    expect(Math.max(...entriesIn(readFileSync(archivePath, 'utf-8')))).toBeLessThan(Math.min(...entriesIn(readFileSync(promptsPath, 'utf-8'))));
  });

  it('moves a multi-line entry whole', async () => {
    const lines = listLog(range(90, 1)).split('\n');
    const last = lines.lastIndexOf(datedEntry(1));
    lines.splice(last + 1, 0, '  continued detail of entry 1', '  and one more line');
    writeFileSync(promptsPath, lines.join('\n') + '\n');
    await run();
    const archived = readFileSync(archivePath, 'utf-8');
    expect(archived).toContain(`${datedEntry(1)}\n  continued detail of entry 1\n  and one more line`);
    expect(readFileSync(promptsPath, 'utf-8')).not.toContain('continued detail');
  });

  it('archives a generated "## Prompt History" table by its Date column, repeating the header, and leaves the boilerplate', async () => {
    const header = ['| Date | User | Prompt Summary | Context |', '|------|------|----------------|---------|'];
    const rows = range(1, 90).map(i => `| ${new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10)} | @me | Prompt ${i} [PROMPT-${i}] | see 2099-12-31 |`);
    const content = [...BOILER, '## Prompt History', ...header, ...rows].join('\n') + '\n';
    writeFileSync(promptsPath, content);
    await run();
    const archived = readFileSync(archivePath, 'utf-8');
    expect(stamp(archived).startsWith(`## Archived on <T>\n\n${header.join('\n')}\n${rows[0]}\n`)).toBe(true);
    const kept = readFileSync(promptsPath, 'utf-8');
    expect(kept).toContain('## Re-Anchor Prompt');
    expect(kept).toContain(header[0]);
    expect(entriesIn(kept)[entriesIn(kept).length - 1]).toBe(90);
  });

  it('refuses a prompts.md with no log section instead of archiving its boilerplate', async () => {
    const content = [...BOILER, ...Array.from({ length: 100 }, (_, i) => `Line ${i}`)].join('\n');
    writeFileSync(promptsPath, content);
    const result = await run();
    expect(result.refused[0].reason).toContain('no "## Latest Entries" list or "## Prompt History" table');
    expect(readFileSync(promptsPath, 'utf-8')).toBe(content);
  });

  it('validate agrees: warns before, silent after archive; gives the refusal reason when archive refuses', async () => {
    const warning = async () =>
      (await new SpecValidator().validate(testDir, { fix: false, verbose: false })).warnings.find(w => w.startsWith('development/prompts.md exceeds line limit'));
    writeFileSync(promptsPath, listLog(range(90, 1)) + '\n');
    expect(await warning()).toContain('Run `specpilot archive`');
    await run();
    expect(await warning()).toBeUndefined();
    const ids = range(90, 1);
    [ids[10], ids[11]] = [ids[11], ids[10]];
    writeFileSync(promptsPath, listLog(ids) + '\n');
    expect(await warning()).toMatch(/but `specpilot archive` will not move anything: SpecPilot cannot tell which .* dates run both ways/);
  });

  // Known limit, not covered here: a refusal excerpt is cut at 60 UTF-16 code units in the CLI
  // and at 60 UTF-8 characters in bash, so an emoji or other character outside the Basic
  // Multilingual Plane within the first 60 characters can make the two messages differ slightly.
  // The files themselves are never touched on a refusal, in either implementation.
  it.each([
    ['newest first', () => listLog(range(90, 1)) + '\n'],
    ['oldest first', () => listLog(range(1, 90)) + '\n'],
    ['abbreviated months', () => listLog(range(300, 211), 'short') + '\n'],
    ['"Sept" without a dot', () => listLog(range(300, 211), 'short').replace(/Sept\./g, 'Sept') + '\n'],
    ['a table', () => [...BOILER, '## Prompt History', '| Date | Summary |', '|---|---|', ...range(1, 95).map(i => `| 2025-0${1 + (i % 9 === 0 ? 0 : 0)}-01 | x ${i} |`.replace('2025-01-01', new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10)))].join('\n') + '\n'],
    // No line break after the last line, with the log at the very end of the file.
    ['newest first, no trailing newline', () => [...BOILER, '## Latest Entries', ...range(90, 1).map(i => datedEntry(i))].join('\n')],
    ['oldest first, no trailing newline', () => [...BOILER, '## Latest Entries', ...range(1, 90).map(i => datedEntry(i))].join('\n')],
    ['a table, no trailing newline', () => [...BOILER, '## Prompt History', '| Date | Summary |', '|---|---|', ...range(1, 95).map(i => `| ${new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10)} | x ${i} |`)].join('\n')],
    ['mixed (refused)', () => { const ids = range(90, 1); [ids[5], ids[6]] = [ids[6], ids[5]]; return listLog(ids) + '\n'; }],
    ['undated (refused)', () => [...BOILER, '## Latest Entries', ...range(1, 95).map(i => `- note ${i}`), ...AFTER].join('\n') + '\n'],
    ['no log section (refused)', () => [...BOILER, ...range(1, 95).map(i => `Line ${i}`)].join('\n') + '\n'],
  ])('bash archive_prompts() matches the CLI byte for byte (%s)', async (_shape, make) => {
    const content = make();
    writeFileSync(promptsPath, content);
    const cli = await run();
    const cliPrompts = readFileSync(promptsPath, 'utf-8');
    const cliArchive = existsSync(archivePath) ? stamp(readFileSync(archivePath, 'utf-8')) : null;

    if (existsSync(archivePath)) rmSync(archivePath);
    writeFileSync(promptsPath, content);
    const out = execFileSync('bash', ['-c', archiveScript()], { cwd: testDir, encoding: 'utf-8' });

    expect(readFileSync(promptsPath, 'utf-8')).toBe(cliPrompts);
    expect(existsSync(archivePath) ? stamp(readFileSync(archivePath, 'utf-8')) : null).toBe(cliArchive);
    if (cli.refused.length) expect(out).toContain(`Not archived: ${cli.refused[0].reason}`);
    else expect(out).toContain('Moved');
  });
});
