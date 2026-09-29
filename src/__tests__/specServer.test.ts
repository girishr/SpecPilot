import { request } from 'http';
import { AddressInfo } from 'net';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { buildSpecsPayload, isAllowedHost, MAX_EVENT_STREAMS, readBranch, SpecServer, startSpecServer } from '../utils/specServer';
import { resolveAllowedPath } from '../utils/specPaths';
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
    spec = await startSpecServer(p.root, 0, '0.0.0-test');
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
    const busy = await startSpecServer(p.root, 0, 'x');
    const port = (busy.server.address() as AddressInfo).port;
    try {
      await expect(serveCommand({ port: String(port) })).rejects.toThrow('exit 1');
      expect(errors.join('\n')).toMatch(new RegExp(`Port ${port} is already in use.*--port`));
    } finally {
      await busy.close();
    }
  });

  it.each([['100'], ['249'], ['1.5'], ['abc']])('rejects --poll %s (whole number of ms, 250 or more)', async poll => {
    await expect(serveCommand({ poll })).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('Invalid --poll');
  });

  it('rejects an invalid --port', async () => {
    await expect(serveCommand({ port: 'abc' })).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('Invalid --port');
  });

  it('refuses to start without .specs/ in the current directory', async () => {
    process.chdir(os.tmpdir());
    await expect(serveCommand({})).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('No .specs/ folder');
  });

  it('prints the URL as http://127.0.0.1:<port> and stops on Ctrl+C', async () => {
    const probe = await startSpecServer(p.root, 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();

    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);

    await serveCommand({ port: String(port) });
    expect(logs.join('\n')).toContain(`http://127.0.0.1:${port}`);
    expect(logs.join('\n')).not.toContain('localhost');
    process.emit('SIGINT');
    expect(await exitCode).toBe(0);
  });
});

// ─── Live reload (BL-052) ────────────────────────────────────────────────────

/** An open GET /api/events stream that collects what the server sends. */
function openEvents(port: number, host = `127.0.0.1:${port}`) {
  return new Promise<{ status: number; headers: Record<string, unknown>; text: () => string; close: () => void; waitFor: (re: RegExp, ms?: number) => Promise<string> }>(
    (resolve, reject) => {
      let text = '';
      const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: host } }, res => {
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
    spec = await startSpecServer(p.root, 0, '0.0.0-test', { pollMs: 250, heartbeatMs: 60, settleMs: 30 });
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
    resolveRoute: (hash: string, files: Record<string, unknown>) => { view: string; sub: string; missing: boolean };
    goneHtml: (path: string) => string;
  };
  const files = { 'quality/tests.md': {}, 'planning/roadmap.md': {} };

  it('opens a listed file', () => {
    expect(resolveRoute('#file/quality/tests.md', files)).toEqual({ view: 'file', sub: 'quality/tests.md', missing: false });
  });

  it('keeps a fresh load of a deleted file on the file view, marked missing, instead of routing to Tasks', () => {
    expect(resolveRoute('#file/security/threat-model.md', files)).toEqual({ view: 'file', sub: 'security/threat-model.md', missing: true });
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

  it('is served and loaded by the page', async () => {
    const p = makeProject();
    const s = await startSpecServer(p.root, 0, 'x');
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
