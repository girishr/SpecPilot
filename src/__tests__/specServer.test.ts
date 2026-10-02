import { createHash } from 'crypto';
import { request } from 'http';
import { AddressInfo } from 'net';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';
import * as os from 'os';
import { buildSpecsPayload, displayRoot, isAllowedHost, MAX_EVENT_STREAMS, readBranch, SpecServer, startSpecServer } from '../utils/specServer';
import { resolveAllowedPath } from '../utils/specPaths';
import * as specPoller from '../utils/specPoller';
import { watchedFiles } from '../utils/specPoller';
import { serveCommand } from '../commands/serve';

// The UI's markdown renderer is plain browser JS that also exports itself for Node.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { md } = require('../../ui/md.js') as { md: (src: string) => string };

const REPO = join(__dirname, '..', '..');

function write(root: string, rel: string, content: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

/** A small project: specs, one instruction file, a source file and a secret outside the root. */
function makeProject(): { root: string; outside: string; cleanup: () => void } {
  const base = mkdtempSync(join(os.tmpdir(), 'specpilot-serve-'));
  const root = join(base, 'project');
  const outside = join(base, 'outside');
  write(root, '.specs/project/project.yaml', '# fileID: PROJ-001\nname: "Fixture Project"\n');
  write(root, '.specs/planning/tasks.md', '---\nfileID: TASKS-001\n---\n\n# Tasks\n\n## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | First `a | b` task |\n');
  write(root, 'CLAUDE.md', '# CLAUDE.md\n');
  write(root, 'src/secret.ts', 'export const secret = 1;\n');
  write(root, '.git/HEAD', 'ref: refs/heads/main\n');
  write(outside, 'secret.txt', 'outside the root\n');
  return { root, outside, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

describe('resolveAllowedPath', () => {
  let p: ReturnType<typeof makeProject>;
  beforeEach(() => (p = makeProject()));
  afterEach(() => p.cleanup());

  it('allows files under the allowlist', () => {
    expect(resolveAllowedPath(p.root, '.specs/planning/tasks.md')).toBe(realpathSync(join(p.root, '.specs/planning/tasks.md')));
    expect(resolveAllowedPath(p.root, './.specs/planning/tasks.md')).not.toBeNull();
    expect(resolveAllowedPath(p.root, 'CLAUDE.md')).not.toBeNull();
  });

  it.each([
    ['.specs/../src/secret.ts'],
    ['../outside/secret.txt'],
    ['.specs/planning/../../src/secret.ts'],
    ['/etc/passwd'],
    ['C:\\Windows\\win.ini'],
    ['.specs\\planning\\tasks.md'],
    ['.specs/planning/tasks.md\0'],
    [''],
  ])('rejects traversal, absolute and malformed paths: %j', requested => {
    expect(resolveAllowedPath(p.root, requested)).toBeNull();
  });

  it.each([['src/secret.ts'], ['package.json'], ['.git/HEAD'], ['.specs'], ['.specs/'], ['.specs/planning'], ['.claude/commands/']])(
    'rejects files and folders outside the allowlist: %j',
    requested => {
      expect(resolveAllowedPath(p.root, requested)).toBeNull();
    },
  );

  it('rejects a symlink that escapes the project root', () => {
    symlinkSync(join(p.outside, 'secret.txt'), join(p.root, '.specs', 'leak.md'));
    expect(resolveAllowedPath(p.root, '.specs/leak.md')).toBeNull();
  });

  it('rejects a symlink that stays in the root but leaves the allowlist', () => {
    symlinkSync(join(p.root, 'src', 'secret.ts'), join(p.root, '.specs', 'source.md'));
    expect(resolveAllowedPath(p.root, '.specs/source.md')).toBeNull();
  });

  it('allows a symlink that stays inside the allowlist', () => {
    symlinkSync(join(p.root, '.specs', 'planning', 'tasks.md'), join(p.root, '.specs', 'alias.md'));
    expect(resolveAllowedPath(p.root, '.specs/alias.md')).toBe(realpathSync(join(p.root, '.specs/planning/tasks.md')));
  });
});

describe('isAllowedHost', () => {
  it('accepts the loopback names on the server port', () => {
    expect(isAllowedHost('127.0.0.1:4321', 4321)).toBe(true);
    expect(isAllowedHost('localhost:4321', 4321)).toBe(true);
    expect(isAllowedHost('LocalHost:4321', 4321)).toBe(true);
  });

  it.each([['evil.com:4321'], ['127.0.0.1'], ['localhost'], ['127.0.0.1:4322'], ['127.0.0.1:4321.evil.com'], ['0.0.0.0:4321'], [undefined]])(
    'rejects %j (DNS rebinding and other hosts)',
    host => {
      expect(isAllowedHost(host, 4321)).toBe(false);
    },
  );
});

describe('readBranch', () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(join(os.tmpdir(), 'specpilot-branch-'))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads the branch from .git/HEAD', () => {
    write(root, '.git/HEAD', 'ref: refs/heads/feat/serve-p1\n');
    expect(readBranch(root)).toBe('feat/serve-p1');
  });

  it('follows a worktree .git file (relative and absolute gitdir)', () => {
    write(root, 'main/.git/worktrees/wt/HEAD', 'ref: refs/heads/wt-branch\n');
    write(root, 'wt/.git', 'gitdir: ../main/.git/worktrees/wt\n');
    expect(readBranch(join(root, 'wt'))).toBe('wt-branch');
    write(root, 'wt2/.git', `gitdir: ${join(root, 'main/.git/worktrees/wt')}\n`);
    expect(readBranch(join(root, 'wt2'))).toBe('wt-branch');
  });

  it('shows a detached HEAD as its commit id', () => {
    write(root, '.git/HEAD', '2a16900078bc51ed89c9507d99267bfc7e16952c\n');
    expect(readBranch(root)).toBe('2a16900078bc51ed89c9507d99267bfc7e16952c');
  });

  it.each([['garbage\n'], ['ref: refs/tags/v1\n'], ['']])('shows nothing when HEAD cannot be parsed: %j', head => {
    write(root, '.git/HEAD', head);
    expect(readBranch(root)).toBeNull();
  });

  it('shows nothing without .git, or with a .git file that has no gitdir', () => {
    expect(readBranch(root)).toBeNull();
    write(root, '.git', 'not a gitdir line\n');
    expect(readBranch(root)).toBeNull();
  });
});

