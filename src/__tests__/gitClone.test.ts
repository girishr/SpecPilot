import { execFileSync } from 'child_process';
import { ClientRequest, request } from 'http';
import { AddressInfo } from 'net';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import * as gitClone from '../utils/gitClone';
import { MAX_PROJECTS, readRegistry, registryPath } from '../utils/projectRegistry';
import { SpecServer, startSpecServer } from '../utils/specServer';
import { cloneRepository, cloneShapeError, cloneUrlError, emptyTarget, gitErrorLine, MAX_GIT_LINE, probeGit, repoNameFromUrl } from '../utils/gitClone';

// BL-PM-002. No test here uses the network: real git clones a local bare repository through the
// test-only `allowProtocols`, and a stub `git` script on PATH stands in where git's own behaviour is
// not the point. Every test runs under a temp HOME, so the developer's git configuration is not read.

const REAL = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PATH: process.env.PATH, XDG: process.env.XDG_CONFIG_HOME };
const GIT_VARS = ['LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'LANGUAGE', 'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_CONFIG_GLOBAL', 'GIT_DIR', 'GIT_WORK_TREE', 'STUB_LOG', 'STUB_MODE', 'STUB_SSH', 'STUB_STDERR', 'STUB_CONFIG_EXIT'];
let HOME: string;
let base: string;
beforeEach(() => {
  HOME = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-githome-')));
  base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-clone-')));
  process.env.HOME = HOME;
  process.env.USERPROFILE = HOME;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.XDG_CONFIG_HOME = join(HOME, '.config');
  for (const name of GIT_VARS) delete process.env[name];
});
afterEach(() => {
  process.env.HOME = REAL.HOME;
  process.env.USERPROFILE = REAL.USERPROFILE;
  process.env.PATH = REAL.PATH;
  delete process.env.GIT_CONFIG_NOSYSTEM;
  if (REAL.XDG === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = REAL.XDG;
  for (const name of GIT_VARS) delete process.env[name];
  rmSync(HOME, { recursive: true, force: true });
  rmSync(base, { recursive: true, force: true });
});

const ONLY = 'Only https://host/path, git@host:path and ssh://host/path repository URLs can be cloned.';
const CREDENTIALS = 'Remove the user name and password from the URL. git reads them from your credential helper.';
const SPACES = 'The repository URL must not contain spaces or control characters.';

describe('cloneUrlError()', () => {
  it.each([
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo',
    'https://git.example.com:8443/team/repo.git',
    'https://dev.azure.com/org/project/_git/repo',
    'ssh://git@github.com/owner/repo.git',
    'ssh://git@host.example:2222/owner/repo.git',
    'ssh://host.example/owner/repo.git',
    'git@github.com:owner/repo.git',
    'git@host:/srv/git/repo.git',
    'me_2@host.example:repo',
    'https://host/~user/a+b/c%20d.git',
  ])('accepts %s', url => {
    expect(cloneUrlError(url)).toBeNull();
  });

  it.each([
    'file:///tmp/repo',
    'file://localhost/tmp/repo',
    'ext::sh -c x',
    'ext::sh',
    '/abs/path',
    './rel',
    '../x',
    'repo',
    'C:\\repo',
    '-u',
    '--upload-pack=x',
    '-oProxyCommand=x',
    'http://host/x',
    'git://host/x',
    'ftp://host/x',
    'HTTPS://host/x',
    'https://host',
    'https://host/',
    'https://-host/x',
    'https://host/-x',
    'https://[::1]/x',
    'ssh://-oProxyCommand=x/y',
    'ssh://git:pw@host/x',
    'git@-host:x',
    'git@host:-x',
    'host:path',
    'alias:owner/repo',
    'a@b@host:x',
    'git@host:a:b',
    'https://host/x?y=1',
    'https://host/x#y',
    'https://host/x\\y',
    'https://host/a@b',
  ])('refuses %s', url => {
    expect(cloneUrlError(url)).toBe(url.includes(' ') ? SPACES : ONLY);
  });

  it.each(['https://user@host/x', 'https://user:pw@host/x', 'https://org@dev.azure.com/org/p/_git/r', 'https://ghp_token@github.com/o/r.git'])(
    'refuses credentials in %s with its own message',
    url => {
      expect(cloneUrlError(url)).toBe(CREDENTIALS);
    },
  );

  it.each([' ', '\t', '\n', '\r', '\0', '\u007f', '\u00a0', '\u2028', '\u2029', '\u3000'])('refuses whitespace or a control character (%j) anywhere', ch => {
    for (const url of [`https://host/x${ch}`, `${ch}https://host/x`, `https://ho${ch}st/x`]) expect(cloneUrlError(url)).toBe(SPACES);
  });

  it('refuses an empty URL and one over 2048 characters', () => {
    const tooLong = 'url must be a string of 1 to 2048 characters.';
    expect(cloneUrlError('')).toBe(tooLong);
    expect(cloneUrlError(`https://host/${'a'.repeat(2048 - 'https://host/'.length)}`)).toBeNull();
    expect(cloneUrlError(`https://host/${'a'.repeat(2049 - 'https://host/'.length)}`)).toBe(tooLong);
  });
});

describe('repoNameFromUrl()', () => {
  it.each([
    ['https://github.com/owner/repo.git', 'repo'],
    ['https://github.com/owner/repo', 'repo'],
    ['https://github.com/owner/repo/', 'repo'],
    ['https://github.com/owner/repo.git//', 'repo'],
    ['git@github.com:owner/repo.git', 'repo'],
    ['git@host:repo.git', 'repo'],
    ['ssh://git@host:22/a/b/my.project.git', 'my.project'],
    ['https://github.com/owner/.github', '.github'],
  ])('%s → %s', (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name);
  });
});

describe('cloneShapeError()', () => {
  const ok = { url: 'https://github.com/owner/repo.git', parent: '/tmp/x', name: '' };

  it('accepts the three string fields, the name empty or given', () => {
    expect(cloneShapeError(ok)).toBeNull();
    expect(cloneShapeError({ ...ok, name: 'my-copy' })).toBeNull();
  });

  it('refuses anything that is not that object', () => {
    for (const body of [null, 'x', 3, [], [ok]]) expect(cloneShapeError(body)).toBe('The request must be a JSON object with url, parent and name.');
    expect(cloneShapeError({ ...ok, allowProtocols: 'file' })).toBe('Unexpected field "allowProtocols".');
    expect(cloneShapeError({ ...ok, branch: 'main' })).toBe('Unexpected field "branch".');
    expect(cloneShapeError({ url: ok.url, parent: ok.parent })).toBe('"name" is missing.');
    expect(cloneShapeError({ parent: ok.parent, name: '' })).toBe('"url" is missing.');
    expect(cloneShapeError({ ...ok, url: 5 })).toBe('"url" must be a string.');
    expect(cloneShapeError({ ...ok, parent: null })).toBe('"parent" must be a string.');
    expect(cloneShapeError({ ...ok, name: ['x'] })).toBe('"name" must be a string.');
  });

  it('checks the parent as the other routes check a path', () => {
    expect(cloneShapeError({ ...ok, parent: '' })).toBe('"parent" must be 1 to 4096 characters.');
    expect(cloneShapeError({ ...ok, parent: 'a'.repeat(4097) })).toBe('"parent" must be 1 to 4096 characters.');
    expect(cloneShapeError({ ...ok, parent: '/a\0b' })).toBe('"parent" must not contain a NUL character.');
  });

  it('checks the URL with the URL rule', () => {
    expect(cloneShapeError({ ...ok, url: 'file:///tmp/repo' })).toBe(ONLY);
    expect(cloneShapeError({ ...ok, url: 'https://u:p@host/x' })).toBe(CREDENTIALS);
    expect(cloneShapeError({ ...ok, url: '' })).toBe('url must be a string of 1 to 2048 characters.');
  });

  it("checks a given name with init's rule and messages", () => {
    const rule = 'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores.';
    for (const name of ['../x', 'a/b', '.git', '-x', 'a b', '{{x}}']) expect(cloneShapeError({ ...ok, name })).toBe(rule);
    expect(cloneShapeError({ ...ok, name: 'a'.repeat(215) })).toBe('Project name must be 214 characters or fewer.');
  });

  it('asks for a name when none can be taken from the URL', () => {
    const ask = 'Type a folder name. One could not be taken from this URL.';
    expect(cloneShapeError({ ...ok, url: 'https://github.com/owner/.github' })).toBe(ask);
    expect(cloneShapeError({ ...ok, url: 'https://host/_x.git' })).toBe(ask);
    expect(cloneShapeError({ ...ok, url: 'https://host/.git' })).toBe(ask);
    expect(cloneShapeError({ ...ok, url: 'https://github.com/owner/.github', name: 'dot-github' })).toBeNull();
  });
});

describe('gitErrorLine()', () => {
  it('returns the last fatal: line, never a remote: line or git\'s own Cloning into line', () => {
    expect(gitErrorLine("Cloning into 'x'...\nremote: run this command\nfatal: repository 'https://h/x' not found\nremote: and this\n")).toBe("fatal: repository 'https://h/x' not found");
    expect(gitErrorLine("Cloning into 'x'...\nfatal: one\n")).toBe('fatal: one');
  });

  it('puts the line just before the fatal: line in front of it, which over ssh says why', () => {
    const ssh = "Cloning into 'x'...\nHost key verification failed.\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n";
    expect(gitErrorLine(ssh)).toBe('Host key verification failed. fatal: Could not read from remote repository.');
    expect(gitErrorLine('git@github.com: Permission denied (publickey).\r\nfatal: Could not read from remote repository.\n')).toBe('git@github.com: Permission denied (publickey). fatal: Could not read from remote repository.');
    // a remote: line between them is skipped, not shown
    expect(gitErrorLine('ERROR: Repository not found.\nremote: paste this\nfatal: Could not read from remote repository.\n')).toBe('ERROR: Repository not found. fatal: Could not read from remote repository.');
    expect(gitErrorLine('fatal: one\nfatal: two\n')).toBe('fatal: one fatal: two');
    // 300 in total, and a long line before it (an ssh banner) never pushes the fatal: line out
    const long = gitErrorLine(`${'w'.repeat(400)}\nfatal: no access\n`)!;
    expect(long).toHaveLength(MAX_GIT_LINE);
    expect(long.endsWith(' fatal: no access')).toBe(true);
    expect(gitErrorLine(`before\nfatal: ${'x'.repeat(400)}\n`)).toBe(`fatal: ${'x'.repeat(400)}`.slice(0, MAX_GIT_LINE));
  });

  it('falls back to the last line that is not remote:, and to null', () => {
    expect(gitErrorLine("Cloning into 'x'...\nerror: something broke\nremote: text\n")).toBe('error: something broke');
    expect(gitErrorLine('remote: only\nremote: this\n')).toBeNull();
    expect(gitErrorLine('\n \n')).toBeNull();
  });

  it('removes colour codes and control characters and cuts the line', () => {
    expect(gitErrorLine('\u001b[31mfatal:\u001b[0m bad\u0007 thing\u2028here\r\n')).toBe('fatal: bad thinghere');
    const long = gitErrorLine(`fatal: ${'x'.repeat(400)}\n`)!;
    expect(long).toHaveLength(MAX_GIT_LINE);
    expect(long.startsWith('fatal: xxx')).toBe(true);
  });
});

describe('emptyTarget()', () => {
  it('removes a folder the request created, with its content', async () => {
    const target = join(base, 'made');
    mkdirSync(join(target, '.git', 'objects'), { recursive: true });
    writeFileSync(join(target, 'file'), 'x');
    expect(await emptyTarget(target, true)).toBeNull();
    expect(existsSync(target)).toBe(false);
  });

  it('leaves a folder that existed empty, and keeps it', async () => {
    const target = join(base, 'was-there');
    mkdirSync(join(target, 'sub'), { recursive: true });
    writeFileSync(join(target, 'sub', 'file'), 'x');
    expect(await emptyTarget(target, false)).toBeNull();
    expect(readdirSync(target)).toEqual([]);
  });

  it('removes a link inside without touching what it points to', async () => {
    const target = join(base, 'made');
    const outside = join(base, 'outside');
    mkdirSync(target);
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    symlinkSync(outside, join(target, 'link'));
    symlinkSync(join(outside, 'keep.txt'), join(target, 'file-link'));
    expect(await emptyTarget(target, true)).toBeNull();
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(join(outside, 'keep.txt'), 'utf-8')).toBe('keep');
  });

  it('leaves a target that is now a link or a file alone', async () => {
    const outside = join(base, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    symlinkSync(outside, join(base, 'link'));
    expect(await emptyTarget(join(base, 'link'), true)).toBeNull();
    expect(lstatSync(join(base, 'link')).isSymbolicLink()).toBe(true);
    expect(readdirSync(outside)).toEqual(['keep.txt']);
    writeFileSync(join(base, 'file'), 'x');
    expect(await emptyTarget(join(base, 'file'), true)).toBeNull();
    expect(readFileSync(join(base, 'file'), 'utf-8')).toBe('x');
  });

  it('is no error for a missing target, and returns the code when it cannot remove', async () => {
    expect(await emptyTarget(join(base, 'never'), true)).toBeNull();
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    const target = join(base, 'locked');
    mkdirSync(join(target, 'sub'), { recursive: true });
    writeFileSync(join(target, 'sub', 'file'), 'x');
    chmodSync(join(target, 'sub'), 0o500);
    try {
      expect(['EACCES', 'ENOTEMPTY']).toContain(await emptyTarget(target, true)); // which one depends on the platform
      expect(existsSync(join(target, 'sub', 'file'))).toBe(true);
    } finally {
      chmodSync(join(target, 'sub'), 0o700);
    }
  });
});

// ─── real git, local repositories only ───────────────────────────────────────

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, stdio: 'pipe' }).toString();

