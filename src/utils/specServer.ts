import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { readFileSync, statSync } from 'fs';
import { join, resolve, sep } from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';
import { randomBytes, timingSafeEqual } from 'crypto';
import { readSpecs } from './specReader';
import { moveShapeError, moveTask, NEW_STALE_ERROR, newTask, NewTask, newTaskShapeError, sha256, STALE_ERROR, TaskMove } from './taskMover';
import { ALLOWED_FILES, listAllowedFiles, resolveAllowedPath } from './specPaths';
import { createPoller } from './specPoller';
import { answersShapeError, createProject, newProjectQuestions, newProjectShapeError, previewNewProject, previewSetup, reserveTarget, setupProject, setupQuestions, specsMissing } from './specSetup';
import { cloneRepository, cloneShapeError, emptyTarget, probeGit, repoNameFromUrl } from './gitClone';
import { checkOpenPath, homeDir, MAX_PROJECTS, pathShapeError, readRegistry, RegistryEntry, removeEntry, sortEntries, upsertEntry, writeRegistry } from './projectRegistry';
import { SlashCommandBackfillResult, SpecBackfiller } from './specBackfiller';
import { isSpecPilotCommand } from './slashCommandGenerator';
import { resolveTarget, SLASH_COMMANDS } from '../core/slashCommands';
import { agentTargets } from '../core/agentConfig';
import { SpecValidator } from './specValidator';
import { answerMcp, MCP_TOOLS, mirroredHeaders, rpcError, ToolRefusal } from './mcpLocal';

// Local server behind `specpilot serve` (BL-051, ARCH-004.33, SEC-004.8). Every request re-reads disk;
// nothing is cached. The server writes nothing itself: task moves go through taskMover.ts (BL-053),
// guided setup and new projects through specSetup.ts (BL-055, BL-PM-003), the project registry through
// projectRegistry.ts (BL-067), a clone through gitClone.ts, which runs the user's git (BL-PM-002), and
// Regenerate All through specBackfiller.ts's command step (BL-PM-006). With --mcp, POST /mcp runs the same
// functions for an AI IDE on this machine (BL-PM-007, mcpLocal.ts).

/** Resolved from this module's own location, never from cwd: dist/utils → <package>/ui. */
const UI_DIR = join(__dirname, '..', '..', 'ui');
/** The chat core's compiled file, which the page runs as /assets/chat-core.js (BL-PM-004b, REQ-002.I.7). */
const CHAT_CORE = join(__dirname, '..', 'core', 'chatFlow.js');

/** tsc's CommonJS output of `src/core/chatFlow.ts` as a page script: `exports` supplied, the source map line dropped. */
export function chatCoreScript(compiled: string): string {
  return `(function (exports) {\n${compiled.replace(/^\/\/# sourceMappingURL=.*$/m, '')}\n})(window.SpecPilotChat = {});\n`;
}

const UI_ROUTES: Record<string, [file: string, type: string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/assets/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/assets/md.js': ['md.js', 'text/javascript; charset=utf-8'],
  '/assets/route.js': ['route.js', 'text/javascript; charset=utf-8'],
  '/assets/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/assets/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

/** DNS-rebinding guard: only the loopback names this server was reached on. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  const h = (host ?? '').toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/** Current branch from .git/HEAD (worktree `.git` files and detached HEADs included), or null. */
export function readBranch(root: string): string | null {
  try {
    let gitDir = join(root, '.git');
    if (statSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitDir, 'utf-8'));
      if (!m) return null;
      gitDir = resolve(root, m[1].trim());
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf-8').trim();
    const ref = /^ref: refs\/heads\/(\S+)$/.exec(head);
    if (ref) return ref[1];
    return /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(head) ? head : null;
  } catch {
    return null;
  }
}

