import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import * as yaml from 'js-yaml';
import { readSpecs } from './specReader';
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
    tasks: tasks ? { ...tasks, intro: tasksIntro(contents['planning/tasks.md']) } : null,
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
}

export interface SpecServer {
  server: Server;
  /** Open event streams right now. */
  streams(): number;
  /** End every event stream, clear every timer, then close the listener. */
  close(): Promise<void>;
}

export function createSpecServer(root: string, specpilotVersion: string, opts: SpecServerOptions = {}): SpecServer {
  // ---- live reload (BL-052): streams, heartbeat, and a poller that runs only while a stream is open
  const streams = new Set<ServerResponse>();
  let heartbeat: NodeJS.Timeout | null = null;
  const broadcast = (chunk: string) => streams.forEach(res => res.write(chunk));
  const poller = createPoller(root, {
    intervalMs: opts.pollMs ?? 1000,
    settleMs: opts.settleMs,
    log: opts.log,
    onChange: paths => broadcast(`event: change\ndata: ${JSON.stringify({ paths })}\n\n`),
  });
  const drop = (res: ServerResponse) => {
    if (!streams.delete(res) || streams.size) return;
    poller.stop();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };
  const openStream = (req: IncomingMessage, res: ServerResponse) => {
    if (streams.size >= MAX_EVENT_STREAMS) return send(res, 503, TEXT, 'Too many open event streams\n');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', ...SECURITY_HEADERS });
    res.write('retry: 2000\n\n');
    streams.add(res);
    req.on('close', () => drop(res));
    if (streams.size === 1) {
      poller.start();
      heartbeat = setInterval(() => broadcast(': heartbeat\n\n'), opts.heartbeatMs ?? 25000);
    }
  };

  const server = createServer((req, res) => {
    try {
      const { port } = server.address() as AddressInfo;
      if (!isAllowedHost(req.headers.host, port)) return send(res, 403, TEXT, 'Forbidden: unexpected Host header\n');
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return send(res, 405, TEXT, 'Method Not Allowed\n');
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const ui = UI_ROUTES[url.pathname];
      if (ui) return send(res, 200, ui[1], readFileSync(join(UI_DIR, ui[0])));
      if (url.pathname === '/api/specs') {
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(buildSpecsPayload(root, specpilotVersion)));
      }
      if (url.pathname === '/api/file') {
        const file = resolveAllowedPath(root, url.searchParams.get('p') ?? '');
        return file ? send(res, 200, TEXT, readFileSync(file)) : send(res, 404, TEXT, 'Not Found\n');
      }
      if (url.pathname === '/api/events') return openStream(req, res);
      send(res, 404, TEXT, 'Not Found\n');
    } catch {
      if (!res.headersSent) send(res, 500, TEXT, 'Internal Server Error\n');
    }
  });

  return {
    server,
    streams: () => streams.size,
    close: () =>
      new Promise<void>(resolveClose => {
        [...streams].forEach(res => {
          res.end();
          drop(res);
        });
        poller.stop();
        server.close(() => resolveClose());
        server.closeIdleConnections?.();
      }),
  };
}

/** Listen on 127.0.0.1 only. Rejects with the listen error (e.g. EADDRINUSE). */
export function startSpecServer(root: string, port: number, specpilotVersion: string, opts: SpecServerOptions = {}): Promise<SpecServer> {
  const handle = createSpecServer(root, specpilotVersion, opts);
  return new Promise((resolvePromise, reject) => {
    handle.server.once('error', reject);
    handle.server.listen(port, '127.0.0.1', () => {
      handle.server.off('error', reject);
      resolvePromise(handle);
    });
  });
}
