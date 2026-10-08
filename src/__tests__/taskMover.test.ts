import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import * as os from 'os';
import {
  moveShapeError,
  moveTask,
  NEW_STALE_ERROR,
  newTask,
  NewTask,
  newTaskShapeError,
  nextTaskId,
  planMove,
  planNewTask,
  sha256,
  STALE_ERROR,
  TaskMove,
} from '../utils/taskMover';
import * as validator from '../utils/specValidator';
import { tasksChecks } from '../utils/specValidator';

// Fault injection for the crash test: the real fs, with writeSync/renameSync routed through hooks.
const mockFs: { beforeRename?: () => void; onRead?: (path: string) => void } = {};
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (...args: unknown[]) => {
      mockFs.onRead?.(String(args[0]));
      return actual.readFileSync(...args);
    },
    renameSync: (...args: unknown[]) => {
      mockFs.beforeRename?.();
      return actual.renameSync(...args);
    },
  };
});

/** Shaped like the real file: front matter, intro, two 2-column tables, a 3-column Completed. */
const TASKS = [
  '---',
  'fileID: TASKS-001',
  'relatedFiles: [roadmap.md, requirements.md, project.yaml]',
  '---',
  '',
  '# Tasks',
  '',
  'Intro text stays put.',
  '',
  '## Backlog',
  '',
  '| ID | Description |',
  '|---|---|',
  "| BL-001 | First, with `'a' | 'b'` in it |",
  '| BL-002 |  Second, odd  spacing   |',
  '| BL-003 | Third |',
  '',
  '## Current Sprint',
  '',
  '| ID | Description |',
  '|---|---|',
  '| CS-001 | Sprint one |',
  '| BL-004 | Sprint two |',
  '',
  '## Completed',
  '',
  '| # | ID | Description |',
  '|---|---|---|',
  '| 1 | [CD-001] | Done |',
  '',
].join('\n');

const line = (content: string, id: string) => content.split('\n').find(l => l.includes(`| ${id} |`))!;

/** The before/after differ by exactly one line: the moved one, byte-identical, in a new place. */
function expectOneLineMove(before: string, after: string, moved: string): void {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b).toHaveLength(a.length);
  expect(after).not.toBe(before);
  const drop = (xs: string[]) => {
    const k = xs.indexOf(moved);
    expect(k).toBeGreaterThanOrEqual(0);
    return [...xs.slice(0, k), ...xs.slice(k + 1)];
  };
  expect(drop(b)).toEqual(drop(a));
}

