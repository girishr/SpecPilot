import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { basename, dirname, join } from 'path';
import { endsWithApproved, taskRowLines, TaskSection } from './specReader';
import { tasksChecks } from './specValidator';
import { COMPLETED_KEEP_ENTRIES, COMPLETED_LINE_LIMIT, completedArchiveBlock, planCompletedArchive } from './specArchiver';
import { findSectionBounds } from './markdownSections';

// The one writer behind `specpilot serve` (BL-053, ARCH-003.18, ARCH-004.36). A move removes one
// line of tasks.md and inserts the identical line elsewhere; a new task (BL-PM-005) inserts one line;
// a review action (BL-113) appends a dated marker to one row's description cell, or removes the last one;
// every other byte stays as it was. An archive (BL-TB-06) appends lines of tasks.md to tasks-archive.md
// and removes them from tasks.md: the second written file, never request text.

/** The write allowlist: tasks.md, and since BL-TB-06 TASKS_ARCHIVE_FILE (appended to only); separate from what the server may read. */
export const WRITABLE_TASKS_FILE = '.specs/planning/tasks.md';

export type MovableSection = 'backlog' | 'currentSprint' | 'review';
/** The sections New Task appends to (REQ-002.H.29). */
export type AddableSection = 'backlog' | 'currentSprint';

/** The section headings as tasks.md writes them (what readSpecs() matches). */
export const SECTION_HEADINGS: Record<TaskSection, string> = { backlog: 'Backlog', currentSprint: 'Current Sprint', review: 'Review', completed: 'Completed', wontDo: "Won't do" };

/**
 * The allowed lane moves (BL-TB-11, REQ-002.H.52; BL-113 adds Review): a lane to the lanes its rows may move to; a
 * lane in the table may always reorder its own rows; a lane absent from it (Completed, Won't do) is neither a source
 * nor a target. The one source for planMove(), moveShapeError() and, through GET /api/specs, the page's menu, drop
 * targets and keys.
 */
export const MOVES: Record<MovableSection, readonly MovableSection[]> = { backlog: ['currentSprint'], currentSprint: ['backlog', 'review'], review: ['currentSprint'] };
/** Why nothing is moved to Completed (BL-113, REQ-002.H.55): the route's and the MCP tool's refusal. */
export const COMPLETED_BY_HAND =
  'Nothing is moved to Completed: when a Review row is marked Approved, write its numbered row (CD ID, task ID, commit) under ## Completed by hand and remove it from ## Review. An unapproved row stays in Review.';
const MOVE_KEYS = Object.keys(MOVES) as MovableSection[]; // own keys only: `in` would admit `__proto__` and other inherited names

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

const joinOr = (a: string[]): string => (a.length > 1 ? `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}` : a.join(''));

/** Check a request body's shape; returns a plain-words problem or null. */
export function moveShapeError(body: unknown): string | null {
  const b = body as Partial<TaskMove> | null;
  if (!b || typeof b !== 'object') return 'The request must be a JSON object with id, toSection and toIndex.';
  if (typeof b.id !== 'string' || !b.id) return 'The request has no task ID.';
  if ((b.toSection as string) === 'completed') return COMPLETED_BY_HAND;
  if (!MOVE_KEYS.includes(b.toSection as MovableSection)) return `Tasks can only be moved to ${joinOr(MOVE_KEYS.map(k => SECTION_HEADINGS[k]))}.`;
  if (!Number.isInteger(b.toIndex) || (b.toIndex as number) < 0) return 'The position must be a whole number, 0 or more.';
  return null;
}