/** A bare repository with one commit (and, when asked, a submodule entry) at `<dir>/<name>`. */
function makeBare(dir: string, name: string, submodule = false): string {
  const work = mkdtempSync(join(base, 'work-'));
  git(work, 'init', '-q');
  writeFileSync(join(work, 'README.md'), '# fixture\n');
  mkdirSync(join(work, '.specs'));
  writeFileSync(join(work, '.specs', 'note.md'), 'spec\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'first');
  if (submodule) {
    const sha = git(work, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(work, '.gitmodules'), '[submodule "sub"]\n\tpath = sub\n\turl = https://127.0.0.1:1/sub.git\n');
    git(work, 'update-index', '--add', '--cacheinfo', `160000,${sha},sub`);
    git(work, 'add', '.gitmodules');
    git(work, 'commit', '-q', '-m', 'submodule');
  }
  mkdirSync(dir, { recursive: true });
  git(base, 'clone', '-q', '--bare', work, join(dir, name));
  rmSync(work, { recursive: true, force: true });
  return join(dir, name);
}

describe('cloneRepository() with the real git', () => {
  const FILE_REFUSED = /^git clone failed: fatal: transport 'file' not allowed$/;
  let target: string;
  beforeEach(() => {
    target = join(base, 'parent', 'copy');
    mkdirSync(target, { recursive: true });
  });

  it('clones a local bare repository through the test-only allowProtocols', async () => {
    const source = makeBare(base, 'source.git');
    expect(await cloneRepository(source, target, { allowProtocols: 'file' })).toEqual({ ok: true });
    expect(readFileSync(join(target, 'README.md'), 'utf-8')).toBe('# fixture\n');
    expect(existsSync(join(target, '.git', 'HEAD'))).toBe(true);
    expect(existsSync(join(target, '.specs', 'note.md'))).toBe(true);
  });

  it('without it git itself refuses the file transport: GIT_ALLOW_PROTOCOL reaches git', async () => {
    const source = makeBare(base, 'source.git');
    for (const url of [source, `file://${source}`]) {
      const out = await cloneRepository(url, target);
      expect(out).toMatchObject({ ok: false, aborted: false });
      expect((out as { error: string }).error).toMatch(FILE_REFUSED);
      expect(readdirSync(target)).toEqual([]);
    }
  });

  it('a folder named like a URL in the working directory is not cloned as a local path', async () => {
    makeBare(join(base, 'parent'), 'git@host:x'); // git looks for a local path of that name first
    makeBare(join(base, 'parent', 'https:', '127.0.0.1:1'), 'x');
    for (const url of ['git@host:x', 'https://127.0.0.1:1/x']) {
      const out = await cloneRepository(url, target);
      expect(out.ok).toBe(false);
      expect(readdirSync(target)).toEqual([]);
    }
    expect(((await cloneRepository('git@host:x', target)) as { error: string }).error).toMatch(FILE_REFUSED);
  });

  it('an insteadOf rewrite to a local repository is refused the same way', async () => {
    const source = makeBare(base, 'source.git');
    writeFileSync(join(HOME, '.gitconfig'), `[url "${source}"]\n\tinsteadOf = https://127.0.0.1:1/x.git\n`);
    const out = await cloneRepository('https://127.0.0.1:1/x.git', target);
    expect((out as { error: string }).error).toMatch(FILE_REFUSED);
    expect(readdirSync(target)).toEqual([]);
  });

  it('does not clone submodules', async () => {
    const source = makeBare(base, 'source.git', true);
    expect(await cloneRepository(source, target, { allowProtocols: 'file' })).toEqual({ ok: true });
    expect(existsSync(join(target, '.gitmodules'))).toBe(true);
    expect(readdirSync(join(target, 'sub'))).toEqual([]);
  });

  it("answers with git's fatal line when the source does not exist", async () => {
    const out = await cloneRepository(join(base, 'nothing-here.git'), target, { allowProtocols: 'file' });
    expect(out).toMatchObject({ ok: false, aborted: false });
    expect((out as { error: string }).error).toMatch(/^git clone failed: fatal: /);
  });

  it('does not start git when the signal is already aborted', async () => {
    const source = makeBare(base, 'source.git');
    const abort = new AbortController();
    abort.abort();
    expect(await cloneRepository(source, target, { allowProtocols: 'file', signal: abort.signal })).toEqual({ ok: false, aborted: true, error: '' });
    expect(readdirSync(target)).toEqual([]);
  });
});

describe('probeGit() with the real git', () => {
  it('finds git; batch mode for ssh is offered on Windows only, and only when nothing is configured', async () => {
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: true });
    for (const platform of ['darwin', 'linux'] as const) expect(await probeGit(HOME, platform)).toEqual({ batchSsh: false });
    if (process.platform !== 'win32') expect(await probeGit(HOME)).toEqual({ batchSsh: false });
  });

  it('on Windows leaves ssh alone when the user has GIT_SSH_COMMAND, GIT_SSH or core.sshCommand', async () => {
    process.env.GIT_SSH_COMMAND = 'ssh -i ~/.ssh/work';
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: false });
    delete process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH = '/usr/bin/ssh';
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: false });
    delete process.env.GIT_SSH;
    writeFileSync(join(HOME, '.gitconfig'), '[core]\n\tsshCommand = ssh -i ~/.ssh/work\n');
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: false });
  });

  it("does not read the local configuration of a repository the server happens to run in", async () => {
    const repo = join(base, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '-q');
    git(repo, 'config', 'core.sshCommand', 'ssh -i local-only');
    const cwd = process.cwd();
    process.chdir(repo);
    try {
      expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: true });
    } finally {
      process.chdir(cwd);
    }
  });

  it('says so when git is not installed', async () => {
    process.env.PATH = mkdtempSync(join(base, 'empty-path-'));
    expect(await probeGit(HOME)).toEqual({ error: 'git is not installed.' });
    const target = join(base, 'copy');
    mkdirSync(target);
    expect(await cloneRepository('https://127.0.0.1:1/x.git', target)).toEqual({ ok: false, aborted: false, error: 'git is not installed.' });
    expect(readdirSync(target)).toEqual([]);
  });
});

