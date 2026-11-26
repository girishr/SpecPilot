// BL-202 (REQ-002.A.19): `specpilot compact` lists, `--apply` moves the plan's archive rows. Temp folders only.
const question = jest.fn((_q: string, answer: (a: string) => void) => answer('n'));
jest.mock('readline', () => ({ createInterface: jest.fn(() => ({ question, close: () => {} })) }));

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { compactCommand } from '../commands/compact';

const CONTEXT = `# Context

## Key Decisions [CTX-003]

- **BL-100 old decision**: done long ago.
- **BL-300 open work**: still going.
- **General note**: no id.
`;
const TASKS = `# Tasks

## Backlog

| ID | Description |
|---|---|
| BL-300 | open |

## Completed

| # | ID | Description |
|---|---|---|
`;
const TASKS_ARCHIVE = `## Archived on 2026-01-01 00:00:00

| # | ID | Description |
|---|---|---|
| 1 | [CD-x-001] [BL-100] | done |

---

`;
const PLAN = `| Entry | Action | Reason |
|---|---|---|
| BL-100 old decision | archive | now in REQ-002.E.9 |
| General note | keep | binds |
`;

describe('compactCommand()', () => {
  let base: string;
  let out: string[];
  const specs = (...p: string[]) => join(base, '.specs', ...p);
  const read = (...p: string[]) => readFileSync(specs(...p), 'utf8');
  const run = (opts: Record<string, unknown> = {}) => compactCommand({ dir: base, ...opts });
  const text = () => out.join('\n');

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-compact-')));
    mkdirSync(specs('development'), { recursive: true });
    mkdirSync(specs('planning'), { recursive: true });
    writeFileSync(specs('development', 'context.md'), CONTEXT);
    writeFileSync(specs('planning', 'tasks.md'), TASKS);
    writeFileSync(specs('planning', 'tasks-archive.md'), TASKS_ARCHIVE);
    mkdirSync(join(base, '.git'));
    writeFileSync(join(base, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    out = [];
    jest.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)); });
    jest.spyOn(console, 'error').mockImplementation((m?: unknown) => { out.push(String(m)); });
    question.mockClear();
    process.exitCode = undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  test('without --apply it lists each entry with its status and line count, writing nothing', async () => {
    await run();
    expect(text()).toMatch(/finished\s+1\s+0\.0 KB\s+BL-100 old decision/);
    expect(text()).toMatch(/open\s+1\s+0\.0 KB\s+BL-300 open work/);
    expect(text()).toMatch(/no-id\s+1\s+0\.0 KB\s+General note/);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(read('development', 'context.md')).toBe(CONTEXT);
  });

  test('repository text is printed through terminalText', async () => {
    writeFileSync(specs('development', 'context.md'), CONTEXT.replace('General note', 'General\x1b]0;x\x07 note'));
    await run();
    expect(text()).not.toMatch(/\x1b/);
    expect(text()).toMatch(/General\]0;x note/);
  });

  test('--apply with no plan file is refused, exit 1, nothing written', async () => {
    await run({ apply: true });
    expect(text()).toContain('No plan: neither .specs/development/compact-plan.md nor .specs/development/compact-requirements.md was found. Run /specpilot-compact first.');
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
  });

  test('--apply writes the archive, then context.md, then removes the plan', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    expect(text()).toContain('Moved 1 entries to context-archive.md');
    const archive = read('development', 'context-archive.md');
    expect(archive.startsWith('## Archived on ')).toBe(true);
    expect(archive).toContain('- **BL-100 old decision**: done long ago.');
    const date = /^## Archived on (\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/m.exec(archive)![1];
    expect(read('development', 'context.md')).toContain(`- **BL-100 old decision**: moved to context-archive.md on ${date}.`);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  test('a second run appends to context-archive.md', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| General note | archive | obsolete |\n');
    await run({ apply: true });
    expect(read('development', 'context-archive.md').match(/^## Archived on /gm)).toHaveLength(2);
  });

  test('a plan with only keep rows: Nothing to move, exit 0, no archive file, plan kept', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| General note | keep | binds |\n');
    await run({ apply: true });
    expect(text()).toContain('Nothing to move: the plan has no archive rows');
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test('a refused plan: one line per problem, exit 1, nothing written, plan kept', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| BL-300 open work | archive | x |\n| Nope | archive | x |\n');
    await run({ apply: true });
    expect(text()).toContain('names BL-300, which is still open in tasks.md');
    expect(text()).toContain('no entry has the title "Nope"');
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test('--dry-run writes nothing and keeps the plan', async () => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true, dryRun: true });
    expect(text()).toContain('Would move 1 entries to context-archive.md');
    expect(out).toContain('  BL-100 old decision');
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(existsSync(specs('development', 'compact-plan.md'))).toBe(true);
  });

  test.each([
    ['context-archive.md', () => symlinkSync(join(base, 'elsewhere.md'), join(base, '.specs', 'development', 'context-archive.md'))],
    ['context.md', () => {
      writeFileSync(join(base, 'real-context.md'), CONTEXT);
      rmSync(join(base, '.specs', 'development', 'context.md'));
      symlinkSync(join(base, 'real-context.md'), join(base, '.specs', 'development', 'context.md'));
    }],
  ])('a linked %s is refused, nothing written (BL-130)', async (_name, link) => {
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    link();
    await run({ apply: true });
    expect(text()).toMatch(/is a symbolic link, so nothing was written/);
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(base, 'elsewhere.md'))).toBe(false);
    expect(readFileSync(join(base, '.specs', 'development', 'context.md'), 'utf8')).toBe(CONTEXT);
  });

  test('a linked compact-plan.md is refused, exit 1, nothing written, the link kept (BL-130)', async () => {
    writeFileSync(join(base, 'real-plan.md'), PLAN);
    symlinkSync(join(base, 'real-plan.md'), specs('development', 'compact-plan.md'));
    await run({ apply: true });
    expect(text()).toMatch(/compact-plan\.md is a symbolic link, so nothing was written/);
    expect(process.exitCode).toBe(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    expect(existsSync(specs('development', 'context-archive.md'))).toBe(false);
    expect(lstatSync(specs('development', 'compact-plan.md')).isSymbolicLink()).toBe(true);
  });

  test('a linked .specs is refused (BL-130)', async () => {
    const real = join(base, 'shared');
    mkdirSync(join(real, 'development'), { recursive: true });
    mkdirSync(join(real, 'planning'), { recursive: true });
    writeFileSync(join(real, 'development', 'context.md'), CONTEXT);
    writeFileSync(join(real, 'development', 'compact-plan.md'), PLAN);
    writeFileSync(join(real, 'planning', 'tasks-archive.md'), TASKS_ARCHIVE);
    rmSync(join(base, '.specs'), { recursive: true });
    symlinkSync(real, join(base, '.specs'));
    await run({ apply: true });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(join(real, 'development', 'context.md'), 'utf8')).toBe(CONTEXT);
  });

  test('off main the branch guard asks; n cancels, --force skips the question', async () => {
    writeFileSync(join(base, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
    writeFileSync(specs('development', 'compact-plan.md'), PLAN);
    await run({ apply: true });
    expect(question).toHaveBeenCalledTimes(1);
    expect(read('development', 'context.md')).toBe(CONTEXT);
    await run({ apply: true, force: true });
    expect(question).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Moved 1 entries to context-archive.md');
  });
});

