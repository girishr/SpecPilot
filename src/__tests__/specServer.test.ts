import { createHash } from 'crypto';
import { createServer, request } from 'http';
import { AddressInfo } from 'net';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';
import * as os from 'os';
import { buildSpecsPayload, displayRoot, isAllowedHost, MAX_EVENT_STREAMS, readBranch, SpecServer, startSpecServer } from '../utils/specServer';
import { resolveAllowedPath } from '../utils/specPaths';
import { ARCHIVE_STALE_ERROR, COMPLETED_BY_HAND, completedArchiveStatus, MOVES, nextTaskId, NOTHING_TO_ARCHIVE_ERROR, nothingPastKeepError, REVIEW_STALE_ERROR, FIELDS_STALE_ERROR } from '../utils/taskMover';
import * as validator from '../utils/specValidator';
import { planCompletedArchive } from '../utils/specArchiver';
import * as specPoller from '../utils/specPoller';
import { watchedFiles } from '../utils/specPoller';
import { serveCommand, STOP_CLONE_MS } from '../commands/serve';
import * as gitClone from '../utils/gitClone';
import * as specServerModule from '../utils/specServer';
import * as specSlash from '../utils/slashCommandGenerator';
import { STAGING_MARKER } from '../utils/specSetup';
import { REVIEW_INSTRUCTIONS, SETUP_INSTRUCTIONS } from '../utils/mcpLocal';
import { MAX_PROJECTS, readRegistry, registryPath, RegistryEntry, writeRegistry } from '../utils/projectRegistry';
import { initOptions, InitAnswers } from '../utils/initQuestions';
import { render } from '../core/render';
import { OPTIONAL_FIELD_LIMITS } from '../core/chatFlow';
import { ALL_FIELDS } from './fixtures/allFields';
import { SpecBackfiller } from '../utils/specBackfiller';
import { fillReleasedSkill, KNOWN_SKILL_TEMPLATES } from '../core/agentConfig';

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

