import { readdirSync, realpathSync, statSync } from 'fs';
import { dirname, isAbsolute, join, posix, relative, sep } from 'path';

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
 * target must still be inside the project root and still inside the allowlist.
 */
export function resolveAllowedPath(root: string, requested: string): string | null {
  if (!requested || requested.includes('\0') || requested.includes('\\')) return null;
  if (isAbsolute(requested) || posix.isAbsolute(requested)) return null;
  if (requested.split('/').includes('..')) return null;
  const rel = posix.normalize(requested);
  if (!isAllowlisted(rel)) return null;
  try {
    const realRoot = realpathSync(root);
    if (realpathSync(dirname(join(root, rel))) !== join(realRoot, dirname(rel))) return null;
    const real = realpathSync(join(root, rel));
    const back = relative(realRoot, real);
    if (!back || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) return null;
    if (!isAllowlisted(back.split(sep).join('/'))) return null;
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