// BL-203 (REQ-002.A.20): the requirements plan, alone or with the context plan, all or nothing.
describe('compactCommand() and requirements.md (BL-203)', () => {
  const LONG = '- `specpilot archive` moves rows past 25 lines (`40 until BL-123`); the developer asked on 2026-09-01 and the Spec Report agreed (BL-061). [REQ-002.A.8]';
  const SHORT = '- `specpilot archive` moves rows past 25 lines (BL-061). [REQ-002.A.8]';
  const REQS = `---\ntitle: Requirements\n---\n\n# Requirements\n\n## Core [REQ-002.A]\n\n${LONG}\n- Small. [REQ-002.A.9]\n- Untagged requirement.\n`;
  const CTX = '# Context\n\n## Key Decisions [CTX-003]\n\n- **BL-100 old decision**: done long ago.\n- **General note**: no id.\n';
  const ARCHIVE = '## Archived on 2026-01-01 00:00:00\n\n| # | ID | Description |\n|---|---|---|\n| 1 | [CD-x-001] [BL-100] | done |\n\n---\n\n';
  const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);
  const reqPlan = (sha = sha8(LONG), item = SHORT) => `# Requirements plan\n\n### REQ-002.A.8 ${sha}\n\nReason: dropped who asked\n\n\`\`\`text\n${item}\n\`\`\`\n`;
  let base: string;
  let out: string[];
  const p = (...x: string[]) => join(base, '.specs', ...x);
  const read = (...x: string[]) => readFileSync(p(...x), 'utf8');
  const run = (opts: Record<string, unknown> = {}) => compactCommand({ dir: base, ...opts });
  const text = () => out.join('\n');

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-compact-req-')));
    for (const d of ['development', 'planning', 'project']) mkdirSync(p(d), { recursive: true });
    writeFileSync(p('development', 'context.md'), CTX);
    writeFileSync(p('planning', 'tasks.md'), '# Tasks\n');
    writeFileSync(p('planning', 'tasks-archive.md'), ARCHIVE);
    writeFileSync(p('project', 'requirements.md'), REQS);
    out = [];
    jest.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)); });
    jest.spyOn(console, 'error').mockImplementation((m?: unknown) => { out.push(String(m)); });
    process.exitCode = undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  test('the listing has a requirements section, largest first, each key with its sha8, and the total', async () => {
    await run();
    const t = text();
    expect(t).toMatch(new RegExp(`REQ-002\\.A\\.8\\s+${sha8(LONG)}\\s+0\\.1 KB\\s+1`));
    expect(t.indexOf('REQ-002.A.8')).toBeLessThan(t.indexOf('REQ-002.A.9'));
    expect(t).toMatch(/no-id\s+-{8}\s+0\.0 KB\s+1\s+- Untagged requirement\./);
    expect(t).toMatch(/3 requirements items, \d\.\d KB; 1 without a key/);
  });

  test('--apply with only the requirements plan rewrites in place, archives the original, removes the plan', async () => {
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    await run({ apply: true, force: true });
    expect(process.exitCode).toBeUndefined();
    expect(read('project', 'requirements.md')).toBe(REQS.replace(LONG, SHORT));
    const archive = read('project', 'requirements-archive.md');
    expect(archive.startsWith('## Archived on ')).toBe(true);
    expect(archive).toContain(`### REQ-002.A.8\n\nReason: dropped who asked\n\n${LONG}\n`);
    expect(existsSync(p('development', 'compact-requirements.md'))).toBe(false);
    expect(text()).toMatch(/Rewrote 1 requirements \(0\.1 KB shorter\); originals in requirements-archive\.md/);
  });

  test('a second run appends to requirements-archive.md', async () => {
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    await run({ apply: true, force: true });
    const shorter = '- `specpilot archive` moves rows (BL-061). [REQ-002.A.8]';
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan(sha8(SHORT), shorter));
    await run({ apply: true, force: true });
    expect(read('project', 'requirements-archive.md').match(/^## Archived on /gm)).toHaveLength(2);
  });

  test('both plans apply together', async () => {
    writeFileSync(p('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| BL-100 old decision | archive | obsolete |\n');
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    await run({ apply: true, force: true });
    expect(text()).toContain('Moved 1 entries to context-archive.md');
    expect(text()).toContain('Rewrote 1 requirements');
    expect(existsSync(p('development', 'compact-plan.md'))).toBe(false);
    expect(existsSync(p('development', 'compact-requirements.md'))).toBe(false);
  });

  test('a context plan with only keep rows still lets the requirements plan show and apply', async () => {
    writeFileSync(p('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| General note | keep | binds |\n');
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    await run({ apply: true, dryRun: true });
    expect(text()).toMatch(/REQ-002\.A\.8\s+\d+ → \d+ bytes/);
    await run({ apply: true, force: true });
    expect(read('project', 'requirements.md')).toBe(REQS.replace(LONG, SHORT));
    expect(read('development', 'context.md')).toBe(CTX);
    expect(existsSync(p('development', 'compact-plan.md'))).toBe(false); // both plans removed (REQ-002.A.20)
  });

  test('a requirements plan with no requirements.md: exit 1, nothing written', async () => {
    rmSync(p('project', 'requirements.md'));
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    await run({ apply: true, force: true });
    expect(process.exitCode).toBe(1);
    expect(text()).toContain('No .specs/project/requirements.md found for the requirements plan.');
    expect(text()).toContain('Nothing was written.');
    expect(existsSync(p('project', 'requirements-archive.md'))).toBe(false);
    expect(existsSync(p('development', 'compact-requirements.md'))).toBe(true);
  });

  test('one plan refusing writes nothing to any file', async () => {
    writeFileSync(p('development', 'compact-plan.md'), '| Entry | Action | Reason |\n|---|---|---|\n| BL-100 old decision | archive | obsolete |\n');
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan('00000000'));
    await run({ apply: true, force: true });
    expect(process.exitCode).toBe(1);
    expect(text()).toMatch(/REQ-002\.A\.8 changed since the plan/);
    expect(read('development', 'context.md')).toBe(CTX);
    expect(read('project', 'requirements.md')).toBe(REQS);
    expect(existsSync(p('development', 'context-archive.md'))).toBe(false);
    expect(existsSync(p('project', 'requirements-archive.md'))).toBe(false);
  });

  test('--dry-run prints bytes before and after and the dropped strings, through terminalText, writing nothing', async () => {
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan(sha8(LONG), SHORT.replace('(BL-061)', '\x1b]0;x\x07(BL-061)')));
    await run({ apply: true, dryRun: true });
    expect(text()).toMatch(new RegExp(`REQ-002\\.A\\.8\\s+${Buffer.byteLength(LONG)} → \\d+ bytes`));
    expect(text()).toContain('    dropped: `40 until BL-123`');
    expect(text()).toMatch(/Would rewrite 1 requirements \(0\.1 KB shorter\)/);
    expect(text()).not.toMatch(/\x1b/);
    expect(read('project', 'requirements.md')).toBe(REQS);
    expect(existsSync(p('development', 'compact-requirements.md'))).toBe(true);
  });

  test.each([
    ['requirements.md', () => {
      writeFileSync(join(base, 'real-req.md'), REQS);
      rmSync(p('project', 'requirements.md'));
      symlinkSync(join(base, 'real-req.md'), p('project', 'requirements.md'));
    }],
    ['requirements-archive.md', () => symlinkSync(join(base, 'elsewhere.md'), p('project', 'requirements-archive.md'))],
    ['compact-requirements.md', () => {
      writeFileSync(join(base, 'real-plan.md'), reqPlan());
      rmSync(p('development', 'compact-requirements.md'));
      symlinkSync(join(base, 'real-plan.md'), p('development', 'compact-requirements.md'));
    }],
  ])('a linked %s is refused, nothing written (BL-130)', async (name, link) => {
    writeFileSync(p('development', 'compact-requirements.md'), reqPlan());
    link();
    await run({ apply: true, force: true });
    expect(text()).toContain(`${name} is a symbolic link, so nothing was written`);
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(base, 'elsewhere.md'))).toBe(false);
    expect(readFileSync(p('project', 'requirements.md'), 'utf8')).toBe(REQS);
  });
});
