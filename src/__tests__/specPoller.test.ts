import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { createPoller, Poller } from '../utils/specPoller';
import { listAllowedFiles } from '../utils/specPaths';

// Fault injection: the real fs, with statSync/readdirSync routed through test hooks.
const mockFs: { stat?: (path: string) => void; readdirCalls: number } = { readdirCalls: 0 };
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    statSync: (p: unknown, o?: unknown) => {
      mockFs.stat?.(String(p));
      return actual.statSync(p, o);
    },
    readdirSync: (...args: unknown[]) => {
      mockFs.readdirCalls++;
      return actual.readdirSync(...args);
    },
  };
});
const fail = (code: string) => (path: string) => {
  if (path.endsWith(join('planning', 'tasks.md'))) throw Object.assign(new Error(code), { code });
};

const FAST = { intervalMs: 40, settleMs: 20, maxSettleMs: 400 };

function write(root: string, rel: string, content: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('specPoller', () => {
  let root: string;
  let poller: Poller | null;
  let events: string[][];

  /** Start a poller collecting events; `waitForEvent` resolves with the next one. */
  function start(extra: Partial<Parameters<typeof createPoller>[1]> = {}): void {
    poller = createPoller(root, { ...FAST, onChange: paths => events.push(paths), ...extra });
    poller.start();
  }
  async function waitForEvent(timeoutMs = 1500): Promise<string[]> {
    const seen = events.length;
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (events.length > seen) return events[seen];
      await sleep(10);
    }
    throw new Error('no change event');
  }

  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-poll-'));
    write(root, '.specs/planning/tasks.md', '# Tasks\n');
    write(root, '.specs/project/requirements.md', '# Requirements\n');
    events = [];
    poller = null;
  });
  afterEach(() => {
    poller?.stop();
    mockFs.stat = undefined;
    try {
      chmodSync(join(root, '.specs', 'locked'), 0o755);
    } catch {
      /* not every test locks a folder */
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('reports an edited file', async () => {
    start();
    write(root, '.specs/planning/tasks.md', '# Tasks\n\n- edited\n');
    expect(await waitForEvent()).toEqual(['.specs/planning/tasks.md']);
  });

  it('reports a new file and a deleted file', async () => {
    start();
    write(root, '.specs/quality/tests.md', '# Tests\n');
    expect(await waitForEvent()).toEqual(['.specs/quality/tests.md']);
    unlinkSync(join(root, '.specs/project/requirements.md'));
    expect(await waitForEvent()).toEqual(['.specs/project/requirements.md']);
  });

  it('reports an atomic save (temp file renamed over the original) even when size and mtime match', async () => {
    const file = join(root, '.specs/planning/tasks.md');
    utimesSync(file, 1700000000, 1700000000);
    const before = statSync(file);
    start();
    // Same length, same mtime: only the inode tells the files apart.
    write(root, '.specs/planning/.tasks.md.swp', '# Task!\n');
    utimesSync(join(root, '.specs/planning/.tasks.md.swp'), 1700000000, 1700000000);
    renameSync(join(root, '.specs/planning/.tasks.md.swp'), file);
    const after = statSync(file);
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs]);
    expect(await waitForEvent()).toEqual(['.specs/planning/tasks.md']);
  });

  it('coalesces a burst of writes into one event', async () => {
    start();
    for (let i = 0; i < 6; i++) {
      write(root, '.specs/planning/tasks.md', `# Tasks\n${'x'.repeat(i + 1)}\n`);
      await sleep(12);
    }
    expect(await waitForEvent()).toEqual(['.specs/planning/tasks.md']);
    await sleep(200);
    expect(events).toHaveLength(1);
  });

  it('ignores files outside the allowlist, node_modules and dot-folders', async () => {
    start();
    write(root, 'src/secret.ts', 'x');
    write(root, 'package.json', '{}');
    write(root, '.claude/settings.json', '{}');
    write(root, '.specs/node_modules/pkg/index.md', 'x');
    write(root, '.specs/.git/HEAD', 'ref: refs/heads/x');
    write(root, '.github/workflows/ci.yml', 'x');
    await sleep(300);
    expect(events).toEqual([]);
  });

  it('treats ENOENT between readdir and stat as a delete, without throwing or stopping', async () => {
    start();
    mockFs.stat = fail('ENOENT');
    expect(await waitForEvent()).toEqual(['.specs/planning/tasks.md']);
    mockFs.stat = undefined;
    expect(await waitForEvent()).toEqual(['.specs/planning/tasks.md']); // back again: still polling
    expect(poller!.running).toBe(true);
  });

  it('skips a file that stat() cannot read (EACCES): no event, no throw, polling continues', async () => {
    start();
    mockFs.stat = fail('EACCES');
    await sleep(250);
    expect(events).toEqual([]);
    write(root, '.specs/project/requirements.md', '# Requirements\n\nedited\n');
    expect(await waitForEvent()).toEqual(['.specs/project/requirements.md']);
  });

  it('keeps the files of a folder it cannot list (EACCES) instead of reporting them deleted', async () => {
    write(root, '.specs/locked/a.md', 'a');
    start();
    chmodSync(join(root, '.specs', 'locked'), 0o000);
    if (listAllowedFiles(root).unreadable.length === 0) return; // running as root: permissions not enforced
    await sleep(250);
    expect(events).toEqual([]);
    chmodSync(join(root, '.specs', 'locked'), 0o755);
    write(root, '.specs/locked/a.md', 'changed');
    expect(await waitForEvent()).toEqual(['.specs/locked/a.md']);
  });

  it('does not scan before start() or after stop()', async () => {
    mockFs.readdirCalls = 0;
    poller = createPoller(root, { ...FAST, onChange: paths => events.push(paths) });
    await sleep(150);
    expect(mockFs.readdirCalls).toBe(0);
    poller.start();
    await sleep(150);
    expect(mockFs.readdirCalls).toBeGreaterThan(0);
    poller.stop();
    const calls = mockFs.readdirCalls;
    await sleep(150);
    expect(mockFs.readdirCalls).toBe(calls);
  });

  it('leaves no timer behind after stop(), even mid-burst', () => {
    jest.useFakeTimers();
    try {
      start();
      expect(jest.getTimerCount()).toBe(1);
      write(root, '.specs/planning/tasks.md', '# changed\n');
      jest.advanceTimersByTime(FAST.intervalMs); // change seen → settle timer scheduled
      expect(jest.getTimerCount()).toBe(1);
      poller!.stop();
      expect(jest.getTimerCount()).toBe(0);
      expect(events).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps the scan and says so once', async () => {
    for (let i = 0; i < 10; i++) write(root, `.specs/many/f${i}.md`, 'x');
    const log = jest.fn();
    start({ maxFiles: 6, log });
    await sleep(250);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('first 6 files');
    expect(listAllowedFiles(root, 6)).toMatchObject({ capped: true });
    expect(listAllowedFiles(root, 6).files).toHaveLength(6);
  });
});

