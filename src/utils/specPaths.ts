import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'fs';
import { randomBytes } from 'crypto';
import { basename, dirname, isAbsolute, join, posix, relative, sep } from 'path';

// What `specpilot serve` may read (REQ-002.H.4, SEC-004.8), shared by the server and the
// live-reload poller so both see exactly the same set of files (ARCH-003.16).

export const ALLOWED_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];
export const ALLOWED_DIRS = ['.specs/', '.claude/commands/', '.claude/skills/', '.github/prompts/'];

/** Upper bound on files one scan returns, so a huge tree cannot make each poll expensive. */
export const MAX_SCAN_FILES = 2000;

/**
 * Allowlisted, and below an allowlisted folder no segment is hidden or `node_modules`: the same
 * rule `listAllowedFiles()` walks by, so what the server serves is exactly what the poller watches.
 */
function isAllowlisted(rel: string): boolean {
  if (ALLOWED_FILES.includes(rel)) return true;
  const dir = ALLOWED_DIRS.find(d => rel.startsWith(d) && rel.length > d.length);
  return !!dir && rel.slice(dir.length).split('/').every(s => s !== '' && !s.startsWith('.') && s !== 'node_modules');
}

/**
 * Map a requested project-relative path to a real file the server may read, or null.
 * Rejects NUL, backslashes, absolute paths and `..` segments; no folder on the way may be a
 * symlink (the scanner does not follow them either); after resolving a symlinked file the
 * target must still be inside the project root and still inside the allowlist. `allowed`, when
 * given, replaces the allowlist with exactly these paths, under the same checks (BL-PM-010).
 */
export function resolveAllowedPath(root: string, requested: string, allowed?: string[]): string | null {
  const ok = allowed ? (rel: string) => allowed.includes(rel) : isAllowlisted;
  if (!requested || requested.includes('\0') || requested.includes('\\')) return null;
  if (isAbsolute(requested) || posix.isAbsolute(requested)) return null;
  if (requested.split('/').includes('..')) return null;
  const rel = posix.normalize(requested);
  if (!ok(rel)) return null;
  try {
    const realRoot = realpathSync(root);
    if (realpathSync(dirname(join(root, rel))) !== join(realRoot, dirname(rel))) return null;
    const real = realpathSync(join(root, rel));
    const back = relative(realRoot, real);
    if (!back || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) return null;
    if (!ok(back.split(sep).join('/'))) return null;
    return statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

export interface AllowedScan {
  /** Project-relative, `/`-joined paths in walk order: the allowlisted files, then each folder sorted. */
  files: string[];
  /** Folders that exist but could not be listed (EACCES, EPERM): their contents are unknown, not gone. */
  unreadable: string[];
  /** True when the scan stopped at `max` files. */
  capped: boolean;
}

/**
 * Every path a request may name: the allowlisted files, plus every non-hidden file under the
 * allowlisted folders, skipping `node_modules` and dot-folders such as `.git`. Stops at `max`.
 * Only directory listings are read here, never file content, and nothing here throws.
 */
export function listAllowedFiles(root: string, max = MAX_SCAN_FILES): AllowedScan {
  const scan: AllowedScan = { files: [...ALLOWED_FILES], unreadable: [], capped: false };
  const walk = (rel: string): void => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') scan.unreadable.push(rel);
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (scan.capped) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (scan.files.length >= max) scan.capped = true;
      else scan.files.push(p);
    }
  };
  for (const d of ALLOWED_DIRS) walk(d.slice(0, -1));
  return scan;
}

// The CLI's one no-follow writer (BL-130, REQ-002.E.18): the server writers' rules (SEC-004.12, SEC-004.19) for every
// write inside the project. `root` is the project folder, `rel` is `/`-joined and starts with the specs folder's name.

/**
 * Why `rel` may not be written under `root`: the first existing folder on the way that is a symbolic link or
 * not a folder, so no write can follow a link out of the project (guided setup's rule, shared since BL-077).
 * A missing folder ends the walk, since it and every deeper one will be created. Null when nothing is in the way.
 */
export function folderError(root: string, rel: string): string | null {
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i++) {
    let st;
    try {
      st = lstatSync(join(root, ...parts.slice(0, i)));
    } catch {
      return null;
    }
    if (st.isSymbolicLink()) return `${parts.slice(0, i).join('/')} is a symbolic link, so nothing was written.`;
    if (!st.isDirectory()) return `${parts.slice(0, i).join('/')} is not a folder, so nothing was written.`;
  }
  return null;
}

/**
 * Walks the folders from `projectDir` down to `dir` (project-relative, `/`-joined) with `lstat`, one level
 * at a time: 'bad' at a symbolic link or a non-folder, 'missing' at the first absent level, else 'ok'.
 * With `create`, an absent level is made with a non-recursive `mkdir` and checked again (BL-PM-006).
 */
export function checkFolders(projectDir: string, dir: string, create: boolean): 'ok' | 'missing' | 'bad' {
  let at = projectDir;
  for (const segment of dir.split('/')) {
    at = join(at, segment);
    let st;
    try {
      st = lstatSync(at);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      if (!create) return 'missing';
      mkdirSync(at);
      st = lstatSync(at);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) return 'bad';
  }
  return 'ok';
}

/**
 * Replace `file` with `content`: a temp file in the same folder, fsync, the given mode, an optional last
 * look, rename. Returns false when the last look said no (the temp file removed), true when renamed.
 */
export function replaceFile(file: string, mode: number, content: string, lastLook?: () => boolean): boolean {
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

/**
 * Why `rel` may not be written under `root`: `folderError()`, or the file itself is a symbolic link (dangling or not)
 * or not a regular file. Null when nothing is in the way, the file missing included.
 */
export function writeError(root: string, rel: string): string | null {
  const folder = folderError(root, rel);
  if (folder) return folder;
  let st;
  try {
    st = lstatSync(join(root, ...rel.split('/')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  if (st.isSymbolicLink()) return `${rel} is a symbolic link, so nothing was written.`;
  if (!st.isFile()) return `${rel} is not a regular file, so nothing was written.`;
  return null;
}

/**
 * Write `content` to `rel` under `root` without following a link: throws `writeError()`'s text, creates missing folders
 * one level at a time, creates a missing file with `wx`, replaces an existing one through `replaceFile()` with its mode.
 * With `create`, an existing file is kept and false returned.
 */
export function writeInside(root: string, rel: string, content: string, { create = false } = {}): boolean {
  const error = writeError(root, rel);
  if (error) throw new Error(error);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  if (dir && checkFolders(root, dir, true) !== 'ok') throw new Error(`${dir} is a symbolic link or not a folder, so nothing was written.`);
  const file = join(root, ...rel.split('/'));
  let st;
  try {
    st = lstatSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    writeFileSync(file, content, { flag: 'wx' });
    return true;
  }
  if (create) return false;
  replaceFile(file, st.mode, content);
  return true;
}