/** `key: value` lines of a leading `---` block, values as written; null when there is none. */
function frontMatter(text: string): Record<string, string> | null {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return null;
  const fm: Record<string, string> = {};
  for (const l of lines.slice(1, close)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(l);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

export interface NavFile {
  path: string;
  frontMatter: Record<string, string> | null;
}

/** The files under one allowlisted folder, with their front matter. */
function navFiles(root: string, scanned: string[], dir: string, keep: (p: string) => boolean): NavFile[] {
  return scanned
    .filter(p => p.startsWith(dir + '/') && keep(p))
    .flatMap(path => {
      const real = resolveAllowedPath(root, path);
      return real ? [{ path, frontMatter: frontMatter(readFileSync(real, 'utf-8')) }] : [];
    });
}

function projectName(yamlText: string | undefined): string | null {
  if (yamlText === undefined) return null;
  try {
    const doc = yaml.load(yamlText) as { name?: unknown } | null;
    return doc && typeof doc.name === 'string' ? doc.name : null;
  } catch {
    return null;
  }
}

/** tasks.md text between its front matter and its first `## ` heading, verbatim. */
function tasksIntro(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  if (lines[0]?.trim() === '---') start = lines.findIndex((l, i) => i > 0 && l.trim() === '---') + 1;
  const end = lines.findIndex((l, i) => i >= start && /^## /.test(l.trim()));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

/** sha256 of tasks.md's raw bytes: what a move's If-Match must carry (BL-053). */
function tasksHash(root: string): string | null {
  const real = resolveAllowedPath(root, '.specs/planning/tasks.md');
  return real ? sha256(readFileSync(real)) : null;
}

const CURSOR_RULES = '.cursor/rules/specpilot.mdc';

/** Everything `GET /api/specs` returns: project metadata, readSpecs() output, the nav tree. */
export function buildSpecsPayload(root: string, specpilotVersion: string) {
  const scanned = listAllowedFiles(root).files;
  const contents: Record<string, string> = {};
  for (const p of scanned.filter(f => f.startsWith('.specs/'))) {
    const real = resolveAllowedPath(root, p);
    if (real) contents[p.slice('.specs/'.length)] = readFileSync(real, 'utf-8');
  }
  const { files, tasks } = readSpecs(contents);
  return {
    project: {
      name: projectName(contents['project/project.yaml']),
      root,
      branch: readBranch(root),
      specpilotVersion,
      specs: !specsMissing(root), // false → the page offers guided setup (BL-055)
      // the file SpecPilot writes for Cursor; checked, never served (BL-PM-010, SEC-004.8)
      cursor: resolveAllowedPath(root, CURSOR_RULES, [CURSOR_RULES]) !== null,
    },
    files,
    tasks: tasks ? { ...tasks, intro: tasksIntro(contents['planning/tasks.md']), sha256: tasksHash(root) } : null,
    nav: {
      specs: Object.keys(contents),
      instructions: ALLOWED_FILES.map(path => {
        const real = resolveAllowedPath(root, path);
        return { path, exists: real !== null, bytes: real ? statSync(real).size : 0 };
      }),
      // generated: the page's "From SpecPilot" group, else "Yours" (BL-PM-006)
      commands: navFiles(root, scanned, '.claude/commands', p => p.endsWith('.md')).map(f => ({ ...f, generated: isSpecPilotCommand(root, f.path) })),
      skills: navFiles(root, scanned, '.claude/skills', p => p.endsWith('/SKILL.md')).map(f => ({ ...f, generated: agentTargets('claude-code').includes(f.path) })),
      prompts: navFiles(root, scanned, '.github/prompts', p => p.endsWith('.md')).map(f => ({ ...f, generated: isSpecPilotCommand(root, f.path) })),
    },
  };
}

/** The command folders the Commands view lists; the result names any other folder Regenerate touched. */
const LISTED_COMMAND_FOLDERS = ['.claude/commands/', '.github/prompts/'];

/** What Regenerate All did, as project-relative paths, and the lines the page shows verbatim (BL-PM-006, REQ-002.H.30). */
export function regenerateReport(results: SlashCommandBackfillResult[]) {
  const pathOf = (ide: string, name: string) => {
    const target = resolveTarget(ide, SLASH_COMMANDS.find(c => c.name === name)!);
    return `${target.dir}/${target.fileName}`;
  };
  const added = results.flatMap(r => r.added.map(name => pathOf(r.ide, name)));
  const updated = results.flatMap(r => r.updated.map(name => pathOf(r.ide, name)));
  const kept = results.flatMap(r => r.kept.map(k => ({ path: k.path, reason: k.reason })));
  const message: string[] = [];
  if (!results.length) message.push('No IDE instruction file found, so no command files were written.');
  else if (!added.length && !updated.length && !kept.length) message.push('Every SpecPilot command file is current.');
  if (updated.length) message.push(`Updated: ${updated.join(', ')}.`);
  if (added.length) message.push(`Added: ${added.join(', ')}.`);
  if (kept.length) message.push(`Kept as they were: ${kept.map(k => `${k.path} (${k.reason})`).join(', ')}.`);
  const folders = [...new Set([...updated, ...added, ...kept.map(k => k.path)].map(p => p.slice(0, p.lastIndexOf('/') + 1)))];
  const unlisted = folders.filter(f => !LISTED_COMMAND_FOLDERS.includes(f));
  if (unlisted.length) message.push(`Not listed on this page: ${unlisted.join(', ')}.`);
  return { added, updated, kept, message };
}

/** `~` or `~/…` for the home directory and anything under it, else the path as given (BL-054). */
export function displayRoot(root: string, home = homedir()): string {
  if (root === home) return '~';
  return root.startsWith(home + sep) ? '~' + root.slice(home.length) : root;
}

/** One entry per served project, in index order: what the rail shows (BL-054). */
function projectList(roots: string[]) {
  return roots.map(root => {
    const yamlFile = resolveAllowedPath(root, '.specs/project/project.yaml');
    return { name: projectName(yamlFile ? readFileSync(yamlFile, 'utf-8') : undefined), root: displayRoot(root), branch: readBranch(root) };
  });
}

/** `?project=<n>` → index into the served roots: omitted = 0; one canonical whole number in range, else null (404). */
function projectIndex(url: URL, count: number): number | null {
  const given = url.searchParams.getAll('project');
  if (given.length === 0) return 0;
  if (given.length > 1 || !/^(0|[1-9][0-9]*)$/.test(given[0])) return null;
  const n = Number(given[0]);
  return n < count ? n : null;
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS });
  res.end(body);
}

const TEXT = 'text/plain; charset=utf-8';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

/** Largest accepted request body for a move (BL-053) and the other write routes. */
export const MAX_MOVE_BODY = 16 * 1024;
/** Largest accepted body for a setup, a new project or a preview, which carry the 23 optional fields (BL-PM-004b). */
export const MAX_SETUP_BODY = 64 * 1024;

/** Where index.html receives the per-start CSRF token (nothing with --read-only). */
const TOKEN_SLOT = '<!-- specpilot-token -->';
/** Where index.html learns that /mcp is on, and whose token it takes: `page` or `env` (BL-PM-007). */
const MCP_SLOT = '<!-- specpilot-mcp -->';

/** Most `/api/events` streams open at once; the next one gets 503 (SEC-004.9). */
export const MAX_EVENT_STREAMS = 8;

export interface SpecServerOptions {
  /** Change-detection interval in ms (`--poll`). */
  pollMs?: number;
  /** Heartbeat comment interval for event streams. */
  heartbeatMs?: number;
  /** Poller settle interval after a change (tests shorten it). */
  settleMs?: number;
  /** One-time notices, e.g. the scan cap. */
  log?: (message: string) => void;
  /** `--read-only`: no write routes, no token in the page (BL-053). */
  readOnly?: boolean;
  /** Per root, whether it was named on the command line: guided setup is offered only for those (BL-055). Default: all. */
  named?: boolean[];
  /** The registry file (`~/.specpilot/projects.json`); the registry routes exist only when set and not read-only (BL-067). */
  registry?: string;
  /** Time limit of a clone in ms (tests shorten it; default `CLONE_TIMEOUT_MS`). */
  cloneTimeoutMs?: number;
  /** `--mcp`: serve POST /mcp (BL-PM-007). */
  mcp?: boolean;
  /** `SPECPILOT_MCP_TOKEN`, already checked by the command: /mcp's token instead of a per-start one. */
  mcpToken?: string;
}

export interface SpecServer {
  server: Server;
  /** The token POST /mcp takes, or null without --mcp (BL-PM-007). */
  mcpToken: string | null;
  /** Open event streams right now. */
  streams(): number;
  /** Kill a running clone and remove what it downloaded (BL-PM-002); resolves when that is done. */
  stopClone(): Promise<void>;
  /** Stop a running clone, end every event stream, clear every timer, then close the listener. */
  close(): Promise<void>;
}

export function createSpecServer(initialRoots: string[], specpilotVersion: string, opts: SpecServerOptions = {}): SpecServer {
  // The served roots: the command line's, then those opened from the page (BL-067). Append-only for the
  // life of the server, so an index never changes and nothing is dropped.
  const roots = [...initialRoots];
  const namedFlags = roots.map((_, i) => opts.named?.[i] ?? true);

  // ---- live reload (BL-052): streams, heartbeat, and one poller per project (BL-054) that runs
  // only while that project has a stream open; the heartbeat runs while any stream is open
  const projectFor = (root: string) => {
    const streams = new Set<ServerResponse>();
    const poller = createPoller(root, {
      intervalMs: opts.pollMs ?? 1000,
      settleMs: opts.settleMs,
      log: opts.log,
      onChange: paths => streams.forEach(res => res.write(`event: change\ndata: ${JSON.stringify({ paths })}\n\n`)),
    });
    return { streams, poller };
  };
  const projects = roots.map(projectFor);
  const allStreams = () => projects.flatMap(p => [...p.streams]);
  let heartbeat: NodeJS.Timeout | null = null;
  const drop = (i: number, res: ServerResponse) => {
    const { streams, poller } = projects[i];
    if (!streams.delete(res)) return;
    if (!streams.size) poller.stop();
    if (allStreams().length || !heartbeat) return;
    clearInterval(heartbeat);
    heartbeat = null;
  };
  const openStream = (i: number, req: IncomingMessage, res: ServerResponse) => {
    if (allStreams().length >= MAX_EVENT_STREAMS) return send(res, 503, TEXT, 'Too many open event streams\n');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', ...SECURITY_HEADERS });
    res.write('retry: 2000\n\n');
    const { streams, poller } = projects[i];
    streams.add(res);
    req.on('close', () => drop(i, res));
    if (streams.size === 1) poller.start();
    if (!heartbeat) heartbeat = setInterval(() => allStreams().forEach(s => s.write(': heartbeat\n\n')), opts.heartbeatMs ?? 25000);
  };

  // ---- task moves (BL-053), new tasks (BL-PM-005) and Regenerate All (BL-PM-006): absent with --read-only
  const token = opts.readOnly ? null : randomBytes(32).toString('hex');
  // /mcp's token (BL-PM-007): its own variable, because a null `token` is what turns the page's writes off.
  const mcpToken = !opts.mcp ? null : (opts.mcpToken ?? token ?? randomBytes(32).toString('hex'));
  let writeLock: Promise<void> = Promise.resolve(); // writes run strictly one after another, in every project
  const payload = (i: number) => ({ ...buildSpecsPayload(roots[i], specpilotVersion), projects: projectList(roots) });
  /** Run `fn` under the write lock and settle with its outcome; a throw never breaks the chain for later writes. */
  const locked = <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = writeLock.then(fn);
    writeLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  /** `locked()` for a route: a throw answers 500 when nothing was sent. */
  const underLock = (res: ServerResponse, fn: () => void | Promise<void>) =>
    locked(fn).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'The server could not finish this request.' });
    });

  /** The checks every write shares (SEC-004.10): Origin, token, content type, size. False = already answered. */
  const writeAllowed = (req: IncomingMessage, res: ServerResponse, limit = MAX_MOVE_BODY): boolean => {
    // Host was checked already; the page's own origin is exactly "http://" + that Host.
    if (req.headers.origin !== `http://${req.headers.host}`) {
      sendJson(res, 403, { error: 'This request did not come from the SpecPilot page, so it was refused.' });
      return false;
    }
    const given = Buffer.from(String(req.headers['x-specpilot-token'] ?? ''));
    const expected = Buffer.from(token!);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      sendJson(res, 403, { error: 'This request did not carry the page token, so it was refused. Reload the page and try again.' });
      return false;
    }
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      sendJson(res, 415, { error: 'Requests that change files must be sent as JSON.' });
      return false;
    }
    if (Number(req.headers['content-length'] ?? 0) > limit) {
      sendJson(res, 413, { error: 'The request is too large.' });
      return false;
    }
    return true;
  };

  /** Read a JSON body of at most `limit` bytes; answers 413 or 400 itself and then does not call back. */
  const readJson = (
    req: IncomingMessage,
    res: ServerResponse,
    then: (body: unknown) => void,
    limit = MAX_MOVE_BODY,
    invalid = () => sendJson(res, 400, { error: 'The request body is not valid JSON.' }),
  ) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        if (!res.headersSent) sendJson(res, 413, { error: 'The request is too large.' });
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (res.headersSent) return;
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        return invalid();
      }
      then(body);
    });
  };

  const handleMove = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    // The project is picked only now, so a request that failed the checks above learns nothing about it (SEC-004.11).
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = moveShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'The move needs an If-Match header with the file hash the page last loaded.' });
      underLock(res, () => {
        let out;
        try {
          out = moveTask(roots[i], body as TaskMove, ifMatch);
        } catch {
          return sendJson(res, 500, { error: 'planning/tasks.md could not be written. Nothing was changed.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, from: out.from, fromIndex: out.fromIndex, specs: payload(i) });
        if (out.status === 409) return sendJson(res, 409, { error: out.error, specs: payload(i) });
        return sendJson(res, 422, { error: out.error });
      });
    });
  };

  /** New Task (BL-PM-005): the move route's checks, then one line appended under the same lock. */
  const handleNewTask = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = newTaskShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'A new task needs an If-Match header with the file hash the page last loaded.' });
      const { description, section } = body as NewTask;
      underLock(res, () => {
        let out;
        try {
          out = newTask(roots[i], { description, section }, ifMatch);
        } catch {
          return sendJson(res, 500, { error: 'planning/tasks.md could not be written. Nothing was changed.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, id: out.id, section: out.section, index: out.index, specs: payload(i) });
        if (out.status === 409) return sendJson(res, 409, { error: out.error, specs: payload(i) });
        return sendJson(res, 422, { error: out.error });
      });
    });
  };

  /** Regenerate All (BL-PM-006): `specpilot backfill`'s command step for the named project, under the write lock. */
  const handleRegenerate = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
        return sendJson(res, 422, { error: 'Regenerate All takes an empty JSON object, {}.' });
      }
      underLock(res, () => {
        if (specsMissing(roots[i])) return sendJson(res, 422, { error: `No .specs/ folder in ${displayRoot(roots[i])}.` });
        const report = regenerateReport(new SpecBackfiller().backfillSlashCommands(roots[i], false));
        sendJson(res, 200, { ...report, specs: payload(i) });
      });
    });
  };

  // ---- guided setup (BL-055): only for a named root (command line, or opened from the page) that has no .specs/
  const named = (i: number) => namedFlags[i];
  const setupIndex = (url: URL): number | null => {
    const i = projectIndex(url, roots.length);
    return i !== null && named(i) && specsMissing(roots[i]) ? i : null;
  };

  const handleSetupGet = (res: ServerResponse, url: URL) => {
    const i = setupIndex(url);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    setupQuestions(roots[i]).then(
      q => sendJson(res, 200, q),
      err => sendJson(res, 422, { error: `This folder could not be read: ${(err as Error).message}` }),
    );
  };

  const handleSetupPost = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res, MAX_SETUP_BODY)) return;
    const i = projectIndex(url, roots.length);
    if (i === null || !named(i)) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = answersShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      writeLock = writeLock
        .then(() => setupProject(roots[i], body as Record<string, unknown>))
        .then(out => {
          if (out.status === 200) return sendJson(res, 200, { specs: payload(i), kept: out.kept, notice: out.notice });
          if (out.status === 409 && out.specsExists) return sendJson(res, 409, { error: out.error, specs: payload(i) });
          return sendJson(res, out.status, { error: out.error });
        })
        .catch(() => {
          if (!res.headersSent) sendJson(res, 500, { error: 'Setup could not finish.' });
        });
    }, MAX_SETUP_BODY);
  };

  // ---- preview (BL-PM-004b): what a create would write, rendered and returned; no lock, nothing written
  const handlePreview = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res, MAX_SETUP_BODY)) return;
    const guided = url.searchParams.has('project');
    const i = guided ? projectIndex(url, roots.length) : null;
    if (guided && (i === null || !named(i))) return send(res, 404, TEXT, 'Not Found\n');
    if (!guided && !registry) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = guided ? answersShapeError(body) : newProjectShapeError(body, true);
      if (problem) return sendJson(res, 422, { error: problem });
      const b = body as Record<string, unknown>;
      Promise.resolve(guided ? previewSetup(roots[i!], b) : previewNewProject(b)).then(
        out => ('status' in out ? sendJson(res, out.status, { error: out.error }) : sendJson(res, 200, out)),
        () => sendJson(res, 500, { error: 'The preview could not be made.' }),
      );
    }, MAX_SETUP_BODY);
  };

  // ---- project registry (BL-067): list, open a folder, forget an entry; all absent with --read-only
  const registry = token && opts.registry ? opts.registry : null;
  const home = homeDir();
  const isDir = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  /** The `GET /api/projects` body: the registry in display order, or its refusal reason. */
  const registryBody = () => {
    const read = readRegistry(registry!);
    const entries = read.error !== null ? [] : sortEntries(read.entries);
    return {
      path: displayRoot(registry!, home),
      entries: entries.map(e => {
        const i = roots.indexOf(e.path);
        return { path: e.path, root: displayRoot(e.path, home), lastOpened: e.lastOpened, pinned: e.pinned, project: i >= 0 ? i : null, exists: isDir(e.path) };
      }),
      error: read.error,
    };
  };
  /** Re-read, change, write; the refusal reason when the registry cannot be used. */
  const changeRegistry = (change: (entries: RegistryEntry[]) => RegistryEntry[] | null): string | null => {
    const read = readRegistry(registry!);
    if (read.error !== null) return read.error;
    const next = change(read.entries);
    if (next === null) return 'That folder is not in the list.';
    try {
      writeRegistry(registry!, next);
    } catch (err) {
      return `${displayRoot(registry!, home)} could not be written (${(err as Error).message}).`;
    }
    return null;
  };

  const TOO_MANY_PROJECTS = `This server already serves ${MAX_PROJECTS} projects. Start another specpilot serve for more.`;
  /**
   * Serve `root` as the next index and record it in the registry: the success body of an open, or null
   * after answering 422 because the folder's allowlisted files cannot be read (it is then not half-opened).
   */
  const serveRoot = (res: ServerResponse, root: string) => {
    let specs;
    try {
      specs = buildSpecsPayload(root, specpilotVersion);
    } catch (err) {
      sendJson(res, 422, { error: `This folder could not be read: ${(err as Error).message}` });
      return null;
    }
    const project = projectFor(root); // built before anything is pushed, so the three lists never disagree
    const n = roots.length;
    roots.push(root);
    namedFlags.push(true);
    projects.push(project);
    const error = changeRegistry(entries => upsertEntry(entries, root, new Date()));
    return { project: n, specs: { ...specs, projects: projectList(roots) }, registry: { ...registryBody(), ...(error ? { error } : {}) } };
  };

  const handleProjectAdd = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    readJson(req, res, body => {
      const problem = pathShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      underLock(res, () => {
        const check = checkOpenPath((body as { path: string }).path, roots, home);
        if ('status' in check) return sendJson(res, check.status, check.project === undefined ? { error: check.error } : { error: check.error, project: check.project });
        if (cloningTarget && (check.root === cloningTarget || check.root.startsWith(cloningTarget + sep))) return sendJson(res, 409, { error: `${cloningTarget} is being cloned. Wait for it to finish.` });
        if (roots.length + (cloningTarget ? 1 : 0) >= MAX_PROJECTS) return sendJson(res, 409, { error: TOO_MANY_PROJECTS });
        const body200 = serveRoot(res, check.root);
        if (body200) sendJson(res, 200, body200);
      });
    });
  };

  // ---- a new project (BL-PM-003): what `init` does in <parent>/<name>, then served like an opened folder
  const handleProjectNewGet = (res: ServerResponse) => {
    try {
      sendJson(res, 200, newProjectQuestions());
    } catch (err) {
      sendJson(res, 422, { error: `The OS username could not be read: ${(err as Error).message}` });
    }
  };

  const handleProjectNew = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res, MAX_SETUP_BODY)) return;
    readJson(req, res, body => {
      const problem = newProjectShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const { parent, name, ...answers } = body as Record<string, unknown> as { parent: string; name: string } & Record<string, unknown>;
      underLock(res, async () => {
        if (roots.length + (cloningTarget ? 1 : 0) >= MAX_PROJECTS) return sendJson(res, 409, { error: TOO_MANY_PROJECTS }); // before anything is created
        const out = await createProject(parent, name, answers, roots, home, cloningTarget);
        if (out.status !== 200) return sendJson(res, out.status, out.project === undefined ? { error: out.error } : { error: out.error, project: out.project });
        const body200 = serveRoot(res, out.root);
        if (body200) sendJson(res, 200, { ...body200, kept: out.kept, notice: out.notice });
      });
    }, MAX_SETUP_BODY);
  };

  // ---- clone a repository (BL-PM-002): the user's git fills <parent>/<name>, then served like an opened folder.
  // One at a time, outside the write lock: the lock covers the checks and the mkdir, and serving the folder.
  let cloneBusy = false;
  let closing = false; // set by stopClone(): no clone starts once the server is being stopped
  let cloningTarget: string | null = null; // reserved: counted in the cap, refused by the open and new routes
  let cloneAbort: AbortController | null = null;
  let cloneDone: Promise<void> = Promise.resolve();

  const runClone = async (res: ServerResponse, url: string, parent: string, name: string, signal: AbortSignal) => {
    const probe = await probeGit(home); // before anything is created
    if ('error' in probe) return sendJson(res, 422, { error: probe.error });
    let reserved: { target: string; created: boolean } | undefined;
    await underLock(res, () => {
      if (signal.aborted) return;
      if (roots.length >= MAX_PROJECTS) return sendJson(res, 409, { error: TOO_MANY_PROJECTS });
      const r = reserveTarget(parent, name, roots, home);
      if (!('status' in r)) {
        reserved = r;
        cloningTarget = r.target;
      } else if (r.notEmpty) sendJson(res, 409, { error: `${r.notEmpty} already exists and is not empty, so nothing was cloned.` });
      else sendJson(res, r.status, r.project === undefined ? { error: r.error } : { error: r.error, project: r.project });
    });
    if (!reserved) return;
    const { target, created } = reserved;
    const cleanUp = async () => {
      const code = await emptyTarget(target, created);
      return code ? ` ${target} could not be cleaned up (${code}).` : '';
    };
    const out = await cloneRepository(url, target, { batchSsh: probe.batchSsh, timeoutMs: opts.cloneTimeoutMs, signal });
    if (!out.ok) {
      const note = await cleanUp();
      if (!out.aborted) sendJson(res, 422, { error: out.error + note });
      return;
    }
    await underLock(res, async () => {
      if (signal.aborted) return void (await cleanUp()); // cancelled just after git finished: nothing happened
      const body200 = serveRoot(res, target);
      if (body200) sendJson(res, 200, body200);
    });
  };

  const handleProjectClone = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    readJson(req, res, body => {
      const problem = cloneShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      if (closing) return sendJson(res, 503, { error: 'The server is stopping.' });
      if (cloneBusy) return sendJson(res, 409, { error: 'Another clone is running. Wait for it to finish.' });
      cloneBusy = true;
      const { url, parent, name } = body as Record<string, string>;
      const abort = new AbortController();
      cloneAbort = abort;
      // The page went away before the answer (Cancel, a closed tab): the response closes unfinished.
      const gone = () => {
        if (!res.writableEnded) abort.abort();
      };
      res.on('close', gone);
      cloneDone = runClone(res, url, parent, name || repoNameFromUrl(url), abort.signal)
        .catch(() => {
          if (!res.headersSent) sendJson(res, 500, { error: 'The server could not finish this request.' });
        })
        .then(() => {
          res.off('close', gone);
          if (!res.writableEnded) res.destroy(); // aborted: nothing was sent, and close() must not wait for this connection
          cloneBusy = false;
          cloningTarget = null;
          cloneAbort = null;
        });
    });
  };

  const handleProjectRemove = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    readJson(req, res, body => {
      const problem = pathShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      underLock(res, () => {
        const error = changeRegistry(entries => removeEntry(entries, (body as { path: string }).path));
        if (error) return sendJson(res, 422, { error });
        sendJson(res, 200, registryBody());
      });
    });
  };

  // ---- local MCP endpoint (BL-PM-007): the functions above, for an AI IDE on this machine; only with --mcp
  const MCP_STALE: Record<string, string> = {
    [STALE_ERROR]: 'planning/tasks.md changed on disk since you last read it. The move was not made.',
    [NEW_STALE_ERROR]: 'planning/tasks.md changed on disk since you last read it, so the task was not added. Call specpilot_list_tasks for the current sha256, then try again.',
  };
  const mcpTools = MCP_TOOLS.filter(t => token || !t.writes); // --read-only: no write tools
  const mcpProject = (args: Record<string, unknown>): number => {
    const n = args.project ?? 0;
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) >= roots.length) throw new ToolRefusal(`No project ${String(n)} is served. specpilot_list_projects lists them.`);
    return n as number;
  };
  const mcpHash = (args: Record<string, unknown>): string => {
    if (typeof args.sha256 !== 'string' || !args.sha256.trim()) throw new ToolRefusal('sha256 is required: the hash specpilot_list_tasks returned.');
    return args.sha256.trim();
  };
  const asJson = (data: Record<string, unknown>) => ({ text: JSON.stringify(data, null, 2), data });
  /** A task write's outcome as the tool's answer: the page's refusals, with the stale one worded for an agent. */
  const taskWrite = async <T extends { status: number }>(write: () => T): Promise<T & { status: 200 }> => {
    let out: T;
    try {
      out = await locked(write);
    } catch {
      throw new ToolRefusal('planning/tasks.md could not be written. Nothing was changed.');
    }
    if (out.status !== 200) {
      const error = (out as unknown as { error: string }).error;
      throw new ToolRefusal(MCP_STALE[error] ?? error);
    }
    return out as T & { status: 200 };
  };
  const callTool = async (name: string, args: Record<string, unknown>) => {
    if (name === 'specpilot_list_projects') {
      return asJson({
        projects: roots.map((root, n) => {
          const p = buildSpecsPayload(root, specpilotVersion);
          return { project: n, name: p.project.name, root: displayRoot(root), branch: p.project.branch, specs: p.project.specs, files: p.nav.specs.map(f => '.specs/' + f) };
        }),
      });
    }
    const i = mcpProject(args);
    if (name === 'specpilot_read_spec') {
      const file = typeof args.path === 'string' ? resolveAllowedPath(roots[i], args.path) : null;
      if (!file) throw new ToolRefusal(`Not found, or not a file SpecPilot shows: ${String(args.path)}`);
      return { text: readFileSync(file, 'utf-8') };
    }
    if (name === 'specpilot_list_tasks') {
      const tasks = buildSpecsPayload(roots[i], specpilotVersion).tasks;
      if (!tasks) throw new ToolRefusal(`No .specs/planning/tasks.md in ${displayRoot(roots[i])}.`);
      return asJson(tasks);
    }
    if (name === 'specpilot_new_task') {
      const task = { description: args.description, section: args.section };
      const problem = newTaskShapeError(task);
      if (problem) throw new ToolRefusal(problem);
      const hash = mcpHash(args);
      const out = await taskWrite(() => newTask(roots[i], task as NewTask, hash));
      return asJson({ id: out.id, section: out.section, index: out.index, sha256: out.sha256 });
    }
    if (name === 'specpilot_move_task') {
      const move = { id: args.id, toSection: args.toSection, toIndex: args.toIndex };
      const problem = moveShapeError(move);
      if (problem) throw new ToolRefusal(problem);
      const hash = mcpHash(args);
      const out = await taskWrite(() => moveTask(roots[i], move as TaskMove, hash));
      return asJson({ from: out.from, fromIndex: out.fromIndex, sha256: out.sha256 });
    }
    if (name === 'specpilot_validate_specs') {
      const r = await new SpecValidator().validate(roots[i], { fix: false, verbose: false });
      return asJson({ isValid: r.isValid, errors: r.errors, warnings: r.warnings });
    }
    // specpilot_regenerate_commands: listed only when the page could do it too
    return asJson(
      await locked(() => {
        if (specsMissing(roots[i])) throw new ToolRefusal(`No .specs/ folder in ${displayRoot(roots[i])}.`);
        return regenerateReport(new SpecBackfiller().backfillSlashCommands(roots[i], false));
      }),
    );
  };

  /** POST /mcp: the page's write checks in the same order, but Origin may be absent. A bad token is 403 too, never 401,
   * which Claude Code takes for an OAuth challenge (SEC-004.20). */
  const handleMcp = (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, TEXT, 'Method Not Allowed\n');
    }
    if (req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`) {
      return sendJson(res, 403, rpcError(null, -32000, 'This request came from a web page, so it was refused.'));
    }
    const given = Buffer.from(String(req.headers['x-specpilot-token'] ?? ''));
    const expected = Buffer.from(mcpToken!);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return sendJson(res, 403, rpcError(null, -32000, 'This request did not carry a valid X-SpecPilot-Token header, so it was refused. Copy the config line again from the page or the terminal.'));
    }
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return sendJson(res, 415, rpcError(null, -32000, 'Send JSON-RPC as application/json.'));
    if (Number(req.headers['content-length'] ?? 0) > MAX_MOVE_BODY) return sendJson(res, 413, rpcError(null, -32000, 'The request is too large.'));
    readJson(
      req,
      res,
      body =>
        answerMcp(body, mirroredHeaders(req.rawHeaders), mcpTools, specpilotVersion, callTool).then(
          reply => {
            if (reply.status !== 202) return sendJson(res, reply.status, reply.body);
            res.writeHead(202, SECURITY_HEADERS);
            res.end();
          },
          () => {
            if (!res.headersSent) sendJson(res, 500, rpcError(null, -32603, 'The server could not finish this request.'));
          },
        ),
      MAX_MOVE_BODY,
      () => sendJson(res, 400, rpcError(null, -32700, 'Parse error: the body is not valid JSON.')),
    );
  };

  const server = createServer((req, res) => {
    try {
      const { port } = server.address() as AddressInfo;
      if (!isAllowedHost(req.headers.host, port)) return send(res, 403, TEXT, 'Forbidden: unexpected Host header\n');
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (mcpToken && url.pathname === '/mcp') return handleMcp(req, res);
      if (url.pathname === '/api/projects') {
        if (registry && req.method === 'GET') return sendJson(res, 200, registryBody());
        if (registry && req.method === 'POST') return handleProjectAdd(req, res);
        res.setHeader('Allow', registry ? 'GET, POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/new') {
        if (registry && req.method === 'GET') return handleProjectNewGet(res);
        if (registry && req.method === 'POST') return handleProjectNew(req, res);
        res.setHeader('Allow', registry ? 'GET, POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/clone') {
        if (registry && req.method === 'POST') return handleProjectClone(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/remove') {
        if (registry && req.method === 'POST') return handleProjectRemove(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/tasks/move') {
        if (req.method === 'POST' && token) return handleMove(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/tasks/new') {
        if (req.method === 'POST' && token) return handleNewTask(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/commands/regenerate') {
        if (req.method === 'POST' && token) return handleRegenerate(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/preview') {
        if (token && req.method === 'POST') return handlePreview(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/setup') {
        if (token && req.method === 'GET') return handleSetupGet(res, url);
        if (token && req.method === 'POST') return handleSetupPost(req, res, url);
        res.setHeader('Allow', token ? 'GET, POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/') {
        const page = readFileSync(join(UI_DIR, 'index.html'), 'utf-8');
        const mcpMeta = token && mcpToken ? `<meta name="specpilot-mcp" content="${opts.mcpToken ? 'env' : 'page'}">` : '';
        return send(res, 200, UI_ROUTES['/'][1], page.replace(TOKEN_SLOT, token ? `<meta name="specpilot-token" content="${token}">` : '').replace(MCP_SLOT, mcpMeta));
      }
      if (url.pathname === '/assets/chat-core.js') return send(res, 200, 'text/javascript; charset=utf-8', chatCoreScript(readFileSync(CHAT_CORE, 'utf-8')));
      const ui = UI_ROUTES[url.pathname];
      if (ui) return send(res, 200, ui[1], readFileSync(join(UI_DIR, ui[0])));
      if (url.pathname !== '/api/specs' && url.pathname !== '/api/file' && url.pathname !== '/api/events') return send(res, 404, TEXT, 'Not Found\n');
      const i = projectIndex(url, roots.length);
      if (i === null) return send(res, 404, TEXT, 'Not Found\n');
      if (url.pathname === '/api/specs') return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload(i)));
      if (url.pathname === '/api/file') {
        const file = resolveAllowedPath(roots[i], url.searchParams.get('p') ?? '');
        return file ? send(res, 200, TEXT, readFileSync(file)) : send(res, 404, TEXT, 'Not Found\n');
      }
      return openStream(i, req, res);
    } catch {
      if (!res.headersSent) send(res, 500, TEXT, 'Internal Server Error\n');
    }
  });

  const stopClone = () => {
    closing = true;
    cloneAbort?.abort();
    return cloneDone;
  };

  return {
    server,
    mcpToken,
    streams: () => allStreams().length,
    stopClone,
    close: async () => {
      await stopClone();
      await new Promise<void>(resolveClose => {
        projects.forEach((p, i) =>
          [...p.streams].forEach(res => {
            res.end();
            drop(i, res);
          }),
        );
        projects.forEach(p => p.poller.stop());
        server.close(() => resolveClose());
        server.closeIdleConnections?.();
      });
    },
  };
}

/** Listen on 127.0.0.1 only. Rejects with the listen error (e.g. EADDRINUSE). */
export function startSpecServer(roots: string[], port: number, specpilotVersion: string, opts: SpecServerOptions = {}): Promise<SpecServer> {
  const handle = createSpecServer(roots, specpilotVersion, opts);
  return new Promise((resolvePromise, reject) => {
    handle.server.once('error', reject);
    handle.server.listen(port, '127.0.0.1', () => {
      handle.server.off('error', reject);
      resolvePromise(handle);
    });
  });
}