/** Work out a move on tasks.md content in memory: the new content, or why it cannot be done. `moves` is the table; only tests pass one. */
export function planMove(content: string, move: TaskMove, moves: Record<string, readonly string[]> = MOVES): PlanResult {
  const lines = content.split('\n');
  const where = taskRowLines(content);
  const hits = (Object.keys(where) as TaskSection[]).flatMap(sec =>
    (where[sec]?.rows ?? []).map((r, i) => ({ sec, i, line: r.line })).filter((_, i) => where[sec]!.rows[i].id === move.id),
  );
  if (!hits.length) return { ok: false, error: `No task row in planning/tasks.md has the ID ${move.id}.` };
  if (hits.length > 1) return { ok: false, error: `${move.id} is on more than one row in planning/tasks.md, so SpecPilot cannot tell which to move.` };
  const hit = hits[0];
  const targets = Object.prototype.hasOwnProperty.call(moves, hit.sec) ? moves[hit.sec] : null;
  if (!targets) return { ok: false, error: `${SECTION_HEADINGS[hit.sec]} rows cannot be moved.` };
  if (hit.sec !== move.toSection && !targets.includes(move.toSection)) {
    return { ok: false, error: `${SECTION_HEADINGS[hit.sec]} rows cannot be moved to ${SECTION_HEADINGS[move.toSection]}.` };
  }
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
 * Replace `file` with `content`: a temp file in the same folder, fsync, the given mode, an optional last
 * look, rename. Returns false when the last look said no (the temp file removed), true when renamed.
 */
function replaceFile(file: string, mode: number, content: string, lastLook?: () => boolean): boolean {
  const tmp = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const fd = openSync(tmp, 'wx', mode & 0o777);
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmp, mode & 0o7777);
    if (lastLook && !lastLook()) {
      unlinkSync(tmp);
      return false;
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
  return true;
}

/** Replace tasks.md with `content`, keeping its mode, with a last look at the hash: an editor may have saved while we were writing. Returns the new hash, or null when the file changed meanwhile. */
function writeTasks({ file, mode }: Loaded, ifMatch: string, content: string): string | null {
  return replaceFile(file, mode, content, () => sha256(readFileSync(file)) === ifMatch) ? sha256(content) : null;
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

/** Read for IDs in use; since BL-TB-06 also appended to by archiveCompleted(). */
export const TASKS_ARCHIVE_FILE = '.specs/planning/tasks-archive.md';

export interface NewTask {
  description: string;
  section: AddableSection;
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
  if (d.includes('|')) return 'The description cannot contain |, because it would split the table cell. Write it another way, e.g. "or".';
  return cellError(d, 'description', MAX_DESCRIPTION);
}

/** What any text inside one table cell must not hold (SEC-004.18), worded for `what`: a control character, an unpaired surrogate, a trailing backslash, too many code points. */
function cellError(text: string, what: string, max: number): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(text)) return `The ${what} contains a control character (such as a tab), which a table row cannot hold as typed.`;
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text)) return `The ${what} contains a character that cannot be written as UTF-8.`;
  if (text.trim().endsWith('\\')) return `The ${what} cannot end in \\, because the table would read it with the closing | as an escaped pipe.`;
  if ([...text.trim()].length > max) return `The ${what} is longer than ${max} characters.`;
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

export type NewTaskOutcome = { status: 200; sha256: string; id: string; section: AddableSection; index: number } | Refusal;

export const NEW_STALE_ERROR =
  'planning/tasks.md changed on disk since this page loaded, so the task was not added. The page now shows the file as it is: check it, then press Add Task again.';

/** The archive's text; missing is fine, anything SpecPilot cannot read as plain UTF-8 is refused, `why` ending the reason. */
function readArchive(root: string, why = 'so SpecPilot cannot tell which IDs are in use'): string | Refusal {
  const file = join(root, TASKS_ARCHIVE_FILE);
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return '';
  }
  if (st.isSymbolicLink()) return { status: 422, error: `planning/tasks-archive.md is a symbolic link, ${why}.` };
  if (!st.isFile()) return { status: 422, error: `planning/tasks-archive.md is not a regular file, ${why}.` };
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return { status: 422, error: `planning/tasks-archive.md could not be read, ${why}.` };
  }
  const text = bytes.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(bytes)) return { status: 422, error: `planning/tasks-archive.md contains bytes that are not valid UTF-8, ${why}.` };
  return text;
}

/** The IDs a new task would get in each section right now (BL-TB-05): the page's hint, by newTask()'s own rule over
 *  tasks.md and the archive; null when the archive is one readArchive() refuses, since the write would refuse too. */
