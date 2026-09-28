import { createServer, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { isAbsolute, join, posix, relative, resolve, sep } from 'path';
import * as yaml from 'js-yaml';
import { readSpecs } from './specReader';

// Read-only local server behind `specpilot serve` (BL-051, ARCH-004.33, SEC-004.8).
// Every request re-reads disk; nothing is cached and nothing is written.

/** Resolved from this module's own location, never from cwd: dist/utils → <package>/ui. */
const UI_DIR = join(__dirname, '..', '..', 'ui');

const UI_ROUTES: Record<string, [file: string, type: string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/assets/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/assets/md.js': ['md.js', 'text/javascript; charset=utf-8'],
  '/assets/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/assets/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

const ALLOWED_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];
const ALLOWED_DIRS = ['.specs/', '.claude/commands/', '.claude/skills/', '.github/prompts/'];

function isAllowlisted(rel: string): boolean {
  return ALLOWED_FILES.includes(rel) || ALLOWED_DIRS.some(d => rel.startsWith(d) && rel.length > d.length);
}

/**
 * Map a requested project-relative path to a real file the server may read, or null.
 * Rejects NUL, backslashes, absolute paths and `..` segments; after resolving symlinks the
 * file must still be inside the project root and still inside the allowlist.
 */
export function resolveAllowedPath(root: string, requested: string): string | null {
  if (!requested || requested.includes('\0') || requested.includes('\\')) return null;
  if (isAbsolute(requested) || posix.isAbsolute(requested)) return null;
  if (requested.split('/').includes('..')) return null;
  const rel = posix.normalize(requested);
  if (!isAllowlisted(rel)) return null;
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(join(root, rel));
    const back = relative(realRoot, real);
    if (!back || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) return null;
    if (!isAllowlisted(back.split(sep).join('/'))) return null;
    return statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

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

/** Regular, non-hidden files under `dir`, as `/`-joined paths relative to it, sorted. */
function listFiles(dir: string, base = dir): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => !e.name.startsWith('.'))
    .flatMap(e => (e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join('/')]))
    .sort();
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

/** The files a request may read under one allowlisted folder, with their front matter. */
function listAllowed(root: string, dir: string, keep: (p: string) => boolean): NavFile[] {
  return listFiles(join(root, dir))
    .map(p => `${dir}/${p}`)
    .filter(keep)
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
  const contents: Record<string, string> = {};
  for (const p of listFiles(join(root, '.specs'))) {
    const real = resolveAllowedPath(root, `.specs/${p}`);
    if (real) contents[p] = readFileSync(real, 'utf-8');
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
      commands: listAllowed(root, '.claude/commands', p => p.endsWith('.md')),
      skills: listAllowed(root, '.claude/skills', p => p.endsWith('/SKILL.md')),
      prompts: listAllowed(root, '.github/prompts', p => p.endsWith('.md')),
    },
  };
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const TEXT = 'text/plain; charset=utf-8';

export function createSpecServer(root: string, specpilotVersion: string): Server {
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
      send(res, 404, TEXT, 'Not Found\n');
    } catch {
      send(res, 500, TEXT, 'Internal Server Error\n');
    }
  });
  return server;
}

/** Listen on 127.0.0.1 only. Rejects with the listen error (e.g. EADDRINUSE). */
export function startSpecServer(root: string, port: number, specpilotVersion: string): Promise<Server> {
  const server = createSpecServer(root, specpilotVersion);
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise(server);
    });
  });
}
