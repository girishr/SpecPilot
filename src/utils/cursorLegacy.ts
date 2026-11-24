import { createHash } from 'crypto';
import { linkSync, lstatSync, readFileSync, realpathSync, unlinkSync } from 'fs';
import { isAbsolute, join } from 'path';
import { writeError } from './specPaths';
import { folderProblem, writeHomeFile } from './projectRegistry';

// SpecPilot's old Cursor rules file (BL-194, REQ-002.A.18, REQ-002.H.79, ARCH-004.81, SEC-004.40): before v2.1.0
// SpecPilot wrote `.cursor/rules/project.mdc`; since then `.cursor/rules/specpilot.mdc`. One state for every caller.

export const OLD_RULES = '.cursor/rules/project.mdc';
export const NEW_RULES = '.cursor/rules/specpilot.mdc';
/** The front-matter line every release from v1.7.0 to v2.0.1 wrote. */
const MARK = 'description: Project mandates and AI coding rules';
export const MAX_ONLY_OLD = 50;
export const MAX_KEPT = 1000;

export type CursorLegacyState = 'none' | 'old' | 'duplicate' | 'edited' | 'kept';

export interface CursorLegacy {
  state: CursorLegacyState;
  /** sha256 of the old file's bytes; null for `none`. */
  sha256: string | null;
  /** The old file's non-empty trimmed body lines that specpilot.mdc lacks, in order, each once, at most MAX_ONLY_OLD. */
  onlyOld: string[];
  onlyOldCount: number;
  /** For `none`: the old file is there but is the user's own. */
  yours: boolean;
  /** For `none`: the old file or its folder is a link or not a regular file (the reason). */
  refused: string | null;
}

export const BOTH_ERROR = `Both ${OLD_RULES} and ${NEW_RULES} exist, so Cursor loads SpecPilot's rules twice. Run specpilot migrate --cursor-rules --remove-old to remove the old file.`;
export const NOT_OURS_ERROR = `${OLD_RULES} is not SpecPilot's: its front matter has no "${MARK}" line. It was left as it is.`;
export const NO_LINKS_ERROR = `This file system does not allow the rename SpecPilot uses. Rename ${OLD_RULES} to specpilot.mdc by hand.`;
export const NOTHING_TO_DO = `No SpecPilot rules file under its old name (${OLD_RULES}). Nothing to do.`;
export const STALE_ERROR = 'The file changed since the page read it.';

const code = (err: unknown) => (err as NodeJS.ErrnoException).code;
const none = (extra: Partial<CursorLegacy> = {}): CursorLegacy => ({ state: 'none', sha256: null, onlyOld: [], onlyOldCount: 0, yours: false, refused: null, ...extra });

/** Front matter and body lines of an .mdc file (front matter only when the first line is `---`). */
function split(text: string): { front: string[]; body: string[] } {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { front: [], body: lines };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end < 0 ? { front: [], body: lines } : { front: lines.slice(1, end), body: lines.slice(end + 1) };
}

/** `~/.specpilot/cursor-rules.json` for `home`. */
export function keepListPath(home: string): string {
  return join(home, '.specpilot', 'cursor-rules.json');
}

/** The keep list's paths, or why it cannot be used. A missing file is an empty list. Never writes. */
export function readKeepList(home: string): { paths: string[]; error: string | null } {
  const file = keepListPath(home);
  const problem = folderProblem(join(home, '.specpilot'));
  if (problem) return { paths: [], error: problem };
  let st;
  try {
    st = lstatSync(file);
  } catch (err) {
    return code(err) === 'ENOENT' ? { paths: [], error: null } : { paths: [], error: `${file} could not be read (${code(err)})` };
  }
  if (st.isSymbolicLink()) return { paths: [], error: `${file} is a symbolic link` };
  if (!st.isFile()) return { paths: [], error: `${file} is not a regular file` };
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return { paths: [], error: `${file} could not be used: it is not valid JSON` };
  }
  const d = doc as { version?: unknown; keepBoth?: unknown } | null;
  const list = d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).sort().join() === 'keepBoth,version' && d.version === 1 ? d.keepBoth : null;
  if (!Array.isArray(list) || list.length > MAX_KEPT || !list.every(p => typeof p === 'string' && isAbsolute(p)) || new Set(list).size !== list.length) {
    return { paths: [], error: `${file} could not be used: it is not {"version": 1, "keepBoth": [absolute paths]}` };
  }
  return { paths: list as string[], error: null };
}

/** The project's state. `home` null: the keep list is not read (the CLI's migrate step). Never writes. */
export function cursorLegacy(root: string, home: string | null): CursorLegacy {
  let old: Buffer;
  try {
    const refused = writeError(root, OLD_RULES);
    if (refused) return none({ refused });
    old = readFileSync(join(root, OLD_RULES));
  } catch (err) {
    // an unreadable file never breaks the page, validate or backfill: it is reported and left alone
    return code(err) === 'ENOENT' ? none() : none({ refused: `${OLD_RULES} could not be read (${code(err)}).` });
  }
  const { front, body } = split(old.toString('utf-8'));
  if (!front.some(l => l.trim() === MARK)) return none({ yours: true });
  const sha256 = createHash('sha256').update(old).digest('hex');
  let hasNew = true;
  try {
    lstatSync(join(root, NEW_RULES));
  } catch (err) {
    if (code(err) !== 'ENOENT') return none({ refused: `${NEW_RULES} could not be read (${code(err)}).` });
    hasNew = false;
  }
  if (!hasNew) return { state: 'old', sha256, onlyOld: [], onlyOldCount: 0, yours: false, refused: null };
  let newLines = new Set<string>();
  try {
    if (!writeError(root, NEW_RULES)) newLines = new Set(readFileSync(join(root, NEW_RULES), 'utf-8').split(/\r?\n/).map(l => l.trim()));
  } catch {
    // an unreadable specpilot.mdc compares as empty: every old line counts as only in the old file
  }
  const missing = [...new Set(body.map(l => l.trim()).filter(l => l && !newLines.has(l)))];
  let state: CursorLegacyState = missing.length ? 'edited' : 'duplicate';
  if (home !== null && readKeepList(home).paths.includes(realpathSync(root))) state = 'kept';
  return { state, sha256, onlyOld: missing.slice(0, MAX_ONLY_OLD), onlyOldCount: missing.length, yours: false, refused: null };
}

