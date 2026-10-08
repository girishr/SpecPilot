import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { taskRowLines } from './specReader';
import { tasksChecks } from './specValidator';

// The one writer behind `specpilot serve` (BL-053, ARCH-003.18, ARCH-004.36). A move removes one
// line of tasks.md and inserts the identical line elsewhere; a new task (BL-PM-005) inserts one line;
// every other byte stays as it was.

/** The write allowlist: exactly one file, separate from what the server may read. */
export const WRITABLE_TASKS_FILE = '.specs/planning/tasks.md';

export type MovableSection = 'backlog' | 'currentSprint';

/** The section headings as tasks.md writes them (what readSpecs() matches). */
export const SECTION_HEADINGS = { backlog: 'Backlog', currentSprint: 'Current Sprint', completed: 'Completed' } as const;

export interface TaskMove {
  id: string;
  toSection: MovableSection;
  /** The row's position in `toSection` after the move, 0-based. */
  toIndex: number;
}

export type PlanResult =
  | { ok: true; content: string; from: MovableSection; fromIndex: number; noop: boolean }
  | { ok: false; error: string };

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** Check a request body's shape; returns a plain-words problem or null. */
export function moveShapeError(body: unknown): string | null {
  const b = body as Partial<TaskMove> | null;
  if (!b || typeof b !== 'object') return 'The request must be a JSON object with id, toSection and toIndex.';
  if (typeof b.id !== 'string' || !b.id) return 'The request has no task ID.';
  if (b.toSection !== 'backlog' && b.toSection !== 'currentSprint') return 'Tasks can only be moved to Backlog or Current Sprint.';
  if (!Number.isInteger(b.toIndex) || (b.toIndex as number) < 0) return 'The position must be a whole number, 0 or more.';
  return null;
}

/** Work out a move on tasks.md content in memory: the new content, or why it cannot be done. */
export function planMove(content: string, move: TaskMove): PlanResult {
  const lines = content.split('\n');
  const where = taskRowLines(content);
  const hits = (['backlog', 'currentSprint', 'completed'] as const).flatMap(sec =>
    (where[sec]?.rows ?? []).map((r, i) => ({ sec, i, line: r.line })).filter((_, i) => where[sec]!.rows[i].id === move.id),
  );
  if (!hits.length) return { ok: false, error: `No task row in planning/tasks.md has the ID ${move.id}.` };
  if (hits.length > 1) return { ok: false, error: `${move.id} is on more than one row in planning/tasks.md, so SpecPilot cannot tell which to move.` };
  const hit = hits[0];
  if (hit.sec === 'completed') return { ok: false, error: 'Completed rows cannot be moved.' };
  const from = hit.sec as MovableSection;
  const target = where[move.toSection];
  if (!target) return { ok: false, error: `planning/tasks.md has no ## ${SECTION_HEADINGS[move.toSection]} section.` };
  if (target.separator === null) return { ok: false, error: `${SECTION_HEADINGS[move.toSection]} has no table yet.` };

  const others = target.rows.filter(r => r.line !== hit.line);
  if (move.toIndex > others.length) {
    return { ok: false, error: `Position ${move.toIndex} is past the end of ${SECTION_HEADINGS[move.toSection]}, which would have ${others.length + 1} rows.` };
  }
  if (from === move.toSection && move.toIndex === hit.i) return { ok: true, content, from, fromIndex: hit.i, noop: true };

  // Insert before the row now at toIndex, or right after the last row (or the separator).
  const at = move.toIndex < others.length ? others[move.toIndex].line : (others.length ? others[others.length - 1].line : target.separator) + 1;
  const last = lines.length - 1; // with a trailing newline, lines[last] is '' and never a row
  if (hit.line === last || at > last) {
    return { ok: false, error: `This move would change which line ends the file, because planning/tasks.md has no line break after its last line. Add one and try again.` };
  }
  const out = lines.slice();
  const [row] = out.splice(hit.line, 1);
  out.splice(at > hit.line ? at - 1 : at, 0, row);
  return { ok: true, content: out.join('\n'), from, fromIndex: hit.i, noop: false };
}

export type MoveOutcome =
  | { status: 200; sha256: string; from: MovableSection; fromIndex: number }
  | { status: 409; error: string }
  | { status: 422; error: string };

export const STALE_ERROR = 'planning/tasks.md changed on disk since this page loaded. The move was not made.';

type Refusal = { status: 409 | 422; error: string };
interface Loaded {
  file: string;
  mode: number;
  content: string;
}

