import { request } from 'http';
import { AddressInfo } from 'net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { BROWSE_TIMEOUT_MS, dialogPrograms, pickedPath, pickFolder } from '../utils/folderPicker';
import { readRegistry, registryPath } from '../utils/projectRegistry';
import { SpecServer, startSpecServer } from '../utils/specServer';

// BL-PM-011. No real dialog opens: stub `osascript`, `zenity` and `kdialog` shell scripts are the only
// thing on PATH, so a missing stub is a missing program. The Windows branch is checked by its arguments.

const REAL = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PATH: process.env.PATH };
const ODD_HOME = `/tmp/it's "a" \\ home`;
let base: string;
let bin: string;
let log: string;

/** A stub dialog: logs its arguments one per line, its working directory and pid, then acts on STUB_MODE. */
function installStub(name: string): void {
  writeFileSync(
    join(bin, name),
    `#!/bin/sh
for a; do printf '%s\\n' "$a"; done > "$STUB_LOG.args"
pwd > "$STUB_LOG.cwd"
echo $$ > "$STUB_LOG.pid"
if read line; then echo open > "$STUB_LOG.stdin"; else echo closed > "$STUB_LOG.stdin"; fi
case "$STUB_MODE" in
  cancel) [ "$0" != "\${0%osascript}" ] && echo "execution error: User canceled. (-128)" >&2; exit 1 ;;
  fail) printf 'Gtk-WARNING: cannot open display: :0\\nsecond line\\n' >&2; exit 3 ;;
  silentfail) exit 4 ;;
  hang) exec /bin/sleep 30 ;;
  *) printf '%s' "$STUB_OUT" ;;
esac
`,
    { mode: 0o755 },
  );
}
const logged = (what: string) => readFileSync(`${log}.${what}`, 'utf-8');
const args = () => logged('args').replace(/\n$/, '').split('\n');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (test: () => boolean, ms = 10000) => {
  const end = Date.now() + ms;
  while (!test() && Date.now() < end) await new Promise(r => setTimeout(r, 20));
  return test();
};

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-browse-')));
  bin = join(base, 'bin');
  mkdirSync(bin);
  log = join(base, 'stub');
  process.env.PATH = bin;
  process.env.STUB_LOG = log;
  delete process.env.STUB_MODE;
  process.env.STUB_OUT = '/Users/me/dev/My Project/\n';
});
afterEach(() => {
  process.env.PATH = REAL.PATH;
  process.env.HOME = REAL.HOME;
  process.env.USERPROFILE = REAL.USERPROFILE;
  delete process.env.STUB_LOG;
  delete process.env.STUB_MODE;
  delete process.env.STUB_OUT;
  rmSync(base, { recursive: true, force: true });
});

describe('pickedPath()', () => {
  it.each([
    ['/Users/me/p/\n', 'darwin', '/Users/me/p'],
    ['/Users/me/p\n', 'linux', '/Users/me/p'],
    ['/Users/me/p', 'linux', '/Users/me/p'],
    ['/\n', 'darwin', '/'],
    ['C:\\Users\\x\\\r\n', 'win32', 'C:\\Users\\x'],
    ['C:\\\n', 'win32', 'C:\\'],
    ['/Users/me/Ünï cødé/\n', 'darwin', '/Users/me/Ünï cødé'],
  ])('%j on %s → %j', (out, platform, path) => expect(pickedPath(out, platform as NodeJS.Platform)).toBe(path));

  it.each([
    ['relative/p\n', 'linux'],
    ['C:relative\n', 'win32'],
    ['/a\n/b\n', 'darwin'],
    ['/a\0b\n', 'linux'],
    [`/${'a'.repeat(4096)}\n`, 'linux'],
    ['\n', 'linux'],
  ])('%j on %s is unusable', (out, platform) => expect(pickedPath(out, platform as NodeJS.Platform)).toBeNull());

  it('keeps a path of exactly 4096 characters', () => expect(pickedPath(`/${'a'.repeat(4095)}\n`, 'linux')).toHaveLength(4096));
});

