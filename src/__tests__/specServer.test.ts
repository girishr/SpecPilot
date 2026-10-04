import { createHash } from 'crypto';
import { request } from 'http';
import { AddressInfo } from 'net';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';
import * as os from 'os';
import { buildSpecsPayload, displayRoot, isAllowedHost, MAX_EVENT_STREAMS, readBranch, SpecServer, startSpecServer } from '../utils/specServer';
import { resolveAllowedPath } from '../utils/specPaths';
import * as specPoller from '../utils/specPoller';
import { watchedFiles } from '../utils/specPoller';
import { serveCommand } from '../commands/serve';
import * as specSetup from '../utils/specSetup';
import { STAGING_MARKER } from '../utils/specSetup';
import { MAX_PROJECTS, readRegistry, registryPath, RegistryEntry, writeRegistry } from '../utils/projectRegistry';

// The UI's markdown renderer is plain browser JS that also exports itself for Node.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { md } = require('../../ui/md.js') as { md: (src: string) => string };

const REPO = join(__dirname, '..', '..');

// Every test runs under a temp HOME (BL-067): nothing here may read or write the real ~/.specpilot.
const REAL_HOME = os.homedir();
let HOME: string;
beforeEach(() => {
  HOME = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-home-')));
  process.env.HOME = HOME;
  process.env.USERPROFILE = HOME;
  if (registryPath().startsWith(REAL_HOME + '/')) throw new Error('the registry path would be the real one');
});
afterEach(() => {
  process.env.HOME = REAL_HOME;
  process.env.USERPROFILE = REAL_HOME;
  rmSync(HOME, { recursive: true, force: true });
});
/** The temp home's registry file, as the command would compute it. */
const regFile = () => registryPath(HOME);

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

  it('refuses to start without .specs/ in the current directory, and names `specpilot serve .` (BL-055)', async () => {
    process.chdir(os.tmpdir());
    await expect(serveCommand([], {})).rejects.toThrow('exit 1');
    expect(errors.join('\n')).toContain('No .specs/ folder in this directory. Run `specpilot serve` from a project root, `specpilot init` first, or `specpilot serve .` to set one up in the browser.');
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
  const { resolveRoute, goneHtml, recentHtml, openOutcome, reloadView } = require('../../ui/route.js') as {
    resolveRoute: (hash: string, files: Record<string, unknown>, count?: number, home?: boolean) => { project: number; view: string; sub: string; missing: boolean };
    goneHtml: (path: string) => string;
    recentHtml: (reg: unknown, home: boolean, projects?: unknown[], chev?: string) => string;
    openOutcome: (status: number, res: unknown) => { project: number | null; specs: unknown; toast: string };
    reloadView: (curView: string, hadSpecs: boolean, hasSpecs: boolean) => string | null;
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

  it.each([['#home'], ['#home/x'], ['#1/home'], ['#9/home'], ['#01/home']])('routes %j to Home when the page has one, whatever index or rest it carries (BL-PM-001)', hash => {
    expect(resolveRoute(hash, files, 2, true)).toEqual({ project: 0, view: 'home', sub: '', missing: false });
  });

  it('keeps #homes an unknown view and every other route as it was when the page has a Home', () => {
    expect(resolveRoute('#homes', files, 2, true)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#1/homes', files, 2, true)).toEqual({ project: 1, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#1/explorer', files, 2, true)).toEqual({ project: 1, view: 'explorer', sub: '', missing: false });
    expect(resolveRoute('#file/quality/tests.md', files, 2, true)).toEqual({ project: 0, view: 'file', sub: 'quality/tests.md', missing: false });
    expect(resolveRoute('#9/explorer', files, 2, true)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
  });

  it.each([[false], [undefined]])('sends #home to the Tasks view of the route\'s project when there is no Home (--read-only; home = %j)', home => {
    expect(resolveRoute('#home', files, 2, home)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#home/x', files, 2, home)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#1/home', files, 2, home)).toEqual({ project: 1, view: 'board', sub: '', missing: false });
    expect(resolveRoute('#9/home', files, 2, home)).toEqual({ project: 0, view: 'board', sub: '', missing: false });
  });

  const REG = {
    path: '~/.specpilot/projects.json',
    error: null,
    entries: [
      { path: '/h/old', root: '~/old', lastOpened: new Date(2026, 9, 4, 7, 8, 59).toISOString(), pinned: true, project: null, exists: true },
      { path: '/h/api', root: '~/api', lastOpened: new Date(2025, 0, 31, 23, 0).toISOString(), pinned: false, project: 1, exists: true },
      { path: '/h/<gone>', root: '~/<gone>', lastOpened: '2026-10-02T10:00:00.000Z', pinned: false, project: null, exists: false },
    ],
  };
  const SERVED = [{ name: 'a', root: '~/a', branch: 'main' }, { name: 'api', root: '~/api', branch: 'feat/x' }];

  it('draws a Home row per entry in the order sent: root, the branch only of an open project, the time, and "folder not found" (BL-PM-001)', () => {
    const rows = recentHtml(REG, true, SERVED, '').split('</button>').filter(Boolean);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('data-path="/h/old"');
    expect(rows[0]).toContain('<div class="ttl" translate="no">~/old</div>'); // not open: no branch
    expect(rows[0]).toContain('<div class="det">4 Oct 2026, 07:08</div>'); // local time, day not padded, hour and minute padded, no seconds
    expect(rows[1]).toContain('<div class="ttl" translate="no">~/api · feat/x</div>');
    expect(rows[1]).toContain('<div class="det">31 Jan 2025, 23:00 · open as project 1</div>');
    expect(rows[2]).toContain('data-path="/h/&lt;gone&gt;"');
    expect(rows[2]).toContain('<div class="ttl" translate="no">~/&lt;gone&gt;</div>');
    expect(rows[2]).toContain(' · folder not found</div>');
    for (const r of rows) {
      expect(r).toMatch(/^<button type="button" class="row act" data-path=/); // the whole row opens the folder
      expect(r).not.toMatch(/Remove from list|disabled|pinned|badge|pill/);
    }
  });

  it('keeps the sheet\'s list as it was: a Remove button per row and no branch', () => {
    const html = recentHtml(REG, false, SERVED, '');
    expect(html.match(/Remove from list/g)).toHaveLength(3);
    expect(html).toContain('<div class="ttl" translate="no">~/api</div>');
    expect(html).toContain(' · folder not found</div>');
    expect(html).not.toContain('feat/x');
    expect(html).toContain('<div class="det">4 Oct 2026, 07:08</div>'); // the same date form as Home
    const odd = recentHtml({ path: 'p', error: null, entries: [{ ...REG.entries[0], lastOpened: 'not a <date>' }] }, false, SERVED, '');
    expect(odd).toContain('<div class="det">not a &lt;date&gt;</div>'); // what Date cannot parse is shown as it is
  });

  it('shows an empty registry and a refused one in both lists, the reason verbatim and escaped', () => {
    for (const home of [true, false]) {
      expect(recentHtml({ path: 'p', error: null, entries: [] }, home)).toBe('<div class="empty">No projects remembered yet.</div>');
      expect(recentHtml({ path: 'p', error: 'x <b> could not be read', entries: [] }, home)).toBe('<p class="note">x &lt;b&gt; could not be read</p>');
    }
  });

  it('a refused open (422, 403, or no message) opens nothing and shows the server\'s message, so a row click on Home stays on Home', () => {
    expect(openOutcome(422, { error: '~/gone does not exist.' })).toEqual({ project: null, specs: null, toast: '~/gone does not exist.' });
    expect(openOutcome(403, { error: 'Forbidden' })).toEqual({ project: null, specs: null, toast: 'Forbidden' });
    expect(openOutcome(422, {})).toEqual({ project: null, specs: null, toast: 'Nothing was opened (HTTP 422).' });
    expect(openOutcome(409, { error: 'Too many projects.' })).toEqual({ project: null, specs: null, toast: 'Too many projects.' }); // a 409 without a project
  });

  it('an open that worked shows the project with the payload it came with; an already open folder is switched to', () => {
    const specs = { projects: [{ root: '~/a' }, { root: '~/api' }] };
    expect(openOutcome(200, { project: 1, specs, registry: { error: null } })).toEqual({ project: 1, specs, toast: '~/api opened as project 1' });
    expect(openOutcome(200, { project: 1, specs, registry: { error: 'not saved' } }).toast).toBe('~/api opened as project 1. not saved');
    expect(openOutcome(409, { project: 0, error: '~/a is already open as project 0.' })).toEqual({ project: 0, specs: null, toast: '~/a is already open as project 0.' });
    expect(openOutcome(409, { project: 0 }).toast).toBe('Already open as project 0');
  });

  it('a live-reload change never moves the page off Home, and moves the other views as before', () => {
    for (const had of [true, false]) for (const has of [true, false]) expect(reloadView('home', had, has)).toBeNull();
    expect(reloadView('board', true, false)).toBe('setup'); // .specs/ gone
    expect(reloadView('file', true, false)).toBe('setup');
    expect(reloadView('setup', false, true)).toBe('board'); // .specs/ appeared another way
    expect(reloadView('setup', false, false)).toBeNull();
    expect(reloadView('setup', true, true)).toBeNull();
    expect(reloadView('board', true, true)).toBeNull();
  });

  it.each([[false], [true]])('serves the Home screen hidden behind the token, with nothing that is not built (BL-PM-001; readOnly %j)', async readOnly => {
    const p = makeProject();
    const s = await startSpecServer([p.root], 0, 'x', { readOnly });
    try {
      const port = (s.server.address() as AddressInfo).port;
      const page = (await hit(port, '/')).body;
      expect(page).toMatch(/<button class="tile home" id="homeBtn" aria-label="Home" aria-keyshortcuts="h" data-tip="Home" hidden>/);
      const home = page.slice(page.indexOf('<section class="view welcome" id="v-home"'), page.indexOf('<!-- TASKS'));
      expect(home).toMatch(/^<section class="view welcome" id="v-home" aria-labelledby="wTitle">\s*<svg class="logo" aria-hidden="true" focusable="false"><use href="#logo"\/><\/svg>/);
      expect(home).toContain('<h1 id="wTitle">Your specs, as a board.</h1>');
      expect(home).toContain(
        '<p class="lead">SpecPilot reads the <span class="mono" translate="no">.specs/</span> folder of any project on this machine and shows its tasks and spec files as they are written. Your AI IDE keeps doing the coding.</p>',
      );
      expect(home).toContain(
        '<use href="#i-folder"/></svg></span><div class="body"><div class="ttl">Files are the truth</div><div class="det">Every view is read from <span class="mono" translate="no">.specs/</span> and git. Every action writes a file you could have edited by hand.</div>',
      );
      expect(home).toContain(
        '<use href="#i-shield"/></svg></span><div class="body"><div class="ttl">Nothing leaves this machine</div><div class="det">Runs on localhost, no account, no telemetry. No <span class="mono" translate="no">.specs/</span> yet? The guided setup writes one for you.</div>',
      );
      expect(home.match(/class="ic2"/g)).toHaveLength(2); // two benefit rows, not the mockup's three
      expect(home).toContain('Server running on <span class="mono" id="homeAddr" translate="no"></span> · <span id="homeVer" translate="no"></span>'); // filled by the script with the real values
      expect(home.indexOf('benefits')).toBeLessThan(home.indexOf('id="homeBox"'));
      expect(page).not.toContain('needs you');
      expect(page).toContain('id="homeOpen">Open a Project Folder</button>');
      for (const left of ['Start a New Project', 'Clone a Repository', 'Connect Your AI IDE', '/mcp', 'sample project', 'disabled']) expect(page).not.toContain(left);
      expect(page.includes('specpilot-token" content=')).toBe(!readOnly); // no token, so the script never shows the tile
    } finally {
      await s.close();
      p.cleanup();
    }
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

// ─── Guided setup (BL-055) ───────────────────────────────────────────────────


/** A folder named on the command line that has no .specs/ yet: a small TypeScript project. */
function makeEmpty(): { root: string; base: string; cleanup: () => void } {
  const base = mkdtempSync(join(os.tmpdir(), 'specpilot-setup-'));
  const root = join(base, 'proj');
  write(root, 'package.json', JSON.stringify({ name: 'new-app', devDependencies: { typescript: '5.0.0' }, dependencies: { react: '18.0.0' } }));
  write(root, 'src/app.ts', 'export const a = 1;\n');
  return { root, base, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

/** Every regular file under root → bytes, so "nothing changed" is one deep equality. */
function snapshot(root: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, snapshot(root, p));
    else if (e.isFile()) out[p] = readFileSync(join(root, p), 'utf-8');
  }
  return out;
}

const ANSWERS = JSON.stringify({ projectType: 'brownfield', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode' });

describe('guided setup over HTTP', () => {
  let e: ReturnType<typeof makeEmpty>;
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    ...over,
  });

  beforeEach(async () => {
    e = makeEmpty();
    p = makeProject();
    spec = await startSpecServer([e.root, p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    e.cleanup();
    p.cleanup();
    jest.restoreAllMocks();
  });

  it('reports project.specs, and GET /api/setup answers only for the project without .specs/, writing nothing', async () => {
    expect(JSON.parse((await hit(port, '/api/specs?project=0')).body).project.specs).toBe(false);
    expect(JSON.parse((await hit(port, '/api/specs?project=1')).body).project.specs).toBe(true);
    const before = snapshot(e.root);
    const res = await hit(port, '/api/setup?project=0');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
    const q = JSON.parse(res.body);
    expect(q.questions.map((x: { key: string }) => x.key)).toEqual(['projectType', 'apiParadigm', 'handle', 'ide']);
    expect(q.detected.line).toBe('✅ Detected typescript/react project');
    expect(q.keep.vscode).toEqual([]);
    expect(snapshot(e.root)).toEqual(before);
    expect((await hit(port, '/api/setup?project=1')).status).toBe(404);
    expect((await hit(port, '/api/setup?project=2')).status).toBe(404);
    expect((await hit(port, '/api/setup?project=0', { host: 'evil.example:80' })).status).toBe(403);
    expect((await hit(port, '/api/setup?project=0', { method: 'PUT' })).status).toBe(405);
    expect((await hit(port, '/api/setup?project=0', { method: 'DELETE' })).status).toBe(405);
  });

  it('GET answers 422 with the reason when the folder cannot be read', async () => {
    writeFileSync(join(e.root, 'package.json'), '{not json');
    const res = await hit(port, '/api/setup?project=0');
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body).error).toContain('This folder could not be read');
  });

  it('creates what add-specs creates, answers with the fresh payload, and the event stream reports the new paths', async () => {
    const events = await openEvents(port, undefined, '/api/events?project=0');
    const res = await post(port, ANSWERS, good(), '/api/setup?project=0');
    expect(res.status).toBe(200);
    expect(res.json.kept).toEqual([]);
    expect(res.json.notice).toBeNull();
    expect(res.json.specs.project.specs).toBe(true);
    expect(res.json.specs.tasks).not.toBeNull();
    expect(readFileSync(join(e.root, '.specs/project/project.yaml'), 'utf-8')).toContain('devPrefix: "jsmith"');
    expect(readFileSync(join(e.root, '.github/copilot-instructions.md'), 'utf-8')).toContain('No commit unless asked.');
    expect(readFileSync(join(e.root, '.gitattributes'), 'utf-8')).toContain('merge=union');
    expect(JSON.parse((await hit(port, '/api/specs?project=0')).body).project.specs).toBe(true);
    expect((await hit(port, '/api/setup?project=0')).status).toBe(404);
    await events.waitFor(/event: change\ndata: .*\.specs\/planning\/tasks\.md/, 4000);
    events.close();
  });

  it('returns the Codex notice for that choice and prints nothing itself', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await post(port, JSON.stringify({ ...JSON.parse(ANSWERS), ide: 'Codex' }), good(), '/api/setup?project=0');
    expect(res.status).toBe(200);
    expect(res.json.notice).toContain('~/.codex/prompts/');
    expect(log).not.toHaveBeenCalled();
    expect(readFileSync(join(e.root, 'CODEX_INSTRUCTIONS.md'), 'utf-8')).toContain('new-app');
  });

  it('keeps existing files and lists them before (GET) and after (POST)', async () => {
    write(e.root, '.gitattributes', '* text=auto\n');
    write(e.root, '.vscode/settings.json', '{"mine": true}\n');
    const q = JSON.parse((await hit(port, '/api/setup?project=0')).body);
    expect(q.keep.vscode).toEqual(['.vscode/settings.json', '.gitattributes']);
    expect(q.keep.Cursor).toEqual(['.gitattributes']);
    write(e.root, '.github/copilot-instructions.md', 'appeared after GET\n'); // between GET and POST
    const res = await post(port, ANSWERS, good(), '/api/setup?project=0');
    expect(res.status).toBe(200);
    expect(res.json.kept).toEqual(['.vscode/settings.json', '.github/copilot-instructions.md', '.gitattributes']);
    expect(readFileSync(join(e.root, '.gitattributes'), 'utf-8')).toBe('* text=auto\n');
    expect(readFileSync(join(e.root, '.vscode/settings.json'), 'utf-8')).toBe('{"mine": true}\n');
    expect(readFileSync(join(e.root, '.github/copilot-instructions.md'), 'utf-8')).toBe('appeared after GET\n');
    expect(readFileSync(join(e.root, '.vscode/extensions.json'), 'utf-8')).toContain('recommendations');
  });

  it.each([
    ['a missing token', () => good({ 'X-SpecPilot-Token': undefined }), 403],
    ['a wrong token', () => good({ 'X-SpecPilot-Token': 'f'.repeat(64) }), 403],
    ['a short token', () => good({ 'X-SpecPilot-Token': 'abc' }), 403],
    ['a foreign Origin', () => good({ Origin: 'http://evil.example' }), 403],
    ['no Origin', () => good({ Origin: undefined }), 403],
    ['Host localhost with Origin 127.0.0.1', () => good({ Host: `localhost:${port}` }), 403],
    ['a foreign Host', () => good({ Host: 'evil.example:80', Origin: 'http://evil.example:80' }), 403],
    ['a form content type', () => good({ 'Content-Type': 'application/x-www-form-urlencoded' }), 415],
    ['a text content type', () => good({ 'Content-Type': 'text/plain' }), 415],
  ])('refuses a POST with %s and writes nothing', async (_what, headers, status) => {
    const before = snapshot(e.root);
    expect((await post(port, ANSWERS, headers(), '/api/setup?project=0')).status).toBe(status);
    expect(snapshot(e.root)).toEqual(before);
  });

  it('refuses a 17 KB body (413), a bad project with a bad token (403, not 404), a bad project (404), and a project with .specs/ (409)', async () => {
    const before = snapshot(e.root);
    expect((await post(port, JSON.stringify({ projectType: 'x'.repeat(17 * 1024) }), good(), '/api/setup?project=0')).status).toBe(413);
    expect((await post(port, ANSWERS, good({ 'X-SpecPilot-Token': 'f'.repeat(64) }), '/api/setup?project=9')).status).toBe(403);
    expect((await post(port, ANSWERS, good(), '/api/setup?project=9')).status).toBe(404);
    expect((await post(port, ANSWERS, good(), '/api/setup?project=01')).status).toBe(404);
    const taken = await post(port, ANSWERS, good(), '/api/setup?project=1');
    expect(taken.status).toBe(409);
    expect(taken.json.specs.project.name).toBe('Fixture Project');
    expect(snapshot(e.root)).toEqual(before);
    expect(readFileSync(join(p.root, '.specs/project/project.yaml'), 'utf-8')).toContain('Fixture Project');
  });

  it.each([
    ['not JSON', '{', 400, 'not valid JSON'],
    ['an array', '[]', 422, 'JSON object'],
    ['null', 'null', 422, 'JSON object'],
    ['a string', '"x"', 422, 'JSON object'],
    ['a missing key', JSON.stringify({ projectType: 'brownfield', apiParadigm: 'rest', ide: 'vscode' }), 422, '"handle" is missing'],
    ['a non-string value', JSON.stringify({ ...JSON.parse(ANSWERS), ide: 1 }), 422, '"ide" must be a string'],
    ['an extra key', JSON.stringify({ ...JSON.parse(ANSWERS), path: '/etc' }), 422, 'Unexpected field "path"'],
    ['a choice not offered', JSON.stringify({ ...JSON.parse(ANSWERS), ide: 'vim' }), 422, '"ide" must be one of'],
    ['a language when detected', JSON.stringify({ ...JSON.parse(ANSWERS), language: 'python' }), 422, '"language" must not be sent'],
    ['a handle with a space', JSON.stringify({ ...JSON.parse(ANSWERS), handle: 'j smith' }), 422, 'The handle must be'],
  ])('refuses a body that is %s and writes nothing', async (_what, body, status, message) => {
    const before = snapshot(e.root);
    const res = await post(port, body, good(), '/api/setup?project=0');
    expect(res.status).toBe(status);
    expect(res.json.error).toContain(message);
    expect(snapshot(e.root)).toEqual(before);
    expect(readdirSync(e.root).some((n: string) => n.startsWith('.specpilot-setup-'))).toBe(false);
  });

  it('two simultaneous setups: one 200, one 409; and the lock chain survives a 500', async () => {
    const [x, y] = await Promise.all([post(port, ANSWERS, good(), '/api/setup?project=0'), post(port, ANSWERS, good(), '/api/setup?project=0')]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(readdirSync(e.root).some((n: string) => n.startsWith('.specpilot-setup-'))).toBe(false);

    const f = makeEmpty();
    const other = await startSpecServer([f.root, p.root], 0, 'x');
    try {
      const port2 = (other.server.address() as AddressInfo).port;
      const token2 = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port2, '/')).body)![1];
      const h = (over: Record<string, string> = {}) => ({ Host: `127.0.0.1:${port2}`, Origin: `http://127.0.0.1:${port2}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token2, ...over });
      jest.spyOn(specSetup, 'setupProject').mockRejectedValueOnce(new Error('boom'));
      const broken = await post(port2, ANSWERS, h(), '/api/setup?project=0');
      expect(broken.status).toBe(500);
      writeFileSync(join(p.root, '.specs/planning/tasks.md'), MOVE_TASKS);
      const hashOf = createHash('sha256').update(readFileSync(join(p.root, '.specs/planning/tasks.md'))).digest('hex');
      const move = await post(port2, JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }), h({ 'If-Match': hashOf }), '/api/tasks/move?project=1');
      expect(move.status).toBe(200);
    } finally {
      await other.close();
      f.cleanup();
    }
  });

  it('a setup and a task move in another project both succeed, one after the other', async () => {
    writeFileSync(join(p.root, '.specs/planning/tasks.md'), MOVE_TASKS);
    const h = createHash('sha256').update(readFileSync(join(p.root, '.specs/planning/tasks.md'))).digest('hex');
    const [setup, move] = await Promise.all([
      post(port, ANSWERS, good(), '/api/setup?project=0'),
      post(port, JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }), good({ 'If-Match': h }), '/api/tasks/move?project=1'),
    ]);
    expect([setup.status, move.status]).toEqual([200, 200]);
    expect(readFileSync(join(p.root, '.specs/planning/tasks.md'), 'utf-8')).not.toBe(MOVE_TASKS);
    expect(existsSync(join(e.root, '.specs/planning/tasks.md'))).toBe(true);
  });

  it('answers 404 for a root that was not named on the command line (the current-directory default)', async () => {
    const d = makeEmpty();
    const unnamed = await startSpecServer([d.root], 0, 'x', { named: [false] });
    try {
      const port2 = (unnamed.server.address() as AddressInfo).port;
      const token2 = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port2, '/')).body)![1];
      expect((await hit(port2, '/api/setup?project=0')).status).toBe(404);
      const res = await post(port2, ANSWERS, { Host: `127.0.0.1:${port2}`, Origin: `http://127.0.0.1:${port2}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token2 }, '/api/setup?project=0');
      expect(res.status).toBe(404);
      expect(specSetup.specsMissing(d.root)).toBe(true);
    } finally {
      await unnamed.close();
      d.cleanup();
    }
  });

  it('a .specs/ created outside the server flips project.specs', async () => {
    write(e.root, '.specs/project/project.yaml', 'name: "By hand"\n');
    expect(JSON.parse((await hit(port, '/api/specs?project=0')).body).project.specs).toBe(true);
    expect((await hit(port, '/api/setup?project=0')).status).toBe(404);
  });
});

describe('guided setup with --read-only', () => {
  it('has no setup routes, reports project.specs false and no token', async () => {
    const e = makeEmpty();
    const spec = await startSpecServer([e.root], 0, 'x', { readOnly: true });
    try {
      const port = (spec.server.address() as AddressInfo).port;
      expect((await hit(port, '/')).body).not.toContain('specpilot-token" content=');
      expect(JSON.parse((await hit(port, '/api/specs')).body).project.specs).toBe(false);
      expect((await hit(port, '/api/setup?project=0')).status).toBe(405);
      const res = await post(port, ANSWERS, { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64) }, '/api/setup?project=0');
      expect(res.status).toBe(405);
      expect(specSetup.specsMissing(e.root)).toBe(true);
    } finally {
      await spec.close();
      e.cleanup();
    }
  });
});

describe('serveCommand with a folder that has no .specs/ (BL-055)', () => {
  let a: ReturnType<typeof makeProject>;
  let e: ReturnType<typeof makeEmpty>;
  let exit: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    a = makeProject();
    e = makeEmpty();
    logs = [];
    exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation((...x: unknown[]) => void logs.push(x.join(' ')));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    a.cleanup();
    e.cleanup();
  });

  async function serveAndStop(folders: string[], options: { readOnly?: boolean } = {}): Promise<{ port: number; out: string[] }> {
    const probe = await startSpecServer([a.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    let exited: (code: number) => void;
    const done = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);
    await serveCommand(folders, { port: String(port), ...options });
    const out = stripVTControlCharacters(logs.join('\n')).split('\n');
    process.emit('SIGINT');
    expect(await done).toBe(0);
    return { port, out };
  }

  it('starts, names the folder, and offers setup there and not in the project that has .specs/', async () => {
    const real = realpathSync(e.root);
    const { port, out } = await serveAndStop([a.root, e.root]);
    expect(out.slice(0, 5)).toEqual([
      `SpecPilot is serving 2 projects at http://127.0.0.1:${port}`,
      `  0  ${realpathSync(a.root)}`,
      `  1  ${real}`,
      `No .specs/ in ${real} yet. Open the page to set it up.`,
      'Tasks can be moved in the page (only .specs/planning/tasks.md is written), and a folder without .specs/ can be set up there (new files only). Open pages update when a spec file changes. Press Ctrl+C to stop.',
    ]);
  });

  it('with --read-only says only that the folder has no .specs/', async () => {
    const real = realpathSync(e.root);
    const { port, out } = await serveAndStop([e.root], { readOnly: true });
    expect(out.slice(0, 3)).toEqual([
      `SpecPilot is serving ${real} at http://127.0.0.1:${port}`,
      `No .specs/ in ${real}.`,
      'Read-only: nothing will be written. Open pages update when a spec file changes. Press Ctrl+C to stop.',
    ]);
  });

  it('prints the 2.6.0 lines unchanged when every folder has .specs/', async () => {
    const { port, out } = await serveAndStop([a.root]);
    expect(out.slice(0, 2)).toEqual([
      `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`,
      'Tasks can be moved in the page (only .specs/planning/tasks.md is written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
    ]);
  });

  it('removes only marked stale staging folders at startup, and none with --read-only', async () => {
    const marked = (root: string, name: string) => {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, STAGING_MARKER), 'm\n');
      writeFileSync(join(root, name, 'CLAUDE.md'), 'staged\n');
    };
    marked(e.root, '.specpilot-setup-0123456789ab');
    marked(a.root, '.specpilot-setup-fedcba987654'); // in a project that has .specs/: removed too
    mkdirSync(join(e.root, '.specpilot-setup-ffffffffffff')); // unmarked
    writeFileSync(join(e.root, '.specpilot-setup-eeeeeeeeeeee'), 'a file\n');
    const { out } = await serveAndStop([a.root, e.root]);
    const re = realpathSync(e.root);
    const ra = realpathSync(a.root);
    expect(out.filter(l => l.startsWith('Removed '))).toEqual([
      `Removed ${ra}/.specpilot-setup-fedcba987654/, left by an interrupted setup.`,
      `Removed ${re}/.specpilot-setup-0123456789ab/, left by an interrupted setup.`,
    ]);
    expect(existsSync(join(e.root, '.specpilot-setup-0123456789ab'))).toBe(false);
    expect(existsSync(join(e.root, '.specpilot-setup-ffffffffffff'))).toBe(true);
    expect(existsSync(join(e.root, '.specpilot-setup-eeeeeeeeeeee'))).toBe(true);

    marked(e.root, '.specpilot-setup-0123456789ab');
    logs.length = 0;
    const { out: ro } = await serveAndStop([e.root], { readOnly: true });
    expect(ro.some(l => l.startsWith('Removed '))).toBe(false);
    expect(existsSync(join(e.root, '.specpilot-setup-0123456789ab'))).toBe(true);
  });

  it('skips a stale staging folder it cannot remove, prints nothing for it, and starts', async () => {
    if (process.getuid && process.getuid() === 0) return; // root ignores folder permissions
    mkdirSync(join(e.root, '.specpilot-setup-0123456789ab'));
    writeFileSync(join(e.root, '.specpilot-setup-0123456789ab', STAGING_MARKER), 'm\n');
    chmodSync(join(e.root, '.specpilot-setup-0123456789ab'), 0o500); // its contents cannot be unlinked
    try {
      const { out } = await serveAndStop([e.root]);
      expect(out.some(l => l.startsWith('Removed '))).toBe(false);
      expect(out[0]).toContain('SpecPilot is serving');
      expect(existsSync(join(e.root, '.specpilot-setup-0123456789ab', STAGING_MARKER))).toBe(true);
    } finally {
      chmodSync(join(e.root, '.specpilot-setup-0123456789ab'), 0o700);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Project registry and opening a folder from the page (BL-067). Every test runs under the temp HOME.

describe('project registry over HTTP', () => {
  let p: ReturnType<typeof makeProject>;
  let q: ReturnType<typeof makeProject>;
  let e: ReturnType<typeof makeEmpty>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    ...over,
  });
  const open = (path: unknown, headers = good()) => post(port, JSON.stringify({ path }), headers, '/api/projects');
  const remove = (path: unknown) => post(port, JSON.stringify({ path }), good(), '/api/projects/remove');
  const list = async () => JSON.parse((await hit(port, '/api/projects')).body);
  const start = async (opts: { readOnly?: boolean; named?: boolean[] } = {}) => {
    spec = await startSpecServer([p.root], 0, '0.0.0-test', { registry: regFile(), ...opts });
    port = (spec.server.address() as AddressInfo).port;
    const page = (await hit(port, '/')).body;
    token = (/<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec(page) || [])[1];
  };
  const seed = (entries: RegistryEntry[]) => writeRegistry(regFile(), entries);
  const fileSha = () => createHash('sha256').update(readFileSync(regFile())).digest('hex');
  const tmpFiles = () => (existsSync(join(HOME, '.specpilot')) ? readdirSync(join(HOME, '.specpilot')).filter(n => n.endsWith('.tmp')) : []);

  beforeEach(async () => {
    p = makeProject();
    q = makeProject();
    e = makeEmpty();
    await start();
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
    q.cleanup();
    e.cleanup();
  });

  it('GET /api/projects with no file lists nothing and creates nothing', async () => {
    expect(await list()).toEqual({ path: '~/.specpilot/projects.json', entries: [], error: null });
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    expect((await hit(port, '/api/projects?project=5')).status).toBe(200); // the parameter is ignored
  });

  it('opens a folder with .specs/ as the next index, serves it fully, records it, and leaves project 0 untouched', async () => {
    const before = JSON.parse((await hit(port, '/api/specs')).body);
    delete before.projects; // `projects` grows by one; the rest must not change
    const t0 = Date.now();
    const r = await open(q.root);
    expect(r.status).toBe(200);
    expect(r.json.project).toBe(1);
    expect(r.json.specs.project.root).toBe(realpathSync(q.root));
    expect(r.json.specs.projects).toHaveLength(2);
    expect(r.json.registry.error).toBeNull();
    expect(r.json.registry.entries).toHaveLength(1);
    const { projects: after, ...rest } = JSON.parse((await hit(port, '/api/specs')).body);
    expect(rest).toEqual(before);
    expect(after).toHaveLength(2);
    expect(JSON.parse((await hit(port, '/api/specs?project=1')).body).project.root).toBe(realpathSync(q.root));
    expect((await hit(port, '/api/file?project=1&p=CLAUDE.md')).status).toBe(200);
    const es = await openEvents(port, undefined, '/api/events?project=1');
    writeFileSync(join(q.root, '.specs/planning/tasks.md'), '---\nfileID: TASKS-001\n---\n\n# Tasks\n\n## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | Changed |\n');
    expect(await es.waitFor(/event: change\ndata: (.*)\n/)).toContain('.specs/planning/tasks.md');
    es.close();
    // the registry file: 0600 in a 0700 folder, one entry, pinned false, lastOpened in this test's window
    expect(statSync(join(HOME, '.specpilot')).mode & 0o777).toBe(0o700);
    expect(statSync(regFile()).mode & 0o777).toBe(0o600);
    const reg = readRegistry(regFile());
    expect(reg.entries).toHaveLength(1);
    expect(reg.entries![0]).toMatchObject({ path: realpathSync(q.root), pinned: false });
    expect(Date.parse(reg.entries![0].lastOpened)).toBeGreaterThanOrEqual(t0 - 1000);
    expect(tmpFiles()).toEqual([]);
    // a move in project 1 against its own hash
    const hash = JSON.parse((await hit(port, '/api/specs?project=1')).body).tasks.sha256;
    const mv = await post(port, JSON.stringify({ id: 'BL-001', toSection: 'currentSprint', toIndex: 0 }), { ...good(), 'If-Match': hash }, '/api/tasks/move?project=1');
    expect(mv.status).toBe(422); // no Current Sprint table in the fixture: refused, which proves the route reached project 1
    expect(mv.json.error).toContain('Current Sprint');
  });

  it('opens a folder without .specs/ and offers guided setup there (it counts as named)', async () => {
    const r = await open(e.root);
    expect(r.status).toBe(200);
    expect(r.json.specs.project.specs).toBe(false);
    const qs = await hit(port, '/api/setup?project=1');
    expect(qs.status).toBe(200);
    expect(JSON.parse(qs.body).questions.some((x: { key: string }) => x.key === 'ide')).toBe(true);
    const setup = await post(port, ANSWERS, good(), '/api/setup?project=1');
    expect(setup.status).toBe(200);
    expect(existsSync(join(e.root, '.specs/project/project.yaml'))).toBe(true);
  });

  it('expands ~/ against the temp home', async () => {
    mkdirSync(join(HOME, 'x', '.specs'), { recursive: true });
    const r = await open('~/x');
    expect(r.status).toBe(200);
    expect(r.json.specs.project.root).toBe(join(HOME, 'x'));
    expect((await list()).entries[0].root).toBe('~/x');
  });

  it('lists entries in display order with the served index, ~/ roots and exists', async () => {
    mkdirSync(join(HOME, 'gone'));
    seed([{ path: join(HOME, 'gone'), lastOpened: '2026-10-01T10:00:00.000Z', pinned: false }, { path: '/pinned-elsewhere', lastOpened: '2026-09-01T10:00:00.000Z', pinned: true }]);
    await open(q.root);
    rmSync(join(HOME, 'gone'), { recursive: true });
    const l = await list();
    expect(l.entries.map((x: { path: string }) => x.path)).toEqual(['/pinned-elsewhere', realpathSync(q.root), join(HOME, 'gone')]);
    expect(l.entries[1]).toMatchObject({ project: 1, exists: true });
    expect(l.entries[2]).toMatchObject({ root: '~/gone', project: null, exists: false });
    expect(l.entries[0]).toMatchObject({ pinned: true, project: null, exists: false });
  });

  it.each([
    ['the same folder again', () => realpathSync(q.root), 1],
    ['its symbolic link', () => join(q.root, '..', 'qlink'), 1],
    ["project 0's folder", () => p.root, 0],
  ])('refuses %s with 409 and the index, registry unchanged', async (_what, path, index) => {
    await open(q.root);
    try { symlinkSync(q.root, join(q.root, '..', 'qlink')); } catch { /* exists */ }
    const before = fileSha();
    const r = await open(path());
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: expect.stringContaining(`is already open as project ${index}.`), project: index });
    expect(fileSha()).toBe(before);
    expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(2);
  });

  it('refuses the current-directory default (served from its realpath) as already open', async () => {
    // a server whose root 0 came in without realpath, as the cwd default did until BL-067: the command now resolves it
    const r = await open(realpathSync(p.root));
    expect(r.status).toBe(409);
    expect(r.json.project).toBe(0);
  });

  it.each([
    ['the home folder', () => HOME],
    ['~', () => '~'],
    ['/', () => '/'],
    ['a regular file', () => join(p.root, 'CLAUDE.md')],
    ['a missing folder', () => join(p.root, 'nope')],
    ['a relative path', () => 'relative/path'],
    ['an empty string', () => ''],
    ['a path with NUL', () => '/tmp/a\0b'],
    ['4097 characters', () => '/' + 'a'.repeat(4096)],
    ['a non-string', () => 5],
  ])('refuses %s with 422 and creates no registry file', async (_what, path) => {
    const r = await open(path());
    expect(r.status).toBe(422);
    expect(typeof r.json.error).toBe('string');
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(1);
  });

  it.each([
    ['an array body', '[]'],
    ['a missing key', '{}'],
    ['an extra key', JSON.stringify({ path: '/tmp', x: 1 })],
  ])('refuses %s with 422', async (_what, body) => {
    const r = await post(port, body, good(), '/api/projects');
    expect(r.status).toBe(422);
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
  });

  it('refuses a body that is not JSON with 400', async () => {
    expect((await post(port, '{nope', good(), '/api/projects')).status).toBe(400);
  });

  it.each([
    ['no token', { 'X-SpecPilot-Token': undefined }, 403],
    ['a wrong token', { 'X-SpecPilot-Token': 'f'.repeat(64) }, 403],
    ['a short token', { 'X-SpecPilot-Token': 'abc' }, 403],
    ['a foreign Origin', { Origin: 'http://evil.example' }, 403],
    ['no Origin', { Origin: undefined }, 403],
    ['Host localhost with Origin 127.0.0.1', { Host: 'localhost:PORT' }, 403],
    ['a foreign Host', { Host: 'evil.example:PORT', Origin: 'http://evil.example:PORT' }, 403],
    ['a form content type', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
    ['a text content type', { 'Content-Type': 'text/plain' }, 415],
  ])('refuses %s on open and remove with no registry file created', async (_what, over, status) => {
    const h = Object.fromEntries(Object.entries(over).map(([k, v]) => [k, typeof v === 'string' ? v.replace('PORT', String(port)) : v]));
    expect((await open(q.root, good(h))).status).toBe(status);
    expect((await post(port, JSON.stringify({ path: q.root }), good(h), '/api/projects/remove')).status).toBe(status);
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(1);
  });

  it('refuses a 17 KB body with 413', async () => {
    const body = JSON.stringify({ path: '/' + 'a'.repeat(17 * 1024) });
    expect((await post(port, body, good({ 'Content-Length': String(Buffer.byteLength(body)) }), '/api/projects')).status).toBe(413);
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
  });

  it('two simultaneous opens get indices 1 and 2 and both are recorded and served', async () => {
    const [a, b] = await Promise.all([open(q.root), open(e.root)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json.project, b.json.project].sort()).toEqual([1, 2]);
    expect(readRegistry(regFile()).entries!.map(x => x.path).sort()).toEqual([realpathSync(e.root), realpathSync(q.root)].sort());
    expect(JSON.parse((await hit(port, '/api/specs?project=2')).body).projects).toHaveLength(3);
    expect((await list()).entries).toHaveLength(2);
  });

  it(`refuses the open past ${MAX_PROJECTS} served projects with 409 and no registry change`, async () => {
    const base = mkdtempSync(join(os.tmpdir(), 'specpilot-many-'));
    try {
      for (let i = 1; i < MAX_PROJECTS; i++) {
        mkdirSync(join(base, `p${i}`, '.specs'), { recursive: true });
        expect((await open(join(base, `p${i}`))).status).toBe(200);
      }
      expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(MAX_PROJECTS);
      const before = fileSha();
      const r = await open(q.root);
      expect(r.status).toBe(409);
      expect(r.json).toEqual({ error: `This server already serves ${MAX_PROJECTS} projects. Start another specpilot serve for more.` });
      expect(fileSha()).toBe(before);
      expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(MAX_PROJECTS);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('the 51st entry drops the oldest unpinned one and keeps a seeded pinned one', async () => {
    const entries: RegistryEntry[] = [];
    for (let i = 0; i < 50; i++) entries.push({ path: `/seed/p${i}`, lastOpened: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), pinned: i === 0 });
    seed(entries);
    expect((await open(q.root)).status).toBe(200);
    const paths = readRegistry(regFile()).entries!.map(x => x.path);
    expect(paths).toHaveLength(50);
    expect(paths).toContain('/seed/p0');
    expect(paths).not.toContain('/seed/p1');
    expect(paths).toContain(realpathSync(q.root));
  });

  it('removes an entry without touching the folder, and the served project stays served', async () => {
    await open(q.root);
    const tree = snapshot(q.root);
    const r = await remove(realpathSync(q.root));
    expect(r.status).toBe(200);
    expect(r.json.entries).toEqual([]);
    expect(snapshot(q.root)).toEqual(tree);
    expect(readRegistry(regFile()).entries).toEqual([]);
    expect((await hit(port, '/api/specs?project=1')).status).toBe(200);
    expect(tmpFiles()).toEqual([]);
  });

  it.each([
    ['a path not in the list', () => '/not/in/list'],
    ['a ~/ form of a stored path', () => '~/' + 'x'],
    ['a relative path', () => 'x'],
  ])('remove of %s → 422, list unchanged', async (_what, path) => {
    mkdirSync(join(HOME, 'x', '.specs'), { recursive: true });
    await open(join(HOME, 'x'));
    const before = fileSha();
    const r = await remove(path());
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('That folder is not in the list.');
    expect(fileSha()).toBe(before);
  });

  it('with a corrupt file: GET says why, an open still serves the folder, remove is refused, the file is byte-identical', async () => {
    mkdirSync(join(HOME, '.specpilot'));
    writeFileSync(regFile(), '{broken');
    const before = fileSha();
    const l = await list();
    expect(l.entries).toEqual([]);
    expect(l.error).toMatch(/not valid JSON/);
    const r = await open(q.root);
    expect(r.status).toBe(200);
    expect(r.json.project).toBe(1);
    expect(r.json.registry.error).toMatch(/not valid JSON/);
    expect((await hit(port, '/api/specs?project=1')).status).toBe(200);
    const rm = await remove(q.root);
    expect(rm.status).toBe(422);
    expect(rm.json.error).toMatch(/not valid JSON/);
    expect(fileSha()).toBe(before);
    expect(tmpFiles()).toEqual([]);
  });

  it('with a symlinked projects.json: refused, never followed', async () => {
    const target = join(HOME, 'elsewhere.json');
    writeFileSync(target, JSON.stringify({ version: 1, projects: [] }));
    mkdirSync(join(HOME, '.specpilot'));
    symlinkSync(target, regFile());
    const r = await open(q.root);
    expect(r.status).toBe(200);
    expect(r.json.registry.error).toMatch(/symbolic link/);
    expect(readFileSync(target, 'utf-8')).toBe(JSON.stringify({ version: 1, projects: [] }));
  });

  it('refuses a folder whose allowlisted file cannot be read (422, nothing served or recorded), and the lock survives', async () => {
    if (process.getuid && process.getuid() === 0) return; // root reads anything
    chmodSync(join(q.root, '.specs/planning/tasks.md'), 0o000);
    try {
      const r = await open(q.root);
      expect(r.status).toBe(422);
      expect(r.json.error).toMatch(/^This folder could not be read: /);
      expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(1);
      expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    } finally {
      chmodSync(join(q.root, '.specs/planning/tasks.md'), 0o644);
    }
    expect((await open(e.root)).status).toBe(200); // the next write under the lock is answered
  });

  it('answers 500 and keeps the lock usable when a write under the lock throws', async () => {
    const spy = jest.spyOn(specPoller, 'createPoller').mockImplementationOnce(() => { throw new Error('boom'); });
    try {
      const r = await open(q.root);
      expect(r.status).toBe(500);
      expect(r.json).toEqual({ error: 'The server could not finish this request.' });
      expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(1); // nothing half-opened
    } finally {
      spy.mockRestore();
    }
    const next = await open(e.root);
    expect(next.status).toBe(200);
    expect(next.json.project).toBe(1);
  });

  it('leaves no timer after close() with an opened project that had a stream', async () => {
    await open(q.root);
    const es = await openEvents(port, undefined, '/api/events?project=1');
    await until(() => spec.streams() === 1);
    const before = timerCount();
    es.close();
    await spec.close();
    expect(timerCount()).toBeLessThanOrEqual(before);
    spec = await startSpecServer([p.root], 0, 'x', { registry: regFile() }); // so afterEach can close something
  });
});

describe('project registry with --read-only', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  beforeEach(async () => {
    p = makeProject();
    mkdirSync(join(HOME, '.specpilot'));
    writeFileSync(regFile(), '{broken'); // never read: nothing may complain
    spec = await startSpecServer([p.root], 0, 'x', { readOnly: true, registry: regFile() });
    port = (spec.server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('answers 405 with an empty Allow on all three routes and puts no token in the page', async () => {
    for (const [path, method] of [['/api/projects', 'GET'], ['/api/projects', 'POST'], ['/api/projects/remove', 'POST']] as const) {
      const r = await hit(port, path, { method });
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('');
    }
    expect((await hit(port, '/')).body).not.toContain('specpilot-token" content=');
    expect(readFileSync(regFile(), 'utf-8')).toBe('{broken');
  });
});

describe('serveCommand and the registry (BL-067)', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
  let exit: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    a = makeProject();
    b = makeProject();
    logs = [];
    exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation((...x: unknown[]) => void logs.push(x.join(' ')));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    a.cleanup();
    b.cleanup();
  });

  async function serveAndStop(folders: string[], options: { readOnly?: boolean } = {}): Promise<{ port: number; out: string[] }> {
    const probe = await startSpecServer([a.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    let exited: (code: number) => void;
    const done = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);
    await serveCommand(folders, { port: String(port), ...options });
    const out = stripVTControlCharacters(logs.join('\n')).split('\n');
    process.emit('SIGINT');
    expect(await done).toBe(0);
    return { port, out };
  }

  it('creates no registry file when there is none, and prints the registry line after the hint', async () => {
    const { port, out } = await serveAndStop([a.root]);
    expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    expect(out.slice(0, 3)).toEqual([
      `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`,
      'Tasks can be moved in the page (only .specs/planning/tasks.md is written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
      'Folders opened in the page are remembered in ~/.specpilot/projects.json.',
    ]);
  });

  it('records the named folders when the file already exists, keeping other entries', async () => {
    writeRegistry(regFile(), [{ path: '/other', lastOpened: '2026-01-01T00:00:00.000Z', pinned: false }]);
    const t0 = Date.now();
    await serveAndStop([a.root, b.root]);
    const reg = readRegistry(regFile());
    expect(reg.entries!.map(x => x.path)).toEqual(['/other', realpathSync(a.root), realpathSync(b.root)]);
    for (const x of reg.entries!.slice(1)) expect(Date.parse(x.lastOpened)).toBeGreaterThanOrEqual(t0 - 1000);
    expect(reg.entries![0].lastOpened).toBe('2026-01-01T00:00:00.000Z');
  });

  it('with --read-only leaves an existing file byte-identical and prints no registry line', async () => {
    writeRegistry(regFile(), [{ path: '/other', lastOpened: '2026-01-01T00:00:00.000Z', pinned: false }]);
    const before = createHash('sha256').update(readFileSync(regFile())).digest('hex');
    const { out } = await serveAndStop([a.root], { readOnly: true });
    expect(createHash('sha256').update(readFileSync(regFile())).digest('hex')).toBe(before);
    expect(out.some(l => l.includes('projects.json'))).toBe(false);
  });

  it('prints the refusal line once for a corrupt file and starts', async () => {
    mkdirSync(join(HOME, '.specpilot'));
    writeFileSync(regFile(), '{broken');
    const { out } = await serveAndStop([a.root]);
    const lines = out.filter(l => l.includes('could not be read'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^~\/\.specpilot\/projects\.json could not be read \(.*not valid JSON\)\. It was left as it is; projects opened in this run are not remembered\.$/);
    expect(out[0]).toContain('SpecPilot is serving');
    expect(readFileSync(regFile(), 'utf-8')).toBe('{broken');
  });

  it('serves the current-directory default from its realpath', async () => {
    const link = join(a.root, '..', 'cwdlink');
    symlinkSync(a.root, link);
    const cwd = process.cwd();
    process.chdir(link);
    try {
      const { port, out } = await serveAndStop([]);
      expect(out[0]).toBe(`SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`);
    } finally {
      process.chdir(cwd);
    }
  });
});