/** Read tasks.md for a write: refuses a missing or symlinked file, a stale hash and bytes that are not UTF-8. */
function loadTasks(root: string, ifMatch: string, stale: string, doing: string): Loaded | Refusal {
  const file = join(root, WRITABLE_TASKS_FILE);
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return { status: 422, error: 'planning/tasks.md does not exist.' };
  }
  if (st.isSymbolicLink()) return { status: 422, error: 'planning/tasks.md is a symbolic link, and SpecPilot will not replace it with a regular file.' };
  const before = readFileSync(file);
  if (sha256(before) !== ifMatch) return { status: 409, error: stale };
  const content = before.toString('utf-8');
  // Decoding and re-encoding must give back the same bytes, or the write would alter lines it never touched.
  if (!Buffer.from(content, 'utf-8').equals(before)) {
    return { status: 422, error: `planning/tasks.md contains bytes that are not valid UTF-8, so SpecPilot cannot ${doing} without changing others.` };
  }
  return { file, mode: st.mode, content };
}

/** What `specpilot validate` would report about `after` that it does not report about `before`. */
const newChecks = (before: string, after: string): string[] => {
  const was = new Set(tasksChecks(before));
  return tasksChecks(after).filter(m => !was.has(m));
};

/**
 * Replace tasks.md with `content`: a temp file in the same folder, fsync, the original mode, a last
 * look at the hash, rename. Returns the new hash, or null when the file changed meanwhile.
 */
function writeTasks({ file, mode }: Loaded, ifMatch: string, content: string): string | null {
  const tmp = join(dirname(file), `.tasks.md.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const fd = openSync(tmp, 'wx', mode & 0o777);
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmp, mode & 0o7777);
    // Last look: an editor may have saved while we were writing.
    if (sha256(readFileSync(file)) !== ifMatch) {
      unlinkSync(tmp);
      return null;
    }
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* never created, or already renamed */
    }
    throw err;
  }
  return sha256(content);
}

/**
 * Apply a move to tasks.md on disk if `ifMatch` is its current sha256. Synchronous from the first
 * read to the rename, so nothing else in this process runs in between; the caller's lock queues
 * requests. Writes a temp file in the same folder, fsyncs it, keeps the mode, renames it over.
 */
export function moveTask(root: string, move: TaskMove, ifMatch: string): MoveOutcome {
  const loaded = loadTasks(root, ifMatch, STALE_ERROR, 'move a line');
  if ('status' in loaded) return loaded;
  const plan = planMove(loaded.content, move);
  if (!plan.ok) return { status: 422, error: plan.error };
  if (plan.noop) return { status: 200, sha256: ifMatch, from: plan.from, fromIndex: plan.fromIndex };

  const introduced = newChecks(loaded.content, plan.content);
  if (introduced.length) return { status: 422, error: `The move was not made, because \`specpilot validate\` would then report: ${introduced.join(' ')}` };

  const written = writeTasks(loaded, ifMatch, plan.content);
  if (written === null) return { status: 409, error: STALE_ERROR };
  return { status: 200, sha256: written, from: plan.from, fromIndex: plan.fromIndex };
}

// ---- New Task (BL-PM-005, REQ-002.H.29, ARCH-004.48): one line appended to Backlog or Current Sprint

/** Read only, for IDs in use. */
export const TASKS_ARCHIVE_FILE = '.specs/planning/tasks-archive.md';

export interface NewTask {
  description: string;
  section: MovableSection;
}

const PREFIX = { backlog: 'BL', currentSprint: 'CS' } as const;
export const MAX_DESCRIPTION = 4000;

/** Check a New Task body; returns a plain-words problem or null. The description is checked as sent, before trimming. */
export function newTaskShapeError(body: unknown): string | null {
  const b = body as Partial<NewTask> | null;
  if (!b || typeof b !== 'object') return 'The request must be a JSON object with description and section.';
  if (b.section !== 'backlog' && b.section !== 'currentSprint') return 'New tasks can only go to Backlog or Current Sprint.';
  const d = b.description;
  if (typeof d !== 'string' || !d.trim()) return 'Type a description for the task.';
  if (/[\r\n\u2028\u2029]/.test(d)) return 'The description must be one line: a table row cannot hold a line break.';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(d)) return 'The description contains a control character (such as a tab), which a table row cannot hold as typed.';
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(d)) return 'The description contains a character that cannot be written as UTF-8.';
  if (d.includes('|')) return 'The description cannot contain |, because it would split the table cell. Write it another way, e.g. "or".';
  if (d.trim().endsWith('\\')) return 'The description cannot end in \\, because the table would read it with the closing | as an escaped pipe.';
  if ([...d.trim()].length > MAX_DESCRIPTION) return `The description is longer than ${MAX_DESCRIPTION} characters.`;
  return null;
}

