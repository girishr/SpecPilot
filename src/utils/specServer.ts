import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path';
import { homedir } from 'os';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { loadRepoYaml, readSpecs } from './specReader';
import { archiveCompleted, completedArchiveStatus, FIELDS_STALE_ERROR, FieldsRequest, fieldsShapeError, MOVES, moveShapeError, moveTask, NEW_STALE_ERROR, newTask, NewTask, newTaskShapeError, REVIEW_STALE_ERROR, ReviewRequest, reviewShapeError, reviewTask, setTaskFields, sha256, STALE_ERROR, suggestedIds, TaskMove } from './taskMover';
import { ALLOWED_FILES, listAllowedFiles, resolveAllowedPath } from './specPaths';
import { createPoller } from './specPoller';
import { answersShapeError, checkTarget, createProject, newProjectQuestions, newProjectShapeError, pendingShapeError, reserveTarget, SetupQuestions, setupProject, setupQuestions, specsMissing } from './specSetup';
import { chatQuestions, CliQuestion, DESIGN_GATED, OPTIONAL_FIELD_LIMITS } from '../core/chatFlow';
import { cloneRepository, cloneShapeError, emptyTarget, probeGit, repoNameFromUrl } from './gitClone';
import { pickFolder } from './folderPicker';
import { checkOpenPath, homeDir, MAX_PROJECTS, pathShapeError, readRegistry, RegistryEntry, removeEntry, sortEntries, upsertEntry, writeRegistry } from './projectRegistry';
import { SlashCommandBackfillResult, SpecBackfiller } from './specBackfiller';
import { isSpecPilotCommand, isSpecPilotSkill, SkillRefresh, SlashCommandGenerator } from './slashCommandGenerator';
import { resolveTarget, SLASH_COMMANDS } from '../core/slashCommands';
import { agentTargets } from '../core/agentConfig';
import { SpecValidator } from './specValidator';
import { answerMcp, MCP_TOOLS, mcpClientName, mirroredHeaders, rpcError, ToolRefusal } from './mcpLocal';

// Local server behind `specpilot serve` (BL-051, ARCH-004.33, SEC-004.8). Every request re-reads disk;
// nothing is cached. The server writes nothing itself: task moves go through taskMover.ts (BL-053),
// guided setup and new projects through specSetup.ts (BL-055, BL-PM-003), the project registry through
// projectRegistry.ts (BL-067), a clone through gitClone.ts, which runs the user's git (BL-PM-002), and
// Regenerate All through specBackfiller.ts's command step (BL-PM-006). With --mcp, POST /mcp runs the same
// functions for an AI IDE on this machine (BL-PM-007, mcpLocal.ts).

/** Resolved from this module's own location, never from cwd: dist/utils → <package>/ui. */
const UI_DIR = join(__dirname, '..', '..', 'ui');
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
    // No control character (git's ref rules refuse them), and not a reftable repository's placeholder (BL-132).
    // eslint-disable-next-line no-control-regex
    const ref = /^ref: refs\/heads\/([^\s\x00-\x1f\x7f]+)$/.exec(head);
    if (ref) return ref[1] === '.invalid' ? null : ref[1];
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
    const doc = loadRepoYaml(yamlText) as { name?: unknown } | null;
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
      specs: !specsMissing(root), // false → the page offers guided setup (BL-055)
      // the file SpecPilot writes for Cursor; checked, never served (BL-PM-010, SEC-004.8)
      cursor: resolveAllowedPath(root, CURSOR_RULES, [CURSOR_RULES]) !== null,
    },
    specpilotVersion, // top level since BL-080: the page's footer reads it with or without a project
    files,
    // nextIds: BL-TB-05; archive: BL-TB-06, the Completed section's lines and the rows POST /api/tasks/archive would move now; moves: BL-TB-11, the lane move table
    tasks: tasks ? { ...tasks, intro: tasksIntro(contents['planning/tasks.md']), sha256: tasksHash(root), nextIds: suggestedIds(root, contents['planning/tasks.md']), archive: completedArchiveStatus(contents['planning/tasks.md']), moves: MOVES } : null,
    nav: {
      specs: Object.keys(contents),
      instructions: ALLOWED_FILES.map(path => {
        const real = resolveAllowedPath(root, path);
        return { path, exists: real !== null, bytes: real ? statSync(real).size : 0 };
      }),
      // generated: the page's "From SpecPilot" group, else "Yours" (BL-PM-006)
      commands: navFiles(root, scanned, '.claude/commands', p => p.endsWith('.md')).map(f => ({ ...f, generated: isSpecPilotCommand(root, f.path) })),
      skills: navFiles(root, scanned, '.claude/skills', p => p.endsWith('/SKILL.md')).map(f => ({ ...f, generated: agentTargets('claude-code').includes(f.path) && isSpecPilotSkill(root) })), // by the commands' rule, BL-PM-012
      prompts: navFiles(root, scanned, '.github/prompts', p => p.endsWith('.md')).map(f => ({ ...f, generated: isSpecPilotCommand(root, f.path) })),
    },
  };
}