describe('specPoller: the allowlisted roots themselves', () => {
  let root: string;
  let poller: Poller | null = null;
  const events: string[][] = [];
  beforeEach(() => {
    root = mkdtempSync(join(os.tmpdir(), 'specpilot-roots-'));
    write(root, '.specs/planning/tasks.md', 'x');
    write(root, '.claude/commands/specpilot-status.md', '---\ndescription: a\n---\n');
    write(root, '.claude/skills/specpilot-project/SKILL.md', 'x');
    write(root, '.github/prompts/specpilot-status.prompt.md', 'x');
    write(root, '.github/copilot-instructions.md', 'x');
    write(root, 'CLAUDE.md', 'x');
    events.length = 0;
  });
  afterEach(() => {
    poller?.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['.claude/commands/specpilot-status.md'],
    ['.claude/commands/specpilot-new.md'],
    ['.claude/skills/specpilot-project/SKILL.md'],
    ['.github/prompts/specpilot-status.prompt.md'],
    ['.github/copilot-instructions.md'],
    ['CLAUDE.md'],
    ['AGENTS.md'],
  ])('fires for an edit or new file at %s (dot-folders are skipped only below the roots)', async path => {
    poller = createPoller(root, { ...FAST, onChange: p => events.push(p) });
    poller.start();
    write(root, path, 'changed content');
    const until = Date.now() + 1500;
    while (!events.length && Date.now() < until) await sleep(10);
    expect(events[0]).toEqual([path]);
  });
});