/**
 * The next free ID with this prefix: the highest number in ID positions plus one, at least three
 * digits. ID positions are a table row's ID cell (the first cell, or the second after a `#` number
 * cell) and the leading bracketed tags of a numbered list item (`28. [CD-067] [CS-014] …`). IDs in
 * running text never count, and `BL-PM-005` is not `BL-<digits>`.
 */
export function nextTaskId(prefix: 'BL' | 'CS', texts: string[]): string {
  const id = new RegExp(`^\\[?${prefix}-(\\d+)\\]?$`);
  let max = 0;
  const take = (token: string) => {
    const m = id.exec(token);
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const text of texts) {
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('|')) {
        const cells = line.split('|');
        const first = (cells[1] ?? '').trim();
        const cell = /^\d+$/.test(first) ? (cells[2] ?? '').trim() : first;
        cell.split(/\s+/).forEach(take);
        continue;
      }
      const item = /^\d+\.\s+((?:\[[^\]\s]+\]\s*)+)/.exec(line);
      if (item) (item[1].match(/\[[^\]\s]+\]/g) ?? []).forEach(take);
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export type NewTaskPlan = { ok: true; content: string; id: string; index: number } | { ok: false; error: string };

/** Work out a new task on tasks.md content in memory: the content with one line inserted, or why not. */
export function planNewTask(content: string, archive: string, task: NewTask): NewTaskPlan {
  const target = taskRowLines(content)[task.section];
  const name = SECTION_HEADINGS[task.section];
  if (!target) return { ok: false, error: `planning/tasks.md has no ## ${name} section.` };
  if (target.separator === null) return { ok: false, error: `${name} has no table yet.` };
  const lines = content.split('\n');
  const after = target.rows.length ? target.rows[target.rows.length - 1].line : target.separator;
  if (after === lines.length - 1) {
    return { ok: false, error: 'The new row would become the last line of planning/tasks.md, which has no line break after its last line. Add one and try again.' };
  }
  const id = nextTaskId(PREFIX[task.section], [content, archive]);
  const eol = lines[after].endsWith('\r') ? '\r' : '';
  const out = lines.slice();
  out.splice(after + 1, 0, `| ${id} | ${task.description.trim()} |${eol}`);
  return { ok: true, content: out.join('\n'), id, index: target.rows.length };
}

export type NewTaskOutcome = { status: 200; sha256: string; id: string; section: MovableSection; index: number } | Refusal;

export const NEW_STALE_ERROR =
  'planning/tasks.md changed on disk since this page loaded, so the task was not added. The page now shows the file as it is: check it, then press Add Task again.';

/** The archive's text for IDs; missing is fine, anything SpecPilot cannot read as plain UTF-8 is refused. */
function readArchive(root: string): string | Refusal {
  const file = join(root, TASKS_ARCHIVE_FILE);
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return '';
  }
  if (st.isSymbolicLink()) return { status: 422, error: 'planning/tasks-archive.md is a symbolic link, so SpecPilot cannot tell which IDs are in use.' };
  if (!st.isFile()) return { status: 422, error: 'planning/tasks-archive.md is not a regular file, so SpecPilot cannot tell which IDs are in use.' };
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return { status: 422, error: 'planning/tasks-archive.md could not be read, so SpecPilot cannot tell which IDs are in use.' };
  }
  const text = bytes.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(bytes)) return { status: 422, error: 'planning/tasks-archive.md contains bytes that are not valid UTF-8, so SpecPilot cannot tell which IDs are in use.' };
  return text;
}

/** Append a new task to tasks.md on disk if `ifMatch` is its current sha256; the same steps and guards as moveTask(). */
export function newTask(root: string, task: NewTask, ifMatch: string): NewTaskOutcome {
  const loaded = loadTasks(root, ifMatch, NEW_STALE_ERROR, 'add a line');
  if ('status' in loaded) return loaded;
  const archive = readArchive(root);
  if (typeof archive !== 'string') return archive;
  const plan = planNewTask(loaded.content, archive, task);
  if (!plan.ok) return { status: 422, error: plan.error };

  const introduced = newChecks(loaded.content, plan.content);
  if (introduced.length) return { status: 422, error: `The task was not added, because \`specpilot validate\` would then report: ${introduced.join(' ')}` };

  const written = writeTasks(loaded, ifMatch, plan.content);
  if (written === null) return { status: 409, error: NEW_STALE_ERROR };
  return { status: 200, sha256: written, id: plan.id, section: task.section, index: plan.index };
}