// ─── a stub git first on PATH (a shell script, so POSIX only) ────────────────

/** Writes `<dir>/git`, a script that records how it was called and then plays `STUB_MODE`. */
function installStubGit(dir: string): void {
  writeFileSync(
    join(dir, 'git'),
    `#!/bin/sh
if [ "$1" = config ]; then
  if [ -n "$STUB_SSH" ]; then echo "$STUB_SSH"; exit 0; fi
  exit "\${STUB_CONFIG_EXIT:-1}"
fi
printf '%s\\n' "$@" > "$STUB_LOG.args"
env > "$STUB_LOG.env"
if ( : < /dev/tty ) 2>/dev/null; then echo yes > "$STUB_LOG.tty"; else echo no > "$STUB_LOG.tty"; fi
if read line; then echo open > "$STUB_LOG.stdin"; else echo closed > "$STUB_LOG.stdin"; fi
ps -o pgid= -p $$ | tr -d ' ' > "$STUB_LOG.pgid"
echo $$ > "$STUB_LOG.pid"
for target; do :; done
case "$STUB_MODE" in
  hang) echo partial > "$target/partial"; sleep 60 & echo $! > "$STUB_LOG.child"; wait ;;
  fail) printf '%b' "$STUB_STDERR" >&2; exit 128 ;;
  silent) exit 3 ;;
  locked) mkdir -p "$target/sub"; echo x > "$target/sub/file"; chmod 500 "$target/sub"; echo "fatal: no" >&2; exit 128 ;;
  nospecs) mkdir -p "$target/.git"; echo x > "$target/README.md" ;;
  unreadable) mkdir -p "$target/.specs/planning"; echo x > "$target/.specs/planning/tasks.md"; chmod 000 "$target/.specs/planning/tasks.md" ;;
  *) mkdir -p "$target/.git" "$target/.specs/planning"; echo 'ref: refs/heads/main' > "$target/.git/HEAD"
     printf '%s\\n' '# fileID: PROJ-001' 'name: "Cloned Project"' > "$target/.specs/project.yaml"
     printf '%s\\n' '# Tasks' '' '## Backlog' '' '| ID | Description |' '|---|---|' '| BL-001 | From the clone |' > "$target/.specs/planning/tasks.md" ;;
esac
`,
    { mode: 0o755 },
  );
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/** Poll a condition; the time is only the limit after which the test gives up, never a wait that is relied on. */
const until = async (test: () => boolean | Promise<boolean>, ms = 15000) => {
  const end = Date.now() + ms;
  while (!(await test()) && Date.now() < end) await new Promise(r => setTimeout(r, 20));
  return test();
};

(process.platform === 'win32' ? describe.skip : describe)('cloneRepository() with a stub git', () => {
  let log: string;
  let target: string;
  const logged = (what: string) => readFileSync(`${log}.${what}`, 'utf-8').trim();
  const envOf = () => Object.fromEntries(logged('env').split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  beforeEach(() => {
    const bin = join(base, 'bin');
    mkdirSync(bin);
    installStubGit(bin);
    process.env.PATH = `${bin}:/usr/bin:/bin`;
    log = join(base, 'stub');
    process.env.STUB_LOG = log;
    target = join(base, 'copy');
    mkdirSync(target);
  });

  it('passes exactly clone --no-recurse-submodules -- <url> <target>, in the parent folder', async () => {
    expect(await cloneRepository('git@github.com:owner/repo.git', target)).toEqual({ ok: true });
    expect(logged('args').split('\n')).toEqual(['clone', '--no-recurse-submodules', '--', 'git@github.com:owner/repo.git', target]);
    expect(envOf().PWD).toBe(base);
  });

  it('sets the transport rule and every no-prompt variable, closes stdin and has no terminal', async () => {
    await cloneRepository('https://github.com/owner/repo.git', target);
    expect(envOf()).toMatchObject({ GIT_ALLOW_PROTOCOL: 'https:ssh', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS_REQUIRE: 'never', GCM_INTERACTIVE: 'never' });
    expect(envOf().HOME).toBe(HOME); // the rest of the environment is the server's
    expect(logged('stdin')).toBe('closed');
    expect(logged('tty')).toBe('no');
    expect(logged('pgid')).toBe(logged('pid')); // its own process group (and session)
  });

  it("does not pass on a GIT_DIR or GIT_WORK_TREE the server was started with", async () => {
    process.env.GIT_DIR = join(base, 'elsewhere.git');
    process.env.GIT_WORK_TREE = join(base, 'elsewhere');
    await cloneRepository('https://github.com/owner/repo.git', target);
    expect('GIT_DIR' in envOf()).toBe(false);
    expect('GIT_WORK_TREE' in envOf()).toBe(false);
  });

  it('asks git for English messages and changes nothing else about the locale', async () => {
    process.env.LANG = process.env.LANG ?? 'en_US.UTF-8';
    const lang = process.env.LANG;
    await cloneRepository('https://github.com/owner/repo.git', target);
    expect(envOf()).toMatchObject({ LC_MESSAGES: 'C', LANG: lang });
    for (const name of ['LC_ALL', 'LC_CTYPE', 'LANGUAGE']) expect(name in envOf()).toBe(false);
    // an LC_ALL would override LC_MESSAGES: it is kept as LC_CTYPE, so file names are handled as before
    process.env.LC_ALL = 'de_DE.UTF-8';
    process.env.LANGUAGE = 'de:fr';
    process.env.LC_MESSAGES = 'de_DE.UTF-8';
    await cloneRepository('https://github.com/owner/repo.git', target);
    expect(envOf()).toMatchObject({ LC_MESSAGES: 'C', LC_CTYPE: 'de_DE.UTF-8', LANG: lang });
    for (const name of ['LC_ALL', 'LANGUAGE']) expect(name in envOf()).toBe(false);
    expect(process.env.LC_ALL).toBe('de_DE.UTF-8'); // the server's own environment is not touched
  });

  it('puts ssh in batch mode only when asked to, and otherwise leaves the variable as it is', async () => {
    await cloneRepository('git@host:x', target, { batchSsh: true });
    expect(envOf().GIT_SSH_COMMAND).toBe('ssh -oBatchMode=yes');
    await cloneRepository('git@host:x', target);
    expect('GIT_SSH_COMMAND' in envOf()).toBe(false);
    process.env.GIT_SSH_COMMAND = 'ssh -i mine';
    await cloneRepository('git@host:x', target, { batchSsh: ((await probeGit(HOME, 'win32')) as { batchSsh: boolean }).batchSsh });
    expect(envOf().GIT_SSH_COMMAND).toBe('ssh -i mine');
  });

  it('probeGit() reads core.sshCommand from git and reports a git that cannot be run', async () => {
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: true });
    process.env.STUB_SSH = 'ssh -i mine';
    expect(await probeGit(HOME, 'win32')).toEqual({ batchSsh: false });
    delete process.env.STUB_SSH;
    process.env.STUB_CONFIG_EXIT = '3';
    expect(await probeGit(HOME)).toEqual({ error: 'git could not be run (3).' });
  });

  it('kills the whole process group at the time limit and leaves no timer', async () => {
    process.env.STUB_MODE = 'hang';
    const out = await cloneRepository('https://github.com/owner/repo.git', target, { timeoutMs: 400 });
    expect(out).toEqual({ ok: false, aborted: false, error: 'The clone was stopped after 10 minutes. What it had downloaded was removed.' });
    expect(await until(() => !alive(Number(logged('pid'))) && !alive(Number(logged('child'))))).toBe(true);
    expect(readdirSync(target)).toEqual(['partial']); // the caller cleans up; this function only stops git
  });

  it('kills it when the signal aborts', async () => {
    process.env.STUB_MODE = 'hang';
    const abort = new AbortController();
    const running = cloneRepository('https://github.com/owner/repo.git', target, { signal: abort.signal });
    expect(await until(() => existsSync(`${log}.child`))).toBe(true);
    abort.abort();
    expect(await running).toEqual({ ok: false, aborted: true, error: '' });
    expect(await until(() => !alive(Number(logged('pid'))) && !alive(Number(logged('child'))))).toBe(true);
  });

  it("returns git's one cleaned line, or the exit code when there is none", async () => {
    process.env.STUB_MODE = 'fail';
    process.env.STUB_STDERR = `Cloning into 'x'...\\nremote: paste this into a terminal\\n\\033[31mfatal: ${'y'.repeat(400)}\\033[0m\\nremote: more\\n`;
    const out = (await cloneRepository('https://github.com/owner/repo.git', target)) as { error: string };
    expect(out.error).toBe(`git clone failed: ${`fatal: ${'y'.repeat(400)}`.slice(0, 300)}`);
    process.env.STUB_MODE = 'silent';
    expect(await cloneRepository('https://github.com/owner/repo.git', target)).toEqual({ ok: false, aborted: false, error: 'git clone failed (exit code 3).' });
  });
});