describe('buildSpecsPayload against this repo', () => {
  const payload = buildSpecsPayload(REPO, '0.0.0-test');
  const tasksMd = readFileSync(join(REPO, '.specs/planning/tasks.md'), 'utf-8').split('\n');

  it('has project metadata, per-file metadata, tasks and the nav tree', () => {
    expect(Object.keys(payload).sort()).toEqual(['files', 'nav', 'project', 'tasks']);
    expect(payload.project.name).toBe('SpecPilot SDD CLI');
    expect(payload.project.root).toBe(REPO);
    expect(payload.project.specpilotVersion).toBe('0.0.0-test');
    expect(Object.keys(payload.files).sort()).toEqual([...payload.nav.specs].sort());
    expect(payload.nav.specs).toEqual(expect.arrayContaining(['planning/tasks.md', 'project/project.yaml', 'architecture/api.yaml']));
    expect(payload.files['planning/tasks.md'].fileID).toBe('TASKS-001');
    expect(payload.nav.instructions.map(f => f.path)).toEqual(['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md']);
    expect(payload.nav.commands.every(f => f.path.startsWith('.claude/commands/'))).toBe(true);
    expect(payload.nav.prompts.every(f => f.path.startsWith('.github/prompts/'))).toBe(true);
    expect(payload.nav.skills.every(f => f.path.startsWith('.claude/skills/') && f.path.endsWith('/SKILL.md'))).toBe(true);
    expect(payload.nav.commands.find(f => f.path === '.claude/commands/specpilot-archive.md')?.frontMatter?.['allowed-tools']).toBe('Bash, Read, Edit');
    expect(JSON.stringify(payload.nav)).not.toContain('.git/');
  });

  it('returns every task row byte for byte as it appears in tasks.md', () => {
    const t = payload.tasks!;
    expect(t.malformed).toEqual([]);
    const rebuilt = [
      ...t.backlog.map(r => `| ${r.id} | ${r.description} |`),
      ...t.currentSprint.map(r => `| ${r.id} | ${r.description} |`),
      ...t.completed.map(r => `| ${r.num} | ${r.id} | ${r.description} |`),
    ];
    for (const line of rebuilt) expect(tasksMd).toContain(line);
    // ...and no table row in those sections was dropped.
    const bodyRows = tasksMd.filter(l => /^\| (BL|CS|\d)/.test(l));
    expect(rebuilt).toHaveLength(bodyRows.length);
  });
});

