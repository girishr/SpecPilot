import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, isAbsolute, join, parse } from 'path';
import { homedir } from 'os';

// The project registry behind `specpilot serve` (BL-067, ARCH-003.21, SEC-004.13): the one file
// SpecPilot writes outside a project. It holds paths, a time and a flag, nothing read from a folder,
// and is never repaired: a file that cannot be read or parsed is refused and left as it is.

export interface RegistryEntry {
  /** The folder's realpath. */
  path: string;
  /** ISO 8601 UTC. */
  lastOpened: string;
  pinned: boolean;
}

/** Most entries the registry keeps; the oldest unpinned one goes first. */
export const MAX_REGISTRY_ENTRIES = 50;

/** Most projects one server serves; `POST /api/projects` refuses past it (the command line is not capped). */
export const MAX_PROJECTS = 20;

const VERSION = 1;

/**
 * The home directory: `HOME`, else `USERPROFILE`, else `os.homedir()`. The same order libuv uses for
 * `os.homedir()`, read from `process.env` so a test that sets the variable before the server starts is
 * honoured (Jest sandboxes `process.env`, which the native `os.homedir()` does not see).
 */
export function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/** `~/.specpilot/projects.json` for `home`. */
export function registryPath(home = homeDir()): string {
  return join(home, '.specpilot', 'projects.json');
}

export type RegistryRead = { entries: RegistryEntry[]; exists: boolean; error: null } | { entries: null; exists: false; error: string };

const code = (err: unknown) => (err as NodeJS.ErrnoException).code;

/** The folder the registry lives in must not exist, or be a real folder (never a link). Null when fine. */
function folderProblem(dir: string): string | null {
  try {
    const st = lstatSync(dir);
    if (st.isSymbolicLink()) return `${dir} is a symbolic link`;
    if (!st.isDirectory()) return `${dir} is not a folder`;
    return null;
  } catch (err) {
    return code(err) === 'ENOENT' ? null : `${dir} could not be read (${code(err)})`;
  }
}

/** Parse the file's text into entries, or say what is wrong with its shape. */
function parseEntries(text: string): { entries: RegistryEntry[] } | { error: string } {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { error: 'it is not valid JSON' };
  }
  const d = doc as { version?: unknown; projects?: unknown } | null;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'it is not a JSON object' };
  if (d.version !== VERSION) return { error: `its version is not ${VERSION}` };
  if (!Array.isArray(d.projects)) return { error: 'its projects field is not a list' };
  const seen = new Set<string>();
  const entries: RegistryEntry[] = [];
  for (const [i, e] of (d.projects as unknown[]).entries()) {
    const at = `entry ${i + 1}`;
    const o = e as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: `${at} is not an object` };
    const keys = Object.keys(o).sort();
    if (keys.join() !== 'lastOpened,path,pinned') return { error: `${at} does not have exactly path, lastOpened and pinned` };
    if (typeof o.path !== 'string' || !isAbsolute(o.path)) return { error: `${at} has no absolute path` };
    if (typeof o.lastOpened !== 'string' || Number.isNaN(Date.parse(o.lastOpened))) return { error: `${at} has no valid lastOpened time` };
    if (typeof o.pinned !== 'boolean') return { error: `${at} has no boolean pinned flag` };
    if (seen.has(o.path)) return { error: `${at} repeats a path` };
    seen.add(o.path);
    entries.push({ path: o.path, lastOpened: o.lastOpened, pinned: o.pinned });
  }
  return { entries };
}

/**
 * Read the registry: a missing file is an empty registry; anything that is not a regular, readable,
 * well-formed file is a refusal with a plain reason. Never writes.
 */
export function readRegistry(file: string): RegistryRead {
  const problem = folderProblem(dirname(file));
  if (problem) return { entries: null, exists: false, error: problem };
  let st;
  try {
    st = lstatSync(file);
  } catch (err) {
    return code(err) === 'ENOENT' ? { entries: [], exists: false, error: null } : { entries: null, exists: false, error: `${file} could not be read (${code(err)})` };
  }
  if (st.isSymbolicLink()) return { entries: null, exists: false, error: `${file} is a symbolic link` };
  if (!st.isFile()) return { entries: null, exists: false, error: `${file} is not a regular file` };
  let text: string;
  try {
    text = readFileSync(file, 'utf-8');
  } catch (err) {
    return { entries: null, exists: false, error: `${file} could not be read (${code(err)})` };
  }
  const parsed = parseEntries(text);
  return 'error' in parsed ? { entries: null, exists: false, error: `${file} could not be used: ${parsed.error}` } : { entries: parsed.entries, exists: true, error: null };
}

