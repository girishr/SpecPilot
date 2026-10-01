import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { readFileSync, statSync } from 'fs';
import { join, resolve, sep } from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';
import { randomBytes, timingSafeEqual } from 'crypto';
import { readSpecs } from './specReader';
import { moveShapeError, moveTask, sha256, TaskMove } from './taskMover';
import { ALLOWED_FILES, listAllowedFiles, resolveAllowedPath } from './specPaths';
import { createPoller } from './specPoller';

// Read-only local server behind `specpilot serve` (BL-051, ARCH-004.33, SEC-004.8).
// Every request re-reads disk; nothing is cached and nothing is written.

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
    },
    files,
    tasks: tasks ? { ...tasks, intro: tasksIntro(contents['planning/tasks.md']), sha256: tasksHash(root) } : null,
    nav: {
      specs: Object.keys(contents),
      instructions: ALLOWED_FILES.map(path => {
        const real = resolveAllowedPath(root, path);
        return { path, exists: real !== null, bytes: real ? statSync(real).size : 0 };
      }),
      commands: navFiles(root, scanned, '.claude/commands', p => p.endsWith('.md')),
      skills: navFiles(root, scanned, '.claude/skills', p => p.endsWith('/SKILL.md')),
      prompts: navFiles(root, scanned, '.github/prompts', p => p.endsWith('.md')),
    },
  };
}

/** `~` or `~/…` for the home directory and anything under it, else the path as given (BL-054). */
export function displayRoot(root: string, home = homedir()): string {
  if (root === home) return '~';
  return root.startsWith(home + sep) ? '~' + root.slice(home.length) : root;
}

/** One entry per served project, in command-line order: what the rail shows (BL-054). */
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

/** Largest accepted move request body (BL-053). */
export const MAX_MOVE_BODY = 16 * 1024;

/** Where index.html receives the per-start CSRF token (nothing with --read-only). */
const TOKEN_SLOT = '<!-- specpilot-token -->';

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
  /** `--read-only`: no write route, no token in the page (BL-053). */
  readOnly?: boolean;
}

export interface SpecServer {
  server: Server;
  /** Open event streams right now. */
  streams(): number;
  /** End every event stream, clear every timer, then close the listener. */
  close(): Promise<void>;
}

export function createSpecServer(roots: string[], specpilotVersion: string, opts: SpecServerOptions = {}): SpecServer {
  // ---- live reload (BL-052): streams, heartbeat, and one poller per project (BL-054) that runs
  // only while that project has a stream open; the heartbeat runs while any stream is open
  const projects = roots.map(root => {
    const streams = new Set<ServerResponse>();
    const poller = createPoller(root, {
      intervalMs: opts.pollMs ?? 1000,
      settleMs: opts.settleMs,
      log: opts.log,
      onChange: paths => streams.forEach(res => res.write(`event: change\ndata: ${JSON.stringify({ paths })}\n\n`)),
    });
    return { streams, poller };
  });
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

  // ---- task moves (BL-053): the only write route, absent with --read-only
  const token = opts.readOnly ? null : randomBytes(32).toString('hex');
  let writeLock: Promise<void> = Promise.resolve(); // moves run strictly one after another, in every project
  const payload = (i: number) => ({ ...buildSpecsPayload(roots[i], specpilotVersion), projects: projectList(roots) });

  const handleMove = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    // Host was checked already; the page's own origin is exactly "http://" + that Host.
    if (req.headers.origin !== `http://${req.headers.host}`) {
      return sendJson(res, 403, { error: 'This request did not come from the SpecPilot page, so it was refused.' });
    }
    const given = Buffer.from(String(req.headers['x-specpilot-token'] ?? ''));
    const expected = Buffer.from(token!);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return sendJson(res, 403, { error: 'This request did not carry the page token, so it was refused. Reload the page and try again.' });
    }
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      return sendJson(res, 415, { error: 'Moves must be sent as JSON.' });
    }
    if (Number(req.headers['content-length'] ?? 0) > MAX_MOVE_BODY) return sendJson(res, 413, { error: 'The request is too large.' });
    // The project is picked only now, so a request that failed the checks above learns nothing about it (SEC-004.11).
    const i = projectIndex(url, roots.length);
    if (i === null) return send(res, 404, TEXT, 'Not Found\n');
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_MOVE_BODY) {
        if (!res.headersSent) sendJson(res, 413, { error: 'The request is too large.' });
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (res.headersSent) return;
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        return sendJson(res, 400, { error: 'The request body is not valid JSON.' });
      }
      const problem = moveShapeError(body);
      if (problem) return sendJson(res, 422, { error: problem });
      const ifMatch = String(req.headers['if-match'] ?? '').replace(/^W\//, '').replace(/"/g, '').trim();
      if (!ifMatch) return sendJson(res, 428, { error: 'The move needs an If-Match header with the file hash the page last loaded.' });
      writeLock = writeLock.then(() => {
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

  const server = createServer((req, res) => {
    try {
      const { port } = server.address() as AddressInfo;
      if (!isAllowedHost(req.headers.host, port)) return send(res, 403, TEXT, 'Forbidden: unexpected Host header\n');
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/tasks/move') {
        if (req.method === 'POST' && token) return handleMove(req, res, url);
        res.setHeader('Allow', token ? 'POST' : '');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      if (url.pathname === '/') {
        const page = readFileSync(join(UI_DIR, 'index.html'), 'utf-8');
        return send(res, 200, UI_ROUTES['/'][1], page.replace(TOKEN_SLOT, token ? `<meta name="specpilot-token" content="${token}">` : ''));
      }
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

  return {
    server,
    streams: () => allStreams().length,
    close: () =>
      new Promise<void>(resolveClose => {
        projects.forEach((p, i) =>
          [...p.streams].forEach(res => {
            res.end();
            drop(i, res);
          }),
        );
        projects.forEach(p => p.poller.stop());
        server.close(() => resolveClose());
        server.closeIdleConnections?.();
      }),
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
