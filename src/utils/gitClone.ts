import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join, parse } from 'path';
import { projectNameError } from './initQuestions';
import { pathShapeError } from './projectRegistry';

// Clone a repository for `specpilot serve` (BL-PM-002, ARCH-003.23, SEC-004.15): the one module that
// starts a process for a request. git is the user's own, started without a shell; only the URL (after
// `--`) and the target folder reach its command line, and nothing it does can wait on a prompt.

export const MAX_URL_LENGTH = 2048;
/** A clone that runs longer is killed, with its helpers. */
export const CLONE_TIMEOUT_MS = 10 * 60 * 1000;
/** Longest git message returned to the page. */
export const MAX_GIT_LINE = 300;

const HOST = '[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?';
const USER = '[A-Za-z0-9_][A-Za-z0-9._-]*';
const PORT = '(?::[0-9]{1,5})?';
const REPO_PATH = '(?!-)[A-Za-z0-9._~/+%-]+';
/** The only URLs cloned: https, ssh:// and user@host:path, each matched from the first character to the last. */
const URL_FORMS = [
  new RegExp(`^https://${HOST}${PORT}/${REPO_PATH}$`),
  new RegExp(`^ssh://(?:${USER}@)?${HOST}${PORT}/${REPO_PATH}$`),
  new RegExp(`^${USER}@${HOST}:${REPO_PATH}$`),
];
// eslint-disable-next-line no-control-regex
const SPACE_OR_CONTROL = /[\s\u0000-\u0020\u007f-\u00a0\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const ANSI_AND_CONTROL = /\u001b\[[0-9;?]*[ -/]*[@-~]|[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
/** The stages of git's progress the page shows (BL-PM-009), by git's own words under `LC_MESSAGES=C`. */
const STAGES: Record<string, CloneStage> = { 'Receiving objects': 'receiving', 'Resolving deltas': 'resolving', 'Updating files': 'updating' };
export type CloneStage = 'receiving' | 'resolving' | 'updating';
const STAGE_LINE = /^(Receiving objects|Resolving deltas|Updating files): +([0-9]{1,3})% \(/;
/** Any progress line of git's: never shown as its error. */
const PROGRESS_LINE = /^[A-Z][A-Za-z ]+: +[0-9]{1,3}% \(/;
/** Longest run of stderr without a line break kept for the next read; a longer one is not progress. */
const MAX_CARRY = 300;

/** What is wrong with a repository URL, or null. Pure string checks: the URL is never parsed or rewritten. */
export function cloneUrlError(url: string): string | null {
  if (!url.length || url.length > MAX_URL_LENGTH) return `url must be a string of 1 to ${MAX_URL_LENGTH} characters.`;
  if (SPACE_OR_CONTROL.test(url)) return 'The repository URL must not contain spaces or control characters.';
  if (URL_FORMS.some(form => form.test(url))) return null;
  if (/^https:\/\/[^/]*@/.test(url)) return 'Remove the user name and password from the URL. git reads them from your credential helper.';
  return 'Only https://host/path, git@host:path and ssh://host/path repository URLs can be cloned.';
}

/**
 * The folder `git clone` would make for a URL: its last path segment without `.git`. The rule lives in
 * the page's `ui/route.js`, which fills the Folder name field with it, so there is one copy.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { repoNameFromUrl } = require('../../ui/route.js') as { repoNameFromUrl: (url: string) => string };

const CLONE_KEYS = ['url', 'parent', 'name'];

/** Shape of a clone body, checked before anything runs. Null when fine. */
export function cloneShapeError(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with url, parent and name.';
  for (const key of Object.keys(b)) if (!CLONE_KEYS.includes(key)) return `Unexpected field "${key}".`;
  for (const key of CLONE_KEYS) {
    if (!(key in b)) return `"${key}" is missing.`;
    if (typeof b[key] !== 'string') return `"${key}" must be a string.`;
  }
  const s = b as Record<string, string>;
  const parentProblem = pathShapeError({ path: s.parent });
  if (parentProblem) return parentProblem.replace('"path"', '"parent"');
  const urlProblem = cloneUrlError(s.url);
  if (urlProblem) return urlProblem;
  if (s.name) {
    const nameProblem = projectNameError(s.name);
    if (nameProblem) return `${nameProblem.message}.`;
  } else if (projectNameError(repoNameFromUrl(s.url))) return 'Type a folder name. One could not be taken from this URL.';
  return null;
}

/** The server's environment plus what keeps git to https and ssh and stops it asking anything. */
function gitEnv(allowProtocols: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_ALLOW_PROTOCOL: allowProtocols, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never', GCM_INTERACTIVE: 'never' };
  // These two would point git at another repository or work tree than the target.
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  // English messages, because `fatal:` and `Cloning into` are matched (gitErrorLine()). Only the message
  // language changes: an LC_ALL, which would override LC_MESSAGES, is kept as LC_CTYPE, so file names
  // are handled as before.
  if (env.LC_ALL) {
    env.LC_CTYPE = env.LC_ALL;
    delete env.LC_ALL;
  }
  delete env.LANGUAGE;
  env.LC_MESSAGES = 'C';
  return env;
}

/**
 * Is git there? And, on Windows only, where the child has a console ssh could ask in: has the user an
 * ssh command of their own (`GIT_SSH_COMMAND`, `GIT_SSH`, `core.sshCommand`)? `batchSsh` says ssh may
 * be put in batch mode without replacing one. On POSIX it is always false: the child has no terminal
 * and no askpass, so ssh cannot ask, and the user's ssh setup is never touched. Run at the file-system
 * root, so no repository's local configuration answers.
 */
export function probeGit(home: string, platform = process.platform): Promise<{ batchSsh: boolean } | { error: string }> {
  return new Promise(done => {
    const child = execFile('git', ['config', '--get', 'core.sshCommand'], { cwd: parse(home).root, env: gitEnv('https:ssh'), windowsHide: true }, (err, stdout) => {
      const code = err ? (err as { code?: number | string }).code : 0;
      if (code === 'ENOENT') return done({ error: 'git is not installed.' });
      if (code !== 0 && code !== 1) return done({ error: `git could not be run (${code}).` }); // 1 = not set
      done({ batchSsh: platform === 'win32' && !stdout.trim() && !process.env.GIT_SSH_COMMAND && !process.env.GIT_SSH });
    });
    child.stdin?.end();
  });
}

/**
 * What the page shows of git's stderr, as one line: its last `fatal:` line with the line just before
 * it, which over ssh is the one that says why (`Host key verification failed.`). `remote:` lines, text
 * the remote host chooses, and git's own `Cloning into` line are never shown. Without a `fatal:` line,
 * the last line left.
 */
export function gitErrorLine(stderr: string): string | null {
  const lines = stderr.split(/\r?\n|\r/).map(line => line.replace(ANSI_AND_CONTROL, '').trim()).filter(l => l && !l.startsWith('remote:') && !l.startsWith('Cloning into ') && !PROGRESS_LINE.test(l));
  if (!lines.length) return null;
  const fatal = lines.map(l => l.startsWith('fatal:')).lastIndexOf(true);
  if (fatal <= 0) return lines[fatal < 0 ? lines.length - 1 : 0].slice(0, MAX_GIT_LINE);
  const last = lines[fatal].slice(0, MAX_GIT_LINE);
  const room = MAX_GIT_LINE - last.length - 1; // the fatal: line is never pushed out by a long line before it
  return room > 0 ? `${lines[fatal - 1].slice(0, room)} ${last}` : last;
}

export interface CloneOptions {
  /** Put ssh in batch mode (Windows only; `probeGit()` says when that replaces nothing of the user's). */
  batchSsh?: boolean;
  timeoutMs?: number;
  /** Aborting kills the clone: the page went away, or the server is closing. */
  signal?: AbortSignal;
  /** Called each time git's progress changes stage or whole percentage (BL-PM-009). */
  onProgress?: (stage: CloneStage, percent: number) => void;
  /** Tests only (a local bare repository needs `file`). The server never passes it and no request field maps to it. */
  allowProtocols?: string;
}

export type CloneResult = { ok: true } | { ok: false; aborted: boolean; error: string };

/**
 * `git clone --progress --no-recurse-submodules -- <url> <target>` in the target's parent, without a shell, with
 * stdin closed and, on POSIX, in its own session (no controlling terminal; one process group to kill).
 * `spawn` and not `execFile`, which cannot start a detached child; both take an argument array.
 */
export function cloneRepository(url: string, target: string, opts: CloneOptions = {}): Promise<CloneResult> {
  return new Promise(done => {
    if (opts.signal?.aborted) return done({ ok: false, aborted: true, error: '' });
    const posix = process.platform !== 'win32';
    const env = gitEnv(opts.allowProtocols ?? 'https:ssh');
    if (opts.batchSsh) env.GIT_SSH_COMMAND = 'ssh -oBatchMode=yes';
    const child = spawn('git', ['clone', '--progress', '--no-recurse-submodules', '--', url, target], {
      cwd: dirname(target), env, stdio: ['ignore', 'ignore', 'pipe'], detached: posix, windowsHide: true,
    });
    let stderr = '';
    let stopped: 'limit' | 'aborted' | null = null;
    const kill = (why: 'limit' | 'aborted') => {
      stopped = stopped ?? why;
      try {
        if (posix && child.pid) process.kill(-child.pid, 'SIGKILL'); // the group: git-remote-https and ssh go too
        else child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const onAbort = () => kill('aborted');
    const timer = setTimeout(() => kill('limit'), opts.timeoutMs ?? CLONE_TIMEOUT_MS);
    opts.signal?.addEventListener('abort', onAbort);
    let finished = false;
    const finish = (result: CloneResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      done(result);
    };
    // git rewrites a progress line with `\r` and ends it with `\n`; a line cut between two reads is
    // joined first. null: inside a run longer than MAX_CARRY, dropped up to the next line break.
    let carry: string | null = '';
    let last = '';
    const readProgress = (text: string) => {
      const lines = text.split(/\r|\n/);
      const tail = lines.pop()!;
      if (lines.length) {
        lines[0] = carry === null ? '' : carry + lines[0];
        carry = '';
      }
      if (carry !== null) carry = carry.length + tail.length > MAX_CARRY ? null : carry + tail;
      for (const line of lines) {
        const m = STAGE_LINE.exec(line.replace(ANSI_AND_CONTROL, ''));
        if (!m || +m[2] > 100 || `${m[1]} ${+m[2]}` === last) continue;
        last = `${m[1]} ${+m[2]}`;
        opts.onProgress!(STAGES[m[1]], +m[2]);
      }
    };
    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderr = (stderr + text).slice(-65536);
      if (opts.onProgress && !finished && !stopped) readProgress(text); // nothing once git is being stopped or has ended
    });
    child.on('error', err => {
      const code = (err as NodeJS.ErrnoException).code;
      finish({ ok: false, aborted: false, error: code === 'ENOENT' ? 'git is not installed.' : `git could not be run (${code}).` });
    });
    child.on('close', (code, signal) => {
      if (stopped === 'aborted') return finish({ ok: false, aborted: true, error: '' });
      if (stopped === 'limit') return finish({ ok: false, aborted: false, error: `The clone was stopped after ${CLONE_TIMEOUT_MS / 60000} minutes. What it had downloaded was removed.` });
      if (code === 0) return finish({ ok: true });
      const line = gitErrorLine(stderr);
      finish({ ok: false, aborted: false, error: line ? `git clone failed: ${line}` : `git clone failed (exit code ${code ?? signal}).` });
    });
  });
}

/**
 * Remove what a clone put into `target`: only while it is still a real folder, every entry in it (links
 * are removed, never followed), and the folder itself only when this request `created` it. The folder
 * was empty when the clone started, so everything in it is the clone's. Resolves to an error code, or null.
 */
export async function emptyTarget(target: string, created: boolean): Promise<string | null> {
  try {
    if (!(await fs.lstat(target)).isDirectory()) return null;
    // Asynchronous, so a stop signal's time limit can end the wait for a large tree (serve.ts).
    for (const entry of await fs.readdir(target)) await fs.rm(join(target, entry), { recursive: true, force: true });
    if (created) await fs.rmdir(target);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? null : (code ?? 'error');
  }
}