export function suggestedIds(root: string, content: string): { backlog: string; currentSprint: string } | null {
  const archive = readArchive(root);
  if (typeof archive !== 'string') return null;
  return { backlog: nextTaskId('BL', [content, archive]), currentSprint: nextTaskId('CS', [content, archive]) };
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

// ---- Review (BL-113, REQ-002.H.55, ARCH-004.71, SEC-004.31): a dated marker appended to one Review row's description
// cell (Approve; Send back, which then moves the row to the top of Current Sprint: a rework is the next thing to do, D12), or the last marker removed again
// by naming it (the undos). The cell's other bytes, its closing `|` and the line ending stay as they were.

export type ReviewAction = 'approve' | 'unapprove' | 'sendBack' | 'unsendBack';

export interface ReviewRequest {
  id: string;
  action: ReviewAction;
  /** sendBack: the note as typed; unsendBack: the note as the server wrote it ('' for the dot form). */
  note?: string;
  /** unapprove, unsendBack: the date the marker carries. */
  date?: string;
  /** unsendBack: the row's position in Review after the move, 0-based. */
  toIndex?: number;
}

export const MAX_NOTE = 200;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** The note as it goes into the cell: runs of line breaks become one space, `|` is escaped, surrounding white space removed; or why it cannot. */
export function reviewNote(raw: unknown): { note: string } | { error: string } {
  if (raw !== undefined && typeof raw !== 'string') return { error: 'The note must be text.' };
  const typed = (raw ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
  const problem = cellError(typed, 'note', MAX_NOTE);
  if (problem) return { error: problem };
  return { note: typed.replace(/\|/g, '\\|') };
}

/** Check a review request's shape; returns a plain-words problem or null. */
export function reviewShapeError(body: unknown): string | null {
  const b = body as Partial<ReviewRequest> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with id and action.';
  if (typeof b.id !== 'string' || !b.id) return 'The request has no task ID.';
  if (!['approve', 'unapprove', 'sendBack', 'unsendBack'].includes(b.action as string)) return 'action must be approve, unapprove, sendBack or unsendBack.';
  if (b.action === 'sendBack') {
    const n = reviewNote(b.note);
    return 'error' in n ? n.error : null;
  }
  if (b.action === 'unapprove' || b.action === 'unsendBack') {
    if (typeof b.date !== 'string' || !DATE_SHAPE.test(b.date)) return 'date must be the YYYY-MM-DD the action wrote.';
  }
  if (b.action === 'unsendBack') {
    if (typeof b.note !== 'string') return 'note must be the text the send back wrote, or empty.';
    if (!Number.isInteger(b.toIndex) || (b.toIndex as number) < 0) return 'The position must be a whole number, 0 or more.';
  }
  return null;
}

/** The server's local day as the markers write it. */
export function localDate(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Edit the description cell of one raw table line: the line's tail (`(\s*\|)?\s*\r?$`: optional closing pipe with
 * its spacing, the line ending) is kept as it is and `edit` gets the text before it, which ends with the description.
 * Returns null when `edit` does.
 */
function editCell(line: string, edit: (head: string) => string | null): string | null {
  const tail = /(\s*\|)?\s*\r?$/.exec(line)![0];
  const head = line.slice(0, line.length - tail.length);
  const out = edit(head);
  return out === null ? null : out + tail;
}

export type ReviewPlan = { ok: true; content: string; date: string; note: string; fromIndex: number; index: number } | { ok: false; error: string };

/** Work out a review action on tasks.md content in memory: the new content, or why it cannot be done. */
export function planReview(content: string, req: ReviewRequest, today: string): ReviewPlan {
  const lines = content.split('\n');
  const where = taskRowLines(content);
  const hits = (Object.keys(where) as TaskSection[]).flatMap(sec => (where[sec]?.rows ?? []).map((r, i) => ({ sec, i, line: r.line, id: r.id })).filter(h => h.id === req.id));
  if (!hits.length) return { ok: false, error: `No task row in planning/tasks.md has the ID ${req.id}.` };
  if (hits.length > 1) return { ok: false, error: `${req.id} is on more than one row in planning/tasks.md, so SpecPilot cannot tell which to change.` };
  const hit = hits[0];
  const wanted: TaskSection = req.action === 'unsendBack' ? 'currentSprint' : 'review';
  if (hit.sec !== wanted) {
    return { ok: false, error: `${req.id} is in ${SECTION_HEADINGS[hit.sec]}, so it cannot be ${req.action === 'approve' ? 'approved' : req.action === 'sendBack' ? 'sent back' : 'put back'}: ${req.action === 'unsendBack' ? 'only a Current Sprint row that was sent back can be' : 'only a Review row can be'}.` };
  }
  const fail = (error: string): ReviewPlan => ({ ok: false, error });
  let date = today;
  let note = '';
  let edited: string | null;
  if (req.action === 'approve') {
    edited = editCell(lines[hit.line], head => {
      if (endsWithApproved(head)) return null;
      return `${head} Approved ${today}`;
    });
    if (edited === null) return fail(`${req.id} is already marked Approved.`);
  } else if (req.action === 'unapprove') {
    date = req.date!;
    edited = editCell(lines[hit.line], head => (endsWithApproved(head, date) ? head.slice(0, -` Approved ${date}`.length) : null));
    if (edited === null) return fail(`${req.id} is not marked Approved ${date}, so there is nothing to undo.`);
  } else if (req.action === 'sendBack') {
    const n = reviewNote(req.note);
    if ('error' in n) return fail(n.error);
    note = n.note;
    edited = editCell(lines[hit.line], head => `${head} Sent back ${today}${note ? `: ${note}` : '.'}`);
  } else {
    date = req.date!;
    note = req.note ?? '';
    const suffix = ` Sent back ${date}${note ? `: ${note}` : '.'}`;
    edited = editCell(lines[hit.line], head => (head.endsWith(suffix) ? head.slice(0, -suffix.length) : null));
    if (edited === null) return fail(`${req.id} does not end with that Sent back note, so there is nothing to undo.`);
  }
  const out = lines.slice();
  out[hit.line] = edited!;
  let next = out.join('\n');
  let index = hit.i;
  if (req.action === 'sendBack' || req.action === 'unsendBack') {
    const to: MovableSection = req.action === 'sendBack' ? 'currentSprint' : 'review';
    const toIndex = req.action === 'sendBack' ? 0 : req.toIndex!;
    const moved = planMove(next, { id: req.id, toSection: to, toIndex });
    if (!moved.ok) return fail(moved.error);
    next = moved.content;
    index = toIndex;
  }
  return { ok: true, content: next, date, note, fromIndex: hit.i, index };
}

export type ReviewOutcome = { status: 200; sha256: string; date: string; note: string; fromIndex: number; index: number } | Refusal;

export const REVIEW_STALE_ERROR = 'planning/tasks.md changed on disk since this page loaded. Nothing was changed.';

/** Apply a review action to tasks.md on disk if `ifMatch` is its current sha256: loadTasks(), planReview(), the validator's checks, writeTasks(). */
export function reviewTask(root: string, req: ReviewRequest, ifMatch: string, now = new Date()): ReviewOutcome {
  const loaded = loadTasks(root, ifMatch, REVIEW_STALE_ERROR, 'change a line');
  if ('status' in loaded) return loaded;
  const plan = planReview(loaded.content, req, localDate(now));
  if (!plan.ok) return { status: 422, error: plan.error };

  const introduced = newChecks(loaded.content, plan.content);
  if (introduced.length) return { status: 422, error: `Nothing was changed, because \`specpilot validate\` would then report: ${introduced.join(' ')}` };

  const written = writeTasks(loaded, ifMatch, plan.content);
  if (written === null) return { status: 409, error: REVIEW_STALE_ERROR };
  return { status: 200, sha256: written, date: plan.date, note: plan.note, fromIndex: plan.fromIndex, index: plan.index };
}

// ---- Archive Completed (BL-TB-06, REQ-002.H.51, ARCH-004.65, SEC-004.30): the Completed step of `specpilot archive`

export type ArchiveOutcome = { status: 200; sha256: string; linesMoved: number } | Refusal;

export const ARCHIVE_STALE_ERROR = 'planning/tasks.md changed on disk since this page loaded, so nothing was archived.';
/** The hash changed in the instant between the archive's write and tasks.md's rename: the rows are in both files. */
export const ARCHIVE_SPLIT_ERROR =
  'planning/tasks.md changed on disk while its rows were being archived. The rows are now in planning/tasks-archive.md and still in tasks.md: check both files.';
export const NOTHING_TO_ARCHIVE_ERROR = `Nothing to archive: ## Completed in planning/tasks.md is within its ${COMPLETED_LINE_LIMIT}-line limit, and the request did not force it.`;
export const NO_COMPLETED_ERROR = 'planning/tasks.md has no ## Completed section.';
/** Forced, or over the limit, and still nothing past the kept entries. */
export const nothingPastKeepError = (entries: number) =>
  `Nothing to archive: ## Completed in planning/tasks.md has ${entries} ${entries === 1 ? 'row' : 'rows'}, and an archive keeps the newest ${COMPLETED_KEEP_ENTRIES}.`;

export interface CompletedArchiveStatus {
  /** The `## Completed` section's line count, 0 without one; over the limit when above COMPLETED_LINE_LIMIT. */
  lines: number;
  /** The lines a forced archive would move now, 0 with nothing past the kept entries. */
  rows: number;
}

/** What the page's Archive Completed dialog shows (BL-TB-06, D8), over the same content the write plans from. */
export function completedArchiveStatus(content: string): CompletedArchiveStatus {
  const lines = content.split('\n');
  const bounds = findSectionBounds(lines, '## Completed');
  const plan = planCompletedArchive(lines, true);
  return { lines: bounds ? bounds.end - bounds.start : 0, rows: plan ? plan.end - plan.start : 0 };
}

/** The section's entries: numbered items, else table body rows. */
function completedEntries(content: string, lines: string[]): number {
  const bounds = findSectionBounds(lines, '## Completed');
  if (!bounds) return 0;
  const items = lines.slice(bounds.start, bounds.end).filter(l => /^\d+\./.test(l)).length;
  return items || (taskRowLines(content).completed?.rows.length ?? 0);
}

/**
 * Move the oldest Completed lines of tasks.md into tasks-archive.md, as `specpilot archive` does (the same
 * plan, the same block), if `ifMatch` is tasks.md's current sha256. `force` archives a section within its line
 * limit by the same keep rule (D8). The archive is written first, so a failure between the two writes leaves
 * the rows in both files, never in neither. moveTask()'s guards and write steps.
 */
export function archiveCompleted(root: string, ifMatch: string, force = false): ArchiveOutcome {
  const loaded = loadTasks(root, ifMatch, ARCHIVE_STALE_ERROR, 'move the rows');
  if ('status' in loaded) return loaded;
  const lines = loaded.content.split('\n');
  const plan = planCompletedArchive(lines, force);
  if (!plan) {
    const bounds = findSectionBounds(lines, '## Completed');
    if (!bounds) return { status: 422, error: NO_COMPLETED_ERROR };
    if (!force && bounds.end - bounds.start <= COMPLETED_LINE_LIMIT) return { status: 422, error: NOTHING_TO_ARCHIVE_ERROR };
    return { status: 422, error: nothingPastKeepError(completedEntries(loaded.content, lines)) };
  }
  const archive = readArchive(root, 'so SpecPilot will not write to it');
  if (typeof archive !== 'string') return archive;
  const after = [...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n');

  const introduced = newChecks(loaded.content, after);
  if (introduced.length) return { status: 422, error: `Nothing was archived, because \`specpilot validate\` would then report: ${introduced.join(' ')}` };

  const file = join(root, TASKS_ARCHIVE_FILE);
  let mode = loaded.mode; // a new archive takes tasks.md's mode
  try {
    mode = lstatSync(file).mode;
  } catch {
    /* no archive yet */
  }
  replaceFile(file, mode, archive + completedArchiveBlock(lines, plan));
  const written = writeTasks(loaded, ifMatch, after);
  if (written === null) return { status: 409, error: ARCHIVE_SPLIT_ERROR };
  return { status: 200, sha256: written, linesMoved: plan.end - plan.start };
}