describe('UI markdown renderer', () => {
  it('escapes raw HTML in spec files everywhere it can appear', () => {
    const html = md(
      [
        '<script>alert(1)</script>',
        '',
        '# <img src=x onerror=alert(1)>',
        '',
        '| <b>head</b> | b |',
        '|---|---|',
        '| <iframe src=x></iframe> | `<i>code</i>` |',
        '',
        '- <svg onload=alert(1)>',
        '- [ ] <a href="javascript:alert(1)">x</a>',
        '',
        '1. <object data=x>',
        '',
        '> <style>body{}</style>',
        '',
        '[<em>link</em>](notes.md)',
        '',
        '```',
        '<script>in code</script>',
        '```',
      ].join('\n'),
    );
    expect(html).not.toMatch(/<(script|img|iframe|svg|a|object|style|b|i)[\s>]/i);
    expect(html).not.toMatch(/<em>link/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;in code&lt;/script&gt;');
  });

  it('styles [ID] references without dropping their brackets', () => {
    expect(md('[CD-girishr-033] [CS-090] and [REQ-002.H.4]')).toBe(
      '<p><span class="ref" translate="no">[CD-girishr-033]</span> <span class="ref" translate="no">[CS-090]</span> and <span class="ref" translate="no">[REQ-002.H.4]</span></p>',
    );
  });

  it('shows each numbered item with the number written in the file, gaps and repeats included', () => {
    expect(md('64. a\n66. b\n66. c')).toBe('<ol start="64"><li value="64">a</li><li value="66">b</li><li value="66">c</li></ol>');
  });

  it('keeps a | inside backticks in the last table cell', () => {
    const html = md('| ID | Description |\n|---|---|\n| BL-1 | uses `a | b` here |');
    expect(html).toContain('<td>BL-1</td><td>uses <code translate="no">a | b</code> here</td>');
  });
});

/** GET/POST against a running server with an explicit Host header. */
function hit(port: number, path: string, opts: { method?: string; host?: string } = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { Host: opts.host ?? `127.0.0.1:${port}` } },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => (body += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('spec server over HTTP (port 0)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;

  beforeAll(async () => {
    p = makeProject();
    spec = await startSpecServer([p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await spec.close();
    p.cleanup();
  });

  it('listens on 127.0.0.1 only', () => {
    expect((spec.server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it.each([
    ['/', 200, 'text/html; charset=utf-8'],
    ['/assets/app.css', 200, 'text/css; charset=utf-8'],
    ['/assets/md.js', 200, 'text/javascript; charset=utf-8'],
    ['/assets/app.js', 200, 'text/javascript; charset=utf-8'],
    ['/api/specs', 200, 'application/json; charset=utf-8'],
    ['/api/file?p=.specs/planning/tasks.md', 200, 'text/plain; charset=utf-8'],
    ['/api/file?p=CLAUDE.md', 200, 'text/plain; charset=utf-8'],
    ['/api/file?p=src/secret.ts', 404, 'text/plain; charset=utf-8'],
    ['/api/file?p=.specs/../src/secret.ts', 404, 'text/plain; charset=utf-8'],
    ['/api/file?p=.git/HEAD', 404, 'text/plain; charset=utf-8'],
    ['/api/file', 404, 'text/plain; charset=utf-8'],
    ['/assets/secret.ts', 404, 'text/plain; charset=utf-8'],
    ['/nope', 404, 'text/plain; charset=utf-8'],
  ])('GET %s → %i with security headers and no CORS', async (path, status, type) => {
    const res = await hit(port, path);
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toBe(type);
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.headers).some(h => h.startsWith('access-control-'))).toBe(false);
  });

  it('serves an allowlisted file as its exact text, re-read on every request', async () => {
    const file = join(p.root, '.specs/planning/tasks.md');
    expect((await hit(port, '/api/file?p=.specs/planning/tasks.md')).body).toBe(readFileSync(file, 'utf-8'));
    writeFileSync(file, 'changed on disk\n');
    expect((await hit(port, '/api/file?p=.specs/planning/tasks.md')).body).toBe('changed on disk\n');
  });

  it('returns the payload from /api/specs', async () => {
    const body = JSON.parse((await hit(port, '/api/specs')).body);
    expect(body.project.name).toBe('Fixture Project');
    expect(body.project.branch).toBe('main');
    expect(body.nav.instructions.find((f: { path: string }) => f.path === 'CLAUDE.md').exists).toBe(true);
  });

  it.each([['POST'], ['PUT'], ['DELETE'], ['PATCH'], ['HEAD'], ['OPTIONS']])('%s → 405 with Allow: GET', async method => {
    const res = await hit(port, '/api/specs', { method });
    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('GET');
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
  });

  it.each([['evil.com'], ['evil.com:PORT'], ['127.0.0.1:1']])('Host %s → 403 before anything else', async host => {
    const res = await hit(port, '/api/file?p=CLAUDE.md', { host: host.replace('PORT', String(port)) });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('CLAUDE.md');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves the SpecPilot logo as the favicon and links it from the page', async () => {
    const icon = await hit(port, '/assets/favicon.svg');
    expect(icon.status).toBe(200);
    expect(icon.headers['content-type']).toBe('image/svg+xml');
    expect(icon.headers['content-security-policy']).toBe("default-src 'self'");
    expect(icon.body).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* fill="none">/);
    expect(icon.body).toContain('url(#paint0_linear_18_9)');
    expect(icon.body).not.toMatch(/<script|\son[a-z]+=/i);
    expect((await hit(port, '/')).body).toContain('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">');
  });

  it('serves a page with no inline script, no inline style and no external resources', async () => {
    const page = (await hit(port, '/')).body;
    expect(page).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(page).not.toMatch(/\sstyle="/);
    expect(page).not.toMatch(/\son[a-z]+="/);
    expect(page).not.toMatch(/(src|href)="https?:/);
  });
});

describe('serveCommand', () => {
  let p: ReturnType<typeof makeProject>;
  let cwd: string;
  let exit: jest.SpyInstance;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    p = makeProject();
    cwd = process.cwd();
    process.chdir(p.root);
    errors = [];
    logs = [];
    exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
  });
  afterEach(() => {
    process.chdir(cwd);
    jest.restoreAllMocks();
    p.cleanup();
  });

  it('fails with a clear message suggesting --port when the port is in use', async () => {
    const busy = await startSpecServer([p.root], 0, 'x');
    const port = (busy.server.address() as AddressInfo).port;
    try {
      await expect(serveCommand([], { port: String(port) })).rejects.toThrow('exit 1');
      expect(errors.join('\n')).toMatch(new RegExp(`Port ${port} is already in use.*--port`));
    } finally {
      await busy.close();
    }
  });

  it.each([['100'], ['249'], ['1.5'], ['abc']])('rejects --poll %s (whole number of ms, 250 or more)', async poll => {
    await expect(serveCommand([], { poll })).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('Invalid --poll');
  });

  it('rejects an invalid --port', async () => {
    await expect(serveCommand([], { port: 'abc' })).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('Invalid --port');
  });

  it('refuses to start without .specs/ in the current directory', async () => {
    process.chdir(os.tmpdir());
    await expect(serveCommand([], {})).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('No .specs/ folder');
  });

  it('prints the URL as http://127.0.0.1:<port> and stops on Ctrl+C', async () => {
    const probe = await startSpecServer([p.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();

    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);

    await serveCommand([], { port: String(port) });
    expect(logs.join('\n')).toContain(`http://127.0.0.1:${port}`);
    expect(logs.join('\n')).not.toContain('localhost');
    process.emit('SIGINT');
    expect(await exitCode).toBe(0);
  });
});

// ─── Live reload (BL-052) ────────────────────────────────────────────────────

/** An open GET /api/events stream that collects what the server sends. */
function openEvents(port: number, host = `127.0.0.1:${port}`, path = '/api/events') {
  return new Promise<{ status: number; headers: Record<string, unknown>; text: () => string; close: () => void; waitFor: (re: RegExp, ms?: number) => Promise<string> }>(
    (resolve, reject) => {
      let text = '';
      const req = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, res => {
        res.setEncoding('utf8');
        res.on('data', c => (text += c));
        const waitFor = async (re: RegExp, ms = 2000) => {
          const until = Date.now() + ms;
          while (Date.now() < until) {
            const m = re.exec(text);
            if (m) return m[0];
            await new Promise(r => setTimeout(r, 10));
          }
          throw new Error(`timed out waiting for ${re} in ${JSON.stringify(text)}`);
        };
        resolve({ status: res.statusCode!, headers: res.headers, text: () => text, close: () => req.destroy(), waitFor });
      });
      req.on('error', err => ((err as NodeJS.ErrnoException).code === 'ECONNRESET' ? undefined : reject(err)));
      req.end();
    },
  );
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Active Node timers right now (Node 17+). */
const timerCount = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;

describe('live reload over /api/events', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;

  beforeEach(async () => {
    p = makeProject();
    spec = await startSpecServer([p.root], 0, '0.0.0-test', { pollMs: 250, heartbeatMs: 60, settleMs: 30 });
    port = (spec.server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('opens an event stream with the security headers and a retry hint', async () => {
    const s = await openEvents(port);
    expect(s.status).toBe(200);
    expect(s.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(s.headers['content-security-policy']).toBe("default-src 'self'");
    expect(s.headers['x-content-type-options']).toBe('nosniff');
    expect(s.headers['cache-control']).toBe('no-store');
    expect(Object.keys(s.headers).some(h => h.startsWith('access-control-'))).toBe(false);
    await s.waitFor(/^retry: 2000\n\n/);
    s.close();
  });

  it('applies the Host check to event streams', async () => {
    const s = await openEvents(port, 'evil.com');
    expect(s.status).toBe(403);
    expect(spec.streams()).toBe(0);
  });

  it(`caps open streams at ${MAX_EVENT_STREAMS} and answers the next with 503`, async () => {
    const open = await Promise.all(Array.from({ length: MAX_EVENT_STREAMS }, () => openEvents(port)));
    expect(open.every(s => s.status === 200)).toBe(true);
    await until(() => spec.streams() === MAX_EVENT_STREAMS);
    const extra = await openEvents(port);
    expect(extra.status).toBe(503);
    expect(extra.headers['content-security-policy']).toBe("default-src 'self'");
    open.forEach(s => s.close());
  });

  it('sends a heartbeat comment', async () => {
    const s = await openEvents(port);
    await s.waitFor(/: heartbeat\n\n/, 1000);
    s.close();
  });

  it('forgets a client on disconnect and stops polling with the last one', async () => {
    const a = await openEvents(port);
    const b = await openEvents(port);
    await until(() => spec.streams() === 2);
    a.close();
    await until(() => spec.streams() === 1);
    b.close();
    await until(() => spec.streams() === 0);
    // With no stream open, an edit produces nothing and nobody is polling for it.
    write(p.root, '.specs/planning/tasks.md', '# changed while nobody listens\n');
    const late = await openEvents(port);
    await new Promise(r => setTimeout(r, 600));
    expect(late.text()).not.toContain('event: change');
    late.close();
  });

  it('pushes an edit to a temp .specs file within 2 s, as paths only', async () => {
    const s = await openEvents(port);
    await s.waitFor(/retry/);
    const started = Date.now();
    write(p.root, '.specs/planning/tasks.md', '# Tasks\n\n- edited by the test\n');
    const event = await s.waitFor(/event: change\ndata: .*\n\n/, 2000);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(JSON.parse(event.split('data: ')[1])).toEqual({ paths: ['.specs/planning/tasks.md'] });
    expect(s.text()).not.toContain('edited by the test');
    s.close();
  });

  it('leaves no timers behind after close()', async () => {
    const before = timerCount();
    const s = await openEvents(port);
    await until(() => spec.streams() === 1);
    expect(timerCount()).toBeGreaterThan(before); // poller + heartbeat running
    await spec.close();
    s.close();
    await until(() => timerCount() <= before);
    expect(spec.server.listening).toBe(false);
  });
});

describe('the poller watches exactly what /api/file serves', () => {
  it('agrees with resolveAllowedPath on every file in a tree full of edge cases', () => {
    const p = makeProject();
    try {
      const r = p.root;
      write(r, '.specs/a.md', 'a');
      write(r, '.specs/.hidden.md', 'hidden file');
      write(r, '.specs/.git/HEAD', 'ref');
      write(r, '.specs/sub/.cache/x.md', 'hidden folder deeper');
      write(r, '.specs/node_modules/pkg/readme.md', 'nm');
      write(r, '.claude/commands/cmd.md', 'c');
      write(r, '.claude/commands/.draft.md', 'hidden command');
      write(r, '.claude/settings.json', 'not allowlisted');
      write(r, '.claude/skills/s/SKILL.md', 's');
      write(r, '.github/prompts/p.prompt.md', 'p');
      write(r, '.github/workflows/ci.yml', 'not allowlisted');
      write(r, 'AGENTS.md', 'agents');
      write(r, 'README.md', 'not allowlisted');
      symlinkSync(join(r, '.specs', 'a.md'), join(r, '.specs', 'alias.md')); // file symlink inside the allowlist
      symlinkSync(join(r, 'src', 'secret.ts'), join(r, '.specs', 'leak.md')); // leaves the allowlist
      symlinkSync(join(p.outside, 'secret.txt'), join(r, '.specs', 'out.md')); // leaves the root
      mkdirSync(join(r, 'docs'));
      write(r, 'docs/d.md', 'reached only through a symlinked folder');
      symlinkSync(join(r, '.specs', 'planning'), join(r, '.specs', 'linkdir')); // symlinked folder, target inside
      symlinkSync(join(r, 'docs'), join(r, '.claude', 'commands', 'docs')); // symlinked folder, target outside

      // Every path a request could name: all real files plus the paths through the symlinks.
      const all = (dir: string, rel = ''): string[] =>
        require('fs').readdirSync(join(r, dir, rel), { withFileTypes: true }).flatMap((e: import('fs').Dirent) => {
          const p2 = [dir, rel, e.name].filter(Boolean).join('/');
          return e.isDirectory() ? all(dir, [rel, e.name].filter(Boolean).join('/')) : [p2];
        });
      const candidates = [
        ...all('.specs'), ...all('.claude'), ...all('.github'), ...all('src'),
        'CLAUDE.md', 'AGENTS.md', 'README.md',
        '.specs/linkdir/tasks.md', '.claude/commands/docs/d.md',
      ];
      const served = candidates.filter(c => resolveAllowedPath(r, c) !== null).sort();
      const watched = watchedFiles(r);
      expect(watched).toEqual(served);
      // And the edge cases landed where they should.
      expect(served).toEqual(expect.arrayContaining(['.specs/a.md', '.specs/alias.md', '.claude/commands/cmd.md', 'AGENTS.md']));
      for (const out of ['.specs/.hidden.md', '.specs/.git/HEAD', '.specs/sub/.cache/x.md', '.specs/node_modules/pkg/readme.md', '.claude/commands/.draft.md', '.specs/leak.md', '.specs/out.md', '.specs/linkdir/tasks.md', '.claude/commands/docs/d.md', '.claude/settings.json', 'README.md']) {
        expect(served).not.toContain(out);
      }
    } finally {
      p.cleanup();
    }
  });
});

describe('UI routing (ui/route.js)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveRoute, goneHtml } = require('../../ui/route.js') as {
    resolveRoute: (hash: string, files: Record<string, unknown>, count?: number) => { project: number; view: string; sub: string; missing: boolean };
    goneHtml: (path: string) => string;
  };
  const files = { 'quality/tests.md': {}, 'planning/roadmap.md': {} };

  it('opens a listed file', () => {
    expect(resolveRoute('#file/quality/tests.md', files)).toEqual({ project: 0, view: 'file', sub: 'quality/tests.md', missing: false });
  });

  it('keeps a fresh load of a deleted file on the file view, marked missing, instead of routing to Tasks', () => {
    expect(resolveRoute('#file/security/threat-model.md', files)).toEqual({ project: 0, view: 'file', sub: 'security/threat-model.md', missing: true });
    expect(goneHtml('.specs/security/threat-model.md')).toBe(
      '<p class="note"><span class="mono" translate="no">.specs/security/threat-model.md</span> no longer exists.</p>',
    );
  });

  it('escapes whatever path the URL carries', () => {
    const r = resolveRoute('#file/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', files);
    expect(r.missing).toBe(true);
    expect(goneHtml(r.sub)).not.toMatch(/<img/);
    expect(goneHtml(r.sub)).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it.each([['', 'board'], ['#', 'board'], ['#board/board', 'board'], ['#explorer', 'explorer'], ['#nope', 'board'], ['#file', 'board'], ['#file/', 'board']])(
    'routes %j to %s',
    (hash, view) => {
      expect(resolveRoute(hash, files).view).toBe(view);
    },
  );

  it('reads the project index of a route (BL-054)', () => {
    expect(resolveRoute('#1/board', files, 3)).toEqual({ project: 1, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#2/file/quality/tests.md', files, 3)).toEqual({ project: 2, view: 'file', sub: 'quality/tests.md', missing: false });
    expect(resolveRoute('#0/explorer', files, 3)).toEqual({ project: 0, view: 'explorer', sub: '', missing: false });
    expect(resolveRoute('#explorer', files, 3)).toEqual({ project: 0, view: 'explorer', sub: '', missing: false });
  });

  it.each([['#9/explorer'], ['#3/explorer'], ['#01/explorer'], ['#1/explorer']])('sends %j (no such project) to project 0 Tasks', hash => {
    expect(resolveRoute(hash, files, hash === '#1/explorer' ? 1 : 3)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
  });

  it('is served and loaded by the page', async () => {
    const p = makeProject();
    const s = await startSpecServer([p.root], 0, 'x');
    try {
      const port = (s.server.address() as AddressInfo).port;
      const js = await hit(port, '/assets/route.js');
      expect([js.status, js.headers['content-type']]).toEqual([200, 'text/javascript; charset=utf-8']);
      expect((await hit(port, '/')).body).toContain('<script src="/assets/route.js" defer></script>');
    } finally {
      await s.close();
      p.cleanup();
    }
  });
});

// ─── Task moves (BL-053) ─────────────────────────────────────────────────────

const MOVE_TASKS = [
  '---', 'fileID: TASKS-001', 'relatedFiles: [roadmap.md, requirements.md, project.yaml]', '---', '', '# Tasks', '',
  '## Backlog', '', '| ID | Description |', '|---|---|', '| BL-001 | One |', '| BL-002 | Two |', '',
  '## Current Sprint', '', '| ID | Description |', '|---|---|', '| CS-001 | Sprint |', '',
  '## Completed', '', '| # | ID | Description |', '|---|---|---|', '| 1 | [CD-001] | Done |', '',
].join('\n');

/** POST /api/tasks/move with full control over the headers that the security checks read. */
function post(port: number, body: string, headers: Record<string, string | undefined>, path = '/api/tasks/move') {
  return new Promise<{ status: number; headers: Record<string, unknown>; json: any }>((resolve, reject) => {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) h[k] = v;
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: h }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => (text += c));
      res.on('end', () => {
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
        resolve({ status: res.statusCode!, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('task moves over HTTP', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  let file: string;
  const hash = () => require('crypto').createHash('sha256').update(readFileSync(file)).digest('hex') as string;
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    'If-Match': hash(),
    ...over,
  });
  const body = JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 });

  beforeEach(async () => {
    p = makeProject();
    file = join(p.root, '.specs/planning/tasks.md');
    writeFileSync(file, MOVE_TASKS);
    spec = await startSpecServer([p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    const page = (await hit(port, '/')).body;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec(page)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('puts a 32-byte token in the page and the tasks.md hash in /api/specs', async () => {
    expect(token).toHaveLength(64);
    expect(JSON.parse((await hit(port, '/api/specs')).body).tasks.sha256).toBe(hash());
  });

  it.each([['127.0.0.1'], ['localhost']])('moves a row for a page on %s: one line, new hash, fresh payload', async name => {
    const res = await post(port, body, good({ Host: `${name}:${port}`, Origin: `http://${name}:${port}` }));
    expect(res.status).toBe(200);
    const after = readFileSync(file, 'utf-8');
    expect(res.json.sha256).toBe(hash());
    expect(res.json.specs.tasks.sha256).toBe(res.json.sha256);
    expect(res.json.specs.tasks.currentSprint.map((r: { id: string }) => r.id)).toEqual(['BL-002', 'CS-001']);
    expect(res.json).toMatchObject({ from: 'backlog', fromIndex: 1 });
    expect(after.split('\n').filter(l => !MOVE_TASKS.split('\n').includes(l))).toEqual([]); // same lines, one moved
    expect(after).not.toBe(MOVE_TASKS);
  });

  it.each<[string, Record<string, string | undefined>, number]>([
    ['no token', { 'X-SpecPilot-Token': undefined }, 403],
    ['a wrong token', { 'X-SpecPilot-Token': 'f'.repeat(64) }, 403],
    ['a short token', { 'X-SpecPilot-Token': 'abc' }, 403],
    ['a foreign Origin', { Origin: 'http://evil.com' }, 403],
    ['no Origin', { Origin: undefined }, 403],
    ['Host localhost with Origin 127.0.0.1', { Host: 'localhost:PORT', Origin: 'http://127.0.0.1:PORT' }, 403],
    ['a form content type', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
    ['a text/plain content type', { 'Content-Type': 'text/plain' }, 415],
    ['a foreign Host', { Host: 'evil.com' }, 403],
  ])('rejects %s and leaves tasks.md untouched', async (_name, over, status) => {
    const headers = good(over);
    for (const k of Object.keys(headers)) if (headers[k as keyof typeof headers]) headers[k as keyof typeof headers] = headers[k as keyof typeof headers]!.replace(/PORT/g, String(port));
    const res = await post(port, body, headers);
    expect(res.status).toBe(status);
    expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
  });

  it('rejects a body over 16 KB with 413 and leaves tasks.md untouched', async () => {
    const big = JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0, pad: 'x'.repeat(17 * 1024) });
    expect((await post(port, big, good())).status).toBe(413);
    expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
  });

  it('409s on a stale If-Match with the fresh payload, and never merges', async () => {
    const res = await post(port, body, good({ 'If-Match': 'a'.repeat(64) }));
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('planning/tasks.md changed on disk since this page loaded. The move was not made.');
    expect(res.json.specs.tasks.sha256).toBe(hash());
    expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
  });

  it('428s without If-Match', async () => {
    expect((await post(port, body, good({ 'If-Match': undefined }))).status).toBe(428);
    expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
  });

  it.each([
    [{ id: 'BL-999', toSection: 'backlog', toIndex: 0 }, 'No task row in planning/tasks.md has the ID BL-999.'],
    [{ id: '[CD-001]', toSection: 'backlog', toIndex: 0 }, 'Completed rows cannot be moved.'],
    [{ id: 'BL-001', toSection: 'completed', toIndex: 0 }, 'Tasks can only be moved to Backlog or Current Sprint.'],
  ])('422s on %j with a plain-words message and no write', async (move, error) => {
    const res = await post(port, JSON.stringify(move), good());
    expect(res.status).toBe(422);
    expect(res.json.error).toBe(error);
    expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
  });

  it('422s on an ID that is on two rows, with no write', async () => {
    const dup = MOVE_TASKS.replace('| CS-001 | Sprint |', '| BL-002 | Sprint |');
    writeFileSync(file, dup);
    const res = await post(port, body, good());
    expect(res.status).toBe(422);
    expect(res.json.error).toContain('more than one row');
    expect(readFileSync(file, 'utf-8')).toBe(dup);
  });

  it('only accepts POST on the move route', async () => {
    const res = await hit(port, '/api/tasks/move');
    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('POST');
  });

  it('serialises two simultaneous moves: one lands, the other sees a stale hash', async () => {
    const h = hash();
    const [a, b] = await Promise.all([
      post(port, JSON.stringify({ id: 'BL-001', toSection: 'currentSprint', toIndex: 0 }), good({ 'If-Match': h })),
      post(port, JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }), good({ 'If-Match': h })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(hash()).toBe(winner.json.sha256);
    const moved = readFileSync(file, 'utf-8').split('\n');
    expect(moved.filter(l => /^\| (BL|CS)-/.test(l))).toHaveLength(3); // nothing lost or duplicated
  });
});

describe('--read-only', () => {
  it('has no write route, no token in the page, and writes nothing', async () => {
    const p = makeProject();
    const file = join(p.root, '.specs/planning/tasks.md');
    writeFileSync(file, MOVE_TASKS);
    const spec = await startSpecServer([p.root], 0, 'x', { readOnly: true });
    try {
      const port = (spec.server.address() as AddressInfo).port;
      const page = (await hit(port, '/')).body;
      expect(page).not.toContain('specpilot-token');
      const res = await post(port, JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }), {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
        'X-SpecPilot-Token': 'f'.repeat(64),
        'If-Match': 'x',
      });
      expect(res.status).toBe(405);
      expect(readFileSync(file, 'utf-8')).toBe(MOVE_TASKS);
    } finally {
      await spec.close();
      p.cleanup();
    }
  });
});

// ─── Multiple projects (BL-054) ──────────────────────────────────────────────

describe('displayRoot', () => {
  it.each([
    ['/home/u', '~'],
    ['/home/u/dev/api', '~/dev/api'],
    ['/home/user2/api', '/home/user2/api'],
    ['/srv/api', '/srv/api'],
  ])('shows %s as %s', (root, shown) => {
    expect(displayRoot(root, '/home/u')).toBe(shown);
  });
});

describe('several projects on one server', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
  let c: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const tasks = (p: { root: string }) => join(p.root, '.specs/planning/tasks.md');
  const hashOf = (p: { root: string }) => createHash('sha256').update(readFileSync(tasks(p))).digest('hex');
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    'If-Match': hashOf(b),
    ...over,
  });
  const move = JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 });

  beforeEach(async () => {
    [a, b, c] = [makeProject(), makeProject(), makeProject()];
    for (const p of [a, b, c]) writeFileSync(tasks(p), MOVE_TASKS);
    write(b.root, '.specs/project/project.yaml', 'name: "Project B"\n');
    write(b.root, '.specs/only-b.md', '# only in B\n');
    rmSync(join(c.root, '.specs/project/project.yaml'));
    spec = await startSpecServer([a.root, b.root, c.root], 0, '0.0.0-test', { pollMs: 250, heartbeatMs: 60, settleMs: 30 });
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    [a, b, c].forEach(p => p.cleanup());
  });

  it('answers /api/specs per project, project 0 when omitted, and lists every project in order', async () => {
    const at = async (q: string) => JSON.parse((await hit(port, `/api/specs${q}`)).body);
    expect((await at('')).project.root).toBe(a.root);
    expect((await at('?project=0')).project.root).toBe(a.root);
    expect((await at('?project=1')).project).toMatchObject({ name: 'Project B', root: b.root });
    expect((await at('?project=2')).project.root).toBe(c.root);
    expect((await at('?project=1')).projects).toEqual([
      { name: 'Fixture Project', root: displayRoot(a.root), branch: 'main' },
      { name: 'Project B', root: displayRoot(b.root), branch: 'main' },
      { name: null, root: displayRoot(c.root), branch: 'main' },
    ]);
  });

  it.each([['-1'], ['1.5'], ['abc'], ['01'], ['+1'], ['%201'], ['1e0'], [''], ['3'], ['1&project=0']])(
    'answers ?project=%s with 404 on every read route',
    async q => {
      for (const route of ['/api/specs?', '/api/file?p=.specs/project/project.yaml&', '/api/events?']) {
        expect((await hit(port, `${route}project=${q}`)).status).toBe(404);
      }
      expect(spec.streams()).toBe(0);
    },
  );

  it("serves a file only from the named project's root", async () => {
    expect((await hit(port, '/api/file?p=.specs/only-b.md&project=1')).body).toBe('# only in B\n');
    expect((await hit(port, '/api/file?p=.specs/only-b.md&project=0')).status).toBe(404);
    expect((await hit(port, '/api/file?p=.specs/only-b.md')).status).toBe(404);
  });

  it("moves a row in the named project only, against that project's hash", async () => {
    const aTasks = MOVE_TASKS + '\n'; // so project 0's hash differs from project 1's
    writeFileSync(tasks(a), aTasks);
    const stale = await post(port, move, good({ 'If-Match': hashOf(a) }), '/api/tasks/move?project=1');
    expect(stale.status).toBe(409);
    expect(stale.json.specs.project.root).toBe(b.root);
    const res = await post(port, move, good(), '/api/tasks/move?project=1');
    expect(res.status).toBe(200);
    expect(res.json.specs.project.root).toBe(b.root);
    expect(res.json.specs.tasks.currentSprint.map((r: { id: string }) => r.id)).toEqual(['BL-002', 'CS-001']);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(aTasks);
    expect(readFileSync(tasks(c), 'utf-8')).toBe(MOVE_TASKS);
    expect(readFileSync(tasks(b), 'utf-8')).not.toBe(MOVE_TASKS);
  });

  it('checks the token before the project, and 404s a bad project only after the checks pass', async () => {
    const forged = await post(port, move, good({ 'X-SpecPilot-Token': 'f'.repeat(64) }), '/api/tasks/move?project=9');
    expect(forged.status).toBe(403);
    const foreign = await post(port, move, good({ Origin: 'http://evil.example' }), '/api/tasks/move?project=abc');
    expect(foreign.status).toBe(403);
    const bad = await post(port, move, good(), '/api/tasks/move?project=9');
    expect(bad.status).toBe(404);
    for (const p of [a, b, c]) expect(readFileSync(tasks(p), 'utf-8')).toBe(MOVE_TASKS);
  });

  it("sends a project's changes only to that project's streams", async () => {
    const sa = await openEvents(port, undefined, '/api/events');
    const sb = await openEvents(port, undefined, '/api/events?project=1');
    await sa.waitFor(/retry/);
    await sb.waitFor(/retry/);
    await new Promise(r => setTimeout(r, 300)); // let each poller take its first snapshot
    writeFileSync(join(b.root, '.specs/only-b.md'), '# changed\n');
    await sb.waitFor(/event: change\ndata: \{"paths":\["\.specs\/only-b\.md"\]\}/, 3000);
    await new Promise(r => setTimeout(r, 400));
    expect(sa.text()).not.toContain('event: change');
    sa.close();
    sb.close();
    await until(() => spec.streams() === 0);
  });

  it('counts the 8-stream cap across all projects', async () => {
    const open = [];
    for (let i = 0; i < MAX_EVENT_STREAMS; i++) open.push(await openEvents(port, undefined, `/api/events?project=${i % 3}`));
    await until(() => spec.streams() === MAX_EVENT_STREAMS);
    expect((await openEvents(port, undefined, '/api/events?project=2')).status).toBe(503);
    open.forEach(s => s.close());
    await until(() => spec.streams() === 0);
  });

  it('leaves no timer behind after close() with streams open in two projects', async () => {
    const before = timerCount();
    await openEvents(port, undefined, '/api/events');
    await openEvents(port, undefined, '/api/events?project=2');
    await until(() => spec.streams() === 2);
    await spec.close();
    expect(timerCount()).toBeLessThanOrEqual(before);
    spec = await startSpecServer([a.root], 0, 'x'); // afterEach closes it
  });
});

describe('one poller per project, running only while that project has a stream', () => {
  it('starts with the first stream of its project and stops with the last, leaving other projects alone', async () => {
    const running = new Map<string, boolean>();
    const real = specPoller.createPoller;
    const spy = jest.spyOn(specPoller, 'createPoller').mockImplementation((root, opts) => {
      const poller = real(root, opts);
      running.set(root, false);
      return {
        ...poller,
        start: () => (running.set(root, true), poller.start()),
        stop: () => (running.set(root, false), poller.stop()),
      };
    });
    const [a, b] = [makeProject(), makeProject()];
    const spec = await startSpecServer([a.root, b.root], 0, 'x', { pollMs: 250 });
    try {
      const port = (spec.server.address() as AddressInfo).port;
      const state = () => [running.get(a.root), running.get(b.root)];
      expect(state()).toEqual([false, false]);

      const a1 = await openEvents(port, undefined, '/api/events?project=0');
      await until(() => spec.streams() === 1);
      expect(state()).toEqual([true, false]);

      const a2 = await openEvents(port, undefined, '/api/events?project=0');
      const b1 = await openEvents(port, undefined, '/api/events?project=1');
      await until(() => spec.streams() === 3);
      expect(state()).toEqual([true, true]);

      a1.close();
      await until(() => spec.streams() === 2);
      expect(state()).toEqual([true, true]); // project 0 still has a2

      a2.close();
      await until(() => spec.streams() === 1);
      expect(state()).toEqual([false, true]); // project 0's last stream gone; project 1 untouched

      b1.close();
      await until(() => spec.streams() === 0);
      expect(state()).toEqual([false, false]);
    } finally {
      await spec.close();
      spy.mockRestore();
      a.cleanup();
      b.cleanup();
    }
  });
});

describe('serveCommand with folders', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
  let exit: jest.SpyInstance;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    [a, b] = [makeProject(), makeProject()];
    errors = [];
    logs = [];
    exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    jest.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    jest.spyOn(console, 'log').mockImplementation((...x: unknown[]) => void logs.push(x.join(' ')));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    a.cleanup();
    b.cleanup();
  });

  /** Run serve on a free port, return what it printed, then stop it with Ctrl+C. */
  async function serveAndStop(folders: string[]): Promise<{ port: number; out: string }> {
    const probe = await startSpecServer([a.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    let exited: (code: number) => void;
    const done = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);
    await serveCommand(folders, { port: String(port) });
    const out = stripVTControlCharacters(logs.join('\n')); // chalk colours the lines in a colour terminal
    process.emit('SIGINT');
    expect(await done).toBe(0);
    return { port, out };
  }

  it.each([
    ['a folder that does not exist', () => join(a.root, 'nope'), 'Folder not found: '],
    ['a file', () => join(a.root, 'CLAUDE.md'), 'Not a folder: '],
    ['a folder without .specs/', () => join(a.root, 'src'), 'No .specs/ folder in '],
  ])('stops with exit 1 and names %s', async (_what, folder, message) => {
    await expect(serveCommand([a.root, folder()], {})).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain(message + folder());
  });

  it('prints the one-project line unchanged for one folder, and a folder named twice (also via a link) once', async () => {
    const link = join(a.root, '..', 'link');
    symlinkSync(a.root, link);
    const real = realpathSync(a.root);
    const { port, out } = await serveAndStop([a.root, link]);
    expect(out.split('\n')[0]).toBe(`SpecPilot is serving ${real} at http://127.0.0.1:${port}`);
  });

  it('lists every project in command-line order', async () => {
    const { port, out } = await serveAndStop([b.root, a.root]);
    expect(out.split('\n').slice(0, 3)).toEqual([
      `SpecPilot is serving 2 projects at http://127.0.0.1:${port}`,
      `  0  ${realpathSync(b.root)}`,
      `  1  ${realpathSync(a.root)}`,
    ]);
  });
});

describe('--read-only with several projects', () => {
  it('has no write route in any project', async () => {
    const [a, b] = [makeProject(), makeProject()];
    writeFileSync(join(b.root, '.specs/planning/tasks.md'), MOVE_TASKS);
    const spec = await startSpecServer([a.root, b.root], 0, 'x', { readOnly: true });
    try {
      const port = (spec.server.address() as AddressInfo).port;
      const res = await post(
        port,
        JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }),
        { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64), 'If-Match': 'x' },
        '/api/tasks/move?project=1',
      );
      expect(res.status).toBe(405);
      expect(readFileSync(join(b.root, '.specs/planning/tasks.md'), 'utf-8')).toBe(MOVE_TASKS);
    } finally {
      await spec.close();
      a.cleanup();
      b.cleanup();
    }
  });
});
