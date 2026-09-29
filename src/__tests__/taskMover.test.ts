import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import * as os from 'os';
import { moveShapeError, moveTask, planMove, sha256, STALE_ERROR, TaskMove } from '../utils/taskMover';
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