/** The warning `validate` and `backfill` show, or null (none for `kept` or the user's own file). */
export function cursorLegacyWarning(state: CursorLegacyState): string | null {
  if (state === 'old') return `${OLD_RULES} is SpecPilot's old Cursor rules file (before v2.1.0). Run specpilot migrate --cursor-rules to rename it to specpilot.mdc.`;
  if (state === 'duplicate' || state === 'edited') return `${OLD_RULES} is SpecPilot's old Cursor rules file and specpilot.mdc also exists, so Cursor loads the rules twice. Run specpilot migrate --cursor-rules --remove-old, or choose Keep both on the specpilot serve page.`;
  return null;
}

/** The line `serve` prints under a project's `Specs:` line at startup, or null. */
export function cursorStartupLine(root: string, home: string, readOnly: boolean): string | null {
  const { state } = cursorLegacy(root, home);
  if (state !== 'old' && state !== 'duplicate' && state !== 'edited') return null;
  return `Cursor: ${OLD_RULES} is SpecPilot's old rules file (before v2.1.0). ${readOnly ? 'Run' : 'Fix it on the page, or run'} specpilot migrate --cursor-rules.`;
}

export type CursorFix = { ok: true; message: string } | { ok: false; status: 409 | 422; error: string };

/** The refusal for a state that does not allow `allowed`. */
function refusal(s: CursorLegacy, allowed: CursorLegacyState[], sha256?: string): CursorFix | null {
  if (sha256 !== undefined && s.sha256 !== null && s.sha256 !== sha256 && allowed.includes(s.state)) return { ok: false, status: 409, error: STALE_ERROR };
  if (allowed.includes(s.state)) return null;
  if (s.refused) return { ok: false, status: 409, error: s.refused };
  if (s.yours) return { ok: false, status: 409, error: NOT_OURS_ERROR };
  if (s.state === 'none') return { ok: false, status: 409, error: NOTHING_TO_DO };
  if (s.state === 'old') return { ok: false, status: 409, error: `${NEW_RULES} does not exist, so the old file was not removed. Rename it instead.` };
  return { ok: false, status: 409, error: BOTH_ERROR };
}

/** `old` → link project.mdc to specpilot.mdc (never over a file), then unlink project.mdc. With `sha256`, the bytes must match. */
export function renameCursorRules(root: string, sha256?: string): CursorFix {
  const refused = refusal(cursorLegacy(root, null), ['old'], sha256);
  if (refused) return refused;
  try {
    linkSync(join(root, OLD_RULES), join(root, NEW_RULES));
  } catch (err) {
    if (code(err) === 'EEXIST') return { ok: false, status: 409, error: BOTH_ERROR };
    if (['EPERM', 'ENOTSUP', 'EXDEV', 'ENOSYS', 'EOPNOTSUPP'].includes(code(err) ?? '')) return { ok: false, status: 422, error: NO_LINKS_ERROR };
    throw err;
  }
  unlinkSync(join(root, OLD_RULES));
  return { ok: true, message: `Renamed ${OLD_RULES} to ${NEW_RULES}.` };
}

/** Both files → unlink SpecPilot's project.mdc. The keep list does not stop it. */
export function removeOldCursorRules(root: string, sha256?: string): CursorFix {
  const refused = refusal(cursorLegacy(root, null), ['duplicate', 'edited'], sha256);
  if (refused) return refused;
  unlinkSync(join(root, OLD_RULES));
  return { ok: true, message: `Removed ${OLD_RULES}.` };
}

/** `duplicate` or `edited` → add the project's real path to the keep list. */
export function keepBoth(root: string, home: string, sha256: string): CursorFix {
  const s = cursorLegacy(root, home);
  if (s.state === 'kept') return s.sha256 === sha256 ? { ok: true, message: 'Kept both files on this machine.' } : { ok: false, status: 409, error: STALE_ERROR };
  const refused = refusal(s, ['duplicate', 'edited'], sha256);
  if (refused) return refused;
  const read = readKeepList(home);
  if (read.error) return { ok: false, status: 422, error: `${read.error}. It was left as it is, so Keep both was not saved.` };
  if (read.paths.length >= MAX_KEPT) return { ok: false, status: 422, error: `${keepListPath(home)} already keeps ${MAX_KEPT} projects, so Keep both was not saved.` };
  writeHomeFile(keepListPath(home), JSON.stringify({ version: 1, keepBoth: [...read.paths, realpathSync(root)] }, null, 2) + '\n');
  return { ok: true, message: 'Kept both files on this machine.' };
}
