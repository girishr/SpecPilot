import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import * as os from 'os';
import {
  ARCHIVE_SPLIT_ERROR,
  ARCHIVE_STALE_ERROR,
  archiveCompleted,
  COMPLETED_BY_HAND,
  completedArchiveStatus,
  localDate,
  moveShapeError,
  MOVES,
  moveTask,
  NEW_STALE_ERROR,
  newTask,
  NewTask,
  newTaskShapeError,
  nextTaskId,
  NO_COMPLETED_ERROR,
  NOTHING_TO_ARCHIVE_ERROR,
  nothingPastKeepError,
  planMove,
  planNewTask,
  planReview,
  REVIEW_STALE_ERROR,
  reviewNote,
  ReviewRequest,
  reviewShapeError,
  reviewTask,
  suggestedIds,
  sha256,
  STALE_ERROR,
  TaskMove,
} from '../utils/taskMover';
import { completedArchiveBlock, planCompletedArchive, SpecArchiver } from '../utils/specArchiver';
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
  '## Review',
  '',
  '| ID | Description |',
  '|---|---|',
  '',
].join('\n');

/** TASKS with two Review rows and a Won't do section (BL-113); the IDs sit after TASKS's, so its next-ID cases keep their numbers. */
const RTASKS = TASKS + ['| BL-005 | Reviewed one |', '| BL-006 | Reviewed two, approved Approved 2026-10-02 |', '', "## Won't do", '', '| ID | Description | Reason |', '|---|---|---|', '| BL-007 | Dropped | Not needed |', ''].join('\n');

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

  // BL-TB-11: the one table of allowed lane moves, enforced here and sent to the page as tasks.moves.
  it('the move table MOVES: Backlog and Current Sprint each to the other, Current Sprint to Review, Review back to Current Sprint, nothing else (BL-113)', () => {
    expect(MOVES).toEqual({ backlog: ['currentSprint'], currentSprint: ['backlog', 'review'], review: ['currentSprint'] });
  });

  it('allows every pair the table names and a reorder within each key', () => {
    const ids = { backlog: 'BL-001', currentSprint: 'CS-001', review: 'BL-005' } as const;
    for (const [from, targets] of Object.entries(MOVES) as [keyof typeof MOVES, readonly TaskMove['toSection'][]][]) {
      for (const to of [from, ...targets]) expect(planMove(RTASKS, { id: ids[from], toSection: to, toIndex: 0 }).ok).toBe(true);
    }
  });

  it('refuses a target the row\'s lane does not map to, and a lane with no entry, in plain words (handed a table without them)', () => {
    const table = { backlog: [], currentSprint: ['backlog'] };
    expect(planMove(TASKS, { id: 'BL-001', toSection: 'currentSprint', toIndex: 0 }, table)).toEqual({ ok: false, error: 'Backlog rows cannot be moved to Current Sprint.' });
    expect(planMove(TASKS, { id: 'BL-001', toSection: 'backlog', toIndex: 2 }, table).ok).toBe(true); // its own lane still reorders
    expect(planMove(TASKS, { id: 'CS-001', toSection: 'backlog', toIndex: 0 }, table).ok).toBe(true);
    expect(planMove(TASKS, { id: 'BL-001', toSection: 'backlog', toIndex: 0 }, { currentSprint: ['backlog'] })).toEqual({ ok: false, error: 'Backlog rows cannot be moved.' });
  });

  it('BL-113: a Review row goes back to Current Sprint only, byte for byte with its markers, never to Backlog; a Won\'t do row never moves', () => {
    const back = planMove(RTASKS, { id: 'BL-006', toSection: 'currentSprint', toIndex: 2 });
    expect(back.ok).toBe(true);
    if (back.ok) expectOneLineMove(RTASKS, back.content, line(RTASKS, 'BL-006')); // the Approved marker travels with the line, nothing added
    expect(planMove(RTASKS, { id: 'BL-005', toSection: 'backlog', toIndex: 0 })).toEqual({ ok: false, error: 'Review rows cannot be moved to Backlog.' });
    expect(planMove(RTASKS, { id: 'BL-007', toSection: 'currentSprint', toIndex: 0 })).toEqual({ ok: false, error: "Won't do rows cannot be moved." });
    expect(planMove(RTASKS, { id: 'CS-001', toSection: 'review', toIndex: 2 }).ok).toBe(true);
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
    [{ id: 'BL-1', toSection: 'completed', toIndex: 0 }, COMPLETED_BY_HAND], // BL-113: the by-hand rule, before the key text
    [{ id: 'BL-1', toSection: 'wontDo', toIndex: 0 }, 'Tasks can only be moved to Backlog, Current Sprint or Review.'],
    [{ id: 'BL-1', toSection: '__proto__', toIndex: 0 }, 'Tasks can only be moved to Backlog, Current Sprint or Review.'], // an inherited name is not a lane (BL-TB-11)
    [{ id: 'BL-1', toSection: 'toString', toIndex: 0 }, 'Tasks can only be moved to Backlog, Current Sprint or Review.'],
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
      'planning/tasks.md has no `## Backlog` section (`## ` headings found: none).',
      'planning/tasks.md has no `## Current Sprint` section (`## ` headings found: none).',
      'planning/tasks.md has no `## Review` section (`## ` headings found: none).',
      'planning/tasks.md has no `## Completed` section (`## ` headings found: none).',
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


// ---- Review (BL-113, REQ-002.H.55): a marker appended to one Review row's cell, or the last one removed by naming it

describe('reviewNote: what goes into the cell', () => {
  it('turns runs of line breaks into one space, escapes |, trims, and keeps everything else as typed', () => {
    expect(reviewNote('  fix the\r\n\ntest  ')).toEqual({ note: 'fix the test' });
    expect(reviewNote('a | b c')).toEqual({ note: 'a \\| b c' });
    expect(reviewNote(undefined)).toEqual({ note: '' });
    expect(reviewNote('`code` **bold**')).toEqual({ note: '`code` **bold**' });
    expect(reviewNote('😀'.repeat(200))).toEqual({ note: '😀'.repeat(200) }); // 200 code points
  });
  it.each([
    ['a tab', 'a\tb', 'control character'],
    ['an unpaired surrogate', 'a\ud800b', 'cannot be written as UTF-8'],
    ['a trailing backslash', 'path\\', 'cannot end in \\'],
    ['201 characters', 'x'.repeat(201), 'longer than 200'],
    ['not text', 42, 'must be text'],
  ])('refuses %s', (_n, raw, text) => {
    const out = reviewNote(raw);
    expect('error' in out && out.error).toContain(text);
  });
});

describe('reviewShapeError', () => {
  it.each<[unknown, string | null]>([
    [{ id: 'BL-005', action: 'approve' }, null],
    [{ id: 'BL-005', action: 'sendBack' }, null],
    [{ id: 'BL-005', action: 'sendBack', note: 'x' }, null],
    [{ id: 'BL-005', action: 'unapprove', date: '2026-10-20' }, null],
    [{ id: 'BL-005', action: 'unsendBack', date: '2026-10-20', note: '', toIndex: 0 }, null],
    [null, 'The request must be a JSON object with id and action.'],
    [[], 'The request must be a JSON object with id and action.'],
    [{ action: 'approve' }, 'The request has no task ID.'],
    [{ id: 'BL-005', action: 'complete' }, 'action must be approve, unapprove, sendBack or unsendBack.'],
    [{ id: 'BL-005', action: 'sendBack', note: 'a\tb' }, 'The note contains a control character (such as a tab), which a table row cannot hold as typed.'],
    [{ id: 'BL-005', action: 'unapprove' }, 'date must be the YYYY-MM-DD the action wrote.'],
    [{ id: 'BL-005', action: 'unapprove', date: '20 Oct' }, 'date must be the YYYY-MM-DD the action wrote.'],
    [{ id: 'BL-005', action: 'unsendBack', date: '2026-10-20', toIndex: 0 }, 'note must be the text the send back wrote, or empty.'],
    [{ id: 'BL-005', action: 'unsendBack', date: '2026-10-20', note: '', toIndex: -1 }, 'The position must be a whole number, 0 or more.'],
  ])('%j → %s', (body, error) => {
    expect(reviewShapeError(body)).toBe(error);
  });
});

describe('planReview: one cell changed, every other byte kept', () => {
  const TODAY = '2026-10-20';
  const plan = (content: string, req: ReviewRequest) => planReview(content, req, TODAY);
  /** The two versions differ in exactly one line, and in it only by `suffix` at the cell's end. */
  const expectOneCellEdit = (before: string, after: string, id: string, suffix: string) => {
    const a = before.split('\n');
    const b = after.split('\n');
    expect(b).toHaveLength(a.length);
    const k = a.findIndex(l => l.includes(`| ${id} |`));
    expect(b.filter((l, i) => l !== a[i]).length).toBe(1);
    expect(b[k]).not.toBe(a[k]);
    const tail = /(\s*\|)?\s*\r?$/.exec(a[k])![0];
    expect(b[k]).toBe(a[k].slice(0, a[k].length - tail.length) + suffix + tail);
    expect(gitNumstat(before, after).trim()).toBe('1\t1\ta.md => b.md');
  };

  it('approve appends ` Approved <today>` inside the cell, before the closing pipe', () => {
    const out = plan(RTASKS, { id: 'BL-005', action: 'approve' });
    expect(out).toMatchObject({ ok: true, date: TODAY, note: '', fromIndex: 0, index: 0 });
    if (out.ok) {
      expectOneCellEdit(RTASKS, out.content, 'BL-005', ' Approved 2026-10-20');
      expect(line(out.content, 'BL-005')).toBe('| BL-005 | Reviewed one Approved 2026-10-20 |');
    }
  });

  it.each([
    ['a row without a closing pipe', '| BL-005 | Reviewed one', '| BL-005 | Reviewed one Approved 2026-10-20'],
    ['a row with odd spacing before the pipe', '| BL-005 |  Reviewed one   |', '| BL-005 |  Reviewed one Approved 2026-10-20   |'],
    ['an empty cell', '| BL-005 |  |', '| BL-005 | Approved 2026-10-20  |'],
    ['a CRLF row', '| BL-005 | Reviewed one |\r', '| BL-005 | Reviewed one Approved 2026-10-20 |\r'],
  ])('approve keeps the tail of %s', (_n, row, expected) => {
    const content = RTASKS.replace('| BL-005 | Reviewed one |', row);
    const out = plan(content, { id: 'BL-005', action: 'approve' });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.content.split('\n').find(l => l.startsWith('| BL-005 |'))).toBe(expected);
  });

  it('approve refuses a row already approved, a row outside Review, an unknown and a duplicate ID', () => {
    expect(plan(RTASKS, { id: 'BL-006', action: 'approve' })).toEqual({ ok: false, error: 'BL-006 is already marked Approved.' });
    expect(plan(RTASKS, { id: 'CS-001', action: 'approve' })).toEqual({ ok: false, error: 'CS-001 is in Current Sprint, so it cannot be approved: only a Review row can be.' });
    expect(plan(RTASKS, { id: 'BL-999', action: 'approve' })).toEqual({ ok: false, error: 'No task row in planning/tasks.md has the ID BL-999.' });
    expect(plan(RTASKS.replace('| BL-003 | Third |', '| BL-005 | Third |'), { id: 'BL-005', action: 'approve' })).toEqual({ ok: false, error: 'BL-005 is on more than one row in planning/tasks.md, so SpecPilot cannot tell which to change.' });
  });

  it('unapprove removes exactly the named marker and gives the bytes back; a wrong date or a cell without it is refused', () => {
    const approved = plan(RTASKS, { id: 'BL-005', action: 'approve' });
    if (!approved.ok) throw new Error(approved.error);
    const back = plan(approved.content, { id: 'BL-005', action: 'unapprove', date: TODAY });
    expect(back).toMatchObject({ ok: true, date: TODAY });
    if (back.ok) expect(back.content).toBe(RTASKS);
    expect(plan(approved.content, { id: 'BL-005', action: 'unapprove', date: '2026-10-19' })).toEqual({ ok: false, error: 'BL-005 is not marked Approved 2026-10-19, so there is nothing to undo.' });
    expect(plan(RTASKS, { id: 'BL-005', action: 'unapprove', date: TODAY })).toEqual({ ok: false, error: `BL-005 is not marked Approved ${TODAY}, so there is nothing to undo.` });
    // `Approved <date>` in running text, not at the end, is no marker (the reader's rule, shared)
    const running = RTASKS.replace('| BL-005 | Reviewed one |', '| BL-005 | Approved 2026-10-01 by the team |');
    expect(plan(running, { id: 'BL-005', action: 'unapprove', date: '2026-10-01' }).ok).toBe(false);
    expect(plan(running, { id: 'BL-005', action: 'approve' }).ok).toBe(true);
  });

  it('sendBack appends ` Sent back <today>: <note>` (the note escaped) and moves the row to the top of Current Sprint (D12); an empty note gives the dot form', () => {
    const out = plan(RTASKS, { id: 'BL-005', action: 'sendBack', note: ' tests | docs\nmissing ' });
    expect(out).toMatchObject({ ok: true, date: TODAY, note: 'tests \\| docs missing', fromIndex: 0, index: 0 });
    if (out.ok) {
      expect(line(out.content, 'BL-005')).toBe('| BL-005 | Reviewed one Sent back 2026-10-20: tests \\| docs missing |');
      const sprint = out.content.split('\n');
      const at = sprint.indexOf('## Current Sprint');
      expect(sprint.slice(at + 4, at + 7)).toEqual(['| BL-005 | Reviewed one Sent back 2026-10-20: tests \\| docs missing |', '| CS-001 | Sprint one |', '| BL-004 | Sprint two |']);
      expect(out.content.split('\n').filter(l => l.includes('BL-005'))).toHaveLength(1);
      expect(gitNumstat(RTASKS, out.content).trim()).toBe('1\t1\ta.md => b.md');
    }
    const dot = plan(RTASKS, { id: 'BL-005', action: 'sendBack' });
    expect(dot).toMatchObject({ ok: true, note: '' });
    if (dot.ok) expect(line(dot.content, 'BL-005')).toBe('| BL-005 | Reviewed one Sent back 2026-10-20. |');
    expect(plan(RTASKS, { id: 'BL-004', action: 'sendBack' })).toEqual({ ok: false, error: 'BL-004 is in Current Sprint, so it cannot be sent back: only a Review row can be.' });
    expect(plan(RTASKS.replace('| ID | Description |\n|---|---|\n| CS-001 | Sprint one |\n| BL-004 | Sprint two |', '[TODO]'), { id: 'BL-005', action: 'sendBack' })).toEqual({ ok: false, error: 'Current Sprint has no table yet.' });
  });

  it('unsendBack removes the named note and moves the row back to Review at toIndex, giving the bytes back; anything else is refused', () => {
    for (const note of ['tests \\| docs missing', '']) {
      const sent = plan(RTASKS, { id: 'BL-005', action: 'sendBack', note: note.replace('\\|', '|') });
      if (!sent.ok) throw new Error(sent.error);
      const back = plan(sent.content, { id: 'BL-005', action: 'unsendBack', date: TODAY, note, toIndex: 0 });
      expect(back).toMatchObject({ ok: true, index: 0 });
      if (back.ok) expect(back.content).toBe(RTASKS);
      expect(plan(sent.content, { id: 'BL-005', action: 'unsendBack', date: TODAY, note: 'another note', toIndex: 0 })).toEqual({ ok: false, error: 'BL-005 does not end with that Sent back note, so there is nothing to undo.' });
      expect(plan(sent.content, { id: 'BL-005', action: 'unsendBack', date: TODAY, note, toIndex: 5 })).toEqual({ ok: false, error: 'Position 5 is past the end of Review, which would have 2 rows.' });
    }
    // the row is found anywhere in Current Sprint, not only last
    const sent = plan(RTASKS, { id: 'BL-005', action: 'sendBack' });
    if (!sent.ok) throw new Error(sent.error);
    const reordered = planMove(sent.content, { id: 'BL-005', toSection: 'currentSprint', toIndex: 0 });
    if (!reordered.ok) throw new Error(reordered.error);
    const back = plan(reordered.content, { id: 'BL-005', action: 'unsendBack', date: TODAY, note: '', toIndex: 0 });
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.content).toBe(RTASKS);
    expect(plan(RTASKS, { id: 'BL-005', action: 'unsendBack', date: TODAY, note: '', toIndex: 0 })).toEqual({ ok: false, error: 'BL-005 is in Review, so it cannot be put back: only a Current Sprint row that was sent back can be.' });
  });
});