/**
 * Replace the registry with `entries`: the folder is created with mode 0700 when missing, the content
 * goes to a temp file (mode 0600) in that folder, `fsync`, then `rename`. Throws, writing nothing,
 * when `readRegistry()` would refuse the current state.
 */
export function writeRegistry(file: string, entries: RegistryEntry[]): void {
  const current = readRegistry(file);
  if (current.error !== null) throw new Error(current.error);
  const dir = dirname(file);
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (err) {
    if (code(err) !== 'EEXIST') throw err;
  }
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify({ version: VERSION, projects: entries }, null, 2) + '\n');
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, file);
  } catch (err) {
    try { closeSync(fd); } catch { /* already closed */ }
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

/** Display order: pinned first, then newest `lastOpened` first. */
export function sortEntries(entries: RegistryEntry[]): RegistryEntry[] {
  return [...entries].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.lastOpened) - Date.parse(a.lastOpened));
}

/** `path` opened at `now`: its entry refreshed or appended, then the cap applied (oldest unpinned out first). */
export function upsertEntry(entries: RegistryEntry[], path: string, now: Date): RegistryEntry[] {
  const lastOpened = now.toISOString();
  const found = entries.find(e => e.path === path);
  const next = found ? entries.map(e => (e === found ? { ...e, lastOpened } : e)) : [...entries, { path, lastOpened, pinned: false }];
  while (next.length > MAX_REGISTRY_ENTRIES) {
    const others = next.filter(e => e.path !== path); // never the one just opened
    const pool = others.some(e => !e.pinned) ? others.filter(e => !e.pinned) : others;
    const oldest = pool.reduce((a, b) => (Date.parse(b.lastOpened) < Date.parse(a.lastOpened) ? b : a));
    next.splice(next.indexOf(oldest), 1);
  }
  return next;
}

/** The entries without the one whose stored path equals `path` byte for byte, or null when there is none. */
export function removeEntry(entries: RegistryEntry[], path: string): RegistryEntry[] | null {
  const i = entries.findIndex(e => e.path === path);
  return i < 0 ? null : [...entries.slice(0, i), ...entries.slice(i + 1)];
}

/** Longest path a request may send. */
export const MAX_PATH_LENGTH = 4096;

/** Shape of a `{path}` body, checked before the lock. Null when fine. */
export function pathShapeError(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with one field, path.';
  const keys = Object.keys(b);
  if (keys.length !== 1 || keys[0] !== 'path') return 'The request must have exactly one field, path.';
  if (typeof b.path !== 'string') return '"path" must be a string.';
  if (!b.path.length || b.path.length > MAX_PATH_LENGTH) return `"path" must be 1 to ${MAX_PATH_LENGTH} characters.`;
  if (b.path.includes('\0')) return '"path" must not contain a NUL character.';
  return null;
}

export type OpenCheck = { root: string } | { status: 409 | 422; error: string; project?: number };

/**
 * The add route's path rule, in one place: `~` expanded against `home`, absolute, realpath-resolved,
 * a directory, not the home folder, not a file-system root, not a served root. Makes no call on the
 * folder but `realpath` and `stat`.
 */
export function checkOpenPath(input: string, roots: string[], home: string): OpenCheck {
  const expanded = input === '~' ? home : input.startsWith('~/') ? join(home, input.slice(2)) : input;
  if (!isAbsolute(expanded)) return { status: 422, error: 'The path must be absolute, e.g. /Users/you/project or ~/project.' };
  let root: string;
  try {
    root = realpathSync(expanded);
  } catch {
    return { status: 422, error: `Folder not found: ${input}` };
  }
  let isDir: boolean;
  try {
    isDir = statSync(root).isDirectory();
  } catch {
    return { status: 422, error: `Folder not found: ${input}` };
  }
  if (!isDir) return { status: 422, error: `Not a folder: ${input}` };
  let realHome: string;
  try {
    realHome = realpathSync(home);
  } catch {
    realHome = home;
  }
  if (root === realHome || parse(root).root === root) return { status: 422, error: 'SpecPilot does not open your home folder or the root of a drive.' };
  const served = roots.findIndex(r => {
    try {
      return realpathSync(r) === root;
    } catch {
      return r === root;
    }
  });
  if (served >= 0) return { status: 409, error: `${root} is already open as project ${served}.`, project: served };
  return { root };
}