describe('project.cursor (BL-PM-010): the Cursor rules file checked through the same guard, never served', () => {
  const RULES = '.cursor/rules/specpilot.mdc';
  let p: ReturnType<typeof makeProject>;
  beforeEach(() => (p = makeProject()));
  afterEach(() => p.cleanup());
  const cursor = () => buildSpecsPayload(p.root, '0.0.0-test').project.cursor;

  it('is true for the file and false without it', () => {
    expect(cursor()).toBe(false);
    write(p.root, RULES, '---\nalwaysApply: true\n---\n');
    expect(cursor()).toBe(true);
  });

  it('is false for a folder at that path', () => {
    mkdirSync(join(p.root, RULES), { recursive: true });
    expect(cursor()).toBe(false);
  });

  it('is false through a symlinked .cursor or .cursor/rules folder, and for a file linked to elsewhere', () => {
    write(p.outside, 'cursor/rules/specpilot.mdc', 'x\n');
    symlinkSync(join(p.outside, 'cursor'), join(p.root, '.cursor'));
    expect(cursor()).toBe(false);
    rmSync(join(p.root, '.cursor'));
    mkdirSync(join(p.root, '.cursor'));
    symlinkSync(join(p.outside, 'cursor', 'rules'), join(p.root, '.cursor', 'rules'));
    expect(cursor()).toBe(false);
    rmSync(join(p.root, '.cursor', 'rules'));
    mkdirSync(join(p.root, '.cursor', 'rules'));
    symlinkSync(join(p.root, 'CLAUDE.md'), join(p.root, RULES));
    expect(cursor()).toBe(false);
  });

  it('leaves the allowlist as it was: no other path passes with that one path allowed, the file is not served, listed or watched', async () => {
    write(p.root, RULES, 'x\n');
    expect(resolveAllowedPath(p.root, RULES)).toBeNull();
    expect(resolveAllowedPath(p.root, RULES, [RULES])).toBe(realpathSync(join(p.root, RULES)));
    expect(resolveAllowedPath(p.root, 'CLAUDE.md', [RULES])).toBeNull();
    expect(resolveAllowedPath(p.root, '.cursor/rules/../rules/specpilot.mdc', [RULES])).toBeNull();
    expect(resolveAllowedPath(p.root, 'CLAUDE.md')).not.toBeNull();
    expect(watchedFiles(p.root)).not.toContain(RULES);
    const spec = await startSpecServer([p.root], 0, '0.0.0-test');
    try {
      const port = (spec.server.address() as AddressInfo).port;
      expect((await hit(port, '/api/file?p=' + encodeURIComponent(RULES))).status).toBe(404);
      const body = JSON.parse((await hit(port, '/api/specs')).body);
      expect(body.project.cursor).toBe(true);
      expect(body.nav.instructions.map((f: { path: string }) => f.path)).not.toContain(RULES);
    } finally {
      await spec.close();
    }
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

  it('tasks.nextIds are the IDs POST /api/tasks/new would assign now (BL-TB-05)', () => {
    const archive = readFileSync(join(REPO, '.specs/planning/tasks-archive.md'), 'utf-8');
    expect(payload.tasks!.nextIds).toEqual({ backlog: nextTaskId('BL', [tasksMd.join('\n'), archive]), currentSprint: nextTaskId('CS', [tasksMd.join('\n'), archive]) });
    expect(payload.tasks!.nextIds!.backlog).toMatch(/^BL-\d{3,}$/);
  });

  it('tasks.moves is the move table the server enforces (BL-TB-11)', () => {
    expect(payload.tasks!.moves).toBe(MOVES);
    expect(payload.tasks!.moves).toEqual({ backlog: ['currentSprint'], currentSprint: ['backlog', 'review'], review: ['currentSprint'] }); // BL-113
  });

  it('tasks.archive is the Completed section\'s lines and what POST /api/tasks/archive would move now with force (BL-TB-06)', () => {
    const plan = planCompletedArchive(tasksMd, true);
    expect(payload.tasks!.archive).toEqual({ lines: expect.any(Number), rows: plan ? plan.end - plan.start : 0 });
    expect(payload.tasks!.archive).toEqual(completedArchiveStatus(tasksMd.join('\n')));
    expect(payload.tasks!.archive.lines).toBeGreaterThan(0);
  });

  it('has project metadata, per-file metadata, tasks and the nav tree', () => {
    expect(Object.keys(payload).sort()).toEqual(['files', 'nav', 'project', 'specpilotVersion', 'tasks']);
    expect(payload.project.name).toBe('SpecPilot SDD CLI');
    expect(payload.project.root).toBe(REPO);
    expect(payload.specpilotVersion).toBe('0.0.0-test'); // top level since BL-080
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
      ...t.review.map(r => `| ${r.id} | ${r.description} |`),
      ...t.completed.map(r => `| ${r.num} | ${r.id} | ${r.description} |`),
      ...t.wontDo.map(r => `| ${r.id} | ${r.description} | ${r.reason} |`),
    ];
    for (const line of rebuilt) expect(tasksMd).toContain(line);
    // ...and no table row in those sections was dropped: the rows between each served heading and the next `## `,
    // not every row in the file (BL-115; the five served headings since BL-113).
    const bodyRows = ['## Backlog', '## Current Sprint', '## Review', '## Completed', "## Won't do"].flatMap(heading => {
      const start = tasksMd.findIndex(l => l.trim() === heading);
      const end = tasksMd.findIndex((l, i) => i > start && /^## /.test(l));
      return tasksMd.slice(start + 1, end < 0 ? undefined : end).filter(l => /^\| (BL|CS|\d)/.test(l));
    });
    expect(bodyRows.length).toBeGreaterThan(0);
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
    ['/assets/OFL-Sixtyfour.txt', 404, 'text/plain; charset=utf-8'], // shipped in ui/ for the wordmark's licence, never served (BL-PM-014)
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

  it('loads no font: the wordmark is outlines, and its OFL licence ships in ui/ (BL-PM-014)', () => {
    const ui = join(__dirname, '../../ui');
    for (const f of readdirSync(ui)) {
      expect(f).not.toMatch(/\.(woff2?|ttf|otf|eot)$/i);
      expect(readFileSync(join(ui, f), 'utf-8')).not.toMatch(/@font-face|fonts\.googleapis|fonts\.gstatic/);
    }
    const ofl = readFileSync(join(ui, 'OFL-Sixtyfour.txt'), 'utf-8');
    expect(ofl.startsWith('Copyright 2021 The Sixtyfour Project Authors (https://github.com/jenskutilek/homecomputer-fonts)\n')).toBe(true);
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
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

  it('starts with no project open when the current directory has no .specs/, and creates no registry file (BL-080)', async () => {
    const empty = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-empty-')));
    process.chdir(empty);
    try {
      const { port, out } = await runAndStop({});
      const lines = stripVTControlCharacters(out).split('\n');
      expect(lines.slice(0, 5)).toEqual([
        `SpecPilot is running at http://127.0.0.1:${port} with no project open.`,
        `No .specs/ folder in ${empty}. Open a project from the page, or run specpilot serve <folder>.`,
        'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
        'Projects are remembered in ~/.specpilot/projects.json.',
        `MCP endpoint: http://127.0.0.1:${port}/mcp`,
      ]);
      expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
    } finally {
      process.chdir(p.root);
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('with --read-only still refuses to start without .specs/ in the current directory, and names `specpilot serve .` (BL-055, BL-080)', async () => {
    process.chdir(os.tmpdir());
    await expect(serveCommand([], { readOnly: true })).rejects.toThrow('exit 1');
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

  /** Start serveCommand on a free port with `opts`, stop it with Ctrl+C, and return what it printed. */
  const runAndStop = async (opts: Record<string, unknown>) => {
    const probe = await startSpecServer([p.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);
    await serveCommand([], { port: String(port), ...opts });
    process.emit('SIGINT');
    expect(await exitCode).toBe(0);
    return { port, out: logs.join('\n') };
  };

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space', 'a'.repeat(20) + ' ' + 'a'.repeat(20)],
    ['a non-ASCII character', 'é'.repeat(40)],
    ['empty', ''],
  ])('refuses to start with --mcp and a SPECPILOT_MCP_TOKEN of %s (BL-PM-007)', async (_why, value) => {
    process.env.SPECPILOT_MCP_TOKEN = value;
    try {
      await expect(serveCommand([], { mcp: true })).rejects.toThrow('exit 1');
      expect(errors.join('\n')).toContain('SPECPILOT_MCP_TOKEN must be at least 32 characters, with no spaces or other invisible characters.');
    } finally {
      delete process.env.SPECPILOT_MCP_TOKEN;
    }
  });

  it('with --no-mcp ignores SPECPILOT_MCP_TOKEN, prints nothing about MCP and serves no /mcp (BL-105)', async () => {
    process.env.SPECPILOT_MCP_TOKEN = 'short';
    const startSpy = jest.spyOn(specServerModule, 'startSpecServer');
    try {
      const { out } = await runAndStop({ mcp: false });
      expect(out).not.toMatch(/MCP/);
      expect(startSpy.mock.calls[startSpy.mock.calls.length - 1][3]).toMatchObject({ mcp: false, mcpToken: undefined });
    } finally {
      delete process.env.SPECPILOT_MCP_TOKEN;
    }
  });

  it('serves MCP by default: plain specpilot serve prints the endpoint and the config line, as --mcp does (BL-105)', async () => {
    for (const opts of [{}, { mcp: true }]) {
      logs.length = 0;
      const { port, out } = await runAndStop(opts);
      expect(out).toContain(`MCP endpoint: http://127.0.0.1:${port}/mcp\n`);
      expect(out).toMatch(/^Add to your IDE's MCP settings: \{"mcpServers"/m);
    }
  });

  it('without --no-mcp a broken SPECPILOT_MCP_TOKEN stops plain specpilot serve (BL-105)', async () => {
    process.env.SPECPILOT_MCP_TOKEN = 'short';
    try {
      await expect(serveCommand([], { port: '0' })).rejects.toThrow('exit 1');
    } finally {
      delete process.env.SPECPILOT_MCP_TOKEN;
    }
  });

  it('prints the endpoint and the config line with a per-start token (BL-PM-007)', async () => {
    const { port, out } = await runAndStop({ mcp: true });
    expect(out).toContain(`MCP endpoint: http://127.0.0.1:${port}/mcp\n`);
    const line = /Add to your IDE's MCP settings: (\{.*\})$/m.exec(out)![1];
    const cfg = JSON.parse(line).mcpServers['specpilot-local'];
    expect(cfg.type).toBe('http');
    expect(cfg.url).toBe(`http://127.0.0.1:${port}/mcp`);
    expect(cfg.headers['X-SpecPilot-Token']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names ${SPECPILOT_MCP_TOKEN} in the config line instead of printing a token from the environment (BL-PM-007)', async () => {
    process.env.SPECPILOT_MCP_TOKEN = 'x'.repeat(32);
    try {
      const { out } = await runAndStop({ mcp: true });
      expect(out).toContain('"X-SpecPilot-Token":"${SPECPILOT_MCP_TOKEN}"');
      expect(out).not.toContain('x'.repeat(32));
    } finally {
      delete process.env.SPECPILOT_MCP_TOKEN;
    }
  });

  it('says read tools only with --read-only, with or without --mcp (BL-PM-007, BL-105)', async () => {
    for (const opts of [{ readOnly: true }, { mcp: true, readOnly: true }]) {
      const { port, out } = await runAndStop(opts);
      expect(out).toContain(`MCP endpoint: http://127.0.0.1:${port}/mcp (read tools only)`);
    }
  });

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('closes and exits 0 on %s, and then handles none of the three (BL-PM-002)', async signal => {
    const probe = await startSpecServer([p.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    const before = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM'), SIGHUP: process.listenerCount('SIGHUP') };

    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);

    await serveCommand([], { port: String(port) });
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) expect(process.listenerCount(s)).toBe(before[s] + 1);
    process.emit(signal);
    process.emit(signal); // a second one while it stops changes nothing
    expect(await exitCode).toBe(0);
    expect(exit).toHaveBeenCalledTimes(1);
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) expect(process.listenerCount(s)).toBe(before[s]);
    await expect(startSpecServer([p.root], port, 'x').then(s => s.close())).resolves.toBeUndefined(); // the port is free again
  });

  it(`waits at most ${STOP_CLONE_MS / 1000} seconds for a clone's clean-up, ignoring further signals meanwhile, then exits anyway`, async () => {
    const close = jest.fn(async () => {});
    jest.spyOn(specServerModule, 'startSpecServer').mockResolvedValue({ server: {} as never, mcpToken: null, streams: () => 0, pending: () => null, stopClone: () => new Promise<void>(() => {}), close });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => exited(code)) as never);
    const before = process.listenerCount('SIGINT');
    await serveCommand([], { port: '4398' });
    jest.useFakeTimers();
    try {
      process.emit('SIGINT');
      process.emit('SIGINT'); // ignored while the clone is being stopped
      jest.advanceTimersByTime(STOP_CLONE_MS - 1);
      await Promise.resolve();
      expect(exit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
    } finally {
      jest.useRealTimers();
    }
    expect(await exitCode).toBe(0);
    expect(close).not.toHaveBeenCalled(); // it would wait for the same clean-up
    expect(process.listenerCount('SIGINT')).toBe(before);
    expect([...warn.mock.calls, ...logs.map(l => [l])].flat().join('\n') + errors.join('\n')).toContain('The clone could not be cleaned up within 5 seconds. Its folder may be left behind.');
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
  const { resolveRoute, goneHtml, editorUrl, cursorPromptUrl, onboardingPrompt, recentHtml, openOutcome, reloadView, repoNameFromUrl, projectLabel } = require('../../ui/route.js') as {
    editorUrl: (path: string, line?: number, scheme?: string) => string;
    cursorPromptUrl: (text: string) => string | null;
    onboardingPrompt: (src: string) => string;
    repoNameFromUrl: (url: string) => string;
    projectLabel: (p: { name: string | null; root: string }) => string;
    resolveRoute: (hash: string, files: Record<string, unknown>, count?: number, home?: boolean) => { project: number; view: string; sub: string; missing: boolean };
    goneHtml: (path: string) => string;
    recentHtml: (reg: unknown, home: boolean, projects?: unknown[], chev?: string) => string;
    openOutcome: (status: number, res: unknown, created?: boolean | 'cloned') => { project: number | null; specs: unknown; toast: string };
    reloadView: (curView: string, hadSpecs: boolean, hasSpecs: boolean) => string | null;
  };
  const files = { 'quality/tests.md': {}, 'planning/roadmap.md': {} };

  it('builds the card config line exactly as serve prints it (BL-PM-007)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mcpConfigLine } = require('../../ui/route.js') as { mcpConfigLine: (host: string, token: string) => string };
    const line = mcpConfigLine('localhost:4400', 'abc');
    expect(line).toBe('{"mcpServers":{"specpilot-local":{"type":"http","url":"http://localhost:4400/mcp","headers":{"X-SpecPilot-Token":"abc"}}}}');
    expect(line).toBe(require('../commands/serve').mcpConfigLine('localhost:4400', 'abc'));
    expect(mcpConfigLine('127.0.0.1:4321', '${SPECPILOT_MCP_TOKEN}')).toContain('"X-SpecPilot-Token":"${SPECPILOT_MCP_TOKEN}"');
  });

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

  it.each([['', 'home'], ['#board', 'home'], ['#2/board', 'home'], ['#file/quality/tests.md', 'home'], ['#home', 'home'], ['#new', 'new']])(
    'with no project served routes %j to %s (BL-080)',
    (hash, view) => {
      expect(resolveRoute(hash, files, 0, true)).toEqual({ project: 0, view, sub: '', missing: false });
    },
  );

  it('keeps the project 0 fallback with one project, and the boot call\'s Infinity', () => {
    expect(resolveRoute('#board', files, 1, true).view).toBe('board');
    expect(resolveRoute('#3/board', files, Infinity, true)).toEqual({ project: 3, view: 'board', sub: '', missing: false });
  });

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

  it.each([['#new'], ['#new/x'], ['#1/new'], ['#9/new']])('routes %j to the new-project chat when the page has a Home (BL-PM-004), and to Tasks without one', hash => {
    expect(resolveRoute(hash, files, 2, true)).toEqual({ project: 0, view: 'new', sub: '', missing: false });
    expect(resolveRoute(hash, files, 2, false).view).toBe('board');
    expect(resolveRoute('#news', files, 2, true).view).toBe('board');
    for (const had of [true, false]) for (const has of [true, false]) expect(reloadView('new', had, has)).toBeNull();
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
    const rows = recentHtml(REG, true, SERVED, '').split('<div class="row hrow">').filter(Boolean);
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
      expect(r).toMatch(/^<button type="button" class="act" data-path="[^"]*"><div class="body">.*<\/div><\/button>/); // the row's button opens the folder, as before BL-PM-008
      expect(r).not.toMatch(/disabled|pinned|badge|pill/);
    }
  });

  it('builds the vscode://file/ link from an absolute path, each segment encoded (BL-PM-008)', () => {
    expect(editorUrl('/Users/me/dev/SpecPilot')).toBe('vscode://file/Users/me/dev/SpecPilot');
    expect(editorUrl('/Users/me/My Projects/a#b?c%d')).toBe('vscode://file/Users/me/My%20Projects/a%23b%3Fc%25d');
    expect(editorUrl('/Users/me/Développement/日本')).toBe('vscode://file/Users/me/D%C3%A9veloppement/%E6%97%A5%E6%9C%AC');
    expect(editorUrl('/Users/me/a"<b>&c')).toBe('vscode://file/Users/me/a%22%3Cb%3E%26c');
  });

  it('keeps a drive letter\'s ":" and turns "\\" into "/" (Windows, unverified on Windows)', () => {
    expect(editorUrl('C:\\Users\\me\\My Project')).toBe('vscode://file/C:/Users/me/My%20Project');
    expect(editorUrl('d:/work')).toBe('vscode://file/d:/work');
    expect(editorUrl('/srv/C:')).toBe('vscode://file/srv/C%3A'); // only a leading drive segment keeps its ':'
  });

  it('encodes a folder ending in ":12" like any other; VS Code may still read it as a line (README Limits)', () => {
    expect(editorUrl('/Users/me/notes:12')).toBe('vscode://file/Users/me/notes%3A12');
    expect(editorUrl('/Users/me/notes:12:3')).toBe('vscode://file/Users/me/notes%3A12%3A3');
  });

  it('appends a line as ":<line>", not encoded, for the task inspector (BL-PM-008)', () => {
    expect(editorUrl('/Users/me/My Project/.specs/planning/tasks.md', 63)).toBe('vscode://file/Users/me/My%20Project/.specs/planning/tasks.md:63');
    expect(editorUrl('C:\\dev\\p/.specs/planning/tasks.md', 7)).toBe('vscode://file/C:/dev/p/.specs/planning/tasks.md:7');
    expect(editorUrl('/Users/me/notes:12/.specs/planning/tasks.md', 1)).toBe('vscode://file/Users/me/notes%3A12/.specs/planning/tasks.md:1');
    expect(editorUrl('/Users/me/p')).toBe('vscode://file/Users/me/p'); // no line: the folder, as before
  });

  it('builds the cursor://file/ link the same way, the vscode default unchanged (BL-PM-010)', () => {
    expect(editorUrl('/Users/me/My Projé 日本', 0, 'cursor')).toBe('cursor://file/Users/me/My%20Proj%C3%A9%20%E6%97%A5%E6%9C%AC');
    expect(editorUrl('C:\\dev\\a b', 0, 'cursor')).toBe('cursor://file/C:/dev/a%20b');
    expect(editorUrl('/Users/me/p', 0)).toBe('vscode://file/Users/me/p');
  });

  it('builds Cursor\'s prompt link with the whole text encoded, and none past 10,000 characters (BL-PM-010)', () => {
    const text = 'Line one & two #3 50% done\nÉtape 日本';
    const url = cursorPromptUrl(text)!;
    expect(url).toBe('cursor://anysphere.cursor-deeplink/prompt?text=' + encodeURIComponent(text));
    expect(new URL(url).searchParams.get('text')).toBe(text);
    const head = 'cursor://anysphere.cursor-deeplink/prompt?text='.length;
    expect(cursorPromptUrl('a'.repeat(10000 - head))).toHaveLength(10000);
    expect(cursorPromptUrl('a'.repeat(10001 - head))).toBeNull();
    expect(cursorPromptUrl(' '.repeat(3400))).toBeNull(); // counted after encoding: 3400 spaces are 10,200 characters
  });

  it('reads the onboarding prompt below the --- line, or the whole body without one (BL-PM-010)', () => {
    expect(onboardingPrompt('---\ntitle: x\n---\n\n> One-time file.\n\n---\n\nYou are the co-pilot.\nGo.\n')).toBe('You are the co-pilot.\nGo.');
    expect(onboardingPrompt('---\r\ntitle: x\r\n---\r\n\r\nNote\r\n---\r\nPrompt\r\n')).toBe('Prompt');
    expect(onboardingPrompt('# Just a prompt\n\nDo this.\n')).toBe('# Just a prompt\n\nDo this.');
    const r = render(initOptions('', 'demo', NEW_ANSWERS as InitAnswers, '.specs', ALL_FIELDS));
    expect(onboardingPrompt(r.files.find(f => f.path.endsWith('development/onboarding.md'))!.content)).toBe(r.onboardingPrompt.trim());
  });

  it('gives a Home row whose folder exists the Open in VS Code link beside its button, and none when the folder is gone', () => {
    const rows = recentHtml(REG, true, SERVED, '').split('<div class="row hrow">').filter(Boolean);
    expect(rows[0]).toContain('</button><a class="ib" href="vscode://file/h/old" aria-label="Open ~/old in VS Code" title="Open in VS Code"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ext"/></svg></a><button type="button" class="ib" data-remove="/h/old"');
    expect(rows[1]).toContain('href="vscode://file/h/api" aria-label="Open ~/api in VS Code"');
    expect(rows[2]).not.toContain('<a ');
    expect(rows[2]).not.toContain('VS Code');
    expect(rows[2]).toMatch(/<\/button><button type="button" class="ib" data-remove="[^"]*"[^>]*>.*<\/button><\/div>$/);
    for (const r of rows) expect(r.split('</button>')[0]).not.toContain('<a '); // never inside the button
    const odd = recentHtml({ path: 'p', error: null, entries: [{ ...REG.entries[0], path: '/h/a "b" <c> & d', root: '~/a "b" <c> & d' }] }, true, SERVED, '');
    expect(odd).toContain('href="vscode://file/h/a%20%22b%22%20%3Cc%3E%20%26%20d" aria-label="Open ~/a &quot;b&quot; &lt;c&gt; &amp; d in VS Code"');
  });

  it('ends every Home row with a Remove icon button for its path, after the link and outside the open button (BL-PM-014)', () => {
    const rows = recentHtml(REG, true, SERVED, '').split('<div class="row hrow">').filter(Boolean);
    expect(rows[0]).toMatch(/<\/a><button type="button" class="ib" data-remove="\/h\/old" aria-label="Remove ~\/old from list" title="Remove from list"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"\/><\/svg><\/button><\/div>$/);
    expect(rows[2]).toContain('data-remove="/h/&lt;gone&gt;" aria-label="Remove ~/&lt;gone&gt; from list"'); // folder not found: still removable
    for (const r of rows) {
      expect(r.match(/data-remove=/g)).toHaveLength(1);
      expect(r.split('</button>')[0]).not.toContain('data-remove'); // not inside the open button, so a click on it never opens the folder
    }
    const odd = recentHtml({ path: 'p', error: null, entries: [{ ...REG.entries[0], path: '/h/a "b" <c> & d', root: '~/a "b" <c> & d' }] }, true, SERVED, '');
    expect(odd).toContain('data-remove="/h/a &quot;b&quot; &lt;c&gt; &amp; d" aria-label="Remove ~/a &quot;b&quot; &lt;c&gt; &amp; d from list"');
  });

  it('gives the sheet\'s list no Open in VS Code link (BL-PM-008 default 9)', () => {
    expect(recentHtml(REG, false, SERVED, '')).not.toMatch(/vscode:|VS Code/);
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

  it('a project without a name is shown under its folder\'s own name, never its whole path (BL-PM-002)', () => {
    expect(projectLabel({ name: 'SpecPilot SDD CLI', root: '~/Documents/dev/SpecPilot' })).toBe('SpecPilot SDD CLI');
    expect(projectLabel({ name: '', root: '~/x' })).toBe(''); // an empty name in the file is the file's own text
    expect(projectLabel({ name: null, root: '~/Documents/dev' })).toBe('dev');
    expect(projectLabel({ name: null, root: '/Users/you/Documents/dev/Hello-World' })).toBe('Hello-World');
    expect(projectLabel({ name: null, root: '/srv/app/' })).toBe('app');
    expect(projectLabel({ name: null, root: 'C:\\work\\my app' })).toBe('my app');
    expect(projectLabel({ name: null, root: '~' })).toBe('~');
    expect(projectLabel({ name: null, root: '/' })).toBe('/');
  });

  it('the Clone tab and the server take the folder name from the URL with one function (BL-PM-002)', () => {
    expect(gitClone.repoNameFromUrl).toBe(repoNameFromUrl);
    expect(repoNameFromUrl('https://github.com/girishr/SpecPilot.git')).toBe('SpecPilot');
    expect(repoNameFromUrl('git@github.com:octocat/Hello-World.git')).toBe('Hello-World');
    for (const typing of ['', 'https:', 'https://', 'https://github.com/']) expect(repoNameFromUrl(typing)).toBe(typing.endsWith('.com/') ? 'github.com' : ''); // while typing: whatever the rule gives
  });

  it('an answer to a clone differs only in its two texts (BL-PM-002)', () => {
    const specs = { projects: [{ root: '~/a' }, { root: '~/dev/repo' }] };
    expect(openOutcome(200, { project: 1, specs, registry: { error: null } }, 'cloned')).toEqual({ project: 1, specs, toast: '~/dev/repo cloned and opened as project 1' });
    expect(openOutcome(200, { project: 1, specs, registry: { error: 'x could not be written (EACCES).' } }, 'cloned').toast).toBe('~/dev/repo cloned and opened as project 1. x could not be written (EACCES).');
    expect(openOutcome(409, { error: '/x is already open as project 1.', project: 1 }, 'cloned')).toEqual({ project: 1, specs: null, toast: '/x is already open as project 1.' });
    expect(openOutcome(422, { error: 'git clone failed: fatal: repository not found' }, 'cloned')).toEqual({ project: null, specs: null, toast: 'git clone failed: fatal: repository not found' });
    expect(openOutcome(502, {}, 'cloned')).toEqual({ project: null, specs: null, toast: 'Nothing was cloned (HTTP 502).' });
  });

  it("the Clone sheet's status and the clone event check (BL-PM-009)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cloneStatus, cloneProgress } = require('../../ui/route.js') as {
      cloneStatus: (seconds: number, progress: { stage: string; percent: number } | null) => string;
      cloneProgress: (data: string) => { stage: string; percent: number } | null;
    };
    expect(cloneStatus(0, null)).toBe('Cloning… 0:00');
    expect(cloneStatus(42, null)).toBe('Cloning… 0:42');
    expect(cloneStatus(13, { stage: 'receiving', percent: 42 })).toBe('Receiving objects 42% · 0:13');
    expect(cloneStatus(75, { stage: 'resolving', percent: 100 })).toBe('Resolving deltas 100% · 1:15');
    expect(cloneStatus(600, { stage: 'updating', percent: 0 })).toBe('Updating files 0% · 10:00');
    expect(cloneProgress('{"stage":"receiving","percent":42}')).toEqual({ stage: 'receiving', percent: 42 });
    expect(cloneProgress('{"stage":"updating","percent":0,"url":"x"}')).toEqual({ stage: 'updating', percent: 0 }); // only the two fields are kept
    for (const data of ['', 'null', '[]', '{"stage":"counting","percent":1}', '{"stage":"toString","percent":1}', '{"stage":"receiving","percent":101}', '{"stage":"receiving","percent":-1}', '{"stage":"receiving","percent":4.5}', '{"stage":"receiving","percent":"4"}']) {
      expect(cloneProgress(data)).toBeNull();
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

  it('the answer to a create (BL-PM-003) differs from an open only in the toast and the fallback text', () => {
    const specs = { projects: [{ root: '~/a' }, { root: '~/dev/demo' }] };
    expect(openOutcome(200, { project: 1, specs, registry: { error: null }, kept: [], notice: null }, true)).toEqual({ project: 1, specs, toast: '~/dev/demo created and opened as project 1' });
    expect(openOutcome(200, { project: 1, specs, registry: { error: 'not saved' } }, true).toast).toBe('~/dev/demo created and opened as project 1. not saved');
    expect(openOutcome(409, { project: 0, error: '~/a is already open as project 0.' }, true)).toEqual({ project: 0, specs: null, toast: '~/a is already open as project 0.' });
    expect(openOutcome(409, { error: '~/dev/demo already exists and is not empty.' }, true)).toEqual({ project: null, specs: null, toast: '~/dev/demo already exists and is not empty.' });
    expect(openOutcome(422, { error: 'Pick a folder inside your home folder, like ~/dev.' }, true).toast).toBe('Pick a folder inside your home folder, like ~/dev.');
    expect(openOutcome(500, {}, true)).toEqual({ project: null, specs: null, toast: 'Nothing was created (HTTP 500).' });
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

  it.each([[false], [true]])('serves the Home screen hidden behind the token, with nothing that is not built (BL-PM-001, BL-PM-003; readOnly %j)', async readOnly => {
    const p = makeProject();
    const s = await startSpecServer([p.root], 0, 'x', { readOnly });
    try {
      const port = (s.server.address() as AddressInfo).port;
      const page = (await hit(port, '/')).body;
      expect(page).toMatch(/<button class="tile home" id="homeBtn" aria-label="Home" aria-keyshortcuts="h" data-tip="Home" hidden>/);
      const home = page.slice(page.indexOf('<section class="view welcome" id="v-home"'), page.indexOf('<!-- TASKS'));
      expect(home).toMatch(/^<section class="view welcome" id="v-home" aria-labelledby="wTitle">\s*<div class="brand"><svg class="logo" aria-hidden="true" focusable="false"><use href="#logo"\/><\/svg><svg class="wordmark" role="img" aria-label="SpecPilot" focusable="false"><use href="#wordmark"\/><\/svg><\/div>/);
      // BL-PM-014: the wordmark is Sixtyfour's outlines with its copyright and licence, and no font is loaded
      expect(page).toMatch(/<symbol id="wordmark" viewBox="0 0 9216 1024" preserveAspectRatio="xMinYMid meet"><!-- wordmark \(BL-PM-014\)[^>]*Copyright 2021 The Sixtyfour Project Authors \(https:\/\/github\.com\/jenskutilek\/homecomputer-fonts\)\.\n\s*Licensed under the SIL Open Font License, Version 1\.1: ui\/OFL-Sixtyfour\.txt --><path fill="currentColor" d="M[^"]+"\/><\/symbol>/);
      expect(page).toMatch(/<button class="tile act" id="addBtn" aria-label="Add a project" data-tip="Add a project" hidden>/); // shown by the script only with the token

      expect(home).toContain('<h1 id="wTitle">Your specs, as a board.</h1>');
      expect(home).toContain(
        '<p class="lead">SpecPilot reads the <span class="mono" translate="no">.specs/</span> folder of any project on this machine and shows its tasks and spec files as they are written. Your AI IDE keeps doing the coding.</p>',
      );
      expect(home).toContain(
        '<use href="#i-folder"/></svg></span><div class="body"><div class="ttl">Files are the truth</div><div class="det">Every view is read from <span class="mono" translate="no">.specs/</span> and git. Every action writes a file you could have edited by hand.</div>',
      );
      expect(home).toContain(
        '<use href="#i-shield"/></svg></span><div class="body"><div class="ttl">Nothing leaves this machine</div><div class="det">Runs on localhost, no account, no telemetry. No <span class="mono" translate="no">.specs/</span> yet? Your AI IDE writes one for you.</div>',
      );
      expect(home.match(/class="ic2"/g)).toHaveLength(2); // two benefit rows, not the mockup's three
      expect(home).toContain('Server running on <span class="mono" id="homeAddr" translate="no"></span> · <span id="homeVer" translate="no"></span>'); // filled by the script with the real values
      expect(home.indexOf('benefits')).toBeLessThan(home.indexOf('id="homeBox"'));
      expect(page).not.toContain('needs you');
      expect(page).toContain('id="homeOpen">Open a Project Folder</button>');
      // BL-PM-003 and BL-PM-002: the mockup's .alt row, Start a New Project then Clone a Repository
      expect(home).toContain('<div class="alt"><button type="button" class="btn line" id="homeNew">Start a New Project</button><button type="button" class="btn line" id="homeClone">Clone a Repository</button></div>');
      expect(home.indexOf('id="homeOpen"')).toBeLessThan(home.indexOf('id="homeNew"'));
      // the sheet: the mockup's tab row; the New tab went into the setup assistant (BL-PM-004)
      const sheet = page.slice(page.indexOf('<div class="veil" id="openVeil">'), page.indexOf('<!-- PALETTE'));
      expect(sheet).toContain('<div class="tabs" id="openTabs" role="tablist" aria-labelledby="openTitle"><button type="button" class="on" role="tab" id="tabFolder" data-t="folder" aria-controls="paneFolder" aria-selected="true">Folder</button><button type="button" role="tab" id="tabClone" data-t="clone" aria-controls="paneClone" aria-selected="false" tabindex="-1">Clone</button></div>');
      for (const gone of ['id="tabNew"', 'id="paneNew"', '>New<', 'Create Project', 'Runs what specpilot init runs']) expect(page).not.toContain(gone);
      // BL-103: the Setup view in place of the chat, with only its own strings; the rows are not started
      const setup = page.slice(page.indexOf('<section class="view setupv" id="v-setup">'), page.indexOf('<!-- FILE: any .specs/ file'));
      expect(setup).toContain('<p class="note">Nothing is created yet. The folder is made by your IDE in step 3, only at this path.</p>');
      expect(setup).toContain('<span class="n">1</span>Connect your AI IDE<span class="st" id="suStatus" role="status"></span>');
      expect(setup).toContain('<span class="n">2</span>Tell it what to do</div>');
      expect(setup).toContain('<span class="n">3</span>Progress</div><p class="note">Updates by itself as your IDE calls the server. Nothing here to click.</p>');
      expect(setup.match(/<li class="wait">/g)).toHaveLength(4);
      expect(setup).toContain('This server was started with <span class="mono" translate="no">--no-mcp</span>, so your IDE cannot reach it. Restart with <span class="mono" translate="no">specpilot serve</span> and come back here.');
      for (const gone of ['id="v-chat"', 'chat-core', 'id="chatRestart"', 'id="chatSub"', 'Hey, I\'m SpecPilot', 'Start Guided Setup', 'id="fileNote"']) expect(page).not.toContain(gone);
      // BL-PM-002: the Clone tab's own strings, its three fields in order, no browser URL check on the field
      expect(sheet).toContain('<div class="pane" id="paneClone" role="tabpanel" aria-labelledby="tabClone" hidden>');
      expect(sheet).toContain('<p class="note">Runs git clone on this machine, then opens the folder. Submodules are not cloned.</p>');
      expect(sheet).toContain('<input id="cloneIn" name="repo-url" type="text" inputmode="url" spellcheck="false" aria-label="Repository URL" placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git" maxlength="2048">');
      expect(sheet).toContain('<input id="cloneParentIn" name="clone-parent" type="text" spellcheck="false" aria-label="Parent folder" placeholder="/path/to/folder or ~/folder">');
      expect(sheet).toContain('<input id="cloneNameIn" name="clone-name" type="text" spellcheck="false" aria-label="Folder name" placeholder="the repository\'s name" maxlength="214">');
      expect(sheet).toContain('<div class="sf"><span class="cloning" id="cloneStatus" hidden><span class="bar" role="progressbar" aria-label="Cloning"></span><span id="cloneTime">Cloning… 0:00</span></span><button type="button" class="btn" id="openCancel">Cancel</button>');
      expect(sheet.indexOf('id="cloneIn"')).toBeLessThan(sheet.indexOf('id="cloneParentIn"'));
      expect(sheet.indexOf('id="cloneParentIn"')).toBeLessThan(sheet.indexOf('id="cloneNameIn"'));
      expect(sheet.indexOf('id="recentBox"')).toBeLessThan(sheet.indexOf('id="paneClone"'));
      // BL-PM-011 and BL-097: a Browse… button at the end of the Folder tab's field and of the Clone tab's Parent folder, no other
      expect(sheet).toContain('aria-label="Folder path" placeholder="/path/to/project or ~/project"><button type="button" class="btn" id="browseBtn">Browse…</button></div>');
      expect(sheet).toContain('aria-label="Parent folder" placeholder="/path/to/folder or ~/folder"><button type="button" class="btn" id="cloneBrowseBtn">Browse…</button></div>');
      expect(page.split('Browse…').length - 1).toBe(3); // and #new's Parent folder (BL-103)
      for (const left of ['Browse Folders', '/mcp', 'sample project', 'disabled']) expect(page).not.toContain(left);
      // BL-PM-007: the card is in the markup but hidden, and without --mcp nothing tells the script to show it
      expect(page).toContain('<div class="gl" id="homeMcp" hidden><div class="gh">Connect Your AI IDE <span class="cnt">optional, one line</span></div>');
      expect(page).not.toContain('specpilot-mcp');
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
/** MOVE_TASKS with a Review section (BL-113): two rows, one sent back once already. */
const REVIEW_TASKS = MOVE_TASKS + ['## Review', '', '| ID | Description |', '|---|---|', '| BL-003 | Three |', '| BL-004 | Four Sent back 2026-10-01: earlier |', ''].join('\n');

/** BL-125: a typed Backlog and Review, a plain Current Sprint. */
const FIELDS_TASKS = [
  '---', 'fileID: TASKS-001', 'relatedFiles: [roadmap.md, requirements.md, project.yaml]', '---', '', '# Tasks', '',
  '## Backlog', '', '| ID | Type | Priority | Description |', '|---|---|---|---|', '| BL-001 | feat | P1 | One |', '| BL-002 |  |  | Two |', '',
  '## Current Sprint', '', '| ID | Description |', '|---|---|', '| CS-001 | Sprint |', '',
  '## Review', '', '| ID | Type | Priority | Description |', '|---|---|---|---|', '| BL-003 | bug |  | Three |', '',
  '## Completed', '', '| # | ID | Description |', '|---|---|---|', '| 1 | [CD-001] | Done |', '',
].join('\n');

/** POST /api/tasks/move with full control over the headers that the security checks read. */
function post(port: number, body: string, headers: Record<string, string | string[] | undefined>, path = '/api/tasks/move') {
  return new Promise<{ status: number; headers: Record<string, unknown>; json: any }>((resolve, reject) => {
    const h: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) h[k] = v;
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: h }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => (text += c));
      res.on('end', () => {
        let json: any;
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
    [{ id: 'BL-001', toSection: 'completed', toIndex: 0 }, COMPLETED_BY_HAND], // BL-113: the by-hand rule
    [{ id: 'BL-001', toSection: 'wontDo', toIndex: 0 }, 'Tasks can only be moved to Backlog, Current Sprint or Review.'],
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

describe('review over HTTP (BL-113)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  let file: string;
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const good = (over: Record<string, string | undefined> = {}) => ({ Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token, 'If-Match': hash(), ...over });
  const review = (body: unknown, over: Record<string, string | undefined> = {}) => post(port, JSON.stringify(body), good(over), '/api/tasks/review');
  const lineOf = (id: string) => readFileSync(file, 'utf-8').split('\n').find(l => l.startsWith(`| ${id} |`));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeEach(async () => {
    p = makeProject();
    file = join(p.root, '.specs/planning/tasks.md');
    writeFileSync(file, REVIEW_TASKS);
    spec = await startSpecServer([p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('approve appends the dated marker to the one cell; undo gives the file back byte for byte; the payload carries approved and history', async () => {
    const r = await review({ id: 'BL-003', action: 'approve' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ action: 'approve', date: today(), note: '', fromIndex: 0, index: 0 });
    expect(r.json.sha256).toBe(hash());
    expect(lineOf('BL-003')).toBe(`| BL-003 | Three Approved ${today()} |`);
    expect(r.json.specs.tasks.review).toEqual([
      { id: 'BL-003', type: null, priority: null, description: `Three Approved ${today()}`, line: 30, approved: today(), history: [] },
      { id: 'BL-004', type: null, priority: null, description: 'Four Sent back 2026-10-01: earlier', line: 31, approved: null, history: [{ date: '2026-10-01', note: 'earlier' }] },
    ]);
    expect(r.json.specs.tasks.wontDo).toEqual([]);
    const again = await review({ id: 'BL-003', action: 'approve' });
    expect(again.status).toBe(422);
    expect(again.json.error).toBe('BL-003 is already marked Approved.');
    const undo = await review({ id: 'BL-003', action: 'unapprove', date: r.json.date });
    expect(undo.status).toBe(200);
    expect(readFileSync(file, 'utf-8')).toBe(REVIEW_TASKS);
    expect(undo.json.specs.tasks.review[0].approved).toBeNull();
  });

  it('send back appends the note (a line break as a space, | escaped) and moves the row to the top of Current Sprint; undo puts it back', async () => {
    const r = await review({ id: 'BL-004', action: 'sendBack', note: ' tests | docs\nmissing ' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ action: 'sendBack', date: today(), note: 'tests \\| docs missing', fromIndex: 1, index: 0 });
    const after = readFileSync(file, 'utf-8');
    expect(lineOf('BL-004')).toBe(`| BL-004 | Four Sent back 2026-10-01: earlier Sent back ${today()}: tests \\| docs missing |`);
    expect(r.json.specs.tasks.currentSprint.map((x: { id: string }) => x.id)).toEqual(['BL-004', 'CS-001']);
    expect(r.json.specs.tasks.review.map((x: { id: string }) => x.id)).toEqual(['BL-003']);
    expect(after.split('\n').filter(l => !REVIEW_TASKS.split('\n').includes(l))).toEqual([lineOf('BL-004')]); // one line changed, and moved
    const undo = await review({ id: 'BL-004', action: 'unsendBack', date: r.json.date, note: r.json.note, toIndex: r.json.fromIndex });
    expect(undo.status).toBe(200);
    expect(undo.json).toMatchObject({ action: 'unsendBack', index: 1 });
    expect(readFileSync(file, 'utf-8')).toBe(REVIEW_TASKS);
    const dot = await review({ id: 'BL-003', action: 'sendBack' });
    expect(dot.status).toBe(200);
    expect(lineOf('BL-003')).toBe(`| BL-003 | Three Sent back ${today()}. |`);
  });

  it.each<[unknown, string]>([
    [{ id: 'BL-001', action: 'approve' }, 'BL-001 is in Backlog, so it cannot be approved: only a Review row can be.'],
    [{ id: 'BL-999', action: 'sendBack' }, 'No task row in planning/tasks.md has the ID BL-999.'],
    [{ id: 'BL-003', action: 'unapprove', date: '2026-10-01' }, 'BL-003 is not marked Approved 2026-10-01, so there is nothing to undo.'],
    [{ id: 'BL-003', action: 'unsendBack', date: '2026-10-01', note: '', toIndex: 0 }, 'BL-003 is in Review, so it cannot be put back: only a Current Sprint row that was sent back can be.'],
    [{ id: 'BL-003', action: 'sendBack', note: 'a\tb' }, 'The note contains a control character (such as a tab), which a table row cannot hold as typed.'],
    [{ id: 'BL-003', action: 'sendBack', note: 'x'.repeat(201) }, 'The note is longer than 200 characters.'],
    [{ id: 'BL-003', action: 'done' }, 'action must be approve, unapprove, sendBack or unsendBack.'],
    [{ id: 'BL-003', action: 'unapprove' }, 'date must be the YYYY-MM-DD the action wrote.'],
  ])('422s on %j with a plain-words message and no write', async (body, error) => {
    const r = await review(body);
    expect(r.status).toBe(422);
    expect(r.json.error).toBe(error);
    expect(readFileSync(file, 'utf-8')).toBe(REVIEW_TASKS);
  });

  it('428s without If-Match, 409s on a stale one with the fresh payload, 403s a foreign Origin, 405s other methods, and writes nothing', async () => {
    expect((await review({ id: 'BL-003', action: 'approve' }, { 'If-Match': undefined })).status).toBe(428);
    const stale = await review({ id: 'BL-003', action: 'approve' }, { 'If-Match': 'a'.repeat(64) });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe(REVIEW_STALE_ERROR);
    expect(stale.json.specs.tasks.sha256).toBe(hash());
    expect((await review({ id: 'BL-003', action: 'approve' }, { Origin: 'http://evil.com' })).status).toBe(403);
    const get = await hit(port, '/api/tasks/review');
    expect(get.status).toBe(405);
    expect(get.headers['allow']).toBe('POST');
    expect(readFileSync(file, 'utf-8')).toBe(REVIEW_TASKS);
  });

  it('is absent with --read-only: 405 with an empty Allow', async () => {
    const q = makeProject();
    writeFileSync(join(q.root, '.specs/planning/tasks.md'), REVIEW_TASKS);
    const ro = await startSpecServer([q.root], 0, 'x', { readOnly: true });
    try {
      const rp = (ro.server.address() as AddressInfo).port;
      const r = await post(rp, JSON.stringify({ id: 'BL-003', action: 'approve' }), { Host: `127.0.0.1:${rp}`, Origin: `http://127.0.0.1:${rp}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64), 'If-Match': 'a'.repeat(64) }, '/api/tasks/review');
      expect(r.status).toBe(405);
      expect(r.headers['allow']).toBe('');
      expect(readFileSync(join(q.root, '.specs/planning/tasks.md'), 'utf-8')).toBe(REVIEW_TASKS);
    } finally {
      await ro.close();
      q.cleanup();
    }
  });
});

describe('Type and Priority over HTTP (BL-125)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  let file: string;
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const good = (over: Record<string, string | undefined> = {}) => ({ Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token, 'If-Match': hash(), ...over });
  const fields = (body: unknown, over: Record<string, string | undefined> = {}) => post(port, JSON.stringify(body), good(over), '/api/tasks/fields');

  beforeEach(async () => {
    p = makeProject();
    file = join(p.root, '.specs/planning/tasks.md');
    writeFileSync(file, FIELDS_TASKS);
    spec = await startSpecServer([p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('sets the two cells of one row and answers {sha256, specs}, the payload carrying type, priority and shapes', async () => {
    const r = await fields({ id: 'BL-002', type: 'chore', priority: 'P2' });
    expect(r.status).toBe(200);
    expect(r.json.sha256).toBe(hash());
    expect(readFileSync(file, 'utf-8')).toBe(FIELDS_TASKS.replace('| BL-002 |  |  | Two |', '| BL-002 | chore | P2 | Two |'));
    expect(r.json.specs.tasks.backlog[1]).toMatchObject({ id: 'BL-002', type: 'chore', priority: 'P2', description: 'Two' });
    expect(r.json.specs.tasks.currentSprint[0]).toMatchObject({ id: 'CS-001', type: null, priority: null });
    expect(r.json.specs.tasks.headings.shapes).toEqual({ '## Backlog': 'typed', '## Current Sprint': 'plain', '## Review': 'typed' });
    const clear = await fields({ id: 'BL-002', type: '', priority: '' });
    expect(clear.status).toBe(200);
    expect(readFileSync(file, 'utf-8')).toBe(FIELDS_TASKS);
  });

  it.each([
    [{ id: 'BL-002' }, 'Name a type or a priority to set.'],
    [{ id: 'BL-002', priority: 'high' }, 'Priority must be P1, P2 or P3, or empty.'],
    [{ id: 'BL-002', type: 'story' }, 'Type must be feat, bug or chore, or empty.'],
    [{ priority: 'P1' }, 'The request has no task ID.'],
    [[], 'The request must be a JSON object with id and a type or priority.'],
    [{ id: 'BL-099', priority: 'P1' }, 'No task row in planning/tasks.md has the ID BL-099.'],
    [{ id: 'CS-001', priority: 'P1' }, 'Current Sprint has no Type and Priority columns. Give the Current Sprint table those columns first.'],
    [{ id: '[CD-001]', priority: 'P1' }, 'Completed rows have no Type and Priority.'],
  ])('422s on %j with a plain-words message and no write', async (body, error) => {
    const r = await fields(body);
    expect(r.status).toBe(422);
    expect(r.json.error).toBe(error);
    expect(readFileSync(file, 'utf-8')).toBe(FIELDS_TASKS);
  });

  it('422s on a symbolic-link tasks.md, bytes that are not UTF-8, and a change validate would newly report', async () => {
    const bad = Buffer.concat([Buffer.from(FIELDS_TASKS), Buffer.from([0xff])]);
    writeFileSync(file, bad);
    const utf = await fields({ id: 'BL-002', priority: 'P1' });
    expect(utf.status).toBe(422);
    expect(utf.json.error).toContain('not valid UTF-8');
    rmSync(file);
    writeFileSync(join(p.root, 'real.md'), FIELDS_TASKS);
    symlinkSync(join(p.root, 'real.md'), file);
    const link = await fields({ id: 'BL-002', priority: 'P1' });
    expect(link.status).toBe(422);
    expect(link.json.error).toBe('planning/tasks.md is a symbolic link, and SpecPilot will not replace it with a regular file.');
    rmSync(file);
    writeFileSync(file, FIELDS_TASKS);
    const spy = jest.spyOn(validator, 'tasksChecks').mockImplementation(c => (c.includes('| BL-002 |  | P1 | Two |') ? ['planted warning'] : []));
    try {
      const checked = await fields({ id: 'BL-002', priority: 'P1' });
      expect(checked.status).toBe(422);
      expect(checked.json.error).toBe('Nothing was changed, because `specpilot validate` would then report: planted warning');
    } finally {
      spy.mockRestore();
    }
    expect(readFileSync(file, 'utf-8')).toBe(FIELDS_TASKS);
  });

  it('428s without If-Match, 409s on a stale one with the fresh payload, 403s a foreign Origin or a bad token, 405s other methods, and writes nothing', async () => {
    expect((await fields({ id: 'BL-002', priority: 'P1' }, { 'If-Match': undefined })).status).toBe(428);
    const stale = await fields({ id: 'BL-002', priority: 'P1' }, { 'If-Match': 'a'.repeat(64) });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe(FIELDS_STALE_ERROR);
    expect(stale.json.specs.tasks.sha256).toBe(hash());
    expect((await fields({ id: 'BL-002', priority: 'P1' }, { Origin: 'http://evil.com' })).status).toBe(403);
    expect((await fields({ id: 'BL-002', priority: 'P1' }, { 'X-SpecPilot-Token': 'f'.repeat(64) })).status).toBe(403);
    expect((await fields({ id: 'BL-002', priority: 'P1' }, { 'Content-Type': 'text/plain' })).status).toBe(415);
    const get = await hit(port, '/api/tasks/fields');
    expect(get.status).toBe(405);
    expect(get.headers['allow']).toBe('POST');
    expect(readFileSync(file, 'utf-8')).toBe(FIELDS_TASKS);
  });

  it('new tasks carry Type and Priority in a typed lane, and are refused them in a plain one', async () => {
    const r = await post(port, JSON.stringify({ description: 'Typed', section: 'backlog', type: 'feat', priority: 'P3' }), good(), '/api/tasks/new');
    expect(r.status).toBe(200);
    expect(readFileSync(file, 'utf-8').split('\n')).toContain(`| ${r.json.id} | feat | P3 | Typed |`);
    const plain = await post(port, JSON.stringify({ description: 'x', section: 'currentSprint', priority: 'P1' }), good(), '/api/tasks/new');
    expect(plain.status).toBe(422);
    expect(plain.json.error).toBe('Current Sprint has no Type and Priority columns, so the task cannot carry them. Give the Current Sprint table those columns first.');
  });

  it('is absent with --read-only: 405 with an empty Allow', async () => {
    const q = makeProject();
    writeFileSync(join(q.root, '.specs/planning/tasks.md'), FIELDS_TASKS);
    const ro = await startSpecServer([q.root], 0, 'x', { readOnly: true });
    try {
      const rp = (ro.server.address() as AddressInfo).port;
      const r = await post(rp, JSON.stringify({ id: 'BL-002', priority: 'P1' }), { Host: `127.0.0.1:${rp}`, Origin: `http://127.0.0.1:${rp}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64), 'If-Match': 'a'.repeat(64) }, '/api/tasks/fields');
      expect(r.status).toBe(405);
      expect(r.headers['allow']).toBe('');
      expect(readFileSync(join(q.root, '.specs/planning/tasks.md'), 'utf-8')).toBe(FIELDS_TASKS);
    } finally {
      await ro.close();
      q.cleanup();
    }
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

// ─── New Task (BL-PM-005) ────────────────────────────────────────────────────

describe('new tasks over HTTP (BL-PM-005)', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
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
    'If-Match': hashOf(a),
    ...over,
  });
  const add = (description: string, section = 'backlog') => JSON.stringify({ description, section });
  const NEW = '/api/tasks/new';

  beforeEach(async () => {
    [a, b] = [makeProject(), makeProject()];
    for (const p of [a, b]) writeFileSync(tasks(p), MOVE_TASKS);
    spec = await startSpecServer([a.root, b.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    a.cleanup();
    b.cleanup();
  });

  it('appends one row with the next ID and answers {sha256, id, section, index, specs}', async () => {
    const res = await post(port, add('  Write the `serve` docs, see [the spec](x.md)  '), good(), NEW);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ sha256: hashOf(a), id: 'BL-003', section: 'backlog', index: 2 });
    expect(res.json.specs.tasks.sha256).toBe(res.json.sha256);
    expect(res.json.specs.tasks.backlog[2]).toEqual({ id: 'BL-003', type: null, priority: null, description: 'Write the `serve` docs, see [the spec](x.md)', line: 14 }); // the new row's line, right after BL-002 (BL-PM-008)
    const after = readFileSync(tasks(a), 'utf-8').split('\n');
    const before = MOVE_TASKS.split('\n');
    expect(after).toHaveLength(before.length + 1);
    expect(after[before.indexOf('| BL-002 | Two |') + 1]).toBe('| BL-003 | Write the `serve` docs, see [the spec](x.md) |');
    expect(after.filter((_, k) => k !== before.indexOf('| BL-002 | Two |') + 1)).toEqual(before);
  });

  it('adds to Current Sprint with a CS ID', async () => {
    const res = await post(port, add('Sprint work', 'currentSprint'), good(), NEW);
    expect(res.json).toMatchObject({ id: 'CS-002', section: 'currentSprint', index: 1 });
  });

  it('writes only the project the request names', async () => {
    const res = await post(port, add('In B'), good({ 'If-Match': hashOf(b) }), `${NEW}?project=1`);
    expect(res.status).toBe(200);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
    expect(readFileSync(tasks(b), 'utf-8')).toContain('| BL-003 | In B |');
  });

  it.each<[string, Record<string, string | undefined>, number]>([
    ['no token', { 'X-SpecPilot-Token': undefined }, 403],
    ['a wrong token', { 'X-SpecPilot-Token': 'f'.repeat(64) }, 403],
    ['a foreign Origin', { Origin: 'http://evil.com' }, 403],
    ['no Origin', { Origin: undefined }, 403],
    ['a foreign Host', { Host: 'evil.com' }, 403],
    ['a form content type', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ])('rejects %s before the project is resolved, writing nothing', async (_n, over, status) => {
    for (const path of [NEW, `${NEW}?project=9`]) {
      expect((await post(port, add('x'), good(over), path)).status).toBe(status);
    }
    expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('404s on a project that is not served, after the checks pass', async () => {
    expect((await post(port, add('x'), good(), `${NEW}?project=9`)).status).toBe(404);
  });

  it('413 over 16 KB, 400 not JSON, 428 without If-Match, 405 on GET; nothing written', async () => {
    expect((await post(port, add('x'.repeat(17 * 1024)), good(), NEW)).status).toBe(413);
    expect((await post(port, '{not json', good(), NEW)).status).toBe(400);
    expect((await post(port, add('x'), good({ 'If-Match': undefined }), NEW)).status).toBe(428);
    const get = await hit(port, NEW);
    expect([get.status, get.headers['allow']]).toEqual([405, 'POST']);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
  });

  it.each([
    ['', 'Type a description for the task.'],
    ['two\nlines', 'The description must be one line: a table row cannot hold a line break.'],
    ['a | b', 'The description cannot contain |, because it would split the table cell. Write it another way, e.g. "or".'],
  ])('422s on %j with the reason and no write', async (description, error) => {
    const res = await post(port, add(description), good(), NEW);
    expect([res.status, res.json.error]).toEqual([422, error]);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('422s on a section other than Backlog or Current Sprint', async () => {
    const res = await post(port, add('x', 'completed'), good(), NEW);
    expect([res.status, res.json.error]).toEqual([422, 'New tasks can only go to Backlog or Current Sprint.']);
  });

  it('409s on a stale If-Match with the fresh payload and a reload hint', async () => {
    const res = await post(port, add('x'), good({ 'If-Match': 'a'.repeat(64) }), NEW);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('press Add Task again');
    expect(res.json.specs.tasks.sha256).toBe(hashOf(a));
    expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('two adds with the same If-Match at once: one 200, one 409, the file gains one row', async () => {
    const h = hashOf(a);
    const [x, y] = await Promise.all([post(port, add('First'), good({ 'If-Match': h }), NEW), post(port, add('Second'), good({ 'If-Match': h }), NEW)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(readFileSync(tasks(a), 'utf-8').split('\n')).toHaveLength(MOVE_TASKS.split('\n').length + 1);
    expect(hashOf(a)).toBe((x.status === 200 ? x : y).json.sha256);
  });

  it('is absent with --read-only: 405 and the button never shown', async () => {
    const ro = await startSpecServer([a.root], 0, 'x', { readOnly: true });
    try {
      const roPort = (ro.server.address() as AddressInfo).port;
      const page = (await hit(roPort, '/')).body;
      expect(page).not.toContain('specpilot-token');
      expect(page).not.toContain('id="newTask"'); // gone since BL-TB-05: the lane headers' Add buttons are drawn by app.js only with a token
      const res = await post(roPort, add('x'), { ...good(), Host: `127.0.0.1:${roPort}`, Origin: `http://127.0.0.1:${roPort}` }, NEW);
      expect(res.status).toBe(405);
      expect(readFileSync(tasks(a), 'utf-8')).toBe(MOVE_TASKS);
    } finally {
      await ro.close();
    }
  });
});

// ─── Archive Completed (BL-TB-06) ────────────────────────────────────────────

/** MOVE_TASKS with 40 more Completed rows: 46 section lines, so `specpilot archive` would move 21. */
const ARCHIVE_TASKS = MOVE_TASKS.replace('| 1 | [CD-001] | Done |\n', ['| 1 | [CD-001] | Done |', ...Array.from({ length: 40 }, (_, i) => `| ${i + 2} | [CD-${String(i + 2).padStart(3, '0')}] | Done ${i + 2} |`)].join('\n') + '\n');

describe('archive Completed over HTTP (BL-TB-06)', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const tasks = (p: { root: string }) => join(p.root, '.specs/planning/tasks.md');
  const archiveOf = (p: { root: string }) => join(p.root, '.specs/planning/tasks-archive.md');
  const hashOf = (p: { root: string }) => createHash('sha256').update(readFileSync(tasks(p))).digest('hex');
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    'If-Match': hashOf(a),
    ...over,
  });
  const ARCHIVE = '/api/tasks/archive';

  beforeEach(async () => {
    [a, b] = [makeProject(), makeProject()];
    writeFileSync(tasks(a), ARCHIVE_TASKS);
    writeFileSync(tasks(b), MOVE_TASKS);
    spec = await startSpecServer([a.root, b.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    a.cleanup();
    b.cleanup();
  });

  it('moves the plan\'s rows into tasks-archive.md and answers {sha256, linesMoved, specs}, the payload then showing nothing to archive', async () => {
    const lines = ARCHIVE_TASKS.split('\n');
    const plan = planCompletedArchive(lines)!;
    const before = JSON.parse((await hit(port, '/api/specs')).body);
    expect(before.tasks.archive).toEqual({ lines: 46, rows: 21 });
    const res = await post(port, '{}', good(), ARCHIVE);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ sha256: hashOf(a), linesMoved: 21 });
    expect(res.json.specs.tasks.sha256).toBe(res.json.sha256);
    expect(res.json.specs.tasks.archive).toEqual({ lines: 25, rows: 0 });
    expect(res.json.specs.tasks.completed).toHaveLength(20);
    expect(readFileSync(tasks(a), 'utf-8')).toBe([...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'));
    const archived = readFileSync(archiveOf(a), 'utf-8');
    expect(archived).toMatch(/^## Archived on \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n\n\| # \| ID \| Description \|\n\|---\|---\|---\|\n/);
    expect(archived).toContain(lines.slice(plan.start, plan.end).join('\n') + '\n\n---\n\n');
    expect(readFileSync(tasks(b), 'utf-8')).toBe(MOVE_TASKS); // the other project untouched
  });

  it('answers 200 on a project whose .git/HEAD names another branch: the guard is the page\'s', async () => {
    writeFileSync(join(a.root, '.git/HEAD'), 'ref: refs/heads/feature\n');
    expect(JSON.parse((await hit(port, '/api/specs')).body).project.branch).toBe('feature');
    expect((await post(port, '{}', good(), ARCHIVE)).status).toBe(200);
    expect(existsSync(archiveOf(a))).toBe(true);
  });

  it('422s with the reason when nothing is over the limit and force was not sent, and forced with nothing past the newest 20; writing nothing', async () => {
    for (const body of ['{}', '{"force":false}']) {
      const res = await post(port, body, good({ 'If-Match': hashOf(b) }), `${ARCHIVE}?project=1`);
      expect([res.status, res.json.error]).toEqual([422, NOTHING_TO_ARCHIVE_ERROR]);
    }
    const forced = await post(port, '{"force":true}', good({ 'If-Match': hashOf(b) }), `${ARCHIVE}?project=1`);
    expect([forced.status, forced.json.error]).toEqual([422, nothingPastKeepError(1)]);
    expect(readFileSync(tasks(b), 'utf-8')).toBe(MOVE_TASKS);
    expect(existsSync(archiveOf(b))).toBe(false);
  });

  it('within the limit, {force: true} archives the rows past the newest 20 (D8)', async () => {
    const within = MOVE_TASKS.replace('| 1 | [CD-001] | Done |\n', ['| 1 | [CD-001] | Done |', ...Array.from({ length: 25 }, (_, i) => `| ${i + 2} | [CD-${String(i + 2).padStart(3, '0')}] | Done ${i + 2} |`)].join('\n') + '\n'); // 26 rows, 31 lines
    writeFileSync(tasks(b), within);
    expect(JSON.parse((await hit(port, '/api/specs?project=1')).body).tasks.archive).toEqual({ lines: 31, rows: 6 });
    const res = await post(port, '{"force":true}', good({ 'If-Match': hashOf(b) }), `${ARCHIVE}?project=1`);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ linesMoved: 6 });
    expect(res.json.specs.tasks.archive).toEqual({ lines: 25, rows: 0 });
    const lines = within.split('\n');
    const plan = planCompletedArchive(lines, true)!;
    expect(readFileSync(tasks(b), 'utf-8')).toBe([...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'));
    expect(readFileSync(archiveOf(b), 'utf-8')).toContain(lines.slice(plan.start, plan.end).join('\n') + '\n\n---\n\n');
  });

  it.each(['{"force":"yes"}', '{"force":true,"x":1}', '{"x":1}', '[]', 'null', '"x"'])('422s on a body of %s, writing nothing', async body => {
    const res = await post(port, body, good(), ARCHIVE);
    expect([res.status, res.json.error]).toEqual([422, 'Archive takes an empty JSON object, {}, or {force: true}.']);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
    expect(existsSync(archiveOf(a))).toBe(false);
  });

  it.each<[string, Record<string, string | undefined>, number]>([
    ['no token', { 'X-SpecPilot-Token': undefined }, 403],
    ['a wrong token', { 'X-SpecPilot-Token': 'f'.repeat(64) }, 403],
    ['a foreign Origin', { Origin: 'http://evil.com' }, 403],
    ['a foreign Host', { Host: 'evil.com' }, 403],
    ['a form content type', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ])('rejects %s before the project is resolved, writing nothing', async (_n, over, status) => {
    for (const path of [ARCHIVE, `${ARCHIVE}?project=9`]) {
      expect((await post(port, '{}', good(over), path)).status).toBe(status);
    }
    expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
  });

  it('404 on an unserved project after the checks, 413 over 16 KB, 400 not JSON, 428 without If-Match, 405 on GET; nothing written', async () => {
    expect((await post(port, '{}', good(), `${ARCHIVE}?project=9`)).status).toBe(404);
    expect((await post(port, JSON.stringify({ x: 'x'.repeat(17 * 1024) }), good(), ARCHIVE)).status).toBe(413);
    expect((await post(port, '{not json', good(), ARCHIVE)).status).toBe(400);
    const stale = await post(port, '{}', good({ 'If-Match': undefined }), ARCHIVE);
    expect([stale.status, stale.json.error]).toEqual([428, 'The archive needs an If-Match header with the file hash the page last loaded.']);
    const get = await hit(port, ARCHIVE);
    expect([get.status, get.headers['allow']]).toEqual([405, 'POST']);
    expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
    expect(existsSync(archiveOf(a))).toBe(false);
  });

  it('409s on a stale If-Match with the fresh payload, writing nothing', async () => {
    const res = await post(port, '{}', good({ 'If-Match': 'a'.repeat(64) }), ARCHIVE);
    expect([res.status, res.json.error]).toEqual([409, ARCHIVE_STALE_ERROR]);
    expect(res.json.specs.tasks.sha256).toBe(hashOf(a));
    expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
    expect(existsSync(archiveOf(a))).toBe(false);
  });

  it('two archives with the same If-Match at once: one 200, one 409 or 422, one block written', async () => {
    const h = hashOf(a);
    const [x, y] = await Promise.all([post(port, '{}', good({ 'If-Match': h }), ARCHIVE), post(port, '{}', good({ 'If-Match': h }), ARCHIVE)]);
    expect([x.status, y.status].filter(s => s === 200)).toHaveLength(1);
    expect((readFileSync(archiveOf(a), 'utf-8').match(/## Archived on /g) ?? []).length).toBe(1);
  });

  it('500s, naming both files, when the archive cannot be written; nothing changed', async () => {
    if (process.getuid?.() === 0) return; // root ignores folder modes
    const dir = join(a.root, '.specs/planning');
    chmodSync(dir, 0o555);
    try {
      const res = await post(port, '{}', good(), ARCHIVE);
      expect([res.status, res.json.error]).toEqual([500, 'The archive could not be written. Check planning/tasks.md and planning/tasks-archive.md.']);
    } finally {
      chmodSync(dir, 0o755);
    }
    expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
    expect(existsSync(archiveOf(a))).toBe(false);
    expect((await post(port, '{}', good(), ARCHIVE)).status).toBe(200); // the lock survived
  });

  it('is absent with --read-only: 405, nothing written', async () => {
    const ro = await startSpecServer([a.root], 0, 'x', { readOnly: true });
    try {
      const roPort = (ro.server.address() as AddressInfo).port;
      expect((await hit(roPort, '/')).body).not.toContain('specpilot-token');
      const res = await post(roPort, '{}', { ...good(), Host: `127.0.0.1:${roPort}`, Origin: `http://127.0.0.1:${roPort}` }, ARCHIVE);
      expect([res.status, res.headers['allow']]).toEqual([405, '']);
      expect(readFileSync(tasks(a), 'utf-8')).toBe(ARCHIVE_TASKS);
      expect(existsSync(archiveOf(a))).toBe(false);
    } finally {
      await ro.close();
    }
  });
});

// ─── Multiple projects (BL-054) ──────────────────────────────────────────────

// ─── Regenerate All (BL-PM-006) ──────────────────────────────────────────────

describe('Regenerate All over HTTP (BL-PM-006)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const REGEN = '/api/commands/regenerate';
  const STATUS = '.claude/commands/specpilot-status.md';
  const SYNC = '.claude/commands/specpilot-sync.md';
  const at = (rel: string) => join(p.root, rel);
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    ...over,
  });
  const regen = (body = '{}', headers = good(), query = '?project=0') => post(port, body, headers, REGEN + query);
  const specs = async () => JSON.parse((await hit(port, '/api/specs')).body);
  const flag = (list: { path: string; generated: boolean }[], path: string) => list.find(f => f.path === path)?.generated;
  const SKILL = '.claude/skills/specpilot-project/SKILL.md';

  beforeEach(async () => {
    p = makeProject(); // has CLAUDE.md, so Claude Code is detected
    write(p.root, '.specs/project/project.yaml', '# fileID: PROJ-001\nname: "Fixture Project"\nlanguage: typescript\n'); // a usable context for the skill (BL-PM-012)
    spec = await startSpecServer([p.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it('adds the missing Claude Code commands and skill, lists them under From SpecPilot and reports their paths', async () => {
    const res = await regen();
    expect(res.status).toBe(200);
    expect(res.json.added).toHaveLength(9);
    expect(res.json.added.slice(0, 8).every((f: string) => f.startsWith('.claude/commands/specpilot-'))).toBe(true);
    expect(res.json.added[8]).toBe(SKILL);
    expect(flag(res.json.specs.nav.skills, SKILL)).toBe(true);
    expect(res.json.updated).toEqual([]);
    expect(res.json.kept).toEqual([]);
    expect(res.json.message).toEqual([`Added: ${res.json.added.join(', ')}.`]);
    expect(res.json.specs.nav.commands.map((f: { generated: boolean }) => f.generated)).toEqual(Array(8).fill(true));
    expect((await regen()).json.message).toEqual(['Every SpecPilot command file is current.']);
  });

  it('restores a stale known version, keeps an edited one, and moves the split accordingly', async () => {
    const stale = '---\ndescription: an older release\n---\n\nOld body.\n';
    const hashes = specSlash.KNOWN_COMMAND_HASHES[STATUS];
    hashes.push(createHash('sha256').update(stale).digest('hex'));
    try {
      await regen();
      const current = readFileSync(at(STATUS), 'utf-8');
      const edited = readFileSync(at(SYNC), 'utf-8') + '\nMy own line.\n';
      writeFileSync(at(STATUS), stale);
      writeFileSync(at(SYNC), edited);
      const before = (await specs()).nav.commands;
      expect(flag(before, STATUS)).toBe(true);
      expect(flag(before, SYNC)).toBe(false);
      const res = await regen();
      expect(res.status).toBe(200);
      expect(res.json.updated).toEqual([STATUS]);
      expect(res.json.kept).toEqual([{ path: SYNC, reason: 'modified' }]);
      expect(res.json.message).toEqual([`Updated: ${STATUS}.`, `Kept as they were: ${SYNC} (modified).`]);
      expect(readFileSync(at(STATUS), 'utf-8')).toBe(current);
      expect(readFileSync(at(SYNC), 'utf-8')).toBe(edited);
      expect(flag(res.json.specs.nav.commands, STATUS)).toBe(true);
      expect(flag(res.json.specs.nav.commands, SYNC)).toBe(false);
    } finally {
      hashes.pop();
    }
  });

  it('leaves a command file of the user\'s alone and lists it under Yours', async () => {
    write(p.root, '.claude/commands/mine.md', '---\ndescription: mine\n---\nMine.\n');
    const res = await regen();
    expect(readFileSync(at('.claude/commands/mine.md'), 'utf-8')).toBe('---\ndescription: mine\n---\nMine.\n');
    expect(flag(res.json.specs.nav.commands, '.claude/commands/mine.md')).toBe(false);
  });

  it('keeps an edited skill under Yours with its reason, refreshes a released render, and never writes another skill (BL-PM-012)', async () => {
    write(p.root, SKILL, '---\nname: specpilot-project\n---\nEdited.\n');
    write(p.root, '.claude/skills/mine/SKILL.md', '---\nname: mine\n---\nMine.\n');
    let res = await regen();
    expect(res.json.kept).toEqual([{ path: SKILL, reason: "does not match SpecPilot's render of project.yaml" }]);
    expect(res.json.message).toContain(`Kept as they were: ${SKILL} (does not match SpecPilot's render of project.yaml).`);
    expect(res.json.message.some((l: string) => l.startsWith('Not listed on this page'))).toBe(false);
    expect(flag(res.json.specs.nav.skills, SKILL)).toBe(false);
    expect(flag(res.json.specs.nav.skills, '.claude/skills/mine/SKILL.md')).toBe(false);
    expect(readFileSync(at(SKILL), 'utf-8')).toBe('---\nname: specpilot-project\n---\nEdited.\n');
    expect(readFileSync(at('.claude/skills/mine/SKILL.md'), 'utf-8')).toBe('---\nname: mine\n---\nMine.\n');
    // what v2.13.0 wrote for this project: SpecPilot's own, so it is replaced
    const released = fillReleasedSkill(KNOWN_SKILL_TEMPLATES[1], { projectName: 'Fixture Project', language: 'typescript' });
    writeFileSync(at(SKILL), released);
    expect(flag((await specs()).nav.skills, SKILL)).toBe(true);
    res = await regen();
    expect(res.json.updated).toEqual([SKILL]);
    expect(res.json.message).toEqual([`Updated: ${SKILL}.`]);
    expect(readFileSync(at(SKILL), 'utf-8')).toContain('Project: Fixture Project\nLanguage: typescript\n\n## Development Process');
    expect(flag(res.json.specs.nav.skills, SKILL)).toBe(true);
  });

  it('keeps the skill with a reason when project.yaml has no usable name or language, or is a link (BL-PM-012)', async () => {
    write(p.root, '.specs/project/project.yaml', 'name: "Fixture Project"\nlanguage: "type\\nscript"\n');
    expect((await regen()).json.kept).toEqual([{ path: SKILL, reason: 'project.yaml has no usable name or language' }]);
    rmSync(at('.specs/project/project.yaml'));
    write(p.root, '.specs/project/real.yaml', 'name: x\nlanguage: typescript\n');
    symlinkSync(at('.specs/project/real.yaml'), at('.specs/project/project.yaml'));
    expect((await regen()).json.kept).toEqual([{ path: SKILL, reason: 'project.yaml could not be read' }]);
    expect(existsSync(at(SKILL))).toBe(false);
  });

  it('names the command folders the page does not list', async () => {
    write(p.root, '.cursor/rules/specpilot.mdc', 'rules\n');
    const res = await regen();
    expect(res.json.added.filter((f: string) => f.startsWith('.cursor/commands/'))).toHaveLength(8);
    expect(res.json.message[res.json.message.length - 1]).toBe('Not listed on this page: .cursor/commands/.');
  });

  it('says so when no IDE instruction file is there, writing nothing', async () => {
    rmSync(at('CLAUDE.md'));
    const res = await regen();
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ added: [], updated: [], kept: [], message: ['No IDE instruction file found, so no command files were written.'] });
    expect(existsSync(at('.claude'))).toBe(false);
  });

  (process.platform === 'win32' ? it.skip : it)('skips and reports every file under a linked .github/prompts, writing nothing outside', async () => {
    write(p.root, '.github/copilot-instructions.md', '# Copilot\n');
    symlinkSync(p.outside, at('.github/prompts'));
    const res = await regen();
    expect(res.status).toBe(200);
    const linked = res.json.kept.filter((k: { path: string }) => k.path.startsWith('.github/prompts/'));
    expect(linked).toHaveLength(8);
    expect(linked.every((k: { reason: string }) => k.reason === 'folder is a symbolic link or not a folder')).toBe(true);
    expect(res.json.message.some((l: string) => l.startsWith('Kept as they were: .github/prompts/specpilot-'))).toBe(true);
    expect(readdirSync(p.outside)).toEqual(['secret.txt']);
  });

  (process.platform === 'win32' ? it.skip : it)('skips every file under a linked .github, writing nothing outside', async () => {
    writeFileSync(join(p.outside, 'copilot-instructions.md'), '# Copilot\n'); // the signal file, read through the link
    symlinkSync(p.outside, at('.github'));
    const res = await regen();
    const linked = res.json.kept.filter((k: { path: string }) => k.path.startsWith('.github/prompts/'));
    expect(linked).toHaveLength(8);
    expect(linked.every((k: { reason: string }) => k.reason === 'folder is a symbolic link or not a folder')).toBe(true);
    expect(readdirSync(p.outside).sort()).toEqual(['copilot-instructions.md', 'secret.txt']);
  });

  (process.platform === 'win32' ? it.skip : it)('skips a linked .claude folder', async () => {
    symlinkSync(p.outside, at('.claude'));
    const res = await regen();
    expect(res.json.kept).toHaveLength(9); // the eight commands and the skill (BL-PM-012)
    expect(res.json.kept[8]).toEqual({ path: SKILL, reason: 'folder is a symbolic link or not a folder' });
    expect(res.json.added).toEqual([]);
    expect(readdirSync(p.outside)).toEqual(['secret.txt']);
  });

  it.each([
    ['another origin', '{}', { Origin: 'http://evil.example' }, 403],
    ['no token', '{}', { 'X-SpecPilot-Token': undefined }, 403],
    ['a form post', '{}', { 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
    ['a body over 16 KB', 'x'.repeat(17 * 1024), {}, 413],
    ['a body that is not JSON', '{', {}, 400],
    ['a body with a key', '{"all":true}', {}, 422],
    ['an array', '[]', {}, 422],
    ['null', 'null', {}, 422],
  ] as [string, string, Record<string, string | undefined>, number][])('refuses %s and writes nothing', async (_name, body, over, status) => {
    const res = await regen(body, good(over));
    expect(res.status).toBe(status);
    expect(existsSync(at('.claude'))).toBe(false);
  });

  it('answers 404 for a project that is not served, 405 for GET, and 422 without .specs/', async () => {
    expect((await regen('{}', good(), '?project=7')).status).toBe(404);
    const get = await hit(port, REGEN);
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe('POST');
    rmSync(at('.specs'), { recursive: true });
    const res = await regen();
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/^No \.specs\/ folder in /);
    expect(existsSync(at('.claude'))).toBe(false);
  });

  it('runs under the write lock with a new task, both finishing', async () => {
    writeFileSync(at('.specs/planning/tasks.md'), MOVE_TASKS);
    const ifMatch = createHash('sha256').update(MOVE_TASKS).digest('hex');
    const [a, b] = await Promise.all([
      regen(),
      post(port, JSON.stringify({ description: 'Added beside a regenerate', section: 'backlog' }), good({ 'If-Match': ifMatch }), '/api/tasks/new'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(readFileSync(at('.specs/planning/tasks.md'), 'utf-8')).toContain('Added beside a regenerate');
  });

  it('runs under the write lock with a task move, both finishing', async () => {
    writeFileSync(at('.specs/planning/tasks.md'), MOVE_TASKS);
    const ifMatch = createHash('sha256').update(MOVE_TASKS).digest('hex');
    const [a, b] = await Promise.all([
      regen(),
      post(port, JSON.stringify({ id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }), good({ 'If-Match': ifMatch })),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.added).toHaveLength(9);
  });

  it('answers 500 when the run throws, and the page adds that files may be partly written', async () => {
    const boom = jest.spyOn(SpecBackfiller.prototype, 'backfillSlashCommands').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      expect((await regen()).status).toBe(500);
    } finally {
      boom.mockRestore();
    }
    expect(readFileSync(join(__dirname, '../../ui/app.js'), 'utf-8')).toContain("r.status===500?' Command files may have been partly written.'");
  });

  it('ui/app.js declares no function name twice (a second one silently replaces the first)', () => {
    const names = [...readFileSync(join(__dirname, '../../ui/app.js'), 'utf-8').matchAll(/^(?:async )?function ([\w$]+)\(/gm)].map(m => m[1]);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('ships the button hidden, for app.js to show only with the token', async () => {
    expect((await hit(port, '/')).body).toContain('<button type="button" class="more" id="cmdRegen" hidden>Regenerate All</button>');
  });
});

describe('Regenerate All with --read-only (BL-PM-006)', () => {
  it('has no route and writes nothing', async () => {
    const p = makeProject();
    const spec = await startSpecServer([p.root], 0, 'x', { readOnly: true });
    try {
      const port = (spec.server.address() as AddressInfo).port;
      const res = await post(port, '{}', {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
        'X-SpecPilot-Token': 'f'.repeat(64),
      }, '/api/commands/regenerate');
      expect(res.status).toBe(405);
      expect(existsSync(join(p.root, '.claude'))).toBe(false);
    } finally {
      await spec.close();
      p.cleanup();
    }
  });
});

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
      const arch = await post(port, '{}', { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64), 'If-Match': 'x' }, '/api/tasks/archive?project=1');
      expect([arch.status, arch.headers['allow']]).toEqual([405, '']); // BL-TB-06
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


describe('setup tools on /mcp (BL-104)', () => {
  let e: ReturnType<typeof makeEmpty>;
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let events: Awaited<ReturnType<typeof openEvents>> | null = null;
  const start = async (roots: string[], opts: Parameters<typeof startSpecServer>[3] = {}) => {
    spec = await startSpecServer(roots, 0, '0.0.0-test', { registry: regFile(), mcp: true, ...opts });
    port = (spec.server.address() as AddressInfo).port;
  };
  const page = (path: string, body: unknown) =>
    post(port, JSON.stringify(body), { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': spec.mcpToken! }, path);
  /** What the setup tools return, as the tests read it. */
  interface ToolData {
    mode: string;
    path: string;
    name: string;
    project: number;
    detected: { label: string; value: string }[];
    questions: { key: string; label: string; kind?: string; max?: number; when?: unknown; choices?: { value: string }[]; categories?: unknown[] }[];
    written: string[];
    validate: { errors: string[]; warnings: string[] };
  }
  const call = async (name: string, args: Record<string, unknown>): Promise<{ error?: { code: number; message: string }; refused?: string; data: ToolData }> => {
    const r = await post(port, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': spec.mcpToken! }, '/mcp');
    expect(r.status).toBe(200);
    if (r.json.error) return { error: r.json.error as { code: number; message: string }, data: {} as ToolData };
    const res = r.json.result as { content: { text: string }[]; structuredContent?: ToolData; isError?: boolean };
    return res.isError ? { refused: res.content[0].text, data: {} as ToolData } : { data: res.structuredContent! };
  };
  const ANSWERS = { projectType: 'brownfield', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode' };
  const NEW = { projectType: 'greenfield', language: 'typescript', framework: 'none', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode', whatItDoes: 'Tracks parcels' };
  /** The setup events seen on the stream so far, parsed. */
  const setupEvents = () => [...events!.text().matchAll(/event: setup\ndata: (.*)\n/g)].map(m => JSON.parse(m[1]) as Record<string, unknown>);

  beforeEach(() => {
    e = makeEmpty();
    p = makeProject();
  });
  afterEach(async () => {
    events?.close();
    events = null;
    await spec.close();
    e.cleanup();
    p.cleanup();
    jest.restoreAllMocks();
  });

  it('with --read-only neither tool is listed and calling one is -32602 (D3)', async () => {
    await start([e.root, p.root], { readOnly: true, registry: undefined });
    for (const name of ['specpilot_setup_questions', 'specpilot_setup_project']) expect((await call(name, { path: e.root })).error?.code).toBe(-32602);
  });

  it('the path rule: a named root without .specs/, the pending target, and nothing else (D2)', async () => {
    await start([e.root, p.root]);
    const real = realpathSync(e.root);
    expect((await call('specpilot_setup_questions', { path: e.root })).data.mode).toBe('existing');
    expect((await call('specpilot_setup_questions', { path: realpathSync(p.root) })).refused).toBe(`${realpathSync(p.root)} already has .specs/. To add missing SpecPilot sections there, run specpilot backfill.`);
    expect((await call('specpilot_setup_questions', { path: join(real, '..') })).refused).toBe(`${realpathSync(e.base)} is not a folder this SpecPilot page is setting up. Open it in the page (Open a Project Folder, Clone, or Start a New Project) first.`);
    expect((await call('specpilot_setup_questions', { path: '' })).refused).toBe('path is required: the folder as the SpecPilot page shows it.');
    mkdirSync(join(HOME, 'dev'), { recursive: true });
    expect((await page('/api/projects/pending', { parent: '~/dev', name: 'fresh' })).status).toBe(200);
    const q = (await call('specpilot_setup_questions', { path: '~/dev/fresh' })).data;
    expect([q.mode, q.path, q.name, q.detected]).toEqual(['new', join(HOME, 'dev', 'fresh'), 'fresh', []]);
    expect(existsSync(join(HOME, 'dev', 'fresh'))).toBe(false); // the questions write nothing
  });

  it('refuses the current-directory default, which is not named', async () => {
    await start([e.root, p.root], { named: [false, false] });
    expect((await call('specpilot_setup_questions', { path: e.root })).refused).toMatch(/is not a folder this SpecPilot page is setting up/);
  });

  it('a pending target registered over HTTP by a token holder is accepted: D2 limits agent mistakes, not a local token holder (architect Q1)', async () => {
    await start([e.root, p.root]);
    expect((await page('/api/projects/pending', { parent: e.base, name: 'agent-chose' })).status).toBe(200);
    expect((await call('specpilot_setup_questions', { path: join(e.base, 'agent-chose') })).data.mode).toBe('new');
  });

  it('specpilot_setup_questions for a folder: detected rows, add-specs\'s questions, the optional fields; writes nothing', async () => {
    await start([e.root, p.root]);
    const before = snapshot(e.root);
    const q = (await call('specpilot_setup_questions', { path: e.root })).data;
    expect(q.name).toBe('new-app');
    expect(q.detected).toEqual(expect.arrayContaining([{ label: 'Project name', value: 'new-app' }, { label: 'Language', value: 'typescript' }]));
    expect(q.detected.map((r: { label: string }) => r.label)).not.toContain('Platforms'); // a seeded value is never a detected row
    const keys = q.questions.map((x: { key: string }) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['projectType', 'apiParadigm', 'handle', 'ide', 'platforms', 'databases', 'integrations']));
    expect(keys).not.toContain('language'); // detected, so not asked
    expect(q.questions.find((x: { key: string }) => x.key === 'ide')!.choices!.map((c: { value: string }) => c.value)).toContain('vscode');
    expect(q.questions.find((x: { key: string }) => x.key === 'platforms')).toMatchObject({ kind: 'list', max: 100 });
    expect(q.questions.find((x: { key: string }) => x.key === 'integrations')!.categories!.length).toBeGreaterThan(0);
    for (const k of Object.keys(OPTIONAL_FIELD_LIMITS)) expect([k, keys.includes(k)]).toEqual([k, true]); // all 23, whatever the answers turn out to be
    expect(snapshot(e.root)).toEqual(before);
  });

  it('specpilot_setup_questions for a new project: init\'s questions, the context questions only for Greenfield', async () => {
    await start([e.root, p.root]);
    await page('/api/projects/pending', { parent: e.base, name: 'fresh' });
    const q = (await call('specpilot_setup_questions', { path: join(e.base, 'fresh') })).data;
    expect(q.questions.find((x: { key: string }) => x.key === 'whatItDoes')).toMatchObject({ when: { projectType: 'greenfield' } });
    expect(q.questions.find((x: { key: string }) => x.key === 'language')!.choices!.map((c: { value: string }) => c.value)).toContain('typescript');
  });

  it('specpilot_setup_project in a folder: what add-specs writes, validate, and state-only events in order', async () => {
    await start([e.root, p.root]);
    events = await openEvents(port, `127.0.0.1:${port}`, '/api/events?project=1');
    await call('specpilot_setup_questions', { path: e.root });
    const r = await call('specpilot_setup_project', { path: e.root, answers: { ...ANSWERS, platforms: ['Web'] }, asked: ['handle', 'ide', 'handle', 'nope'] });
    expect(r.data.project).toBe(0);
    expect(r.data.written).toEqual(expect.arrayContaining(['.specs/project/project.yaml', '.vscode/settings.json']));
    expect(Array.isArray(r.data.validate.errors) && Array.isArray(r.data.validate.warnings)).toBe(true);
    expect(existsSync(join(e.root, '.specs/project/project.yaml'))).toBe(true);
    await events.waitFor(/"row":"validate","state":"done"/);
    const ev = setupEvents();
    expect(ev.map(x => `${x.row}:${x.state}`)).toEqual(['read:running', 'read:done', 'questions:running', 'questions:done', 'write:running', 'write:done', 'validate:running', 'validate:done']);
    expect(ev.every(x => x.project === 0 && !('pending' in x))).toBe(true);
    expect(ev[3]).toMatchObject({ fromCode: 3, fromUser: 2, topics: ['Handle', 'AI IDE'] }); // duplicates once, unknown keys ignored
    expect(ev[5].files).toBe(r.data.written.length);
    expect(ev[7]).toMatchObject({ errors: r.data.validate.errors.length, warnings: r.data.validate.warnings.length });
    // state only: no served root, no written file name, no detected value in any event's data
    const text = events.text().split('\n').filter(l => l.startsWith('data: {"project"') || l.startsWith('data: {"pending"')).join('\n');
    for (const leak of [realpathSync(e.root), realpathSync(p.root), 'new-app', ...r.data.written]) expect(text).not.toContain(leak);
    const labels = (await call('specpilot_setup_questions', { path: e.root })).refused; // .specs/ exists now
    expect(labels).toMatch(/already has \.specs\//);
  });

  it('refuses answers of the wrong shape, asked that is not a list, and a detected language sent anyway; writes nothing', async () => {
    await start([e.root, p.root]);
    const before = snapshot(e.root);
    expect((await call('specpilot_setup_project', { path: e.root, answers: [] })).refused).toBe('answers must be an object: one value per question key from specpilot_setup_questions.');
    expect((await call('specpilot_setup_project', { path: e.root, answers: ANSWERS, asked: 'handle' })).refused).toBe('asked must be a list of answer keys.');
    expect((await call('specpilot_setup_project', { path: e.root, answers: { ...ANSWERS, ide: 'Emacs' } })).refused).toMatch(/^"ide" must be one of/);
    expect((await call('specpilot_setup_project', { path: e.root, answers: { ...ANSWERS, language: 'python' } })).refused).toBe('The language was detected, so "language" must not be sent.');
    expect(snapshot(e.root)).toEqual(before);
  });

  it('a write that fails sends write idle and is a tool error with the writer\'s text', async () => {
    await start([e.root, p.root]);
    events = await openEvents(port, `127.0.0.1:${port}`, '/api/events?project=1');
    symlinkSync(p.outside, join(e.root, '.vscode'));
    const r = await call('specpilot_setup_project', { path: e.root, answers: ANSWERS });
    expect(r.refused).toBe('.vscode is a symbolic link, so nothing was written.');
    await events.waitFor(/"row":"write","state":"idle"/);
    expect(existsSync(join(e.root, '.specs'))).toBe(false);
  });

  it('a new project: created at the pending target, served and recorded, the slot cleared, the last event names it', async () => {
    await start([e.root, p.root]);
    events = await openEvents(port, `127.0.0.1:${port}`, '/api/events?project=1');
    await page('/api/projects/pending', { parent: e.base, name: 'fresh' });
    const target = join(realpathSync(e.base), 'fresh');
    expect((await call('specpilot_setup_project', { path: target, answers: { ...NEW, parent: '/x' } })).refused).toBe('"parent" and "name" come from the path; leave them out of answers.');
    const r = await call('specpilot_setup_project', { path: target, answers: NEW, asked: ['whatItDoes'] });
    expect([r.data.path, r.data.project]).toEqual([target, 2]);
    expect(existsSync(join(target, '.specs/project/project.yaml'))).toBe(true);
    expect(spec.pending()).toBeNull();
    expect(readRegistry(regFile()).entries!.map(x => x.path)).toContain(target);
    await events.waitFor(/"row":"validate","state":"done"/);
    const last = setupEvents().pop()!;
    expect(last).toMatchObject({ pending: true, project: 2 });
    expect(events.text()).not.toContain(target);
    expect((await call('specpilot_setup_project', { path: target, answers: NEW })).refused).toBe(`${target} already has .specs/. To add missing SpecPilot sections there, run specpilot backfill.`);
  });

  it('checks the target again at write time: a folder that filled up after registration is refused', async () => {
    await start([e.root, p.root]);
    await page('/api/projects/pending', { parent: e.base, name: 'fresh' });
    write(e.base, 'fresh/notes.txt', 'mine\n');
    const r = await call('specpilot_setup_project', { path: join(e.base, 'fresh'), answers: NEW });
    expect(r.refused).toBe(`${join(realpathSync(e.base), 'fresh')} already exists and is not empty. Use Open a Project Folder to open it and add .specs/ there.`);
    expect(readdirSync(join(e.base, 'fresh'))).toEqual(['notes.txt']);
  });

  it('checks the project cap again under the lock', async () => {
    const many = Array.from({ length: MAX_PROJECTS - 3 }, () => makeProject());
    try {
      await start([e.root, p.root, ...many.map(m => m.root)]);
      expect((await page('/api/projects/pending', { parent: e.base, name: 'fresh' })).status).toBe(200); // 19 served
      const extra = makeProject();
      many.push(extra);
      expect((await page('/api/projects', { path: extra.root })).status).toBe(200); // 20 served
      const r = await call('specpilot_setup_project', { path: join(e.base, 'fresh'), answers: NEW });
      expect(r.refused).toBe(`This server already serves ${MAX_PROJECTS} projects. Start another specpilot serve for more.`);
      expect(existsSync(join(e.base, 'fresh'))).toBe(false);
    } finally {
      many.forEach(m => m.cleanup());
    }
  });

  it('written but not readable to be served: a tool error naming the folder and the files, the slot cleared, no project', async () => {
    await start([e.root, p.root]);
    await page('/api/projects/pending', { parent: e.base, name: 'fresh' });
    const target = join(realpathSync(e.base), 'fresh');
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- the module object itself: a namespace import is a copy the server never calls
    const fs = require('fs') as typeof import('fs');
    const real = fs.readFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation(((path: unknown, ...rest: unknown[]) => {
      if (String(path).startsWith(join(target, '.specs') + '/')) throw new Error('EIO');
      return (real as (...a: unknown[]) => unknown)(path, ...rest);
    }) as typeof fs.readFileSync);
    const r = await call('specpilot_setup_project', { path: target, answers: NEW });
    expect(r.refused).toMatch(new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} was set up, but it could not be read to be served \\(This folder could not be read: EIO\\)\\. Open it with Open a Project Folder\\. Written: .*\\.specs/project/project\\.yaml`));
    expect(spec.pending()).toBeNull();
    expect(JSON.parse((await hit(port, '/api/specs')).body).projects).toHaveLength(2);
  });

  it('a refused pending registration clears the slot (BL-104)', async () => {
    await start([e.root, p.root]);
    await page('/api/projects/pending', { parent: e.base, name: 'fresh' });
    expect(spec.pending()).not.toBeNull();
    expect((await page('/api/projects/pending', { parent: e.base, name: 'proj' })).status).toBe(409); // a served root
    expect(spec.pending()).toBeNull();
  });
});

describe('Setup view server (BL-103)', () => {
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
  const pending = (body: unknown, headers = good()) => post(port, JSON.stringify(body), headers, '/api/projects/pending');
  const start = async (opts: Parameters<typeof startSpecServer>[3] = {}) => {
    spec = await startSpecServer([e.root, p.root], 0, '0.0.0-test', { registry: regFile(), ...opts });
    port = (spec.server.address() as AddressInfo).port;
    token = (/<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body) || [])[1];
  };
  const specsOf = async (n: number) => JSON.parse((await hit(port, `/api/specs?project=${n}`)).body);

  beforeEach(async () => {
    e = makeEmpty();
    p = makeProject();
    await start();
  });
  afterEach(async () => {
    await spec.close();
    e.cleanup();
    p.cleanup();
  });

  it('the chat\'s routes and its script are gone: they answer as any unknown path', async () => {
    for (const path of ['/api/setup?project=0', '/api/projects/new', '/api/preview', '/assets/chat-core.js']) {
      expect((await hit(port, path)).status).toBe(404);
      const r = await hit(port, path, { method: 'POST' });
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET');
    }
    expect((await hit(port, '/')).body).not.toContain('chat-core');
  });

  it('reports project.specs and named, and a .specs/ made outside the server flips specs', async () => {
    expect((await specsOf(0)).project).toMatchObject({ specs: false, named: true });
    expect((await specsOf(1)).project).toMatchObject({ specs: true, named: true });
    mkdirSync(join(e.root, '.specs'));
    expect((await specsOf(0)).project.specs).toBe(true);
  });

  it('keeps the current-directory default out of the Setup view (named false)', async () => {
    await spec.close();
    await start({ named: [false, false] });
    expect((await specsOf(0)).project).toMatchObject({ specs: false, named: false });
  });

  it('POST /api/projects/pending registers a missing or empty folder and creates nothing; the next replaces it', async () => {
    const before = readdirSync(e.base);
    const r = await pending({ parent: e.base, name: 'demo' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ target: join(realpathSync(e.base), 'demo') });
    expect(readdirSync(e.base)).toEqual(before);
    expect(spec.pending()).toBe(join(realpathSync(e.base), 'demo'));
    mkdirSync(join(e.base, 'empty'));
    expect((await pending({ parent: e.base, name: 'empty' })).status).toBe(200);
    expect(spec.pending()).toBe(join(realpathSync(e.base), 'empty'));
    expect(readdirSync(join(e.base, 'empty'))).toEqual([]);
  });

  it('refuses a request that fails the write checks, or of the wrong shape, keeping the pending path', async () => {
    await pending({ parent: e.base, name: 'demo' });
    const body = { parent: e.base, name: 'other' };
    expect((await pending(body, good({ Origin: 'http://evil.example' }))).status).toBe(403);
    expect((await pending(body, good({ 'X-SpecPilot-Token': 'f'.repeat(64) }))).status).toBe(403);
    expect((await pending(body, good({ 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await post(port, JSON.stringify({ parent: 'x'.repeat(17 * 1024), name: 'a' }), good(), '/api/projects/pending')).status).toBe(413);
    expect((await post(port, '{not json', good(), '/api/projects/pending')).status).toBe(400);
    expect((await pending({ parent: e.base })).json.error).toBe('"name" is missing.');
    expect((await pending({ ...body, extra: 1 })).json.error).toBe('Unexpected field "extra".');
    expect((await pending({ parent: e.base, name: 'demo app' })).json.error).toBe('Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores.');
    expect((await pending({ parent: 'a\0b', name: 'x' })).json.error).toBe('"parent" must not contain a NUL character.');
    expect(spec.pending()).toBe(join(realpathSync(e.base), 'demo'));
  });

  it('refuses a served root, a link, a file, a non-empty folder, the home folder and a .specs/ parent with the existing messages', async () => {
    const real = realpathSync(e.base);
    const served = await pending({ parent: e.base, name: 'proj' });
    expect(served.status).toBe(409);
    expect(served.json).toEqual({ error: `${join(real, 'proj')} is already open as project 0.`, project: 0 });
    symlinkSync(p.root, join(e.base, 'link'));
    expect((await pending({ parent: e.base, name: 'link' })).json.error).toBe(`${join(real, 'link')} is a symbolic link, so nothing was created.`);
    writeFileSync(join(e.base, 'file'), 'x');
    expect((await pending({ parent: e.base, name: 'file' })).json.error).toBe(`${join(real, 'file')} exists and is not a folder, so nothing was created.`);
    write(e.base, 'full/a.txt', 'x');
    const full = await pending({ parent: e.base, name: 'full' });
    expect(full.status).toBe(409);
    expect(full.json.error).toBe(`${join(real, 'full')} already exists and is not empty. Use Open a Project Folder to open it and add .specs/ there.`);
    expect((await pending({ parent: HOME, name: 'x' })).json.error).toBe('Pick a folder inside your home folder, like ~/dev.');
    expect((await pending({ parent: '/', name: 'x' })).json.error).toBe('Pick a folder inside your home folder, like ~/dev.');
    mkdirSync(join(e.base, '.specs'));
    expect((await pending({ parent: join(e.base, '.specs'), name: 'x' })).json.error).toBe('A project cannot be created inside a .specs/ folder.');
    expect(spec.pending()).toBeNull();
  });

  it(`refuses with ${MAX_PROJECTS} projects served`, async () => {
    await spec.close();
    const many = Array.from({ length: MAX_PROJECTS }, () => makeProject());
    try {
      spec = await startSpecServer(many.map(m => m.root), 0, '0.0.0-test', { registry: regFile() });
      port = (spec.server.address() as AddressInfo).port;
      token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
      expect((await pending({ parent: e.base, name: 'demo' })).status).toBe(409);
    } finally {
      await spec.close();
      many.forEach(m => m.cleanup());
      await start();
    }
  });

  it('has no pending route with --read-only', async () => {
    await spec.close();
    await start({ readOnly: true, registry: undefined });
    const r = await hit(port, '/api/projects/pending', { method: 'POST' });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('');
  });

  it('mcp.client: null until an initialize, then its sanitized name, sent to open streams as event: mcp', async () => {
    await spec.close();
    await start({ mcp: true });
    const rpc = (msg: unknown, over: Record<string, string> = {}) =>
      post(port, JSON.stringify(msg), { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': spec.mcpToken!, ...over }, '/mcp');
    expect((await specsOf(0)).mcp).toEqual({ client: null });
    const events = await openEvents(port, `127.0.0.1:${port}`, '/api/events?project=0');
    await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect((await specsOf(0)).mcp).toEqual({ client: null }); // only an initialize (or a 2026-07-28 request) connects
    await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } } });
    expect((await specsOf(0)).mcp).toEqual({ client: { name: 'claude-code' } });
    expect(await events.waitFor(/event: mcp\ndata: .*\n/)).toBe('event: mcp\ndata: {"client":{"name":"claude-code"}}\n');
    await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {} } });
    expect((await specsOf(0)).mcp).toEqual({ client: { name: '' } });
    await rpc({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: '‮\u0007⁦' } } });
    expect((await specsOf(0)).mcp).toEqual({ client: { name: '' } });
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'Cursor', version: '2' } };
    const modern = await rpc({ jsonrpc: '2.0', id: 4, method: 'server/discover', params: { _meta: meta } }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' });
    expect(modern.status).toBe(200);
    expect((await specsOf(0)).mcp).toEqual({ client: { name: 'Cursor' } });
    events.close();
    expect(events.text()).not.toMatch(/event: mcp\ndata: .*(\/|https?:)/);
  });

  it('a refused MCP request connects nothing', async () => {
    await spec.close();
    await start({ mcp: true });
    const r = await post(port, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'x' } } }), { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': 'f'.repeat(64) }, '/mcp');
    expect(r.status).toBe(403);
    expect((await specsOf(0)).mcp).toEqual({ client: null });
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
      'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written), and a folder without .specs/ can be set up there (new files only). Open pages update when a spec file changes. Press Ctrl+C to stop.',
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
      'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
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
// No project served (BL-080): the state a bare `specpilot serve` without .specs/ (and the desktop app) starts in.
describe('no project served (BL-080)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;

  beforeEach(async () => {
    p = makeProject();
    spec = await startSpecServer([], 0, '0.0.0-test', { pollMs: 250, settleMs: 30, heartbeatMs: 60, registry: regFile(), mcp: true });
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });
  const writeHeaders = (over: Record<string, string | undefined> = {}) => ({ Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token, ...over });
  const mcpHeaders = { Host: '', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-SpecPilot-Token': '', 'MCP-Protocol-Version': '2025-11-25' };
  const mcp = (method: string, params: unknown) => post(port, JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), { ...mcpHeaders, Host: `127.0.0.1:${port}`, 'X-SpecPilot-Token': spec.mcpToken! }, '/mcp');

  it('answers GET /api/specs without a project as the no-project state, the version at the top level', async () => {
    const r = await hit(port, '/api/specs');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ project: null, projects: [], files: {}, specpilotVersion: '0.0.0-test', mcp: { client: null } });
  });

  it('answers 404 on every project route, with ?project=0 and without the parameter, after the shared write checks', async () => {
    for (const path of ['/api/specs?project=0', '/api/events?project=0', '/api/file?p=CLAUDE.md', '/api/file?project=0&p=CLAUDE.md']) {
      expect((await hit(port, path)).status).toBe(404);
    }
    for (const path of ['/api/tasks/move', '/api/tasks/new', '/api/tasks/archive', '/api/commands/regenerate']) {
      for (const q of ['', '?project=0']) {
        expect((await post(port, '{}', writeHeaders({ 'If-Match': 'x' }), path + q)).status).toBe(404);
        expect((await post(port, '{}', writeHeaders({ Origin: undefined }), path + q)).status).toBe(403);
      }
    }
  });

  it('opens a server-level stream: counted against the cap, carries mcp, never a change; the first open becomes project 0', async () => {
    const open = await Promise.all(Array.from({ length: MAX_EVENT_STREAMS }, () => openEvents(port)));
    expect(open.every(s => s.status === 200)).toBe(true);
    await until(() => spec.streams() === MAX_EVENT_STREAMS);
    expect((await openEvents(port)).status).toBe(503);
    open.slice(1).forEach(s => s.close());
    await until(() => spec.streams() === 1);
    const first = open[0];
    await first.waitFor(/: heartbeat\n\n/, 1000);
    await mcp('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    expect(await first.waitFor(/event: mcp\ndata: .*\n/)).toBe('event: mcp\ndata: {"client":{"name":"claude-code"}}\n');
    expect(JSON.parse((await hit(port, '/api/specs')).body).mcp).toEqual({ client: { name: 'claude-code' } });

    const opened = await post(port, JSON.stringify({ path: p.root }), writeHeaders(), '/api/projects');
    expect(opened.status).toBe(200);
    expect(opened.json.project).toBe(0);
    expect(opened.json.specs.specpilotVersion).toBe('0.0.0-test');
    expect(opened.json.specs.project.specpilotVersion).toBeUndefined();
    expect(JSON.parse((await hit(port, '/api/specs?project=0')).body).projects).toHaveLength(1);
    expect(JSON.parse((await hit(port, '/api/specs')).body).project.root).toBe(realpathSync(p.root)); // omitted means project 0 again
    expect(readRegistry(regFile()).entries!.map(x => x.path)).toEqual([realpathSync(p.root)]);
    const fresh = await openEvents(port);
    await until(() => spec.streams() === 2);
    write(p.root, '.specs/planning/tasks.md', '# changed\n');
    await fresh.waitFor(/event: change\n/, 3000);
    expect(first.text()).not.toContain('event: change'); // the no-project stream stays server-level for its life
    fresh.close();
    first.close();
    await until(() => spec.streams() === 0);
  });

  it('over /mcp, specpilot_list_projects is empty and a tool that takes a project is refused', async () => {
    expect((await mcp('tools/call', { name: 'specpilot_list_projects', arguments: {} })).json.result.structuredContent.projects).toEqual([]);
    const r = await mcp('tools/call', { name: 'specpilot_list_tasks', arguments: {} });
    expect(r.json.result).toEqual({ content: [{ type: 'text', text: 'No project 0 is served. specpilot_list_projects lists them.' }], isError: true });
  });
});

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

  it('opens a folder without .specs/ for the Setup view (it counts as named)', async () => {
    const r = await open(e.root);
    expect(r.status).toBe(200);
    expect(r.json.specs.project).toMatchObject({ specs: false, named: true });
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

const NEW_ANSWERS = {
  projectType: 'greenfield', language: 'typescript', framework: 'react', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode',
  whatItDoes: 'Tracks parcels', targetUsers: '', expectedScale: '', constraints: '',
};


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

  it('answers 405 with an empty Allow on all four routes and puts no token in the page', async () => {
    for (const [path, method] of [['/api/projects', 'GET'], ['/api/projects', 'POST'], ['/api/projects/remove', 'POST'], ['/api/projects/pending', 'POST']] as const) {
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

  /** Stops still owed by tests that kept the server up (BL-114's HTTP checks); run before the outer afterEach restores `process.exit`. */
  const afterStops: Array<() => Promise<void>> = [];
  /** Start, read the output, stop with Ctrl+C; with `keep`, `fetch` works until the test's own afterEach stops it. */
  async function serveAndStop(folders: string[], options: { readOnly?: boolean } = {}, keep = false): Promise<{ port: number; out: string[]; fetch: (path: string) => ReturnType<typeof hit> }> {
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
    const stop = async () => {
      process.emit('SIGINT');
      expect(await done).toBe(0);
    };
    const fetch = (path: string) => hit(port, path);
    if (keep) afterStops.push(stop);
    else await stop();
    return { port, out, fetch };
  }

  it('creates the registry file with the served folder when there is none, and prints the registry line after the hint (BL-080)', async () => {
    const t0 = Date.now();
    const { port, out } = await serveAndStop([a.root]);
    const reg = readRegistry(regFile());
    expect(reg.entries!.map(x => x.path)).toEqual([realpathSync(a.root)]);
    expect(Date.parse(reg.entries![0].lastOpened)).toBeGreaterThanOrEqual(t0 - 1000);
    if (process.platform !== 'win32') {
      expect(statSync(join(HOME, '.specpilot')).mode & 0o777).toBe(0o700);
      expect(statSync(regFile()).mode & 0o777).toBe(0o600);
    }
    expect(out.slice(0, 3)).toEqual([
      `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`,
      'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
      'Projects are remembered in ~/.specpilot/projects.json.',
    ]);
  });

  it('records the current-directory default too, and creates nothing when nothing is served (BL-080)', async () => {
    const cwd = process.cwd();
    const empty = mkdtempSync(join(os.tmpdir(), 'specpilot-empty-'));
    try {
      process.chdir(a.root);
      await serveAndStop([]);
      expect(readRegistry(regFile()).entries!.map(x => x.path)).toEqual([realpathSync(a.root)]);
      rmSync(join(HOME, '.specpilot'), { recursive: true, force: true });
      logs.length = 0;
      process.chdir(empty);
      const { out } = await serveAndStop([]);
      expect(existsSync(join(HOME, '.specpilot'))).toBe(false);
      expect(out[0]).toMatch(/^SpecPilot is running at http:\/\/127\.0\.0\.1:\d+ with no project open\.$/);
      expect(out[1]).toBe(`No .specs/ folder in ${realpathSync(empty)}. Open a project from the page, or run specpilot serve <folder>.`);
    } finally {
      process.chdir(cwd);
      rmSync(empty, { recursive: true, force: true });
    }
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

  // Remembered projects reopened at startup (BL-114, REQ-002.H.45): the registry's entries with .specs/ follow the named folders.
  describe('reopens the remembered projects (BL-114)', () => {
    const entry = (path: string, lastOpened: string, pinned = false): RegistryEntry => ({ path: realpathSync(path), lastOpened, pinned });
    const fileHash = () => createHash('sha256').update(readFileSync(regFile())).digest('hex');
    let empty: string;
    let cwd: string;
    beforeEach(() => {
      cwd = process.cwd();
      empty = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-empty-')));
      process.chdir(empty);
    });
    afterEach(async () => {
      for (const stop of afterStops.splice(0)) await stop(); // before the outer afterEach restores process.exit
      process.chdir(cwd);
      rmSync(empty, { recursive: true, force: true });
    });
    const HINT = 'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written). Open pages update when a spec file changes. Press Ctrl+C to stop.';

    it('serves the remembered projects in display order after a cwd without .specs/, prints the lines in order, and leaves the file byte for byte', async () => {
      writeRegistry(regFile(), [entry(a.root, '2026-01-01T00:00:00.000Z'), entry(b.root, '2026-01-02T00:00:00.000Z')]);
      const before = fileHash();
      const { port, out } = await serveAndStop([]);
      expect(out.slice(0, 6)).toEqual([
        `SpecPilot is serving 2 projects at http://127.0.0.1:${port}`,
        `  0  ${realpathSync(b.root)}`,
        `  1  ${realpathSync(a.root)}`,
        `No .specs/ folder in ${empty}. Open a project from the page, or run specpilot serve <folder>.`,
        'Reopened 2 remembered projects from ~/.specpilot/projects.json.',
        HINT,
      ]);
      expect(out.join('\n')).not.toContain('with no project open');
      expect(fileHash()).toBe(before);
    });

    it('prints the single-project line and the singular for one remembered project, pinned first otherwise', async () => {
      writeRegistry(regFile(), [entry(a.root, '2026-01-01T00:00:00.000Z')]);
      const one = await serveAndStop([]);
      expect(one.out.slice(0, 3)).toEqual([
        `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${one.port}`,
        `No .specs/ folder in ${empty}. Open a project from the page, or run specpilot serve <folder>.`,
        'Reopened 1 remembered project from ~/.specpilot/projects.json.',
      ]);
      logs.length = 0;
      writeRegistry(regFile(), [entry(a.root, '2026-01-01T00:00:00.000Z', true), entry(b.root, '2026-01-02T00:00:00.000Z')]);
      const two = await serveAndStop([]);
      expect(two.out[1]).toBe(`  0  ${realpathSync(a.root)}`);
    });

    it('serves a named folder once, at index 0, records it, and leaves the reopened entry as it was', async () => {
      writeRegistry(regFile(), [entry(a.root, '2026-01-01T00:00:00.000Z'), entry(b.root, '2026-01-02T00:00:00.000Z')]);
      const { port, out } = await serveAndStop([a.root]);
      expect(out.slice(0, 4)).toEqual([
        `SpecPilot is serving 2 projects at http://127.0.0.1:${port}`,
        `  0  ${realpathSync(a.root)}`,
        `  1  ${realpathSync(b.root)}`,
        'Reopened 1 remembered project from ~/.specpilot/projects.json.',
      ]);
      const reg = readRegistry(regFile()).entries!;
      expect(reg.find(e => e.path === realpathSync(b.root))!.lastOpened).toBe('2026-01-02T00:00:00.000Z');
      expect(Date.parse(reg.find(e => e.path === realpathSync(a.root))!.lastOpened)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
    });

    it("reopens the current directory's own entry once too, with named false for it and true for the reopened one", async () => {
      writeRegistry(regFile(), [entry(a.root, '2026-01-01T00:00:00.000Z'), entry(b.root, '2026-01-02T00:00:00.000Z')]);
      process.chdir(a.root);
      const { port, out, fetch } = await serveAndStop([], {}, true);
      expect(out.slice(0, 3)).toEqual([`SpecPilot is serving 2 projects at http://127.0.0.1:${port}`, `  0  ${realpathSync(a.root)}`, `  1  ${realpathSync(b.root)}`]);
      const p0 = JSON.parse((await fetch('/api/specs?project=0')).body);
      const p1 = JSON.parse((await fetch('/api/specs?project=1')).body);
      expect(p0.project.named).toBe(false);
      expect(p1.project.named).toBe(true);
      expect(p1.project.root).toBe(realpathSync(b.root));
    });

    it('skips, silently, an entry without .specs/, a missing folder, a file, the home folder and a root; Home still lists them', async () => {
      const bare = mkdtempSync(join(os.tmpdir(), 'specpilot-bare-'));
      const gone = join(bare, 'gone');
      try {
        writeRegistry(regFile(), [
          entry(a.root, '2026-01-05T00:00:00.000Z'),
          { path: realpathSync(bare), lastOpened: '2026-01-04T00:00:00.000Z', pinned: false },
          { path: gone, lastOpened: '2026-01-03T00:00:00.000Z', pinned: false },
          { path: join(realpathSync(a.root), 'CLAUDE.md'), lastOpened: '2026-01-02T00:00:00.000Z', pinned: false },
          { path: HOME, lastOpened: '2026-01-01T00:00:00.000Z', pinned: false },
          { path: '/', lastOpened: '2025-12-31T00:00:00.000Z', pinned: false },
        ]);
        const { port, out, fetch } = await serveAndStop([], {}, true);
        expect(out.slice(0, 3)).toEqual([
          `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`,
          `No .specs/ folder in ${empty}. Open a project from the page, or run specpilot serve <folder>.`,
          'Reopened 1 remembered project from ~/.specpilot/projects.json.',
        ]);
        expect(out.join('\n')).not.toContain('Not reopened');
        const list = JSON.parse((await fetch('/api/projects')).body);
        expect(list.entries.map((e: { path: string; project: number | null; exists: boolean }) => [e.path, e.project, e.exists])).toEqual([
          [realpathSync(a.root), 0, true],
          [realpathSync(bare), null, true],
          [gone, null, false],
          [join(realpathSync(a.root), 'CLAUDE.md'), null, false],
          [HOME, null, true],
          ['/', null, true],
        ]);
      } finally {
        rmSync(bare, { recursive: true, force: true });
      }
    });

    (process.platform === 'win32' || process.getuid?.() === 0 ? it.skip : it)('says why a remembered project could not be read, after the Reopened line, and serves the rest', async () => {
      writeRegistry(regFile(), [entry(a.root, '2026-01-02T00:00:00.000Z'), entry(b.root, '2026-01-01T00:00:00.000Z')]);
      chmodSync(join(b.root, '.specs/planning/tasks.md'), 0o000);
      try {
        const { port, out } = await serveAndStop([]);
        expect(out.slice(0, 3)).toEqual([
          `SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${port}`,
          `No .specs/ folder in ${empty}. Open a project from the page, or run specpilot serve <folder>.`,
          'Reopened 1 remembered project from ~/.specpilot/projects.json.',
        ]);
        expect(out[3]).toMatch(new RegExp(`^Not reopened: ${realpathSync(b.root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(.*EACCES.*\\)\\.$`));
        expect(out[4]).toBe(HINT);
      } finally {
        chmodSync(join(b.root, '.specs/planning/tasks.md'), 0o644);
      }
    });

    it('stops at 20 served, counts only what would have been reopened, and names the real count', async () => {
      const many = Array.from({ length: 19 }, () => makeProject());
      const missing = join(empty, 'missing');
      try {
        writeRegistry(regFile(), [...many.map((m, i) => entry(m.root, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`)), entry(a.root, '2025-12-01T00:00:00.000Z'), { path: missing, lastOpened: '2025-11-01T00:00:00.000Z', pinned: false }]);
        const first = await serveAndStop([b.root, a.root]); // 2 named, then 18 of the 19 remembered; a is already served; the missing one is not counted
        expect(first.out[0]).toBe(`SpecPilot is serving ${MAX_PROJECTS} projects at http://127.0.0.1:${first.port}`);
        expect(first.out.slice(MAX_PROJECTS + 1, MAX_PROJECTS + 3)).toEqual(['Reopened 18 remembered projects from ~/.specpilot/projects.json.', `1 remembered project not reopened: this server already serves ${MAX_PROJECTS}.`]);
        logs.length = 0;
        const named = [...many.map(m => m.root), a.root, b.root]; // 21 named: nothing reopened, the real count
        writeRegistry(regFile(), [entry(empty, '2026-02-01T00:00:00.000Z')]);
        write(empty, '.specs/project/project.yaml', 'name: x\n');
        const second = await serveAndStop(named);
        expect(second.out[0]).toBe(`SpecPilot is serving 21 projects at http://127.0.0.1:${second.port}`);
        expect(second.out[22]).toBe('1 remembered project not reopened: this server already serves 21.');
        expect(second.out.join('\n')).not.toContain('Reopened ');
      } finally {
        many.forEach(m => m.cleanup());
      }
    });

    it('never runs the stale-staging sweep in a reopened project', async () => {
      const stale = join(b.root, '.specpilot-setup-0123456789ab');
      mkdirSync(stale);
      writeFileSync(join(stale, STAGING_MARKER), '');
      writeRegistry(regFile(), [entry(b.root, '2026-01-01T00:00:00.000Z')]);
      const { out } = await serveAndStop([]);
      expect(out[2]).toBe('Reopened 1 remembered project from ~/.specpilot/projects.json.');
      expect(existsSync(stale)).toBe(true);
      expect(out.join('\n')).not.toContain('Removed ');
    });

    it('reopens nothing with --read-only or a refused registry', async () => {
      writeRegistry(regFile(), [entry(b.root, '2026-01-01T00:00:00.000Z')]);
      const ro = await serveAndStop([a.root], { readOnly: true });
      expect(ro.out[0]).toBe(`SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${ro.port}`);
      expect(ro.out.join('\n')).not.toContain('Reopened');
      logs.length = 0;
      writeFileSync(regFile(), '{broken');
      const bad = await serveAndStop([a.root]);
      expect(bad.out[0]).toBe(`SpecPilot is serving ${realpathSync(a.root)} at http://127.0.0.1:${bad.port}`);
      expect(bad.out.join('\n')).not.toContain('Reopened');
      expect(bad.out.some(l => l.includes('could not be read'))).toBe(true);
    });
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


describe('local MCP endpoint over HTTP (BL-PM-007)', () => {
  let a: ReturnType<typeof makeProject>;
  let b: ReturnType<typeof makeProject>;
  let spec: SpecServer | null = null;
  let port: number;
  let token: string;
  const fileOf = (root: string) => join(root, '.specs/planning/tasks.md');
  const hashOf = (root: string) => createHash('sha256').update(readFileSync(fileOf(root))).digest('hex');
  const start = async (opts: Parameters<typeof startSpecServer>[3] = {}) => {
    spec = await startSpecServer([a.root, b.root], 0, '0.0.0-test', { mcp: true, ...opts });
    port = (spec.server.address() as AddressInfo).port;
    token = spec.mcpToken!;
  };
  const headers = (over: Record<string, string | string[] | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-SpecPilot-Token': token,
    'MCP-Protocol-Version': '2025-11-25',
    ...over,
  });
  const rpc = (method: string, params?: unknown, over: Record<string, string | string[] | undefined> = {}) =>
    post(port, JSON.stringify({ jsonrpc: '2.0', id: 7, method, ...(params === undefined ? {} : { params }) }), headers(over), '/mcp');
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await rpc('tools/call', { name, arguments: args });
    expect(r.status).toBe(200);
    return r.json.result as { content: Array<{ text: string }>; structuredContent?: any; isError?: boolean };
  };
  const pageWrite = (path: string, body: unknown, root: string, project: number, over: Record<string, string | undefined> = {}) =>
    post(port, JSON.stringify(body), {
      Host: `127.0.0.1:${port}`,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/json',
      'X-SpecPilot-Token': token,
      'If-Match': hashOf(root),
      ...over,
    }, `${path}?project=${project}`);

  beforeEach(() => {
    a = makeProject();
    b = makeProject();
    writeFileSync(fileOf(a.root), MOVE_TASKS);
    writeFileSync(fileOf(b.root), MOVE_TASKS);
  });
  afterEach(async () => {
    await spec?.close();
    spec = null;
    a.cleanup();
    b.cleanup();
  });

  it('is off without --mcp: /mcp answers as any unknown path and the page has no card meta', async () => {
    spec = await startSpecServer([a.root], 0, '0.0.0-test');
    port = (spec.server.address() as AddressInfo).port;
    expect(spec.mcpToken).toBeNull();
    expect((await hit(port, '/mcp')).status).toBe(404);
    expect((await hit(port, '/mcp', { method: 'POST' })).status).toBe(405);
    expect((await hit(port, '/')).body).not.toContain('specpilot-mcp');
  });

  it('takes the page token and tells the page to show the card with it', async () => {
    await start();
    const page = (await hit(port, '/')).body;
    expect(page).toContain(`<meta name="specpilot-token" content="${token}">`);
    expect(page).toContain('<meta name="specpilot-mcp" content="page">');
  });

  it('runs the initialize handshake: JSON answers to a client that also accepts SSE, 202 with no body for notifications', async () => {
    await start();
    const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, { 'MCP-Protocol-Version': undefined });
    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(init.json.result).toEqual({ protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'specpilot-local', version: '0.0.0-test' }, instructions: `${REVIEW_INSTRUCTIONS} ${SETUP_INSTRUCTIONS}` });
    for (const method of ['notifications/initialized', 'notifications/cancelled']) {
      const n = await post(port, JSON.stringify({ jsonrpc: '2.0', method }), headers(), '/mcp');
      expect(n.status).toBe(202);
      expect(n.json).toBe('');
    }
    expect((await rpc('ping')).json.result).toEqual({});
  });

  it('refuses a protocol version header it does not serve with 400', async () => {
    await start();
    const r = await rpc('tools/list', undefined, { 'MCP-Protocol-Version': '2026-07-28' });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toBe('Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18)');
  });

  it.each([['GET'], ['DELETE'], ['PUT']])('answers %s with 405 and Allow: POST', async method => {
    await start();
    const r = await hit(port, '/mcp', { method });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('POST');
  });

  it('refuses a foreign Host with 403', async () => {
    await start();
    expect((await rpc('ping', undefined, { Host: `evil.com:${port}` })).status).toBe(403);
  });

  it('takes no Origin and the page own, and refuses any other with 403 before the token is looked at', async () => {
    await start();
    expect((await rpc('ping')).status).toBe(200);
    expect((await rpc('ping', undefined, { Origin: `http://127.0.0.1:${port}` })).status).toBe(200);
    for (const origin of ['https://evil.com', 'null', `http://localhost:${port}`]) {
      const r = await rpc('ping', undefined, { Origin: origin, 'X-SpecPilot-Token': 'wrong' });
      expect(r.status).toBe(403);
      expect(r.json.error.message).toBe('This request came from a web page, so it was refused.');
    }
  });

  it.each([['missing', undefined], ['wrong', 'f'.repeat(64)], ['short', 'abc']])('refuses a %s token with 403 and names the header, not 401 (an OAuth challenge to Claude Code)', async (_why, value) => {
    await start();
    const r = await rpc('ping', undefined, { 'X-SpecPilot-Token': value });
    expect(r.status).toBe(403);
    expect(r.headers['www-authenticate']).toBeUndefined();
    expect(r.json).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This request did not carry a valid X-SpecPilot-Token header, so it was refused. Copy the config line again from the page or the terminal.' } });
  });

  it('refuses another content type (415), a body over 64 KB (413, BL-104) and a body that is not JSON (400, -32700)', async () => {
    await start();
    expect((await rpc('ping', undefined, { 'Content-Type': 'text/plain' })).status).toBe(415);
    const big = await post(port, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(65 * 1024) } }), headers(), '/mcp');
    expect(big.status).toBe(413);
    expect((await post(port, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(60 * 1024) } }), headers(), '/mcp')).status).toBe(200);
    const bad = await post(port, '{nope', headers(), '/mcp');
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe(-32700);
  });

  it('lists ten tools (BL-104; specpilot_set_task since BL-125)', async () => {
    await start();
    expect((await rpc('tools/list')).json.result.tools.map((t: any) => t.name)).toHaveLength(10);
  });

  it('lists projects and tasks as /api/specs gives them', async () => {
    await start();
    const specs = JSON.parse((await hit(port, '/api/specs?project=1')).body);
    const projects = (await tool('specpilot_list_projects')).structuredContent.projects;
    expect(projects).toHaveLength(2);
    expect(projects[1]).toEqual({ project: 1, name: 'Fixture Project', root: specs.projects[1].root, branch: 'main', specs: true, files: specs.nav.specs.map((f: string) => '.specs/' + f) });
    expect((await tool('specpilot_list_tasks', { project: 1 })).structuredContent).toEqual(specs.tasks);
  });

  it('reads an allowlisted file verbatim and refuses everything /api/file refuses', async () => {
    await start();
    expect((await tool('specpilot_read_spec', { path: '.specs/planning/tasks.md' })).content[0].text).toBe(MOVE_TASKS);
    symlinkSync(join(a.outside, 'secret.txt'), join(a.root, '.specs', 'leak.md'));
    for (const path of ['src/secret.ts', '.specs/../src/secret.ts', '../outside/secret.txt', '/etc/passwd', '.specs/planning/tasks.md\0', '.specs/leak.md', '', 5]) {
      const r = await tool('specpilot_read_spec', { path });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/^Not found, or not a file SpecPilot shows: /);
    }
  });

  it.each([[2], [-1], [1.5], ['0']])('refuses project %j as a tool error', async project => {
    await start();
    const r = await tool('specpilot_list_tasks', { project });
    expect(r).toEqual({ content: [{ type: 'text', text: `No project ${String(project)} is served. specpilot_list_projects lists them.` }], isError: true });
  });

  it('adds a task with the same bytes the page route writes', async () => {
    await start();
    const r = await tool('specpilot_new_task', { project: 0, description: ' Ship the MCP card ', section: 'currentSprint', sha256: hashOf(a.root) });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ id: 'CS-002', section: 'currentSprint', index: 1, sha256: hashOf(a.root) });
    expect((await pageWrite('/api/tasks/new', { description: ' Ship the MCP card ', section: 'currentSprint' }, b.root, 1)).status).toBe(200);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(readFileSync(fileOf(b.root), 'utf-8'));
  });

  it('sets Type and Priority with the same bytes the page route writes, its refusals in the words of the route (BL-125)', async () => {
    await start();
    writeFileSync(fileOf(a.root), FIELDS_TASKS);
    writeFileSync(fileOf(b.root), FIELDS_TASKS);
    const r = await tool('specpilot_set_task', { id: 'BL-002', type: 'bug', priority: 'P1', sha256: hashOf(a.root) });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ sha256: hashOf(a.root) });
    expect((await pageWrite('/api/tasks/fields', { id: 'BL-002', type: 'bug', priority: 'P1' }, b.root, 1)).status).toBe(200);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(readFileSync(fileOf(b.root), 'utf-8'));
    for (const args of [{ id: 'CS-001', priority: 'P1' }, { id: 'BL-002', priority: 'high' }, { id: 'BL-002' }]) {
      const page = await pageWrite('/api/tasks/fields', args, b.root, 1);
      const viaTool = await tool('specpilot_set_task', { ...args, sha256: hashOf(a.root) });
      expect(viaTool).toEqual({ content: [{ type: 'text', text: page.json.error }], isError: true });
    }
    const stale = await tool('specpilot_set_task', { id: 'BL-002', priority: 'P2', sha256: 'a'.repeat(64) });
    expect(stale.content[0].text).toBe('planning/tasks.md changed on disk since you last read it, so Type and Priority were not changed. Call specpilot_list_tasks for the current sha256, then try again.');
    const added = await tool('specpilot_new_task', { description: 'Via tool', section: 'backlog', type: 'feat', priority: 'P2', sha256: hashOf(a.root) });
    expect(readFileSync(fileOf(a.root), 'utf-8').split('\n')).toContain(`| ${added.structuredContent.id} | feat | P2 | Via tool |`);
    expect((await tool('specpilot_list_tasks')).structuredContent.backlog[1]).toMatchObject({ id: 'BL-002', type: 'bug', priority: 'P1' });
  });

  it('lists no specpilot_set_task with --read-only (BL-125)', async () => {
    await start({ readOnly: true });
    const names = (await rpc('tools/list')).json.result.tools.map((t: any) => t.name);
    expect(names).not.toContain('specpilot_set_task');
  });

  it('moves a task with the same bytes the page route writes', async () => {
    await start();
    const r = await tool('specpilot_move_task', { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256: hashOf(a.root) });
    expect(r.structuredContent).toEqual({ from: 'backlog', fromIndex: 1, sha256: hashOf(a.root) });
    expect((await pageWrite('/api/tasks/move', { id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }, b.root, 1)).status).toBe(200);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(readFileSync(fileOf(b.root), 'utf-8'));
  });

  it('moves a row to Review and back, and refuses every move to Completed with the by-hand rule (BL-113)', async () => {
    await start();
    writeFileSync(fileOf(a.root), REVIEW_TASKS);
    const toReview = await tool('specpilot_move_task', { id: 'CS-001', toSection: 'review', toIndex: 0, sha256: hashOf(a.root) });
    expect(toReview.structuredContent).toEqual({ from: 'currentSprint', fromIndex: 0, sha256: hashOf(a.root) });
    const tasks = (await tool('specpilot_list_tasks')).structuredContent;
    expect(tasks.review.map((r: { id: string }) => r.id)).toEqual(['CS-001', 'BL-003', 'BL-004']);
    expect(tasks.review[2]).toMatchObject({ approved: null, history: [{ date: '2026-10-01', note: 'earlier' }] });
    expect(tasks.moves).toEqual({ backlog: ['currentSprint'], currentSprint: ['backlog', 'review'], review: ['currentSprint'] });
    const back = await tool('specpilot_move_task', { id: 'CS-001', toSection: 'currentSprint', toIndex: 0, sha256: hashOf(a.root) });
    expect(back.structuredContent).toMatchObject({ from: 'review', fromIndex: 0 });
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(REVIEW_TASKS);
    for (const id of ['BL-003', 'BL-004', 'BL-001']) {
      const refused = await tool('specpilot_move_task', { id, toSection: 'completed', toIndex: 0, sha256: hashOf(a.root) });
      expect(refused).toEqual({ content: [{ type: 'text', text: COMPLETED_BY_HAND }], isError: true });
    }
    expect((await tool('specpilot_move_task', { id: 'BL-003', toSection: 'backlog', toIndex: 0, sha256: hashOf(a.root) })).content[0].text).toBe('Review rows cannot be moved to Backlog.');
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(REVIEW_TASKS);
  });

  it('refuses a stale sha256 with "since you last read it" and writes nothing', async () => {
    await start();
    const stale = 'f'.repeat(64);
    const move = await tool('specpilot_move_task', { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256: stale });
    expect(move).toEqual({ content: [{ type: 'text', text: 'planning/tasks.md changed on disk since you last read it. The move was not made.' }], isError: true });
    const add = await tool('specpilot_new_task', { description: 'x', section: 'backlog', sha256: stale });
    expect(add.content[0].text).toBe('planning/tasks.md changed on disk since you last read it, so the task was not added. Call specpilot_list_tasks for the current sha256, then try again.');
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('refuses what the page refuses, with the page text, and a missing sha256', async () => {
    await start();
    const sha256 = hashOf(a.root);
    expect((await tool('specpilot_new_task', { description: 'a | b', section: 'backlog', sha256 })).content[0].text).toContain('cannot contain |');
    expect((await tool('specpilot_new_task', { description: 'x', section: 'completed', sha256 })).content[0].text).toBe('New tasks can only go to Backlog or Current Sprint.');
    expect((await tool('specpilot_move_task', { id: 'BL-002', toSection: 'currentSprint', toIndex: -1, sha256 })).content[0].text).toBe('The position must be a whole number, 0 or more.');
    expect((await tool('specpilot_move_task', { id: 'BL-404', toSection: 'currentSprint', toIndex: 0, sha256 })).isError).toBe(true);
    expect((await tool('specpilot_new_task', { description: 'x', section: 'backlog' })).content[0].text).toBe('sha256 is required: the hash specpilot_list_tasks returned.');
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('runs a page move and a tool move one after the other under the one lock', async () => {
    await start();
    const sha256 = hashOf(a.root);
    const [page, mcp] = await Promise.all([
      pageWrite('/api/tasks/move', { id: 'BL-001', toSection: 'currentSprint', toIndex: 0 }, a.root, 0),
      rpc('tools/call', { name: 'specpilot_move_task', arguments: { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256 } }),
    ]);
    // Same starting hash: whichever takes the lock first wins, the other then finds the file changed.
    const pageWon = page.status === 200;
    expect(pageWon ? mcp.json.result.isError : page.status === 409).toBe(true);
    expect(pageWon ? page.status : mcp.json.result.isError).toBe(pageWon ? 200 : undefined);
    const rows = readFileSync(fileOf(a.root), 'utf-8').split('\n').filter(l => /^\| (BL|CS)-/.test(l));
    expect(rows).toEqual(pageWon ? ['| BL-002 | Two |', '| BL-001 | One |', '| CS-001 | Sprint |'] : ['| BL-001 | One |', '| BL-002 | Two |', '| CS-001 | Sprint |']);
  });

  it('validates without writing anything', async () => {
    await start();
    const before = snapshot(a.root);
    const r = (await tool('specpilot_validate_specs')).structuredContent;
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain('Missing required file: architecture/architecture.md');
    expect(snapshot(a.root)).toEqual(before);
  });

  it('regenerates commands as the page route does', async () => {
    await start();
    const r = (await tool('specpilot_regenerate_commands', { project: 0 })).structuredContent;
    const page = (await pageWrite('/api/commands/regenerate', {}, b.root, 1)).json;
    // the page also refreshes the skill (BL-PM-012); the tool is commands only
    const SKILL = '.claude/skills/specpilot-project/SKILL.md';
    expect(r).toEqual({ added: page.added, updated: page.updated, kept: page.kept.filter((k: { path: string }) => k.path !== SKILL), message: page.message.filter((l: string) => !l.startsWith('Kept as they were: ' + SKILL)) });
    expect(r.added.length).toBeGreaterThan(0);
  });

  it('leaves an out-of-date released skill byte for byte, where the page route would refresh it (BL-PM-012)', async () => {
    const SKILL = '.claude/skills/specpilot-project/SKILL.md';
    write(a.root, '.specs/project/project.yaml', 'name: "MCP Project"\nlanguage: typescript\n');
    const released = fillReleasedSkill(KNOWN_SKILL_TEMPLATES[0], { projectName: 'MCP Project', language: 'typescript' });
    write(a.root, SKILL, released);
    await start();
    await tool('specpilot_regenerate_commands', { project: 0 });
    expect(readFileSync(join(a.root, SKILL), 'utf-8')).toBe(released);
    expect((await pageWrite('/api/commands/regenerate', {}, a.root, 0)).json.updated).toEqual([SKILL]);
  });

  it('keeps the page write routes exact about Origin when --mcp is on', async () => {
    await start();
    expect((await pageWrite('/api/tasks/move', { id: 'BL-002', toSection: 'currentSprint', toIndex: 0 }, a.root, 0, { Origin: undefined })).status).toBe(403);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('with --read-only: a token for /mcp only, read tools only, and the page as read-only as before', async () => {
    await start({ readOnly: true });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const page = (await hit(port, '/')).body;
    expect(page).not.toContain('specpilot-token');
    expect(page).not.toContain('specpilot-mcp');
    expect(page).not.toContain(token);
    expect((await rpc('tools/list')).json.result.tools.map((t: any) => t.name)).toEqual(['specpilot_list_projects', 'specpilot_read_spec', 'specpilot_list_tasks', 'specpilot_validate_specs']);
    const write = await rpc('tools/call', { name: 'specpilot_move_task', arguments: { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256: hashOf(a.root) } });
    expect(write.json.error).toEqual({ code: -32602, message: 'Unknown tool: specpilot_move_task' });
    expect((await tool('specpilot_list_tasks')).structuredContent.sha256).toBe(hashOf(a.root));
    for (const path of ['/api/tasks/move', '/api/tasks/new', '/api/commands/regenerate', '/api/projects']) expect((await pageWrite(path, {}, a.root, 0)).status).toBe(405);
    expect((await hit(port, '/api/projects')).status).toBe(405);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('with SPECPILOT_MCP_TOKEN: takes that token only, and the page names it instead of carrying it', async () => {
    const env = 'e'.repeat(40);
    await start({ mcpToken: env });
    expect(token).toBe(env);
    const page = (await hit(port, '/')).body;
    expect(page).toContain('<meta name="specpilot-mcp" content="env">');
    expect(page).not.toContain(env);
    const pageToken = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec(page)![1];
    expect((await rpc('ping', undefined, { 'X-SpecPilot-Token': pageToken })).status).toBe(403);
    expect((await rpc('ping')).status).toBe(200);
  });

  // BL-089 (REQ-002.H.33, SEC-004.21): revision 2026-07-28 over HTTP, with the headers a conforming client sends.
  const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 't', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
  const modern = (method: string, params: Record<string, unknown> = {}, over: Record<string, string | string[] | undefined> = {}) =>
    post(
      port,
      JSON.stringify({ jsonrpc: '2.0', id: 9, method, params: { ...params, _meta: META } }),
      { ...headers(), 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...(method === 'tools/call' ? { 'Mcp-Name': String(params.name) } : {}), ...over },
      '/mcp',
    );

  it('serves 2026-07-28: discover, list, and a task write with the same bytes as the page route', async () => {
    await start();
    const d = await modern('server/discover');
    expect(d.status).toBe(200);
    expect(d.json.result).toEqual({
      resultType: 'complete',
      supportedVersions: ['2026-07-28', '2025-11-25', '2025-06-18'],
      capabilities: { tools: {} },
      instructions: `${REVIEW_INSTRUCTIONS} ${SETUP_INSTRUCTIONS}`,
      ttlMs: 0,
      cacheScope: 'private',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'specpilot-local', version: '0.0.0-test' } },
    });
    expect((await modern('tools/list')).json.result.tools).toHaveLength(10);
    const add = await modern('tools/call', { name: 'specpilot_new_task', arguments: { description: ' Ship the MCP card ', section: 'currentSprint', sha256: hashOf(a.root) } });
    expect(add.status).toBe(200);
    expect(add.json.result.resultType).toBe('complete');
    expect(add.json.result.structuredContent.id).toBe('CS-002');
    expect((await pageWrite('/api/tasks/new', { description: ' Ship the MCP card ', section: 'currentSprint' }, b.root, 1)).status).toBe(200);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(readFileSync(fileOf(b.root), 'utf-8'));
  });

  it('refuses repeated mirrored headers sent as separate lines with -32020, and writes nothing', async () => {
    await start();
    const args = { name: 'specpilot_move_task', arguments: { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256: hashOf(a.root) } };
    for (const over of [{ 'Mcp-Method': ['tools/call', 'tools/call'] }, { 'MCP-Protocol-Version': ['2026-07-28', '2026-07-28'] }, { 'Mcp-Name': ['specpilot_move_task', 'specpilot_move_task'] }]) {
      const r = await modern('tools/call', args, over);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe(-32020);
      expect(r.json.error.message).toMatch(/header was sent 2 times$/);
    }
    expect((await modern('tools/call', args, { 'Mcp-Name': 'specpilot_list_tasks' })).json.error.code).toBe(-32020);
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('answers -32022 for another version and 404 for ping, and the guards still answer first', async () => {
    await start();
    const v = await post(port, JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '2027-01-01' } } }), { ...headers(), 'MCP-Protocol-Version': '2027-01-01', 'Mcp-Method': 'tools/list' }, '/mcp');
    expect(v.status).toBe(400);
    expect(v.json.error).toEqual({ code: -32022, message: 'Unsupported protocol version', data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18'], requested: '2027-01-01' } });
    const ping = await modern('ping');
    expect(ping.status).toBe(404);
    expect(ping.json.error.code).toBe(-32601);
    expect((await modern('tools/list', {}, { 'X-SpecPilot-Token': 'x'.repeat(64) })).status).toBe(403);
    expect((await modern('tools/list', {}, { Origin: 'https://evil.com' })).status).toBe(403);
    expect((await modern('tools/list', {}, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await modern('tools/list', {}, { Host: 'evil.com' })).status).toBe(403);
    expect((await modern('tools/list', { pad: 'x'.repeat(65 * 1024) })).status).toBe(413);
  });

  it('with --read-only lists four tools on 2026-07-28 and refuses a write tool with -32602 and HTTP 200', async () => {
    await start({ readOnly: true });
    expect((await modern('tools/list')).json.result.tools).toHaveLength(4);
    const w = await modern('tools/call', { name: 'specpilot_move_task', arguments: { id: 'BL-002', toSection: 'currentSprint', toIndex: 0, sha256: hashOf(a.root) } });
    expect(w.status).toBe(200);
    expect(w.json.error).toEqual({ code: -32602, message: 'Unknown tool: specpilot_move_task' });
    expect(readFileSync(fileOf(a.root), 'utf-8')).toBe(MOVE_TASKS);
  });

  it('still joins a repeated version header on the initialize-based path, as Node did before BL-089', async () => {
    await start();
    const r = await rpc('ping', undefined, { 'MCP-Protocol-Version': ['2025-11-25', '2025-11-25'] });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toBe('Bad Request: Unsupported protocol version: 2025-11-25, 2025-11-25 (supported versions: 2025-11-25, 2025-06-18)');
  });
});

describe('Quit (BL-098)', () => {
  let p: ReturnType<typeof makeProject>;
  let spec: SpecServer;
  let port: number;
  let token: string;
  let onQuit: jest.Mock;
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    ...over,
  });
  const quit = (headers: Record<string, string | undefined>, body = '{}') => post(port, body, headers, '/api/quit');

  beforeEach(async () => {
    p = makeProject();
    onQuit = jest.fn();
    spec = await startSpecServer([p.root], 0, '0.0.0-test', { onQuit });
    port = (spec.server.address() as AddressInfo).port;
    token = /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await hit(port, '/')).body)![1];
  });
  afterEach(async () => {
    await spec.close();
    p.cleanup();
  });

  it.each([
    ['a bad Host', { Host: 'evil.example' }, 403],
    ['no Origin', { Origin: undefined }, 403],
    ['another Origin', { Origin: 'http://evil.example' }, 403],
    ['no token', { 'X-SpecPilot-Token': undefined }, 403],
    ['a wrong token', { 'X-SpecPilot-Token': 'f'.repeat(64) }, 403],
    ['a body that is not JSON', { 'Content-Type': 'text/plain' }, 415],
  ])('refuses %s and does not stop', async (_what, over, status) => {
    expect((await quit(good(over))).status).toBe(status);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('refuses a body over the size limit with 413', async () => {
    expect((await quit(good(), JSON.stringify({ pad: 'x'.repeat(20000) }))).status).toBe(413);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('answers 405 to GET', async () => {
    const r = await hit(port, '/api/quit');
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('POST');
  });

  it('answers 202 and then stops once, also when asked again', async () => {
    const r = await quit(good());
    expect(r.status).toBe(202);
    expect(r.json).toEqual({ stopping: true });
    await new Promise(res => setTimeout(res, 20));
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect((await quit(good())).status).toBe(202);
    await new Promise(res => setTimeout(res, 20));
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it('is 405 with an empty Allow under --read-only', async () => {
    const ro = await startSpecServer([p.root], 0, 'x', { readOnly: true, onQuit });
    const roPort = (ro.server.address() as AddressInfo).port;
    try {
      const r = await post(roPort, '{}', { Host: `127.0.0.1:${roPort}`, Origin: `http://127.0.0.1:${roPort}`, 'Content-Type': 'application/json' }, '/api/quit');
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('');
      expect(onQuit).not.toHaveBeenCalled();
    } finally {
      await ro.close();
    }
  });
});

describe('specpilot serve --stop (BL-098)', () => {
  let p: ReturnType<typeof makeProject>;
  let cwd: string;
  let exit: jest.SpyInstance;
  let errors: string[];
  let logs: string[];
  const NONE = (port: number) => `No SpecPilot server that --stop can reach is running on port ${port}. A --read-only server stops with Ctrl+C in its terminal.`;
  const freePort = async () => {
    const probe = await startSpecServer([p.root], 0, 'x');
    const port = (probe.server.address() as AddressInfo).port;
    await probe.close();
    return port;
  };

  beforeEach(() => {
    p = makeProject();
    cwd = process.cwd();
    process.chdir(p.root);
    errors = [];
    logs = [];
    exit = jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(stripVTControlCharacters(a.join(' '))));
    jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
  });
  afterEach(() => {
    process.chdir(cwd);
    jest.restoreAllMocks();
    p.cleanup();
  });

  it('stops a running specpilot serve the way Ctrl+C does, and says so', async () => {
    const port = await freePort();
    let exited: (code: number) => void;
    const exitCode = new Promise<number>(r => (exited = r));
    exit.mockImplementation(((code: number) => {
      if (code === 0) return exited(code);
      throw new Error(`exit ${code}`);
    }) as never);
    const before = process.listenerCount('SIGINT');
    await serveCommand([], { port: String(port), mcp: false }); // no config line, so any token in the log came from --stop
    await serveCommand([], { stop: true, port: String(port) });
    expect(await exitCode).toBe(0);
    expect(logs).toContain(`Stopped the SpecPilot server on port ${port}.`);
    expect(process.listenerCount('SIGINT')).toBe(before);
    expect(logs.join('\n')).not.toMatch(/[0-9a-f]{64}/); // the token is never printed
  });

  it('exits 1 when nothing listens on the port', async () => {
    const port = await freePort();
    await expect(serveCommand([], { stop: true, port: String(port) })).rejects.toThrow('exit 1');
    expect(errors).toEqual([NONE(port)]);
  });

  it('exits 1 for a server that is not SpecPilot, and sends it nothing but GET /', async () => {
    const seen: string[] = [];
    const other = createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      res.end('<html><title>SpecPilot Local</title></html>');
    });
    await new Promise<void>(r => other.listen(0, '127.0.0.1', r));
    const port = (other.address() as AddressInfo).port;
    try {
      await expect(serveCommand([], { stop: true, port: String(port) })).rejects.toThrow('exit 1');
      expect(errors).toEqual([NONE(port)]);
      expect(seen).toEqual(['GET /']);
    } finally {
      await new Promise(r => other.close(r));
    }
  });

  it('exits 1 for a --read-only server, which keeps running', async () => {
    const ro = await startSpecServer([p.root], 0, 'x', { readOnly: true });
    const port = (ro.server.address() as AddressInfo).port;
    try {
      await expect(serveCommand([], { stop: true, port: String(port) })).rejects.toThrow('exit 1');
      expect(errors).toEqual([NONE(port)]);
      expect((await hit(port, '/')).status).toBe(200);
    } finally {
      await ro.close();
    }
  });

  it.each([
    ['a folder', ['.'], {}],
    ['--read-only', [], { readOnly: true }],
    ['--open', [], { open: true }],
    ['--mcp', [], { mcp: true }],
    ['--no-mcp', [], { mcp: false }],
    ['--poll', [], { poll: '500' }],
  ])('exits 1 with %s', async (_what, folders, opts) => {
    await expect(serveCommand(folders as string[], { stop: true, ...opts })).rejects.toThrow('exit 1');
    expect(errors).toEqual(['--stop takes only --port. Run `specpilot serve --stop` or `specpilot serve --stop --port <n>`.']);
  });

  it('exits 1 for an invalid --port', async () => {
    await expect(serveCommand([], { stop: true, port: '0' })).rejects.toThrow('exit 1');
    expect(errors).toEqual(['Invalid --port "0". Use a whole number from 1 to 65535.']);
  });
});