describe('reviewTask: the write on disk', () => {
  let root: string;
  let file: string;
  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-review-'));
    mkdirSync(join(root, '.specs', 'planning'), { recursive: true });
    file = join(root, '.specs', 'planning', 'tasks.md');
    writeFileSync(file, RTASKS);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const approve: ReviewRequest = { id: 'BL-005', action: 'approve' };

  it('writes the one-cell edit dated by `now`, returns the new hash, keeps the mode, leaves no temp file', () => {
    chmodSync(file, 0o640);
    const out = reviewTask(root, approve, sha256(RTASKS), new Date(2031, 1, 3, 23, 59));
    const after = readFileSync(file, 'utf-8');
    expect(out).toEqual({ status: 200, sha256: sha256(after), date: '2031-02-03', note: '', fromIndex: 0, index: 0 });
    expect(line(after, 'BL-005')).toBe('| BL-005 | Reviewed one Approved 2031-02-03 |');
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(readdirSync(join(root, '.specs', 'planning'))).toEqual(['tasks.md']);
    expect(localDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('409s on a stale hash, 422s on a refusal, refuses a symlinked tasks.md and bad UTF-8, writing nothing', () => {
    expect(reviewTask(root, approve, sha256('something else'))).toEqual({ status: 409, error: REVIEW_STALE_ERROR });
    expect(reviewTask(root, { id: 'BL-006', action: 'approve' }, sha256(RTASKS))).toEqual({ status: 422, error: 'BL-006 is already marked Approved.' });
    expect(readFileSync(file, 'utf-8')).toBe(RTASKS);
    const bad = Buffer.concat([Buffer.from(RTASKS), Buffer.from([0xff])]);
    writeFileSync(file, bad);
    expect(reviewTask(root, approve, sha256(bad)).status).toBe(422);
    rmSync(file);
    writeFileSync(join(root, 'real.md'), RTASKS);
    symlinkSync(join(root, 'real.md'), file);
    expect(reviewTask(root, approve, sha256(RTASKS))).toEqual({ status: 422, error: 'planning/tasks.md is a symbolic link, and SpecPilot will not replace it with a regular file.' });
    expect(readFileSync(join(root, 'real.md'), 'utf-8')).toBe(RTASKS);
  });
});

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

  // BL-TB-05: the page's `Next ID` hint, by the write's own rule
  it('suggestedIds gives the IDs newTask would assign, with no archive and with one', () => {
    expect(suggestedIds(root, TASKS)).toEqual({ backlog: 'BL-005', currentSprint: nextTaskId('CS', [TASKS, '']) });
    expect(suggestedIds(root, TASKS)!.backlog).toBe((newTask(root, task, sha256(TASKS)) as { id: string }).id);
    writeFileSync(archive, '# Task Archive\n\n1. [CD-001] [BL-090] [CS-120] Old\n');
    expect(suggestedIds(root, TASKS)).toEqual({ backlog: 'BL-091', currentSprint: 'CS-121' });
  });

  it('suggestedIds is null when the archive is a symbolic link, as the write refuses it', () => {
    symlinkSync(file, archive);
    expect(suggestedIds(root, TASKS)).toBeNull();
    expect(newTask(root, task, sha256(TASKS))).toMatchObject({ status: 422 });
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

// ---- BL-TB-06: the Completed step of `specpilot archive`, as the page runs it
describe('archiveCompleted: the Completed archive on disk', () => {
  let root: string;
  let file: string;
  let archive: string;
  /** TASKS with `n` more Completed rows after `| 1 | [CD-001] | Done |`, oldest first. */
  const withCompleted = (n: number) =>
    TASKS.replace('| 1 | [CD-001] | Done |\n', ['| 1 | [CD-001] | Done |', ...Array.from({ length: n }, (_, i) => `| ${i + 2} | [CD-${String(i + 2).padStart(3, '0')}] | Done ${i + 2} |`)].join('\n') + '\n');
  const BIG = withCompleted(40); // 46 section lines: heading, blank, header, separator, 41 rows, the trailing ''
  const stamp = (s: string) => s.replace(/## Archived on \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '## Archived on <T>');
  const leftovers = () => readdirSync(join(root, '.specs', 'planning')).filter(f => f !== 'tasks.md' && f !== 'tasks-archive.md');
  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-archive-'));
    mkdirSync(join(root, '.specs', 'planning'), { recursive: true });
    file = join(root, '.specs', 'planning', 'tasks.md');
    archive = join(root, '.specs', 'planning', 'tasks-archive.md');
    writeFileSync(file, BIG);
  });
  afterEach(() => {
    mockFs.beforeRename = undefined;
    mockFs.onRead = undefined;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('completedArchiveStatus gives the section\'s lines and the rows a forced archive would move, over the content the write plans from', () => {
    expect(completedArchiveStatus(withCompleted(34))).toEqual({ lines: 40, rows: 15 }); // within the limit: 35 rows, the keep rule still leaves 15 to force
    expect(completedArchiveStatus(withCompleted(35))).toEqual({ lines: 41, rows: 16 }); // 41 lines: 36 rows, keep 20
    const plan = planCompletedArchive(BIG.split('\n'))!;
    expect(completedArchiveStatus(BIG)).toEqual({ lines: 46, rows: plan.end - plan.start });
    expect(completedArchiveStatus(BIG).rows).toBe(21);
    expect(completedArchiveStatus(TASKS)).toEqual({ lines: 6, rows: 0 }); // one row: nothing past the newest 20
    expect(completedArchiveStatus(withCompleted(19))).toEqual({ lines: 25, rows: 0 }); // exactly 20 rows
    expect(completedArchiveStatus(withCompleted(20))).toEqual({ lines: 26, rows: 1 });
    expect(completedArchiveStatus(TASKS.replace('## Completed', '## Done'))).toEqual({ lines: 0, rows: 0 });
    expect(planCompletedArchive(withCompleted(34).split('\n'))).toBeNull(); // the CLI and the validator never force
  });

  it('within the limit: 422 without force, and with force the rows past the newest 20 move as the CLI\'s keep rule would', () => {
    const within = withCompleted(25); // 26 rows, 31 lines
    writeFileSync(file, within);
    expect(archiveCompleted(root, sha256(within))).toEqual({ status: 422, error: NOTHING_TO_ARCHIVE_ERROR });
    expect(archiveCompleted(root, sha256(within), false)).toEqual({ status: 422, error: NOTHING_TO_ARCHIVE_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(within);
    expect(existsSync(archive)).toBe(false);
    const lines = within.split('\n');
    const plan = planCompletedArchive(lines, true)!;
    const out = archiveCompleted(root, sha256(within), true);
    const after = readFileSync(file, 'utf-8');
    expect(out).toEqual({ status: 200, sha256: sha256(after), linesMoved: 6 });
    expect(after).toBe([...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'));
    expect(after.split('\n').filter(l => /^\| \d+ \|/.test(l))).toHaveLength(20);
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe(stamp(completedArchiveBlock(lines, plan)));
  });

  it('moves exactly the plan\'s rows into a new archive as the CLI\'s block, keeps every other line, gives the new file tasks.md\'s mode', () => {
    chmodSync(file, 0o640);
    const lines = BIG.split('\n');
    const plan = planCompletedArchive(lines)!;
    const out = archiveCompleted(root, sha256(BIG));
    const after = readFileSync(file, 'utf-8');
    expect(out).toEqual({ status: 200, sha256: sha256(after), linesMoved: 21 });
    expect(after).toBe([...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'));
    expect(after.split('\n').filter(l => /^\| \d+ \|/.test(l))).toHaveLength(20);
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe(stamp(completedArchiveBlock(lines, plan)));
    expect(readFileSync(archive, 'utf-8')).toContain('| # | ID | Description |\n|---|---|---|\n| 1 | [CD-001] | Done |\n');
    expect(statSync(archive).mode & 0o777).toBe(0o640);
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(leftovers()).toEqual([]);
  });

  it('writes the same bytes as `specpilot archive` for the same file', async () => {
    const cli = mkdtempSync(join(os.tmpdir(), 'specpilot-archive-cli-'));
    mkdirSync(join(cli, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(cli, '.specs', 'planning', 'tasks.md'), BIG);
    await new SpecArchiver().archive(cli, { dryRun: false });
    archiveCompleted(root, sha256(BIG));
    expect(readFileSync(file, 'utf-8')).toBe(readFileSync(join(cli, '.specs', 'planning', 'tasks.md'), 'utf-8'));
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe(stamp(readFileSync(join(cli, '.specs', 'planning', 'tasks-archive.md'), 'utf-8')));
    rmSync(cli, { recursive: true, force: true });
  });

  it('appends to an existing archive and keeps its mode', () => {
    writeFileSync(archive, '# Task Archive\n\n| # | ID | Description |\n|---|---|---|\n| 0 | [CD-000] | Older |\n');
    chmodSync(archive, 0o600);
    const plan = planCompletedArchive(BIG.split('\n'))!;
    expect(archiveCompleted(root, sha256(BIG)).status).toBe(200);
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe('# Task Archive\n\n| # | ID | Description |\n|---|---|---|\n| 0 | [CD-000] | Older |\n' + stamp(completedArchiveBlock(BIG.split('\n'), plan)));
    expect(statSync(archive).mode & 0o777).toBe(0o600);
  });

  it('moves a list-shaped Completed as the CLI does: the oldest entry lines, the block trimmed', () => {
    const entries = Array.from({ length: 41 }, (_, i) => `${i + 1}. [CD-${String(i + 1).padStart(3, '0')}] Completed task ${i + 1}`);
    const list = TASKS.replace('| # | ID | Description |\n|---|---|---|\n| 1 | [CD-001] | Done |\n', entries.join('\n') + '\n\n## Notes\n\nx\n');
    writeFileSync(file, list);
    const lines = list.split('\n');
    const plan = planCompletedArchive(lines)!;
    const moved = plan.end - plan.start; // the CLI's list rule counts the blank line after the entries, so 22 of the 41 entries move
    expect(moved).toBe(22);
    const checksBefore = tasksChecks(list);
    expect(archiveCompleted(root, sha256(list))).toMatchObject({ status: 200, linesMoved: moved }); // BL-116: the no-table warning is validate()'s alone, so the count's change is no new problem
    const checksAfter = tasksChecks(readFileSync(file, 'utf-8'));
    expect(checksAfter.filter(w => !checksBefore.includes(w))).toEqual([]); // nothing new (the limit warning going away is fine), so no 422
    expect([...checksBefore, ...checksAfter].some(w => w.includes('no table'))).toBe(false);
    expect(readFileSync(file, 'utf-8')).toBe([...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'));
    expect(readFileSync(file, 'utf-8')).toBe(list.replace(entries.slice(0, moved).join('\n') + '\n', ''));
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe(`## Archived on <T>\n\n${entries.slice(0, moved).join('\n')}\n\n---\n\n`);
    expect(stamp(readFileSync(archive, 'utf-8'))).toBe(stamp(completedArchiveBlock(lines, plan)));
  });

  it('refuses with nothing over the limit, and forced with nothing past the newest 20, writing nothing', () => {
    writeFileSync(file, TASKS);
    expect(archiveCompleted(root, sha256(TASKS))).toEqual({ status: 422, error: NOTHING_TO_ARCHIVE_ERROR });
    expect(NOTHING_TO_ARCHIVE_ERROR).toBe('Nothing to archive: ## Completed in planning/tasks.md is within its 40-line limit, and the request did not force it.');
    expect(archiveCompleted(root, sha256(TASKS), true)).toEqual({ status: 422, error: nothingPastKeepError(1) });
    expect(nothingPastKeepError(1)).toBe('Nothing to archive: ## Completed in planning/tasks.md has 1 row, and an archive keeps the newest 20.');
    expect(nothingPastKeepError(20)).toBe('Nothing to archive: ## Completed in planning/tasks.md has 20 rows, and an archive keeps the newest 20.');
    const twenty = withCompleted(19);
    writeFileSync(file, twenty);
    expect(archiveCompleted(root, sha256(twenty), true)).toEqual({ status: 422, error: nothingPastKeepError(20) });
    const none = TASKS.replace('## Completed', '## Done');
    writeFileSync(file, none);
    expect(archiveCompleted(root, sha256(none), true)).toEqual({ status: 422, error: NO_COMPLETED_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(none);
    expect(existsSync(archive)).toBe(false);
  });

  it.each([
    ['a symbolic-link archive', () => symlinkSync(file, archive), 'planning/tasks-archive.md is a symbolic link, so SpecPilot will not write to it.'],
    ['an archive that is a directory', () => mkdirSync(archive), 'planning/tasks-archive.md is not a regular file, so SpecPilot will not write to it.'],
    ['an archive that is not valid UTF-8', () => writeFileSync(archive, Buffer.from([0x31, 0xff])), 'planning/tasks-archive.md contains bytes that are not valid UTF-8, so SpecPilot will not write to it.'],
  ])('refuses %s, writing nothing', (_n, setup, error) => {
    setup();
    expect(archiveCompleted(root, sha256(BIG))).toEqual({ status: 422, error });
    expect(readFileSync(file, 'utf-8')).toBe(BIG);
    expect(leftovers()).toEqual([]);
  });

  it('refuses a symbolic-link tasks.md and a tasks.md that is not valid UTF-8', () => {
    const real = join(root, 'real.md');
    writeFileSync(real, BIG);
    rmSync(file);
    symlinkSync(real, file);
    expect(archiveCompleted(root, sha256(BIG))).toEqual({ status: 422, error: expect.stringContaining('symbolic link') });
    rmSync(file);
    const bad = Buffer.concat([Buffer.from(BIG, 'utf-8'), Buffer.from([0xff])]);
    writeFileSync(file, bad);
    expect(archiveCompleted(root, sha256(bad))).toEqual({ status: 422, error: expect.stringContaining('not valid UTF-8') });
    expect(existsSync(archive)).toBe(false);
  });

  it('refuses an archive after which `specpilot validate` would report something new', () => {
    jest.spyOn(validator, 'tasksChecks').mockImplementation(c => (c.includes('Done 41') && !c.includes('| 1 | [CD-001] |') ? ['planted warning'] : []));
    expect(archiveCompleted(root, sha256(BIG))).toEqual({ status: 422, error: 'Nothing was archived, because `specpilot validate` would then report: planted warning' });
    expect(readFileSync(file, 'utf-8')).toBe(BIG);
    expect(existsSync(archive)).toBe(false);
  });

  it('409s on a stale hash with nothing written', () => {
    expect(archiveCompleted(root, 'a'.repeat(64))).toEqual({ status: 409, error: ARCHIVE_STALE_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(BIG);
    expect(existsSync(archive)).toBe(false);
  });

  it('an editor save between the archive\'s write and the last look: 409 saying the rows are in both files, tasks.md as saved', () => {
    const changed = BIG.replace('# Tasks', '# Tasks (saved meanwhile)');
    let reads = 0;
    mockFs.onRead = path => {
      if (path === file && ++reads === 2) writeFileSync(file, changed); // the last look, after the archive block was written
    };
    expect(archiveCompleted(root, sha256(BIG))).toEqual({ status: 409, error: ARCHIVE_SPLIT_ERROR });
    expect(readFileSync(file, 'utf-8')).toBe(changed);
    expect(readFileSync(archive, 'utf-8')).toContain('| 1 | [CD-001] | Done |');
    expect(leftovers()).toEqual([]);
  });

  it('a crash at tasks.md\'s rename leaves the archive appended, tasks.md whole and no temp file', () => {
    let renames = 0;
    mockFs.beforeRename = () => {
      if (++renames === 2) throw new Error('disk full'); // the first rename is the archive's
    };
    expect(() => archiveCompleted(root, sha256(BIG))).toThrow('disk full');
    expect(readFileSync(file, 'utf-8')).toBe(BIG);
    expect(readFileSync(archive, 'utf-8')).toContain('| 1 | [CD-001] | Done |');
    expect(leftovers()).toEqual([]);
  });

  it('a crash at the archive\'s rename leaves both files as they were', () => {
    mockFs.beforeRename = () => {
      throw new Error('disk full');
    };
    expect(() => archiveCompleted(root, sha256(BIG))).toThrow('disk full');
    expect(readFileSync(file, 'utf-8')).toBe(BIG);
    expect(existsSync(archive)).toBe(false);
    expect(leftovers()).toEqual([]);
  });
});