// ─── the route, with the stub git ────────────────────────────────────────────

type Answer = { status: number; headers: Record<string, unknown>; json: any };
/** One request; `req` is returned too, so a test can close the connection before the answer. */
function call(port: number, path: string, method: string, headers: Record<string, string | undefined>, body?: string): { req: ClientRequest; answer: Promise<Answer> } {
  let req!: ClientRequest;
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
    req.on('error', reject);
    req.end(body);
  });
  return { req, answer };
}

(process.platform === 'win32' ? describe.skip : describe)('POST /api/projects/clone (BL-PM-002)', () => {
  const URL = 'https://github.com/owner/repo.git';
  const NEW_ANSWERS = { projectType: 'greenfield', language: 'typescript', framework: 'react', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode', whatItDoes: 'Tracks parcels' };
  let served: string; // project 0
  let parent: string; // where clones go
  let log: string;
  let spec: SpecServer;
  let port: number;
  let token: string;
  const regFile = () => registryPath(HOME);
  const good = (over: Record<string, string | undefined> = {}) => ({
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'Content-Type': 'application/json',
    'X-SpecPilot-Token': token,
    ...over,
  });
  const get = (path: string) => call(port, path, 'GET', { Host: `127.0.0.1:${port}` }).answer;
  const post = (path: string, body: unknown, headers = good()) => call(port, path, 'POST', headers, typeof body === 'string' ? body : JSON.stringify(body));
  const clone = (over: Record<string, unknown> = {}, headers = good()) => post('/api/projects/clone', { url: URL, parent, name: '', ...over }, headers).answer;
  const projects = async () => (await get('/api/specs')).json.projects as unknown[];
  const logged = (what: string) => readFileSync(`${log}.${what}`, 'utf-8').trim();
  const stubRan = () => existsSync(`${log}.args`);
  const stubGone = () => until(() => !alive(Number(logged('pid'))) && !alive(Number(logged('child'))));
  const start = async (roots: string[], opts: { readOnly?: boolean; cloneTimeoutMs?: number } = {}) => {
    spec = await startSpecServer(roots, 0, '0.0.0-test', { registry: regFile(), ...opts });
    port = (spec.server.address() as AddressInfo).port;
    token = (/<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec((await get('/')).json) || [])[1];
  };

  beforeEach(async () => {
    const bin = join(base, 'bin');
    mkdirSync(bin);
    installStubGit(bin);
    process.env.PATH = `${bin}:/usr/bin:/bin`;
    log = join(base, 'stub');
    process.env.STUB_LOG = log;
    served = join(base, 'served');
    mkdirSync(join(served, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(served, '.specs', 'planning', 'tasks.md'), '# Tasks\n\n## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | One |\n');
    parent = join(base, 'dev');
    mkdirSync(parent);
    await start([served]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await spec.close();
    execFileSync('chmod', ['-R', 'u+rwx', base]);
  });

  it('refuses a request that fails the write checks, before git is looked at', async () => {
    expect((await clone({}, good({ Host: 'evil.example' }))).status).toBe(403);
    expect((await clone({}, good({ Origin: undefined }))).status).toBe(403);
    expect((await clone({}, good({ Origin: 'http://evil.example' }))).status).toBe(403);
    expect((await clone({}, good({ 'X-SpecPilot-Token': undefined }))).status).toBe(403);
    expect((await clone({}, good({ 'X-SpecPilot-Token': 'f'.repeat(64) }))).status).toBe(403);
    expect((await clone({}, good({ 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await clone({ parent: 'a'.repeat(17 * 1024) })).status).toBe(413);
    expect((await post('/api/projects/clone', '{not json').answer).status).toBe(400);
    expect(readdirSync(parent)).toEqual([]);
    expect(stubRan()).toBe(false);
  });

  it('answers 405 with Allow: POST to other methods, and to everything with --read-only', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const r = await call(port, '/api/projects/clone', method, { Host: `127.0.0.1:${port}` }).answer;
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('POST');
    }
    await spec.close();
    await start([served], { readOnly: true });
    const r = await clone({}, good({ 'X-SpecPilot-Token': 'x' }));
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('');
    expect(readdirSync(parent)).toEqual([]);
    expect(stubRan()).toBe(false);
  });

  it.each([
    [{ url: 'file:///tmp/repo' }, 'Only https://host/path, git@host:path and ssh://host/path repository URLs can be cloned.'],
    [{ url: '/tmp/repo' }, 'Only https://host/path, git@host:path and ssh://host/path repository URLs can be cloned.'],
    [{ url: 'ext::sh -c x' }, 'The repository URL must not contain spaces or control characters.'],
    [{ url: '--upload-pack=touch x' }, 'The repository URL must not contain spaces or control characters.'],
    [{ url: '-u' }, 'Only https://host/path, git@host:path and ssh://host/path repository URLs can be cloned.'],
    [{ url: 'https://user:pw@github.com/o/r.git' }, 'Remove the user name and password from the URL. git reads them from your credential helper.'],
    [{ url: `https://host/${'a'.repeat(2048)}` }, 'url must be a string of 1 to 2048 characters.'],
    [{ name: '../escape' }, 'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores.'],
    [{ url: 'https://github.com/owner/.github' }, 'Type a folder name. One could not be taken from this URL.'],
    [{ allowProtocols: 'file' }, 'Unexpected field "allowProtocols".'],
    [{ parent: '' }, '"parent" must be 1 to 4096 characters.'],
  ])('refuses the body %j with 422, runs nothing and creates nothing', async (over, error) => {
    const r = await clone(over);
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error });
    expect(readdirSync(parent)).toEqual([]);
    expect(stubRan()).toBe(false);
    expect(existsSync(`${log}.pid`)).toBe(false);
  });

  it('answers 422 "git is not installed." and creates nothing when there is no git', async () => {
    process.env.PATH = mkdtempSync(join(base, 'empty-path-'));
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'git is not installed.' });
    expect(readdirSync(parent)).toEqual([]);
  });

  it('answers 422 when git cannot be run, and creates nothing', async () => {
    process.env.STUB_CONFIG_EXIT = '3';
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'git could not be run (3).' });
    expect(readdirSync(parent)).toEqual([]);
  });

  it('refuses a parent or a target as the new-project route does, without running git clone', async () => {
    expect((await clone({ parent: join(base, 'nowhere') })).json).toEqual({ error: `Folder not found: ${join(base, 'nowhere')}` });
    expect((await clone({ parent: 'relative/path' })).json).toEqual({ error: 'The path must be absolute, e.g. /Users/you/project or ~/project.' });
    expect((await clone({ parent: '~' })).json).toEqual({ error: 'Pick a folder inside your home folder, like ~/dev.' });
    expect((await clone({ parent: join(served, '.specs', 'planning') })).json).toEqual({ error: 'A project cannot be created inside a .specs/ folder.' });

    const served409 = await clone({ parent: base, name: 'served' });
    expect(served409.status).toBe(409);
    expect(served409.json).toEqual({ error: `${served} is already open as project 0.`, project: 0 });

    symlinkSync(served, join(parent, 'link'));
    const link = await clone({ name: 'link' });
    expect(link.status).toBe(409);
    expect(link.json).toEqual({ error: `${join(parent, 'link')} is a symbolic link, so nothing was created.` });

    writeFileSync(join(parent, 'file'), 'x');
    expect((await clone({ name: 'file' })).json).toEqual({ error: `${join(parent, 'file')} exists and is not a folder, so nothing was created.` });

    mkdirSync(join(parent, 'full'));
    writeFileSync(join(parent, 'full', '.hidden'), 'x');
    const full = await clone({ name: 'full' });
    expect(full.status).toBe(409);
    expect(full.json).toEqual({ error: `${join(parent, 'full')} already exists and is not empty, so nothing was cloned.` });
    expect(readdirSync(join(parent, 'full'))).toEqual(['.hidden']);

    expect(stubRan()).toBe(false);
    expect(readdirSync(parent).sort()).toEqual(['file', 'full', 'link']);
    expect(await projects()).toHaveLength(1);
  });

  it('clones into <parent>/<repository name>, serves it as the next index and records it', async () => {
    const r = await clone();
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(['project', 'specs', 'registry']);
    expect(r.json.project).toBe(1);
    expect(r.json.specs.project.root).toBe(join(parent, 'repo'));
    expect(r.json.specs.project.specs).toBe(true);
    expect(r.json.specs.projects).toHaveLength(2);
    expect(r.json.registry.entries.map((e: { path: string }) => e.path)).toEqual([join(parent, 'repo')]);
    expect(logged('args').split('\n')).toEqual(['clone', '--no-recurse-submodules', '--', URL, join(parent, 'repo')]);
    expect(logged('env')).toContain('GIT_ALLOW_PROTOCOL=https:ssh');
    expect(logged('env')).not.toContain('GIT_SSH_COMMAND'); // POSIX: the user's ssh setup is never touched
    expect((await get('/api/specs?project=1')).json.project.root).toBe(join(parent, 'repo'));
    expect(readRegistry(regFile()).entries!.map(e => e.path)).toEqual([join(parent, 'repo')]);
    const again = await clone(); // the folder is now a served root
    expect(again.status).toBe(409);
    expect(again.json.project).toBe(1);
  });

  it("passes the user's own GIT_SSH_COMMAND through unchanged", async () => {
    process.env.GIT_SSH_COMMAND = 'ssh -i mine';
    expect((await clone()).status).toBe(200);
    expect(logged('env')).toContain('GIT_SSH_COMMAND=ssh -i mine');
  });

  it('a repository without .specs/ is served for guided setup, in an existing empty folder under the given name', async () => {
    process.env.STUB_MODE = 'nospecs';
    mkdirSync(join(parent, 'mine'));
    const r = await clone({ name: 'mine' });
    expect(r.status).toBe(200);
    expect(r.json.specs.project.root).toBe(join(parent, 'mine'));
    expect(r.json.specs.project.specs).toBe(false);
    expect((await get('/api/setup?project=1')).status).toBe(200);
    expect(readdirSync(join(parent, 'mine')).sort()).toEqual(['.git', 'README.md']);
  });

  it("answers 422 with git's line when git fails, removes the folder it made, and frees the slot", async () => {
    process.env.STUB_MODE = 'fail';
    process.env.STUB_STDERR = "Cloning into 'repo'...\\nremote: Repository not found.\\nHost key verification failed.\\nfatal: Could not read from remote repository.\\n";
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'git clone failed: Host key verification failed. fatal: Could not read from remote repository.' });
    expect(readdirSync(parent)).toEqual([]);
    expect(await projects()).toHaveLength(1);
    expect(existsSync(regFile())).toBe(false);

    mkdirSync(join(parent, 'kept'));
    expect((await clone({ name: 'kept' })).status).toBe(422);
    expect(readdirSync(parent)).toEqual(['kept']); // it was there before: left, and left empty
    expect(readdirSync(join(parent, 'kept'))).toEqual([]);

    delete process.env.STUB_MODE;
    expect((await clone()).status).toBe(200);
  });

  it('stops git at the time limit, removes what it downloaded, and frees the slot', async () => {
    await spec.close();
    await start([served], { cloneTimeoutMs: 300 });
    process.env.STUB_MODE = 'hang';
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'The clone was stopped after 10 minutes. What it had downloaded was removed.' });
    expect(await stubGone()).toBe(true);
    expect(readdirSync(parent)).toEqual([]);
    expect(await projects()).toHaveLength(1);
    delete process.env.STUB_MODE;
    expect((await clone()).status).toBe(200);
  });

  it('while a clone runs: a second is refused, its folder is reserved, and other writes are not held up', async () => {
    const other = join(base, 'other');
    mkdirSync(join(other, '.specs'), { recursive: true });
    process.env.STUB_MODE = 'hang';
    const first = post('/api/projects/clone', { url: URL, parent, name: '' });
    first.answer.catch(() => {});
    expect(await until(() => existsSync(`${log}.child`))).toBe(true);
    const target = join(parent, 'repo');

    const second = await clone({ name: 'second' });
    expect(second.status).toBe(409);
    expect(second.json).toEqual({ error: 'Another clone is running. Wait for it to finish.' });
    expect(existsSync(join(parent, 'second'))).toBe(false);

    const busy = { error: `${target} is being cloned. Wait for it to finish.` };
    const opened = await post('/api/projects', { path: target }).answer;
    expect(opened.status).toBe(409);
    expect(opened.json).toEqual(busy);
    const created = await post('/api/projects/new', { parent, name: 'repo', ...NEW_ANSWERS }).answer;
    expect(created.status).toBe(409);
    expect(created.json).toEqual(busy);
    expect(readdirSync(target)).toEqual(['partial']);

    // nor anything inside it: the clean-up would remove a served folder
    expect((await post('/api/projects', { path: target }).answer).status).toBe(409);
    const inside = await post('/api/projects/new', { parent: target, name: 'inner', ...NEW_ANSWERS }).answer;
    expect(inside.status).toBe(409);
    expect(inside.json).toEqual(busy);
    expect(readdirSync(target)).toEqual(['partial']);

    const open = await post('/api/projects', { path: other }).answer; // the write lock is free
    expect(open.status).toBe(200);
    expect(open.json.project).toBe(1);

    // the page goes away: git is killed, the folder removed, nothing more served, the slot free
    first.req.destroy();
    expect(await stubGone()).toBe(true);
    expect(await until(() => !existsSync(target))).toBe(true);
    expect(await projects()).toHaveLength(2);
    delete process.env.STUB_MODE;
    let next = await clone();
    await until(async () => next.status !== 409 || (next = await clone()).status !== 409); // until the slot is given back
    expect(next.status).toBe(200);
    expect(next.json.project).toBe(2);
  });

  it(`counts toward the cap of ${MAX_PROJECTS}: refused when full, and holds a place while it runs`, async () => {
    const tooMany = { error: `This server already serves ${MAX_PROJECTS} projects. Start another specpilot serve for more.` };
    const dirs = (n: number) => Array.from({ length: n }, (_, i) => {
      const d = join(base, `root-${i}`);
      mkdirSync(d, { recursive: true });
      return d;
    });
    await spec.close();
    await start(dirs(MAX_PROJECTS));
    const full = await clone();
    expect(full.status).toBe(409);
    expect(full.json).toEqual(tooMany);
    expect(readdirSync(parent)).toEqual([]);
    expect(stubRan()).toBe(false);

    await spec.close();
    await start(dirs(MAX_PROJECTS - 1));
    process.env.STUB_MODE = 'hang';
    const running = post('/api/projects/clone', { url: URL, parent, name: '' });
    running.answer.catch(() => {});
    expect(await until(() => existsSync(`${log}.child`))).toBe(true);
    const extra = join(base, 'extra');
    mkdirSync(extra);
    const opened = await post('/api/projects', { path: extra }).answer;
    expect(opened.status).toBe(409);
    expect(opened.json).toEqual(tooMany);
    const created = await post('/api/projects/new', { parent, name: 'fresh', ...NEW_ANSWERS }).answer;
    expect(created.status).toBe(409);
    expect(created.json).toEqual(tooMany);
    expect(existsSync(join(parent, 'fresh'))).toBe(false);
    running.req.destroy();
    expect(await stubGone()).toBe(true);
  });

  it('a cancel that arrives just after git finished still removes the clone and serves nothing', async () => {
    let running!: ReturnType<typeof post>;
    let sawAbort = false;
    jest.spyOn(gitClone, 'cloneRepository').mockImplementation(async (_url, target, opts) => {
      mkdirSync(join(target, '.specs'), { recursive: true });
      writeFileSync(join(target, 'README.md'), 'done');
      running.req.destroy(); // git has exited 0; the page goes away before the folder is served
      sawAbort = await until(() => opts!.signal!.aborted); // the server has noticed the closed connection
      return { ok: true };
    });
    running = post('/api/projects/clone', { url: URL, parent, name: '' });
    await expect(running.answer).rejects.toThrow();
    expect(await until(() => !existsSync(join(parent, 'repo')))).toBe(true);
    expect(sawAbort).toBe(true);
    expect(await projects()).toHaveLength(1);
    expect(existsSync(regFile())).toBe(false);
  });

  it('a clone whose files cannot be read answers 422, stays on disk and is not served', async () => {
    if (process.getuid?.() === 0) return;
    process.env.STUB_MODE = 'unreadable';
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(/^This folder could not be read: /);
    expect(existsSync(join(parent, 'repo', '.specs', 'planning', 'tasks.md'))).toBe(true);
    expect(await projects()).toHaveLength(1);
  });

  it('says so when the clean-up cannot remove something', async () => {
    if (process.getuid?.() === 0) return;
    process.env.STUB_MODE = 'locked';
    const r = await clone();
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(new RegExp(`^git clone failed: fatal: no ${join(parent, 'repo').replace(/[.]/g, '\\.')} could not be cleaned up \\((EACCES|ENOTEMPTY)\\)\\.$`));
  });

  it('close() stops a running clone, removes what it downloaded and leaves nothing open', async () => {
    process.env.STUB_MODE = 'hang';
    const running = post('/api/projects/clone', { url: URL, parent, name: '' });
    running.answer.catch(() => {});
    expect(await until(() => existsSync(`${log}.child`))).toBe(true);
    await spec.close();
    expect(readdirSync(parent)).toEqual([]);
    expect(await stubGone()).toBe(true);
    await expect(running.answer).rejects.toThrow(); // its connection was closed, not left waiting
    await start([served]); // afterEach closes this one
  });

  it('removes the clone without blocking the server, so a stop signal\'s time limit can fire meanwhile', async () => {
    const real = gitClone.emptyTarget;
    let removing = false;
    let finish!: () => void;
    const large = new Promise<void>(r => (finish = r)); // a large tree: the removal ends when the test says so
    jest.spyOn(gitClone, 'emptyTarget').mockImplementation(async (target, created) => {
      removing = true;
      await large;
      return real(target, created);
    });
    process.env.STUB_MODE = 'hang';
    const running = post('/api/projects/clone', { url: URL, parent, name: '' });
    running.answer.catch(() => {});
    expect(await until(() => existsSync(`${log}.child`))).toBe(true);
    let ticked = false;
    const stopped = spec.stopClone();
    expect(await until(() => removing)).toBe(true);
    await new Promise<void>(r => setTimeout(() => ((ticked = true), r()), 0));
    expect(ticked).toBe(true); // a timer fired while the removal was under way: the event loop is free
    expect(existsSync(join(parent, 'repo', 'partial'))).toBe(true); // and nothing is removed yet
    finish();
    await stopped;
    expect(readdirSync(parent)).toEqual([]);
    await spec.close();
    await start([served]);
  });

  it('starts no clone once the server is being stopped', async () => {
    await spec.stopClone();
    const r = await clone();
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: 'The server is stopping.' });
    expect(readdirSync(parent)).toEqual([]);
    expect(stubRan()).toBe(false);
  });
});