/** The command folders the Commands view lists; the result names any other folder Regenerate touched. */
const LISTED_COMMAND_FOLDERS = ['.claude/commands/', '.github/prompts/'];

/** What Regenerate All did, as project-relative paths, and the lines the page shows verbatim (BL-PM-006, REQ-002.H.30). */
export function regenerateReport(results: SlashCommandBackfillResult[], skill: SkillRefresh | null = null) {
  const pathOf = (ide: string, name: string) => {
    const target = resolveTarget(ide, SLASH_COMMANDS.find(c => c.name === name)!);
    return `${target.dir}/${target.fileName}`;
  };
  // The skill (BL-PM-012) joins the same lists; the Skills view lists it, so its folder is never "not listed".
  const skillIf = (action: SkillRefresh['action']) => (skill && skill.action === action ? [skill.path] : []);
  const added = [...results.flatMap(r => r.added.map(name => pathOf(r.ide, name))), ...skillIf('added')];
  const updated = [...results.flatMap(r => r.updated.map(name => pathOf(r.ide, name))), ...skillIf('updated')];
  const kept = [...results.flatMap(r => r.kept.map(k => ({ path: k.path, reason: k.reason as string }))), ...(skill?.action === 'kept' ? [{ path: skill.path, reason: skill.reason as string }] : [])];
  const message: string[] = [];
  if (!results.length) message.push('No IDE instruction file found, so no command files were written.');
  else if (!added.length && !updated.length && !kept.length) message.push('Every SpecPilot command file is current.');
  if (updated.length) message.push(`Updated: ${updated.join(', ')}.`);
  if (added.length) message.push(`Added: ${added.join(', ')}.`);
  if (kept.length) message.push(`Kept as they were: ${kept.map(k => `${k.path} (${k.reason})`).join(', ')}.`);
  const folders = [...new Set([...updated, ...added, ...kept.map(k => k.path)].filter(p => p !== skill?.path).map(p => p.slice(0, p.lastIndexOf('/') + 1)))];
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

/** `?project=<n>` → index into the served roots: omitted = 0 when a project 0 exists (BL-080); one canonical whole number in range, else null (404). */
function projectIndex(url: URL, count: number): number | null {
  const given = url.searchParams.getAll('project');
  if (given.length === 0) return 0 < count ? 0 : null;
  if (given.length > 1 || !/^(0|[1-9][0-9]*)$/.test(given[0])) return null;
  const n = Number(given[0]);
  return n < count ? n : null;
}

const SECURITY_HEADERS = {
  // No other page may frame the UI (BL-143): its writes are one click each.
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
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

/** Where index.html receives the per-start CSRF token (nothing with --read-only). */
const TOKEN_SLOT = '<!-- specpilot-token -->';
/** Where index.html learns that /mcp is on, and whose token it takes: `page` or `env` (BL-PM-007). */
const MCP_SLOT = '<!-- specpilot-mcp -->';
/** Sent where an earlier program's service worker shows itself: removes it (and this origin's localStorage) (BL-142). */
const CLEAR_STORAGE = { 'Clear-Site-Data': '"storage"' };
/** The reads only the page itself may make (BL-144). */
const READS = new Set(['/api/events', '/api/specs', '/api/file', '/api/projects']);

/** Largest accepted body on /mcp: the setup answers, as the page's setup routes took them (BL-104). */
export const MAX_MCP_BODY = 64 * 1024;

// The CLI's question list as the chat core takes it: the page's own rule, also read here since BL-104.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { flowQuestions } = require('../../ui/route.js') as { flowQuestions: (q: unknown, answers: Record<string, unknown>, first?: unknown[]) => CliQuestion[] };

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
  /** Time limit of a folder dialog in ms (tests shorten it; default `BROWSE_TIMEOUT_MS`). */
  browseTimeoutMs?: number;
  /** `--mcp`: serve POST /mcp (BL-PM-007). */
  mcp?: boolean;
  /** Called once by POST /api/quit after its 202 is sent: the command's own stop path (BL-098). */
  onQuit?: () => void;
  /** `SPECPILOT_MCP_TOKEN`, already checked by the command: /mcp's token instead of a per-start one. */
  mcpToken?: string;
}

export interface SpecServer {
  server: Server;
  /** The token POST /mcp takes, or null without --mcp (BL-PM-007). */
  mcpToken: string | null;
  /** Open event streams right now. */
  streams(): number;
  /** The Setup view's pending path (BL-103), or null: the one place outside a served root the setup tool may write. */
  pending(): string | null;
  /** Kill a running clone and remove what it downloaded (BL-PM-002), and close an open folder dialog (BL-PM-011); resolves when that is done. */
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
  // Streams opened while no project is served (BL-080): server-level events only (mcp, setup, clone,
  // the heartbeat), never a change; no poller; counted against the cap like any other stream.
  const serverStreams = new Set<ServerResponse>();
  const allStreams = () => [...serverStreams, ...projects.flatMap(p => [...p.streams])];
  let heartbeat: NodeJS.Timeout | null = null;
  const drop = (i: number | null, res: ServerResponse) => {
    if (i === null) serverStreams.delete(res);
    else {
      const { streams, poller } = projects[i];
      if (!streams.delete(res)) return;
      if (!streams.size) poller.stop();
    }
    if (allStreams().length || !heartbeat) return;
    clearInterval(heartbeat);
    heartbeat = null;
  };
  const openStream = (i: number | null, req: IncomingMessage, res: ServerResponse) => {
    if (allStreams().length >= MAX_EVENT_STREAMS) return send(res, 503, TEXT, 'Too many open event streams\n');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', ...SECURITY_HEADERS });
    res.write('retry: 2000\n\n');
    req.on('close', () => drop(i, res));
    if (i === null) serverStreams.add(res);
    else {
      const { streams, poller } = projects[i];
      streams.add(res);
      if (streams.size === 1) poller.start();
    }
    if (!heartbeat) heartbeat = setInterval(() => allStreams().forEach(s => s.write(': heartbeat\n\n')), opts.heartbeatMs ?? 25000);
  };

  // ---- task moves (BL-053), new tasks (BL-PM-005) and Regenerate All (BL-PM-006): absent with --read-only
  const token = opts.readOnly ? null : randomBytes(32).toString('hex');
  // /mcp's token (BL-PM-007): its own variable, because a null `token` is what turns the page's writes off.
  const mcpToken = !opts.mcp ? null : (opts.mcpToken ?? token ?? randomBytes(32).toString('hex'));
  // Per start, on every asset reference: an entry another program cached for /assets/* is never used (BL-142).
  const assetVersion = randomBytes(8).toString('hex');
  let writeLock: Promise<void> = Promise.resolve(); // writes run strictly one after another, in every project
  // The MCP client whose initialize /mcp last answered (BL-103): null until then; `name` sanitized, '' when none was sent.
  let mcpClient: { name: string } | null = null;
  // `named`: whether the Setup view is offered there (REQ-002.H.15's current-directory rule, BL-103).
  const payload = (i: number) => {
    const p = buildSpecsPayload(roots[i], specpilotVersion);
    return { ...p, project: { ...p.project, named: namedFlags[i] }, projects: projectList(roots), mcp: { client: mcpClient } };
  };
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
      const { description, section, type, priority } = body as NewTask;
      underLock(res, () => {
        let out;
        try {
          out = newTask(roots[i], { description, section, type, priority }, ifMatch);
        } catch {
          return sendJson(res, 500, { error: 'planning/tasks.md could not be written. Nothing was changed.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, id: out.id, section: out.section, index: out.index, specs: payload(i) });
        if (out.status === 409) return sendJson(res, 409, { error: out.error, specs: payload(i) });
        return sendJson(res, 422, { error: out.error });
      });
    });
  };

  /** Review (BL-113): approve or send back one Review row, or undo either; the move route's checks, under the same lock. */
  const handleReview = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = reviewShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'This action needs an If-Match header with the file hash the page last loaded.' });
      const { id, action, note, date, toIndex } = body as ReviewRequest;
      underLock(res, () => {
        let out;
        try {
          out = reviewTask(roots[i], { id, action, note, date, toIndex }, ifMatch);
        } catch {
          return sendJson(res, 500, { error: 'planning/tasks.md could not be written. Nothing was changed.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, action, date: out.date, note: out.note, fromIndex: out.fromIndex, index: out.index, specs: payload(i) });
        if (out.status === 409) return sendJson(res, 409, { error: out.error, specs: payload(i) });
        return sendJson(res, 422, { error: out.error });
      });
    });
  };

  /** Type and Priority (BL-125): one row's two cells set or cleared; the move route's checks, under the same lock. */
  const handleFields = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      const problem = fieldsShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'This change needs an If-Match header with the file hash the page last loaded.' });
      const { id, type, priority } = body as FieldsRequest;
      underLock(res, () => {
        let out;
        try {
          out = setTaskFields(roots[i], { id, type, priority }, ifMatch);
        } catch {
          return sendJson(res, 500, { error: 'planning/tasks.md could not be written. Nothing was changed.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, specs: payload(i) });
        if (out.status === 409) return sendJson(res, 409, { error: out.error, specs: payload(i) });
        return sendJson(res, 422, { error: out.error });
      });
    });
  };

  /** Archive Completed (BL-TB-06): the Completed step of `specpilot archive`, the move route's checks, under the same lock. */
  const handleArchive = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (!writeAllowed(req, res)) return;
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    readJson(req, res, body => {
      // {} or {force: <boolean>} and nothing else (D8: force archives a section within its limit)
      const keys = body !== null && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : null;
      const force = (body as { force?: unknown } | null)?.force;
      if (keys === null || (keys.length === 1 && (keys[0] !== 'force' || typeof force !== 'boolean')) || keys.length > 1) {
        return sendJson(res, 422, { error: 'Archive takes an empty JSON object, {}, or {force: true}.' });
      }
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'The archive needs an If-Match header with the file hash the page last loaded.' });
      underLock(res, () => {
        let out;
        try {
          out = archiveCompleted(roots[i], ifMatch, force === true);
        } catch {
          return sendJson(res, 500, { error: 'The archive could not be written. Check planning/tasks.md and planning/tasks-archive.md.' });
        }
        if (out.status === 200) return sendJson(res, 200, { sha256: out.sha256, linesMoved: out.linesMoved, specs: payload(i) });
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
        // The skill is its own step (BL-PM-012): the MCP tool calls only the command step.
        const report = regenerateReport(new SpecBackfiller().backfillSlashCommands(roots[i], false), new SlashCommandGenerator().refreshSkill(roots[i], '.specs', false));
        sendJson(res, 200, { ...report, specs: payload(i) });
      });
    });
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
  const addRoot = (root: string) => {
    let specs;
    try {
      specs = buildSpecsPayload(root, specpilotVersion);
    } catch (err) {
      return { error: `This folder could not be read: ${(err as Error).message}` };
    }
    const project = projectFor(root); // built before anything is pushed, so the three lists never disagree
    const n = roots.length;
    roots.push(root);
    namedFlags.push(true);
    projects.push(project);
    const error = changeRegistry(entries => upsertEntry(entries, root, new Date()));
    return { project: n, specs: { ...specs, project: { ...specs.project, named: true }, projects: projectList(roots), mcp: { client: mcpClient } }, registry: { ...registryBody(), ...(error ? { error } : {}) } };
  };
  /** `addRoot()` for a route: answers 422 itself when the folder cannot be read (it is then not half-opened). */
  const serveRoot = (res: ServerResponse, root: string) => {
    const out = addRoot(root);
    if ('error' in out) {
      sendJson(res, 422, { error: out.error });
      return null;
    }
    return out;
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

  // ---- the Setup view's pending path (BL-103, SEC-004.26): where a new project may be made, checked, nothing
  // created; one slot for the run, replaced by the next registration, never written anywhere.
  let pendingTarget: string | null = null;
  const handlePending = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    readJson(req, res, body => {
      const problem = pendingShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const { parent, name } = body as { parent: string; name: string };
      underLock(res, () => {
        if (roots.length + (cloningTarget ? 1 : 0) >= MAX_PROJECTS) return sendJson(res, 409, { error: TOO_MANY_PROJECTS });
        const out = checkTarget(parent, name, roots, home, cloningTarget);
        if ('status' in out) pendingTarget = null; // a refusal leaves no path writable that the page no longer shows (BL-104)
        if ('status' in out) return sendJson(res, out.status, out.project === undefined ? { error: out.error } : { error: out.error, project: out.project });
        pendingTarget = out.target;
        sendJson(res, 200, { target: out.target });
      });
    });
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
    // Progress goes to every open stream, as a stage key and a number only (BL-PM-009, SEC-004.9): a clone belongs to no project.
    const onProgress = (stage: string, percent: number) => allStreams().forEach(s => s.write(`event: clone\ndata: ${JSON.stringify({ stage, percent })}\n\n`));
    const out = await cloneRepository(url, target, { batchSsh: probe.batchSsh, timeoutMs: opts.cloneTimeoutMs, signal, onProgress });
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

  // ---- browse for a folder (BL-PM-011): the system's dialog, its answer returned as text for the Folder path field.
  // Nothing comes from the request, nothing is read or written, so no lock; one dialog at a time.
  let browseAbort: AbortController | null = null;
  let browseDone: Promise<void> = Promise.resolve();

  const handleBrowse = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    readJson(req, res, body => {
      if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return sendJson(res, 422, { error: 'Send an empty JSON object.' });
      if (closing) return sendJson(res, 503, { error: 'The server is stopping.' });
      if (browseAbort) return sendJson(res, 409, { error: 'A folder dialog is already open.' });
      const abort = new AbortController();
      browseAbort = abort;
      const gone = () => {
        if (!res.writableEnded) abort.abort(); // the sheet was closed or the page went away: close the dialog
      };
      res.on('close', gone);
      browseDone = pickFolder(home, { timeoutMs: opts.browseTimeoutMs, signal: abort.signal })
        .then(out => {
          if (!abort.signal.aborted) sendJson(res, 'error' in out ? 422 : 200, out);
        })
        .catch(() => {
          if (!res.headersSent) sendJson(res, 500, { error: 'The server could not finish this request.' });
        })
        .then(() => {
          res.off('close', gone);
          if (!res.writableEnded) res.destroy();
          browseAbort = null;
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
    [REVIEW_STALE_ERROR]: REVIEW_STALE_ERROR,
    [FIELDS_STALE_ERROR]: 'planning/tasks.md changed on disk since you last read it, so Type and Priority were not changed. Call specpilot_list_tasks for the current sha256, then try again.',
  };
  const mcpTools = MCP_TOOLS.filter(t => token || (!t.writes && !t.setup)); // --read-only: no write tools, no setup tools (D3)
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
  // ---- setup over MCP (BL-104, REQ-002.H.42, SEC-004.27): D2's path rule, the questions, the writer, Progress events
  type SetupTarget = { kind: 'existing'; root: string; index: number } | { kind: 'new'; target: string };
  const BACKFILL = (p: string) => `${p} already has .specs/. To add missing SpecPilot sections there, run specpilot backfill.`;
  /** D2: a served root named or opened from the page without .specs/, or exactly the pending target. Run on every call and again under the lock. */
  const setupTarget = (path: unknown): SetupTarget => {
    if (typeof path !== 'string' || !path.trim() || path.includes('\0')) throw new ToolRefusal('path is required: the folder as the SpecPilot page shows it.');
    const expanded = path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path;
    const abs = resolve(expanded);
    let norm = abs;
    try {
      norm = existsSync(abs) ? realpathSync(abs) : join(realpathSync(dirname(abs)), basename(abs));
    } catch {
      /* a parent that is gone: compared as given */
    }
    // A served root as given or by its real path (the command line's roots are real paths already).
    const real = (r: string) => {
      try {
        return realpathSync(r);
      } catch {
        return r;
      }
    };
    const index = roots.findIndex(r => r === norm || real(r) === norm);
    if (index >= 0 && namedFlags[index]) {
      if (!specsMissing(roots[index])) throw new ToolRefusal(BACKFILL(norm));
      return { kind: 'existing', root: roots[index], index };
    }
    if (pendingTarget !== null && norm === pendingTarget && isAbsolute(norm)) {
      if (existsSync(norm) && !specsMissing(norm)) throw new ToolRefusal(BACKFILL(norm));
      return { kind: 'new', target: norm };
    }
    throw new ToolRefusal(`${norm} is not a folder this SpecPilot page is setting up. Open it in the page (Open a Project Folder, Clone, or Start a New Project) first.`);
  };
  /** `event: setup` to every open stream: state and counts only, never a path (SEC-004.9). */
  const emitSetup = (t: SetupTarget, data: Record<string, unknown>) => {
    const line = JSON.stringify({ ...(t.kind === 'existing' ? { project: t.index } : { pending: true }), ...data });
    allStreams().forEach(st => st.write(`event: setup\ndata: ${line}\n\n`));
  };
  /** The questions for a target: the CLI's, then the 28 optional fields with the chat core's wording, labels and options. */
  const setupQuestionList = async (t: SetupTarget) => {
    let q: SetupQuestions | ReturnType<typeof newProjectQuestions>;
    try {
      q = t.kind === 'existing' ? await setupQuestions(t.root) : newProjectQuestions();
    } catch (err) {
      throw new ToolRefusal(t.kind === 'existing' ? `This folder could not be read: ${(err as Error).message}` : `The OS username could not be read: ${(err as Error).message}`);
    }
    const mode = t.kind === 'existing' ? 'setup' : 'new';
    // Answers that open every optional field's question: databases and realtime follow a REST or GraphQL API, sync
    // follows an offline store, constraint detail follows a technical constraint, the design assets follow a Yes. The agent answers what applies.
    const open = { apiParadigm: 'rest', localDatabases: ['SQLite'], technicalConstraints: ['Budget cap'], hasDesignAssets: 'Yes' };
    const core = chatQuestions(q.questions as unknown as CliQuestion[], flowQuestions(q, {}, []), open, mode, q.files.outside);
    const cli = (q.questions as unknown as CliQuestion[]).map(x => ({
      key: x.key, label: x.label ?? x.key, question: x.message, required: !!x.required,
      ...(x.choices ? { choices: x.choices.map(c => ({ value: c.value, text: c.name })) } : {}),
      ...(x.key === 'framework' && !x.choices && q.frameworks ? { choicesByLanguage: q.frameworks } : {}),
      ...(x.when ? { when: x.when } : {}),
    }));
    const fields = core.filter(c => c.core && c.key in OPTIONAL_FIELD_LIMITS).map(c => ({
      key: c.key, label: c.label, question: c.chat, kind: OPTIONAL_FIELD_LIMITS[c.key].kind, max: OPTIONAL_FIELD_LIMITS[c.key].max,
      ...(c.options?.length ? { options: c.options.filter(o => !o.todo).map(o => o.label) } : {}),
      ...(c.categories ? { categories: c.categories.map(k => ({ id: k.id, label: k.label, options: k.options })) } : {}),
      ...(DESIGN_GATED.includes(c.key) ? { when: { hasDesignAssets: 'Yes' } } : {}),
    }));
    const detected = 'detected' in q && q.detected ? q.detected.rows.map(r => ({ label: r.label, value: r.value })) : [];
    const name = t.kind === 'new' ? basename(t.target) : ('detected' in q && q.detected ? q.detected.name : basename(t.root));
    return { questions: [...cli, ...fields], detected, name };
  };
  const setupProjectTool = async (args: Record<string, unknown>) => {
    const first = setupTarget(args.path);
    const answers = args.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new ToolRefusal('answers must be an object: one value per question key from specpilot_setup_questions.');
    if (args.asked !== undefined && (!Array.isArray(args.asked) || args.asked.some(k => typeof k !== 'string'))) throw new ToolRefusal('asked must be a list of answer keys.');
    const a = answers as Record<string, unknown>;
    if (first.kind === 'new' && ('parent' in a || 'name' in a)) throw new ToolRefusal('"parent" and "name" come from the path; leave them out of answers.');
    const problem = first.kind === 'existing' ? answersShapeError(a) : newProjectShapeError({ parent: dirname(first.target), name: basename(first.target), ...a });
    if (problem) throw new ToolRefusal(problem);
    const labels = new Map((await setupQuestionList(first)).questions.map(x => [x.key, x.label]));
    const asked = [...new Set((args.asked as string[] | undefined) ?? [])].filter(k => k in a);
    const counts = { fromCode: Object.keys(a).length - asked.length, fromUser: asked.length, topics: asked.flatMap(k => (labels.has(k) ? [labels.get(k)!] : [])) };

    const written = await locked(async () => {
      const t = setupTarget(args.path); // again under the lock: the folder may have changed since (SEC-004.27)
      if (t.kind !== first.kind) throw new ToolRefusal(`${t.kind === 'new' ? t.target : t.root} changed while it was being set up. Call specpilot_setup_questions again.`);
      emitSetup(t, { row: 'questions', state: 'done', ...counts });
      emitSetup(t, { row: 'write', state: 'running' });
      let out;
      if (t.kind === 'existing') out = await setupProject(t.root, a);
      else if (roots.length + (cloningTarget ? 1 : 0) >= MAX_PROJECTS) out = { status: 409 as const, error: TOO_MANY_PROJECTS };
      else out = await createProject(dirname(t.target), basename(t.target), a, roots, home, cloningTarget);
      if (out.status !== 200) {
        emitSetup(t, { row: 'write', state: 'idle' });
        throw new ToolRefusal(out.error);
      }
      emitSetup(t, { row: 'write', state: 'done', files: out.written.length });
      if (t.kind === 'existing') return { t, root: t.root, project: t.index, out };
      pendingTarget = null;
      const served = addRoot(t.target);
      if ('error' in served) throw new ToolRefusal(`${t.target} was set up, but it could not be read to be served (${served.error}). Open it with Open a Project Folder. Written: ${out.written.join(', ')}`);
      return { t, root: t.target, project: served.project, out };
    });
    emitSetup(written.t, { row: 'validate', state: 'running' });
    const r = await new SpecValidator().validate(written.root, { fix: false, verbose: false });
    emitSetup(written.t, { row: 'validate', state: 'done', errors: r.errors.length, warnings: r.warnings.length, ...(written.t.kind === 'new' ? { project: written.project } : {}) });
    const { out } = written;
    return asJson({ path: written.root, project: written.project, written: out.written, kept: out.kept, notice: out.notice, validate: { errors: r.errors, warnings: r.warnings } });
  };

  const callTool = async (name: string, args: Record<string, unknown>) => {
    if (name === 'specpilot_setup_questions') {
      const t = setupTarget(args.path);
      emitSetup(t, { row: 'read', state: 'running' });
      const list = await setupQuestionList(t);
      emitSetup(t, { row: 'read', state: 'done', detected: list.detected.length });
      emitSetup(t, { row: 'questions', state: 'running' });
      return asJson({ mode: t.kind, path: t.kind === 'existing' ? t.root : t.target, name: list.name, detected: list.detected, questions: list.questions });
    }
    if (name === 'specpilot_setup_project') return setupProjectTool(args);
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
      const task = { description: args.description, section: args.section, type: args.type, priority: args.priority };
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
    if (name === 'specpilot_set_task') {
      const req = { id: args.id, type: args.type, priority: args.priority };
      const problem = fieldsShapeError(req);
      if (problem) throw new ToolRefusal(problem);
      const hash = mcpHash(args);
      const out = await taskWrite(() => setTaskFields(roots[i], req as FieldsRequest, hash));
      return asJson({ sha256: out.sha256 });
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

  /** An answered client (BL-103): kept for /api/specs, and sent as `event: mcp` to every open stream when it changes. */
  const seeClient = (name: string) => {
    if (mcpClient?.name === name) return;
    mcpClient = { name };
    allStreams().forEach(st => st.write(`event: mcp\ndata: ${JSON.stringify({ client: mcpClient })}\n\n`));
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
    if (Number(req.headers['content-length'] ?? 0) > MAX_MCP_BODY) return sendJson(res, 413, rpcError(null, -32000, 'The request is too large.'));
    readJson(
      req,
      res,
      body =>
        answerMcp(body, mirroredHeaders(req.rawHeaders), mcpTools, specpilotVersion, callTool).then(
          reply => {
            const name = mcpClientName(body);
            if (name !== undefined && reply.status === 200 && 'result' in (reply.body as object)) seeClient(name);
            if (reply.status !== 202) return sendJson(res, reply.status, reply.body);
            res.writeHead(202, SECURITY_HEADERS);
            res.end();
          },
          () => {
            if (!res.headersSent) sendJson(res, 500, rpcError(null, -32603, 'The server could not finish this request.'));
          },
        ),
      MAX_MCP_BODY,
      () => sendJson(res, 400, rpcError(null, -32700, 'Parse error: the body is not valid JSON.')),
    );
  };

  /** POST /api/quit (BL-098): 202, then the command's stop once the answer has gone out. */
  let quitting = false;
  const handleQuit = (req: IncomingMessage, res: ServerResponse) => {
    if (!writeAllowed(req, res)) return;
    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ stopping: true }), () => {
      if (quitting) return;
      quitting = true;
      opts.onQuit?.();
    });
  };

  const server = createServer((req, res) => {
    try {
      const { port } = server.address() as AddressInfo;
      if (!isAllowedHost(req.headers.host, port)) return send(res, 403, TEXT, 'Forbidden: unexpected Host header\n');
      // A worker's install or update fetch: SpecPilot registers none, so this one is an earlier program's (BL-142).
      if (req.headers['service-worker'] === 'script') {
        res.writeHead(404, { 'Content-Type': TEXT, ...SECURITY_HEADERS, ...CLEAR_STORAGE });
        return res.end('Not Found\n');
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      // From this origin, an address typed in, or a client that sends no fetch metadata (BL-143, BL-144).
      const site = req.headers['sec-fetch-site'];
      const ours = site === undefined || site === 'none' || site === 'same-origin';
      // Another page may neither hold an event slot nor read the data (BL-144); the page itself sends no foreign Origin.
      const foreignOrigin = req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`;
      if (req.method === 'GET' && READS.has(url.pathname) && (!ours || foreignOrigin)) {
        return sendJson(res, 403, { error: 'This request did not come from the SpecPilot page, so it was refused.' });
      }
      if (mcpToken && url.pathname === '/mcp') return handleMcp(req, res);
      if (url.pathname === '/api/projects') {
        if (registry && req.method === 'GET') return sendJson(res, 200, registryBody());
        if (registry && req.method === 'POST') return handleProjectAdd(req, res);
        res.setHeader('Allow', registry ? 'GET, POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/pending') {
        if (registry && req.method === 'POST') return handlePending(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/clone') {
        if (registry && req.method === 'POST') return handleProjectClone(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/browse') {
        if (registry && req.method === 'POST') return handleBrowse(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/projects/remove') {
        if (registry && req.method === 'POST') return handleProjectRemove(req, res);
        res.setHeader('Allow', registry ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/quit') {
        if (token && req.method === 'POST') return handleQuit(req, res);
        res.setHeader('Allow', token ? 'POST' : '');
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
      if (url.pathname === '/api/tasks/review') {
        if (req.method === 'POST' && token) return handleReview(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/tasks/fields') {
        if (req.method === 'POST' && token) return handleFields(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/tasks/archive') {
        if (req.method === 'POST' && token) return handleArchive(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/api/commands/regenerate') {
        if (req.method === 'POST' && token) return handleRegenerate(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/') {
        // The token only into a top-level load: not a worker's pass-through (`empty`), a frame or a navigation preload (BL-142).
        const dest = req.headers['sec-fetch-dest'];
        const topLevel = (dest === undefined || dest === 'document') && req.headers['service-worker-navigation-preload'] === undefined;
        const pageToken = topLevel ? token : null;
        const page = readFileSync(join(UI_DIR, 'index.html'), 'utf-8').replace(/"\/assets\/([\w.]+)"/g, (_, file: string) =>
          file === 'favicon.svg'
            ? `"/assets/${file}?v=${assetVersion}"`
            : `"/assets/${file}?v=${assetVersion}" integrity="sha384-${createHash('sha384').update(readFileSync(join(UI_DIR, file))).digest('base64')}"`,
        );
        const mcpMeta = pageToken && mcpToken ? `<meta name="specpilot-mcp" content="${opts.mcpToken ? 'env' : 'page'}">` : '';
        // Only this origin's own requests clear storage: a frame from another port or site must not wipe it (BL-143).
        res.writeHead(200, { 'Content-Type': UI_ROUTES['/'][1], ...SECURITY_HEADERS, ...(topLevel || !ours ? {} : CLEAR_STORAGE) });
        return res.end(page.replace(TOKEN_SLOT, pageToken ? `<meta name="specpilot-token" content="${pageToken}">` : '').replace(MCP_SLOT, mcpMeta));
      }
      const ui = UI_ROUTES[url.pathname];
      if (ui) return send(res, 200, ui[1], readFileSync(join(UI_DIR, ui[0])));
      if (url.pathname !== '/api/specs' && url.pathname !== '/api/file' && url.pathname !== '/api/events') return send(res, 404, TEXT, 'Not Found\n');
      // No project served yet (BL-080): the page learns the state from /api/specs and listens for the
      // server-level events; the one place the omitted-project rule bends (REQ-002.H.44).
      if (!roots.length && !url.searchParams.has('project')) {
        if (url.pathname === '/api/specs') return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ project: null, projects: [], files: {}, specpilotVersion, mcp: { client: mcpClient } }));
        if (url.pathname === '/api/events') return openStream(null, req, res);
      }
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
    browseAbort?.abort();
    return Promise.all([cloneDone, browseDone]).then(() => undefined);
  };

  return {
    server,
    mcpToken,
    streams: () => allStreams().length,
    pending: () => pendingTarget,
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
