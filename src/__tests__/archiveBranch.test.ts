// BL-132 (REQ-002.A.8, REQ-002.H.1; audit run-1 item 3, SEC-002.12 (d)): no program is started by bare name from the
// project folder. Every child_process launch fails the test.
jest.mock('child_process', () => {
  const refuse = (name: string) => jest.fn(() => { throw new Error(`child_process.${name} called`); });
  return { execSync: refuse('execSync'), execFileSync: refuse('execFileSync'), execFile: refuse('execFile'), spawn: refuse('spawn'), exec: refuse('exec'), spawnSync: refuse('spawnSync') };
});
const question = jest.fn((_q: string, answer: (a: string) => void) => answer('n'));
jest.mock('readline', () => ({ createInterface: jest.fn(() => ({ question, close: () => {} })) }));

import * as childProcess from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { archiveCommand, currentBranch } from '../commands/archive';
import { browserCommand } from '../commands/serve';

const HEX = 'a'.repeat(40);

describe('currentBranch() reads .git/HEAD, starting nothing (BL-132)', () => {
  let base: string;
  const head = (gitDir: string, text: string) => {
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), text);
  };
  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-branch-')));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  test('the branch of the folder and of a subfolder', () => {
    head(join(base, 'repo', '.git'), 'ref: refs/heads/feature\n');
    mkdirSync(join(base, 'repo', 'pkg', 'a'), { recursive: true });
    expect(currentBranch(join(base, 'repo'))).toBe('feature');
    expect(currentBranch(join(base, 'repo', 'pkg', 'a'))).toBe('feature');
  });

  test('a nested repository: the inner .git wins', () => {
    head(join(base, 'repo', '.git'), 'ref: refs/heads/outer\n');
    head(join(base, 'repo', 'inner', '.git'), 'ref: refs/heads/main\n');
    mkdirSync(join(base, 'repo', 'inner', 'x'));
    expect(currentBranch(join(base, 'repo', 'inner', 'x'))).toBe('main');
  });

  test('a worktree (absolute gitdir:) and a submodule (relative gitdir:) reached from a subfolder', () => {
    head(join(base, 'repo', '.git', 'worktrees', 'wt'), 'ref: refs/heads/wtb\n');
    mkdirSync(join(base, 'wt'));
    writeFileSync(join(base, 'wt', '.git'), `gitdir: ${join(base, 'repo', '.git', 'worktrees', 'wt')}\n`);
    expect(currentBranch(join(base, 'wt'))).toBe('wtb');
    head(join(base, 'repo', '.git', 'modules', 'sub'), 'ref: refs/heads/subb\n');
    mkdirSync(join(base, 'repo', 'sub', 'deep'), { recursive: true });
    writeFileSync(join(base, 'repo', 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
    expect(currentBranch(join(base, 'repo', 'sub', 'deep'))).toBe('subb');
  });

  test('a detached HEAD gives its id; no .git, a reftable placeholder and a control character give null', () => {
    head(join(base, 'd', '.git'), `${HEX}\n`);
    expect(currentBranch(join(base, 'd'))).toBe(HEX);
    mkdirSync(join(base, 'none'));
    expect(currentBranch(join(base, 'none'))).toBeNull();
    head(join(base, 'rt', '.git'), 'ref: refs/heads/.invalid\n');
    expect(currentBranch(join(base, 'rt'))).toBeNull();
    head(join(base, 'esc', '.git'), 'ref: refs/heads/a\x1b]0;x\x07\n');
    expect(currentBranch(join(base, 'esc'))).toBeNull();
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });
});

describe('archiveCommand() asks only off main or master (BL-132)', () => {
  let base: string;
  let cwd: string;
  let out: string[];
  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-archive-branch-')));
    mkdirSync(join(base, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(base, '.specs', 'planning', 'tasks.md'), '# Tasks\n');
    cwd = process.cwd();
    process.chdir(base);
    out = [];
    jest.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)); });
    question.mockClear();
  });
  afterEach(() => {
    process.chdir(cwd);
    jest.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
  });
  const branch = (name: string) => {
    mkdirSync(join(base, '.git'));
    writeFileSync(join(base, '.git', 'HEAD'), `ref: refs/heads/${name}\n`);
  };

  test('on main: no question, the archive runs', async () => {
    branch('main');
    await archiveCommand({ dryRun: false });
    expect(question).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('Archiving oversized');
  });

  test('on a feature branch: the question names it, and No cancels', async () => {
    branch('feature');
    await archiveCommand({ dryRun: false });
    expect(question).toHaveBeenCalledTimes(1);
    expect(out.join('\n')).toContain("You're on branch 'feature'");
    expect(out.join('\n')).not.toContain('Archiving oversized');
  });

  test('without .git: no question, the archive runs', async () => {
    await archiveCommand({ dryRun: false });
    expect(question).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('Archiving oversized');
  });
});

describe('browserCommand() (BL-132)', () => {
  const url = 'http://127.0.0.1:4321/';
  test('win32: cmd.exe by its full path, the home drive\'s root as working directory', () => {
    expect(browserCommand(url, 'win32', { SystemRoot: 'D:\\Win' }, 'E:\\Users\\x')).toEqual({ file: 'D:\\Win\\System32\\cmd.exe', args: ['/c', 'start', '', url], cwd: 'E:\\' });
    expect(browserCommand(url, 'win32', {}, 'E:\\Users\\x').file).toBe('C:\\Windows\\System32\\cmd.exe');
  });
  test('darwin and linux unchanged', () => {
    expect(browserCommand(url, 'darwin', {}, '/Users/x')).toEqual({ file: 'open', args: [url], cwd: undefined });
    expect(browserCommand(url, 'linux', {}, '/home/x')).toEqual({ file: 'xdg-open', args: [url], cwd: undefined });
  });
});