/** What `git diff --numstat` says about the two versions: "added removed". */
function gitNumstat(before: string, after: string): string {
  const dir = mkdtempSync(join(os.tmpdir(), 'specpilot-diff-'));
  writeFileSync(join(dir, 'a.md'), before);
  writeFileSync(join(dir, 'b.md'), after);
  try {
    return execFileSync('git', ['diff', '--no-index', '--numstat', 'a.md', 'b.md'], { cwd: dir, encoding: 'utf-8' });
  } catch (err) {
    return String((err as { stdout?: string }).stdout ?? ''); // exit 1 = files differ
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('planMove: a move is one line cut and pasted', () => {
  it.each<[string, TaskMove]>([
    ['up within Backlog', { id: 'BL-003', toSection: 'backlog', toIndex: 0 }],
    ['down within Backlog (first row to last)', { id: 'BL-001', toSection: 'backlog', toIndex: 2 }],
    ['Backlog → end of Current Sprint', { id: 'BL-002', toSection: 'currentSprint', toIndex: 2 }],
    ['Current Sprint → top of Backlog', { id: 'CS-001', toSection: 'backlog', toIndex: 0 }],
    ['last row of Current Sprint → middle of Backlog', { id: 'BL-004', toSection: 'backlog', toIndex: 1 }],
  ])('%s: exactly one line moves, every other byte stays', (_name, move) => {
    const plan = planMove(TASKS, move);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expectOneLineMove(TASKS, plan.content, line(TASKS, move.id));
    expect(gitNumstat(TASKS, plan.content).trim()).toBe('1\t1\ta.md => b.md');
  });

  it('puts the row where toIndex says, counted after the move', () => {
    const plan = planMove(TASKS, { id: 'BL-001', toSection: 'backlog', toIndex: 1 });
    expect(plan.ok && plan.content.split('\n').slice(13, 16).map(l => l.split(' | ')[0])).toEqual(['| BL-002', '| BL-001', '| BL-003']);
  });

  it('keeps CRLF line endings, the moved line carrying its own \\r', () => {
    const crlf = TASKS.replace(/\n/g, '\r\n');
    const plan = planMove(crlf, { id: 'BL-003', toSection: 'currentSprint', toIndex: 0 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expectOneLineMove(crlf, plan.content, line(crlf, 'BL-003'));
    expect(plan.content.split('\r\n')).toHaveLength(crlf.split('\r\n').length);
    expect(plan.content.replace(/\r\n/g, '')).not.toContain('\n');
    expect(gitNumstat(crlf, plan.content).trim()).toBe('1\t1\ta.md => b.md');
  });

  it('keeps a file with no trailing newline without one', () => {
    const bare = TASKS.slice(0, -1);
    const plan = planMove(bare, { id: 'BL-002', toSection: 'currentSprint', toIndex: 1 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expectOneLineMove(bare, plan.content, line(bare, 'BL-002'));
    expect(plan.content.endsWith('\n')).toBe(false);
    expect(gitNumstat(bare, plan.content).trim()).toBe('1\t1\ta.md => b.md');
  });

  it('refuses to move the file\'s last line when there is no line break after it', () => {
    const endsInSprint = TASKS.slice(0, TASKS.indexOf('\n## Completed')).replace(/\n+$/, '');
    expect(endsInSprint.endsWith('| BL-004 | Sprint two |')).toBe(true);
    for (const move of [
      { id: 'BL-004', toSection: 'backlog', toIndex: 0 },
      { id: 'BL-001', toSection: 'currentSprint', toIndex: 2 },
    ] as TaskMove[]) {
      const plan = planMove(endsInSprint, move);
      expect(plan).toEqual({ ok: false, error: expect.stringContaining('no line break after its last line') });
    }
  });

  it('treats a move to where the row already is as a no-op', () => {
    expect(planMove(TASKS, { id: 'BL-002', toSection: 'backlog', toIndex: 1 })).toMatchObject({ ok: true, noop: true, content: TASKS });
  });

  it.each<[string, string, TaskMove, string]>([
    ['unknown ID', TASKS, { id: 'BL-999', toSection: 'backlog', toIndex: 0 }, 'No task row in planning/tasks.md has the ID BL-999.'],
    ['an ID on two rows', TASKS.replace('| CS-001 | Sprint one |', '| BL-002 | Sprint one |'), { id: 'BL-002', toSection: 'backlog', toIndex: 0 }, 'BL-002 is on more than one row in planning/tasks.md, so SpecPilot cannot tell which to move.'],
    ['a Completed row', TASKS, { id: '[CD-001]', toSection: 'backlog', toIndex: 0 }, 'Completed rows cannot be moved.'],
    ['a section without a table', TASKS.replace('| ID | Description |\n|---|---|\n| CS-001 | Sprint one |\n| BL-004 | Sprint two |', '[TODO]'), { id: 'BL-001', toSection: 'currentSprint', toIndex: 0 }, 'Current Sprint has no table yet.'],
    ['an index past the end', TASKS, { id: 'BL-001', toSection: 'currentSprint', toIndex: 3 }, 'Position 3 is past the end of Current Sprint, which would have 3 rows.'],
  ])('refuses %s, in plain words', (_n, content, move, error) => {
    expect(planMove(content, move)).toEqual({ ok: false, error });
  });

  it.each([
    [null, 'The request must be a JSON object with id, toSection and toIndex.'],
    [{ toSection: 'backlog', toIndex: 0 }, 'The request has no task ID.'],
    [{ id: 'BL-1', toSection: 'completed', toIndex: 0 }, 'Tasks can only be moved to Backlog or Current Sprint.'],
    [{ id: 'BL-1', toSection: 'backlog', toIndex: -1 }, 'The position must be a whole number, 0 or more.'],
    [{ id: 'BL-1', toSection: 'backlog', toIndex: 1.5 }, 'The position must be a whole number, 0 or more.'],
  ])('checks the request shape: %j', (body, error) => {
    expect(moveShapeError(body)).toBe(error);
  });
});

describe('tasksChecks: the validator\'s tasks.md checks on content in memory', () => {
  it('reports what `specpilot validate` reports, worded the same way', () => {
    expect(tasksChecks(TASKS)).toEqual([]);
    expect(tasksChecks('# Tasks\n\nnothing tracked\n')).toEqual([
      'tasks.md should track task status (In Progress, Completed, etc.)',
      'planning/tasks.md is missing YAML front-matter metadata.',
      'planning/tasks.md should reference planning/roadmap.md',
      'planning/tasks.md should reference project/requirements.md',
      'planning/tasks.md should reference project/project.yaml',
    ]);
  });
});

describe('moveTask: the write on disk', () => {
  let root: string;
  let file: string;
  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-move-'));
    mkdirSync(join(root, '.specs', 'planning'), { recursive: true });
    file = join(root, '.specs', 'planning', 'tasks.md');
    writeFileSync(file, TASKS);
  });
  afterEach(() => {
    mockFs.beforeRename = undefined;
    mockFs.onRead = undefined;
    rmSync(root, { recursive: true, force: true });
  });
  const leftovers = () => readdirSync(join(root, '.specs', 'planning')).filter(f => f !== 'tasks.md');
  const move: TaskMove = { id: 'BL-001', toSection: 'currentSprint', toIndex: 0 };

  it('writes the one-line move, returns the new hash, keeps the file mode, leaves no temp file', () => {
    chmodSync(file, 0o640);
    const out = moveTask(root, move, sha256(TASKS));
    const after = readFileSync(file, 'utf-8');
    expect(out).toEqual({ status: 200, sha256: sha256(after), from: 'backlog', fromIndex: 0 });
    expectOneLineMove(TASKS, after, line(TASKS, 'BL-001'));
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(leftovers()).toEqual([]);
  });

  it('409s on a stale hash and leaves the file untouched', () => {
    expect(moveTask(root, move, sha256('something else'))).toEqual({ status: 409, error: STALE_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(TASKS);
  });

  it.each<TaskMove>([
    { id: 'BL-999', toSection: 'backlog', toIndex: 0 },
    { id: '[CD-001]', toSection: 'backlog', toIndex: 0 },
  ])('422s on %j and leaves the file untouched', bad => {
    expect(moveTask(root, bad, sha256(TASKS)).status).toBe(422);
    expect(readFileSync(file, 'utf-8')).toBe(TASKS);
    expect(leftovers()).toEqual([]);
  });

  it('will not replace a symlinked tasks.md', () => {
    writeFileSync(join(root, 'real-tasks.md'), TASKS);
    rmSync(file);
    symlinkSync(join(root, 'real-tasks.md'), file);
    expect(moveTask(root, move, sha256(TASKS))).toEqual({ status: 422, error: expect.stringContaining('symbolic link') });
    expect(readFileSync(join(root, 'real-tasks.md'), 'utf-8')).toBe(TASKS);
  });

  it('a crash just before the rename leaves the original whole and no temp file behind', () => {
    mockFs.beforeRename = () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    expect(() => moveTask(root, move, sha256(TASKS))).toThrow('disk full');
    expect(readFileSync(file, 'utf-8')).toBe(TASKS);
    expect(leftovers()).toEqual([]);
  });

  it('re-checks the hash right before the rename (an editor saved meanwhile) and does not clobber it', () => {
    // Simulate the editor's save landing between our first read and the pre-rename re-check.
    const edited = TASKS.replace('Intro text stays put.', 'Intro text edited in the editor.');
    let reads = 0;
    mockFs.onRead = p => {
      if (p === file && ++reads === 2) writeFileSync(file, edited);
    };
    expect(moveTask(root, move, sha256(TASKS))).toEqual({ status: 409, error: STALE_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(edited);
    expect(leftovers()).toEqual([]);
  });

  it('refuses a file that is not valid UTF-8 rather than rewrite its bytes', () => {
    const bytes = Buffer.concat([Buffer.from(TASKS.replace('Intro text stays put.', 'Intro ')), Buffer.from([0xff, 0xfe])]);
    writeFileSync(file, bytes);
    const out = moveTask(root, move, sha256(bytes));
    expect(out).toEqual({ status: 422, error: expect.stringContaining('not valid UTF-8') });
    expect(readFileSync(file).equals(bytes)).toBe(true);
  });

  it('says so when tasks.md does not exist', () => {
    rmSync(file);
    expect(moveTask(root, move, 'x')).toEqual({ status: 422, error: 'planning/tasks.md does not exist.' });
  });
});

// ─── New Task (BL-PM-005) ────────────────────────────────────────────────────

describe('nextTaskId: the highest number in ID positions, plus one', () => {
  const backlog = (...ids: string[]) => ['## Backlog', '', '| ID | Description |', '|---|---|', ...ids.map(id => `| ${id} | x |`), ''].join('\n');

  it('takes the highest and never fills a gap', () => {
    expect(nextTaskId('BL', [backlog('BL-001', 'BL-005', 'BL-003')])).toBe('BL-006');
  });

  it('counts the archive, whose highest can win', () => {
    expect(nextTaskId('CS', [backlog('CS-078'), '| 9 | [CD-120] [CS-091] | Done |'])).toBe('CS-092');
  });

  it('ignores IDs in running text, bare or bracketed, and BL-PM-### rows: still BL-088', () => {
    const tasks = backlog('BL-086', 'BL-PM-100', 'BL-087') + '| BL-PM-099 | follow-up to [BL-500], see BL-600 and CS-096 |\n\nNotes name BL-700 and [BL-800].\n';
    expect(nextTaskId('BL', [tasks, ''])).toBe('BL-088');
    expect(nextTaskId('CS', [tasks, ''])).toBe('CS-001');
  });

  it('BL-090 in tasks-archive.md makes the next BL-091', () => {
    const tasks = backlog('BL-086', 'BL-PM-100', 'BL-087');
    const archive = '## Archived Completed Items\n\n1. [CD-001] [BL-090] Done long ago\n';
    expect(nextTaskId('BL', [tasks, archive])).toBe('BL-091');
  });

  it('reads the second cell of Completed and archived tables, and the leading tags of a list item', () => {
    expect(nextTaskId('BL', ['| # | ID | Description |\n|---|---|---|\n| 126 | [CD-girishr-035] [BL-041] [REQ-002.B.9] | mentions [BL-999] |\n'])).toBe('BL-042');
    expect(nextTaskId('CS', ['28. [CD-067] [CS-014] text naming [CS-999]\n'])).toBe('CS-015');
  });

  it('keeps BL and CS apart, starts at 001 and grows past three digits', () => {
    expect(nextTaskId('BL', [backlog('CS-050')])).toBe('BL-001');
    expect(nextTaskId('CS', [backlog('BL-050')])).toBe('CS-001');
    expect(nextTaskId('BL', [backlog('BL-999')])).toBe('BL-1000');
  });

  it('gives BL-088 and CS-092 on this repository\'s own files', () => {
    const own = ['tasks.md', 'tasks-archive.md'].map(f => readFileSync(join(__dirname, '../../.specs/planning', f), 'utf-8'));
    // The build adds no row to tasks.md; if one is added later, this pins the rule, not the number.
    expect(Number(nextTaskId('BL', own).slice(3))).toBeGreaterThanOrEqual(88);
    expect(Number(nextTaskId('CS', own).slice(3))).toBeGreaterThanOrEqual(92);
  });
});

describe('planNewTask: one line inserted, every other byte kept', () => {
  const plan = (content: string, task: NewTask, archive = '') => planNewTask(content, archive, task);

  it('appends after Backlog\'s last row: git sees one insertion and nothing else', () => {
    const out = plan(TASKS, { description: 'Fourth', section: 'backlog' });
    expect(out).toEqual({ ok: true, content: expect.any(String), id: 'BL-005', index: 3 });
    if (!out.ok) return;
    const lines = out.content.split('\n');
    expect(lines[16]).toBe('| BL-005 | Fourth |');
    expect([...lines.slice(0, 16), ...lines.slice(17)]).toEqual(TASKS.split('\n'));
    expect(gitNumstat(TASKS, out.content).trim()).toBe('1\t0\ta.md => b.md');
  });

  it('puts the first row of an empty table right after its separator', () => {
    const empty = TASKS.replace('| CS-001 | Sprint one |\n| BL-004 | Sprint two |\n', '');
    const out = plan(empty, { description: 'First in sprint', section: 'currentSprint' });
    expect(out.ok && out.content).toBe(empty.replace('## Current Sprint\n\n| ID | Description |\n|---|---|\n', '## Current Sprint\n\n| ID | Description |\n|---|---|\n| CS-001 | First in sprint |\n'));
    expect(out.ok && out.index).toBe(0);
    expect(out.ok && gitNumstat(empty, out.content).trim()).toBe('1\t0\ta.md => b.md');
  });

  it('keeps a CRLF file CRLF', () => {
    const crlf = TASKS.replace(/\n/g, '\r\n');
    const out = plan(crlf, { description: 'Fourth', section: 'backlog' });
    expect(out.ok && out.content).toBe(crlf.replace('| BL-003 | Third |\r\n', '| BL-003 | Third |\r\n| BL-005 | Fourth |\r\n'));
    expect(out.ok && gitNumstat(crlf, out.content).trim()).toBe('1\t0\ta.md => b.md');
  });

  it('writes the description as typed: markdown kept, surrounding white space removed, nothing added', () => {
    const out = plan(TASKS, { description: '  Fix `serve` **now**, see [docs](README.md)  ', section: 'backlog' });
    expect(out.ok && out.content.split('\n')[16]).toBe('| BL-005 | Fix `serve` **now**, see [docs](README.md) |');
  });

  it.each<[string, string, NewTask, string]>([
    ['no ## Current Sprint', TASKS.replace('## Current Sprint', '## Later'), { description: 'x', section: 'currentSprint' }, 'planning/tasks.md has no ## Current Sprint section.'],
    ['a section without a table', TASKS.replace('| ID | Description |\n|---|---|\n| CS-001 | Sprint one |\n| BL-004 | Sprint two |', '[TODO]'), { description: 'x', section: 'currentSprint' }, 'Current Sprint has no table yet.'],
    ['a last row with no line break after it', TASKS.slice(0, TASKS.indexOf('\n## Completed')).replace(/\n+$/, ''), { description: 'x', section: 'currentSprint' }, 'The new row would become the last line of planning/tasks.md, which has no line break after its last line. Add one and try again.'],
  ])('refuses %s', (_n, content, task, error) => {
    expect(plan(content, task)).toEqual({ ok: false, error });
  });
});

describe('newTaskShapeError: what a table cell can hold as typed', () => {
  const ok = (description: unknown, section: unknown = 'backlog') => newTaskShapeError({ description, section });
  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['LF', 'a\nb'],
    ['CR', 'a\rb'],
    ['U+2028', 'a b'],
    ['U+2029', 'a b'],
    ['a tab', 'a\tb'],
    ['another C0 control', 'a\u0001b'],
    ['DEL', 'a\u007fb'],
    ['U+0085 (C1)', 'a\u0085b'],
    ['an unpaired surrogate', 'a\ud800b'],
    ['a lone low surrogate', 'a\udc00b'],
    ['|', 'a | b'],
    ['a trailing backslash', 'path\\'],
    ['4001 characters', 'x'.repeat(4001)],
    ['4001 emoji', '😀'.repeat(4001)],
    ['not a string', 42],
  ])('refuses %s', (_n, d) => {
    expect(ok(d)).not.toBeNull();
  });

  it.each([
    ['4000 characters', 'x'.repeat(4000)],
    ['4000 emoji (the cap counts code points)', '😀'.repeat(4000)],
    ['a paired surrogate', '😀 done'],
    ['markdown', '`a` [b](c) **d**'],
    ['a backslash inside', 'a\\b'],
  ])('accepts %s', (_n, d) => {
    expect(ok(d)).toBeNull();
  });

  it.each([['completed'], ['Backlog'], [null]])('refuses section %j', section => {
    expect(ok('x', section)).toBe('New tasks can only go to Backlog or Current Sprint.');
  });

  it('refuses a body that is not an object', () => {
    expect(newTaskShapeError(null)).toBe('The request must be a JSON object with description and section.');
  });
});

describe('newTask: the write on disk', () => {
  let root: string;
  let file: string;
  let archive: string;
  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-new-'));
    mkdirSync(join(root, '.specs', 'planning'), { recursive: true });
    file = join(root, '.specs', 'planning', 'tasks.md');
    archive = join(root, '.specs', 'planning', 'tasks-archive.md');
    writeFileSync(file, TASKS);
  });
  afterEach(() => {
    mockFs.beforeRename = undefined;
    mockFs.onRead = undefined;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const leftovers = () => readdirSync(join(root, '.specs', 'planning')).filter(f => f !== 'tasks.md' && f !== 'tasks-archive.md');
  const task: NewTask = { description: 'Fourth', section: 'backlog' };
  const untouched = () => {
    expect(readFileSync(file, 'utf-8')).toBe(TASKS);
    expect(leftovers()).toEqual([]);
  };

  it('writes one line, returns hash, ID, section and index, keeps the mode, leaves no temp file', () => {
    chmodSync(file, 0o640);
    const out = newTask(root, task, sha256(TASKS));
    const after = readFileSync(file, 'utf-8');
    expect(out).toEqual({ status: 200, sha256: sha256(after), id: 'BL-005', section: 'backlog', index: 3 });
    expect(gitNumstat(TASKS, after).trim()).toBe('1\t0\ta.md => b.md');
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(leftovers()).toEqual([]);
  });

  it('numbers past the highest ID in tasks-archive.md', () => {
    writeFileSync(archive, '# Task Archive\n\n1. [CD-001] [BL-090] Old\n');
    expect(newTask(root, task, sha256(TASKS))).toMatchObject({ status: 200, id: 'BL-091' });
    expect(readFileSync(archive, 'utf-8')).toBe('# Task Archive\n\n1. [CD-001] [BL-090] Old\n'); // only read
  });

  it('409s on a stale hash, with a reload hint, and writes nothing', () => {
    expect(newTask(root, task, sha256('else'))).toEqual({ status: 409, error: NEW_STALE_ERROR });
    expect(NEW_STALE_ERROR).toContain('press Add Task again');
    untouched();
  });

  it('409s when an editor saves before the rename (the last look)', () => {
    const edited = TASKS.replace('Intro text stays put.', 'Edited.');
    let reads = 0;
    mockFs.onRead = p => {
      if (p === file && ++reads === 2) writeFileSync(file, edited);
    };
    expect(newTask(root, task, sha256(TASKS))).toEqual({ status: 409, error: NEW_STALE_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(edited);
    expect(leftovers()).toEqual([]);
  });

  it('will not replace a symlinked tasks.md', () => {
    writeFileSync(join(root, 'real.md'), TASKS);
    rmSync(file);
    symlinkSync(join(root, 'real.md'), file);
    expect(newTask(root, task, sha256(TASKS))).toEqual({ status: 422, error: expect.stringContaining('symbolic link') });
    expect(readFileSync(join(root, 'real.md'), 'utf-8')).toBe(TASKS);
  });

  it('refuses a tasks.md that is not valid UTF-8', () => {
    const bytes = Buffer.concat([Buffer.from(TASKS), Buffer.from([0xff])]);
    writeFileSync(file, bytes);
    expect(newTask(root, task, sha256(bytes))).toEqual({ status: 422, error: expect.stringContaining('not valid UTF-8') });
    expect(readFileSync(file).equals(bytes)).toBe(true);
  });

  it.each<[string, () => void, string]>([
    ['a symlinked archive', () => { writeFileSync(join(root, 'a.md'), ''); symlinkSync(join(root, 'a.md'), archive); }, 'symbolic link'],
    ['an archive that is a directory', () => mkdirSync(archive), 'not a regular file'],
    ['an archive that is not valid UTF-8', () => writeFileSync(archive, Buffer.from([0x31, 0xff])), 'not valid UTF-8'],
  ])('refuses %s', (_n, setup, error) => {
    setup();
    expect(newTask(root, task, sha256(TASKS))).toEqual({ status: 422, error: expect.stringContaining(error) });
    untouched();
  });

  it('refuses a row after which `specpilot validate` would report something new', () => {
    jest.spyOn(validator, 'tasksChecks').mockImplementation(c => (c.includes('Fourth') ? ['planted warning'] : []));
    expect(newTask(root, task, sha256(TASKS))).toEqual({ status: 422, error: expect.stringContaining('planted warning') });
    untouched();
  });

  it('refuses a plan the file cannot take, with nothing written', () => {
    expect(newTask(root, { description: 'x', section: 'currentSprint' }, sha256(TASKS)).status).toBe(200);
    const noTable = TASKS.replace('| ID | Description |\n|---|---|\n| CS-001 | Sprint one |\n| BL-004 | Sprint two |', '[TODO]');
    writeFileSync(file, noTable);
    expect(newTask(root, { description: 'x', section: 'currentSprint' }, sha256(noTable))).toEqual({ status: 422, error: 'Current Sprint has no table yet.' });
    expect(readFileSync(file, 'utf-8')).toBe(noTable);
  });

  it('a crash just before the rename leaves the original whole and no temp file', () => {
    mockFs.beforeRename = () => {
      throw new Error('disk full');
    };
    expect(() => newTask(root, task, sha256(TASKS))).toThrow('disk full');
    untouched();
  });
});