describe('dialogPrograms()', () => {
  it('puts the home folder in no osascript or PowerShell argument: the arrays are the same for any home', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const a = dialogPrograms('/Users/me', platform);
      const b = dialogPrograms(ODD_HOME, platform);
      expect(b.map(p => [p.file, p.args])).toEqual(a.map(p => [p.file, p.args]));
      expect(JSON.stringify(b)).not.toContain("it's");
    }
    const [ps] = dialogPrograms('C:\\Users\\x', 'win32');
    expect(ps.file).toBe('powershell.exe');
    expect(ps.args.slice(0, 4)).toEqual(['-NoProfile', '-NonInteractive', '-STA', '-Command']);
    expect(ps.args).toHaveLength(5);
    expect(ps.args[4]).toContain("[Environment]::GetFolderPath('UserProfile')");
    expect(ps.args[4]).toContain('FolderBrowserDialog');
    expect(ps.args[4]).toContain('TopMost = $true');
  });

  it('has no program on another platform', async () => {
    expect(dialogPrograms('/home/me', 'freebsd')).toEqual([]);
    expect(await pickFolder('/home/me', { platform: 'freebsd' })).toEqual({ error: 'No folder dialog is available on this machine. Type the path instead.' });
  });
});

(process.platform === 'win32' ? describe.skip : describe)('pickFolder() with stub dialogs', () => {
  it('macOS: osascript with the constant script, in the home folder\'s root, stdin closed; the folder picked', async () => {
    installStub('osascript');
    expect(await pickFolder(ODD_HOME, { platform: 'darwin' })).toEqual({ path: '/Users/me/dev/My Project' });
    expect(args()).toEqual(['-e', 'activate', '-e', 'POSIX path of (choose folder with prompt "Choose a project folder" default location (path to home folder))']);
    expect(logged('cwd').trim()).toBe('/');
    expect(logged('stdin').trim()).toBe('closed');
  });

  it('Linux: zenity gets the home folder as one whole argument', async () => {
    installStub('zenity');
    process.env.STUB_OUT = '/home/me/p\n';
    expect(await pickFolder(ODD_HOME, { platform: 'linux' })).toEqual({ path: '/home/me/p' });
    expect(args()).toEqual(['--file-selection', '--directory', '--title=Choose a project folder', `--filename=${ODD_HOME}/`]);
  });

  it('Linux: kdialog when zenity is not installed, the home folder one argument', async () => {
    installStub('kdialog');
    process.env.STUB_OUT = '/home/me/p\n';
    expect(await pickFolder(ODD_HOME, { platform: 'linux' })).toEqual({ path: '/home/me/p' });
    expect(args()).toEqual(['--getexistingdirectory', ODD_HOME, '--title', 'Choose a project folder']);
  });

  it('no program installed', async () => {
    for (const platform of ['darwin', 'linux'] as const) expect(await pickFolder('/home/me', { platform })).toEqual({ error: 'No folder dialog is available on this machine. Type the path instead.' });
  });

  it('a cancel is null: osascript exit 1 with -128, zenity and kdialog exit 1', async () => {
    process.env.STUB_MODE = 'cancel';
    installStub('osascript');
    expect(await pickFolder('/home/me', { platform: 'darwin' })).toEqual({ path: null });
    installStub('zenity');
    expect(await pickFolder('/home/me', { platform: 'linux' })).toEqual({ path: null });
    rmSync(join(bin, 'zenity'));
    installStub('kdialog');
    expect(await pickFolder('/home/me', { platform: 'linux' })).toEqual({ path: null });
  });

  it('osascript exit 1 without -128 is a failure, not a cancel', async () => {
    writeFileSync(join(bin, 'osascript'), '#!/bin/sh\necho "execution error: no user interaction allowed (-1713)" >&2\nexit 1\n', { mode: 0o755 });
    expect(await pickFolder('/home/me', { platform: 'darwin' })).toEqual({ error: 'The folder dialog could not be opened: execution error: no user interaction allowed (-1713)' });
  });

  it('a failure gives the first stderr line, cut at 300; no stderr gives the exit code', async () => {
    installStub('zenity');
    process.env.STUB_MODE = 'fail';
    expect(await pickFolder('/home/me', { platform: 'linux' })).toEqual({ error: 'The folder dialog could not be opened: Gtk-WARNING: cannot open display: :0' });
    process.env.STUB_MODE = 'silentfail';
    expect(await pickFolder('/home/me', { platform: 'linux' })).toEqual({ error: 'The folder dialog could not be opened: exit code 4' });
    writeFileSync(join(bin, 'zenity'), `#!/bin/sh\nprintf '%s\\n' "${'x'.repeat(400)}" >&2\nexit 2\n`, { mode: 0o755 });
    const out = (await pickFolder('/home/me', { platform: 'linux' })) as { error: string };
    expect(out.error).toBe(`The folder dialog could not be opened: ${'x'.repeat(300)}`);
  });

  it('unusable output', async () => {
    installStub('osascript');
    process.env.STUB_OUT = 'relative/path\n';
    expect(await pickFolder('/home/me', { platform: 'darwin' })).toEqual({ error: 'The folder dialog did not return a usable path.' });
    process.env.STUB_OUT = `/${'a'.repeat(70 * 1024)}\n`; // over the 64 KB buffer
    expect(await pickFolder('/home/me', { platform: 'darwin' })).toEqual({ error: 'The folder dialog did not return a usable path.' });
  });

  it('the time limit kills the dialog', async () => {
    installStub('osascript');
    process.env.STUB_MODE = 'hang';
    expect(await pickFolder('/home/me', { platform: 'darwin', timeoutMs: 300 })).toEqual({ error: 'The folder dialog was closed after 5 minutes.' });
    // Under load the stub can be killed before it writes its pid: then nothing was left running either.
    if (existsSync(`${log}.pid`)) expect(alive(Number(logged('pid')))).toBe(false);
    expect(BROWSE_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  it('an abort kills the dialog and answers null', async () => {
    installStub('osascript');
    process.env.STUB_MODE = 'hang';
    const abort = new AbortController();
    const out = pickFolder('/home/me', { platform: 'darwin', signal: abort.signal });
    expect(await until(() => existsSync(`${log}.pid`))).toBe(true);
    abort.abort();
    expect(await out).toEqual({ path: null });
    expect(await until(() => !alive(Number(logged('pid'))))).toBe(true);
  });
});

type Answer = { status: number; headers: Record<string, unknown>; json: any };
function call(port: number, path: string, method: string, headers: Record<string, string | undefined>, body?: string) {
  let req!: import('http').ClientRequest;
  const answer = new Promise<Answer>((resolve, reject) => {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) h[k] = v;
    req = request({ host: '127.0.0.1', port, path, method, headers: h }, res => {
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
    req.on('error', err => ((err as NodeJS.ErrnoException).code === 'ECONNRESET' ? undefined : reject(err)));
    req.end(body);
  });
  return { req, answer };
}

// The route on this machine's platform, with that platform's stub: macOS osascript, Linux zenity.
(process.platform === 'darwin' || process.platform === 'linux' ? describe : describe.skip)('POST /api/projects/browse (BL-PM-011)', () => {
  const stub = process.platform === 'darwin' ? 'osascript' : 'zenity';
  let home: string;
  let served: string;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const good = (over: Record<string, string | undefined> = {}) => ({ Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', 'X-SpecPilot-Token': token, ...over });
  const get = (path: string) => call(port, path, 'GET', { Host: `127.0.0.1:${port}` }).answer;
  const browse = (body: unknown = {}, headers = good()) => call(port, '/api/projects/browse', 'POST', headers, typeof body === 'string' ? body : JSON.stringify(body));
  const start = async (opts: { readOnly?: boolean } = {}) => {
    spec = await startSpecServer([served], 0, '0.0.0-test', { registry: registryPath(home), ...opts });
    port = (spec.server.address() as AddressInfo).port;
    token = (/<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await get('/')).json) || [])[1];
  };
  const stubRan = () => existsSync(`${log}.args`);

  beforeEach(async () => {
    home = join(base, 'home');
    mkdirSync(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    served = join(base, 'served');
    mkdirSync(join(served, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(served, '.specs', 'planning', 'tasks.md'), '# Tasks\n\n## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | One |\n');
    installStub(stub);
    await start();
  });
  afterEach(async () => {
    await spec.close();
  });

  it('refuses a request that fails the write checks, before any dialog', async () => {
    expect((await browse({}, good({ Host: 'evil.example' })).answer).status).toBe(403);
    expect((await browse({}, good({ Origin: undefined })).answer).status).toBe(403);
    expect((await browse({}, good({ Origin: 'http://evil.example' })).answer).status).toBe(403);
    expect((await browse({}, good({ 'X-SpecPilot-Token': undefined })).answer).status).toBe(403);
    expect((await browse({}, good({ 'Content-Type': 'text/plain' })).answer).status).toBe(415);
    expect((await browse({ x: 'a'.repeat(17 * 1024) }).answer).status).toBe(413);
    expect((await browse('{not json').answer).status).toBe(400);
    for (const body of [{ path: '/etc' }, [], null, 'x']) expect((await browse(JSON.stringify(body)).answer)).toMatchObject({ status: 422, json: { error: 'Send an empty JSON object.' } });
    expect(stubRan()).toBe(false);
  });

  it('answers 405 with Allow: POST to other methods, and to everything with --read-only', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const r = await call(port, '/api/projects/browse', method, { Host: `127.0.0.1:${port}` }).answer;
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('POST');
    }
    await spec.close();
    await start({ readOnly: true });
    const r = await browse({}, good({ 'X-SpecPilot-Token': 'x' })).answer;
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('');
    expect(stubRan()).toBe(false);
  });

  it('returns the folder picked, and reads, serves and records nothing', async () => {
    process.env.STUB_OUT = `${served}/\n`;
    const before = readdirSync(home);
    expect(await browse().answer).toMatchObject({ status: 200, json: { path: served } });
    expect((await get('/api/specs')).json.projects).toHaveLength(1);
    expect(readdirSync(home)).toEqual(before); // no ~/.specpilot created
    expect(readRegistry(registryPath(home)).entries).toEqual([]);
  });

  it('a cancel is 200 {path: null}; a failure is 422 with its line', async () => {
    process.env.STUB_MODE = 'cancel';
    expect(await browse().answer).toMatchObject({ status: 200, json: { path: null } });
    process.env.STUB_MODE = 'fail';
    expect((await browse().answer).status).toBe(422);
  });

  it('a second request while a dialog is open is 409; the first still answers', async () => {
    process.env.STUB_MODE = 'hang';
    const first = browse();
    expect(await until(() => existsSync(`${log}.pid`))).toBe(true);
    expect(await browse().answer).toMatchObject({ status: 409, json: { error: 'A folder dialog is already open.' } });
    first.req.destroy();
    expect(await until(() => !alive(Number(logged('pid'))))).toBe(true);
  });

  it('the request closing closes the dialog, and the next request opens a new one', async () => {
    process.env.STUB_MODE = 'hang';
    const first = browse();
    expect(await until(() => existsSync(`${log}.pid`))).toBe(true);
    const pid = Number(logged('pid'));
    first.req.destroy();
    expect(await until(() => !alive(pid))).toBe(true);
    process.env.STUB_MODE = 'cancel';
    let r: Answer | undefined;
    for (let i = 0; i < 50 && (!r || r.status === 409); i++) r = await browse().answer; // the flag clears as the kill settles
    expect(r).toMatchObject({ status: 200, json: { path: null } });
  });

  it('stopping the server closes the dialog; no dialog starts after', async () => {
    process.env.STUB_MODE = 'hang';
    browse();
    expect(await until(() => existsSync(`${log}.pid`))).toBe(true);
    const pid = Number(logged('pid'));
    await spec.stopClone(); // SIGKILL is sent before it resolves; the process is gone a moment later
    expect(await until(() => !alive(pid))).toBe(true);
    expect(await browse().answer).toMatchObject({ status: 503, json: { error: 'The server is stopping.' } });
  });
});
