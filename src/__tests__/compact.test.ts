// BL-202 (REQ-002.A.19): `specpilot compact` lists, `--apply` moves the plan's archive rows. Temp folders only.
const question = jest.fn((_q: string, answer: (a: string) => void) => answer('n'));
jest.mock('readline', () => ({ createInterface: jest.fn(() => ({ question, close: () => {} })) }));

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { compactCommand } from '../commands/compact';

const CONTEXT = `# Context

## Key Decisions [CTX-003]

- **BL-100 old decision**: done long ago.
- **BL-300 open work**: still going.
- **General note**: no id.
`;
const TASKS = `# Tasks

## Backlog

| ID | Description |
|---|---|
| BL-300 | open |

## Completed

| # | ID | Description |
|---|---|---|
`;
const TASKS_ARCHIVE = `## Archived on 2026-01-01 00:00:00

| # | ID | Description |
|---|---|---|
| 1 | [CD-x-001] [BL-100] | done |

---

`;
const PLAN = `| Entry | Action | Reason |
|---|---|---|
| BL-100 old decision | archive | now in REQ-002.E.9 |
| General note | keep | binds |
`;

describe('compactCommand()', () => {
  let base: string;
  let out: string[];
  const specs = (...p: string[]) => join(base, '.specs', ...p);
  const read = (...p: string[]) => readFileSync(specs(...p), 'utf8');
  const run = (opts: Record<string, unknown> = {}) => compactCommand({ dir: base, ...opts });
  const text = () => out.join('\n');

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-compact-')));
    mkdirSync(specs('development'), { recursive: true });
    mkdirSync(specs('planning'), { recursive: true });
    writeFileSync(specs('development', 'context.md'), CONTEXT);
    writeFileSync(specs('planning', 'tasks.md'), TASKS);
    writeFileSync(specs('planning', 'tasks-archive.md'), TASKS_ARCHIVE);
    mkdirSync(join(base, '.git'));
    writeFileSync(join(base, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    out = [];
    jest.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)); });
    jest.spyOn(console, 'error').mockImplementation((m?: unknown) => { out.push(String(m)); });
    question.mockClear();
    process.exitCode = undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  test('without --apply it lists each entry with its status and line count, writing nothing', async () => {
    await run();
    expect(text()).toMatch(/finished\s+1\s+0\.0 KB\s+BL-100 old decision/);
    expect(text()).toMatch(/open\s+1\s+0\.0 KB\s+BL-300 open work/);
    expect(text()).toMatch(/no-id\s+1\s+0\.0 KB\s+General note/);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(read('development', 'context.md')).toBe(CONTEXT);
  });

  test('repository text is printed through terminalText', async () => {
    writeFileSync(specs('development', 'context.md'), CONTEXT.replace('General note', 'General\x1b]0;x\x07 note'));
    await run();
    expect(text()).not.toMatch(/\x1b/);
    expect(text()).toMatch(/General\]0;x note/);
  });

  test('--apply with no plan file is refused, exit 1, nothing written', async () => {
    await run({ apply: true });
    expect(text()).toContain('No plan: .specs/development/compact-plan.md not found. Run /specpilot-compact first.');
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
  });

  test('--apply writes the archive, then context.md, then removes the plan', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    expect(text()).toContain('Moved 1 entries to context-archive.md');
    const archive = read('development', 'context-archive.md');
    expect(archive.startsWith('## Archived on ')).toBe(true);
    expect(archive).toContain('- **BL-100 old decision**: done long ago.');
    const date = /^## Archived on (\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/m.exec(archive)![1];
    expect(read('development', 'context.md')).toContain(`- **BL-100 old decision**: moved to context-archive.md on ${date}.`);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  test('a second run appends to context-archive.md', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| General note | archive | obsolete |\n');
    await run({ apply: true });
    expect(read('development', 'context-archive.md').match(/^## Archived on /gm)).toHaveLength(2);
  });

  test('a plan with only keep rows: Nothing to move, exit 0, no archive file, plan kept', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| General note | keep | binds |\n');
    await run({ apply: true });
    expect(text()).toContain('Nothing to move: the plan has no archive rows');
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test('a refused plan: one line per problem, exit 1, nothing written, plan kept', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| BL-300 open work | archive | x |\n| Nope | archive | x |\n');
    await run({ apply: true });
    expect(text()).toContain('names BL-300, which is still open in tasks.md');
    expect(text()).toContain('no entry has the title "Nope"');
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test('--dry-run writes nothing and keeps the plan', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true, dryRun: true });
    expect(text()).toContain('Would move 1 entries to context-archive.md');
    expect(out).toContain('  BL-100 old decision');
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test.each([
    ['context-archive.md', () => symlinkSync(join(base, 'elsewhere.md'), join(base, '.specs', 'development', 'context-archive.md'))],
    ['context.md', () => {
      writeFileSync(join(base, 'real-context.md'), CONTEXT);
      rmSync(join(base, '.specs', 'development', 'context.md'));
      symlinkSync(join(base, 'real-context.md'), join(base, '.specs', 'development', 'context.md'));
    }],
  ])('a linked %s is refused, nothing written (BL-130)', async (_name, link) => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    link();
    await run({ apply: true });
    expect(text()).toMatch(/is a symbolic link, so nothing was written/);
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(base, 'elsewhere.md'))).toBe(false);
    expect(readFileSync(join(base, '.specs', 'development', 'context.md'), 'utf8')).toBe(CONTEXT);
  });

  test('a linked compact-plan.md is refused, exit 1, nothing written, the link kept (BL-130)', async () => {
    writeFileSync(join(base, 'real-plan.md'), PLAN);
    symlinkSync(join(base, 'real-plan.md'), specs('development', 'compact-plan.md'));
    await run({ apply: true });
    expect(text()).toMatch(/compact-plan\.md is a symbolic link, so nothing was written/);
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(lstatSync(specs('development', 'compact-plan.md')).isSymbolicLink()).toBe(true);
  });

  test('a linked .specs is refused (BL-130)', async () => {
    const real = join(base, 'shared');
    mkdirSync(join(real, 'development'), { recursive: true });
    mkdirSync(join(real, 'planning'), { recursive: true });
    writeFileSync(join(real, 'development', 'context.md'), CONTEXT);
    writeFileSync(join(real, 'development', 'compact-plan.md'), PLAN);
    writeFileSync(join(real, 'planning', 'tasks-archive.md'), TASKS_ARCHIVE);
    rmSync(join(base, '.specs'), { recursive: true });
    symlinkSync(real, join(base, '.specs'));
    await run({ apply: true });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(join(real, 'development', 'context.md'), 'utf8')).toBe(CONTEXT);
  });

  test('off main the branch guard asks; n cancels, --force skips the question', async () => {
    writeFileSync(join(base, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    expect(question).toHaveBeenCalledTimes(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    await run({ apply: true, force: true });
    expect(question).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Moved 1 entries to context-archive.md');
  });
});
