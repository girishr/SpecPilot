import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { taskRowLines } from './specReader';
import { tasksChecks } from './specValidator';

// The one writer behind `specpilot serve` (BL-053, ARCH-003.18, ARCH-004.36). A move removes one
// line of tasks.md and inserts the identical line elsewhere; every other byte stays as it was.

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

/**
 * Apply a move to tasks.md on disk if `ifMatch` is its current sha256. Synchronous from the first
 * read to the rename, so nothing else in this process runs in between; the caller's lock queues
 * requests. Writes a temp file in the same folder, fsyncs it, keeps the mode, renames it over.
 */
export function moveTask(root: string, move: TaskMove, ifMatch: string): MoveOutcome {
  const file = join(root, WRITABLE_TASKS_FILE);
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return { status: 422, error: 'planning/tasks.md does not exist.' };
  }
  if (st.isSymbolicLink()) return { status: 422, error: 'planning/tasks.md is a symbolic link, and SpecPilot will not replace it with a regular file.' };
  const before = readFileSync(file);
  if (sha256(before) !== ifMatch) return { status: 409, error: STALE_ERROR };

  const content = before.toString('utf-8');
  // Decoding and re-encoding must give back the same bytes, or the write would alter lines it never moved.
  if (!Buffer.from(content, 'utf-8').equals(before)) {
    return { status: 422, error: 'planning/tasks.md contains bytes that are not valid UTF-8, so SpecPilot cannot move a line without changing others.' };
  }
  const plan = planMove(content, move);
  if (!plan.ok) return { status: 422, error: plan.error };
  if (plan.noop) return { status: 200, sha256: ifMatch, from: plan.from, fromIndex: plan.fromIndex };

  const was = new Set(tasksChecks(content));
  const introduced = tasksChecks(plan.content).filter(m => !was.has(m));
  if (introduced.length) return { status: 422, error: `The move was not made, because \`specpilot validate\` would then report: ${introduced.join(' ')}` };

  const tmp = join(dirname(file), `.tasks.md.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const fd = openSync(tmp, 'wx', st.mode & 0o777);
    try {
      writeSync(fd, plan.content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmp, st.mode & 0o7777);
    // Last look: an editor may have saved while we were writing.
    if (sha256(readFileSync(file)) !== ifMatch) {
      unlinkSync(tmp);
      return { status: 409, error: STALE_ERROR };
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
  return { status: 200, sha256: sha256(plan.content), from: plan.from, fromIndex: plan.fromIndex };
}
