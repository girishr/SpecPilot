import { statSync } from 'fs';
import { join } from 'path';
import { listAllowedFiles, MAX_SCAN_FILES, resolveAllowedPath } from './specPaths';

// Live-reload change detection for `specpilot serve` (BL-052, ARCH-003.17, ARCH-004.35).
// Polls with stat() instead of fs.watch (recursive watch is unreliable on Linux before Node 20)
// and never reads file content.

interface Entry {
  mtimeMs: number;
  size: number;
  /** Extra signal for atomic saves; some file systems report 0, which then simply always matches. */
  ino: number;
}

type Snapshot = Map<string, Entry>;

export interface PollerOptions {
  /** Idle interval between scans. */
  intervalMs: number;
  /** After a change, re-check this often until a check finds nothing new. */
  settleMs?: number;
  /** Emit anyway once a burst has lasted this long. */
  maxSettleMs?: number;
  /** Called once per settled burst with the changed project-relative paths, sorted. */
  onChange: (paths: string[]) => void;
  /** Where the one-time "scan capped" notice goes. */
  log?: (message: string) => void;
  maxFiles?: number;
}

export interface Poller {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/** stat() every allowlisted file. ENOENT (gone since readdir) → absent; EACCES or any other error → keep what we knew. */
function scan(root: string, prev: Snapshot, maxFiles: number): { snap: Snapshot; capped: boolean } {
  const { files, unreadable, capped } = listAllowedFiles(root, maxFiles);
  const snap: Snapshot = new Map();
  for (const path of files) {
    try {
      const st = statSync(join(root, path));
      // Only what the server would actually serve (regular file, symlinks resolved inside the allowlist).
      if (st.isFile() && resolveAllowedPath(root, path)) snap.set(path, { mtimeMs: st.mtimeMs, size: st.size, ino: st.ino });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      const known = prev.get(path);
      if (known) snap.set(path, known);
    }
  }
  // A folder we could not list: its files are unknown this time, not deleted.
  for (const dir of unreadable) {
    for (const [path, entry] of prev) if (path.startsWith(dir + '/') && !snap.has(path)) snap.set(path, entry);
  }
  return { snap, capped };
}

/** The paths one scan would watch right now (for tests and diagnostics). */
export function watchedFiles(root: string, maxFiles = MAX_SCAN_FILES): string[] {
  return [...scan(root, new Map(), maxFiles).snap.keys()].sort();
}

function diff(a: Snapshot, b: Snapshot): string[] {
  const changed = new Set<string>();
  for (const [path, x] of a) {
    const y = b.get(path);
    if (!y || y.mtimeMs !== x.mtimeMs || y.size !== x.size || y.ino !== x.ino) changed.add(path);
  }
  for (const path of b.keys()) if (!a.has(path)) changed.add(path);
  return [...changed].sort();
}

export function createPoller(root: string, opts: PollerOptions): Poller {
  const settleMs = opts.settleMs ?? 150;
  const maxSettleMs = opts.maxSettleMs ?? 2000;
  const maxFiles = opts.maxFiles ?? MAX_SCAN_FILES;
  let timer: NodeJS.Timeout | null = null;
  let prev: Snapshot = new Map();
  let pending = new Set<string>();
  let burstStart = 0;
  let warnedCap = false;

  const check = (): string[] => {
    const { snap, capped } = scan(root, prev, maxFiles);
    if (capped && !warnedCap) {
      warnedCap = true;
      opts.log?.(`specpilot serve: watching the first ${maxFiles} files only; changes to the rest are not detected.`);
    }
    const changed = diff(prev, snap);
    prev = snap;
    return changed;
  };

  const tick = (): void => {
    timer = null;
    let changed: string[] = [];
    try {
      changed = check();
    } catch {
      // Nothing in a scan should throw; if something does, keep polling rather than die.
    }
    changed.forEach(p => pending.add(p));
    const settling = pending.size > 0;
    if (settling && !burstStart) burstStart = Date.now();
    if (settling && changed.length && Date.now() - burstStart < maxSettleMs) {
      timer = setTimeout(tick, settleMs);
      return;
    }
    if (settling) {
      const paths = [...pending].sort();
      pending = new Set();
      burstStart = 0;
      opts.onChange(paths);
    }
    if (poller.running) timer = setTimeout(tick, opts.intervalMs);
  };

  let active = false;
  const poller: Poller = {
    start() {
      if (active) return;
      active = true;
      prev = scan(root, new Map(), maxFiles).snap;
      timer = setTimeout(tick, opts.intervalMs);
    },
    stop() {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = new Set();
      burstStart = 0;
    },
    get running() {
      return active;
    },
  };
  return poller;
}
