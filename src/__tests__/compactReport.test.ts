// BL-204 (REQ-002.A.21, ARCH-004.84): the compact report's numbers, from fixture text only.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { compactReport, ReportTexts } from '../utils/compactReport';
import { planCompact } from '../utils/contextCompactor';
import { SpecArchiver } from '../utils/specArchiver';

const DATE = '2026-11-26';
const marker = (lead: string) => `- **${lead}**: moved to context-archive.md on ${DATE}.`;
const big = (n: number) => 'x'.repeat(n);

// 30 Completed rows: archive keeps 10 (the 25-line limit), so BL-1..BL-20 move.
const completed = Array.from({ length: 30 }, (_, i) => `| ${i + 1} | [CD-x-${i + 1}] [BL-${i + 1}] | done ${i + 1} |`);
const TASKS = ['# Tasks', '', '## Backlog', '', '| ID | Description |', '|---|---|', '| BL-900 | open |', '', '## Completed', '', '| # | ID | Description |', '|---|---|---|', ...completed, ''].join('\n');
const ARCHIVE = '## Archived on 2026-01-01 00:00:00\n\n| # | ID | Description |\n|---|---|---|\n| 0 | [CD-x-0] [BL-500] | done |\n\n---\n\n';

const LONG_A = `- **BL-500 archived decision**: ${big(2000)}`;
const LONG_B = `- **BL-3 moved by archive**: ${big(1000)}\n  more ${big(500)}`;
const CONTEXT = ['# Context', '', '## Key Decisions', '', LONG_A, LONG_B, '- **BL-25 still in Completed**: kept', '- **BL-900 open work**: kept', '- **Note**: no id', ''].join('\n');

const item = (key: string, bytes: number) => `- ${big(bytes - key.length - 5)} [${key}]`;
const REQS = ['# Requirements', '', '## Core', '', item('REQ-1', 5000), item('REQ-2', 8000), item('REQ-3', 4095), `- ${big(9000)}`, item('REQ-4', 6000), ''].join('\n');

const texts = (over: Partial<ReportTexts> = {}): ReportTexts => ({
  tasks: TASKS, tasksArchive: ARCHIVE, prompts: null, context: CONTEXT, requirements: REQS, requirementsArchive: null, ...over,
});
const file = (r: ReturnType<typeof compactReport>, name: string) => r.files.find((f) => f.file === name)!;

describe('compactReport()', () => {
  test('tasks.md and prompts.md savings equal the bytes specpilot archive removes from the same text', async () => {
    const prompts = ['# Prompts', '', '## Latest Entries', ...Array.from({ length: 120 }, (_, i) => `- 2026-01-${String((i % 28) + 1).padStart(2, '0')}: entry ${120 - i}`).sort().reverse(), ''].join('\n');
    const base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-report-')));
    try {
      mkdirSync(join(base, '.specs', 'planning'), { recursive: true });
      mkdirSync(join(base, '.specs', 'development'), { recursive: true });
      writeFileSync(join(base, '.specs', 'planning', 'tasks.md'), TASKS);
      writeFileSync(join(base, '.specs', 'development', 'prompts.md'), prompts);
      const r = compactReport(texts({ prompts }), DATE);
      await new SpecArchiver().archive(base, { dryRun: false });
      const after = (p: string) => Buffer.byteLength(readFileSync(join(base, '.specs', p), 'utf-8'));
      expect(file(r, 'planning/tasks.md')).toMatchObject({ how: 'exact', saving: Buffer.byteLength(TASKS) - after('planning/tasks.md') });
      expect(file(r, 'planning/tasks.md').saving).toBeGreaterThan(0);
      expect(file(r, 'development/prompts.md')).toMatchObject({ how: 'exact', saving: Buffer.byteLength(prompts) - after('development/prompts.md') });
      expect(file(r, 'development/prompts.md').saving).toBeGreaterThan(0);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('a prompts.md archive would refuse is shown as refusing, with no saving', () => {
    const prompts = ['# Prompts', '', ...Array.from({ length: 120 }, (_, i) => `line ${i}`), ''].join('\n');
    expect(file(compactReport(texts({ prompts }), DATE), 'development/prompts.md')).toMatchObject({ how: 'refuses', saving: 0 });
  });

  test('the context ceiling counts entries finished after archive, less their markers; the likely saving is half', () => {
    const r = compactReport(texts(), DATE);
    // An entry's lines with their newlines, replaced by one marker line with its newline.
    const bytesOf = (entry: string, lead: string) => Buffer.byteLength(entry) - Buffer.byteLength(marker(lead));
    // LONG_A is finished already, LONG_B (BL-3) only once archive moves its row; BL-25 stays in Completed, BL-900 is open.
    const ceiling = bytesOf(LONG_A, 'BL-500 archived decision') + bytesOf(LONG_B, 'BL-3 moved by archive');
    expect(file(r, 'development/context.md')).toMatchObject({ how: 'likely', count: 2, ceiling, saving: Math.round(ceiling / 2) });
  });

  test('the ceiling matches what planCompact would remove for those entries', () => {
    const plan = '| Entry | Action | Reason |\n|---|---|---|\n| BL-500 archived decision | archive | x |\n';
    const moved = planCompact(CONTEXT, plan, TASKS, ARCHIVE, `${DATE} 00:00:00`);
    const only = compactReport(texts({ tasks: null }), DATE);
    if (!('newContext' in moved)) throw new Error(JSON.stringify(moved));
    expect(file(only, 'development/context.md').ceiling).toBe(Buffer.byteLength(CONTEXT) - Buffer.byteLength(moved.newContext));
  });

  test('each entry is clamped at 0, not the total; only tiny entries give nothing for the agent', () => {
    const tiny = ['## K', '', '- **BL-500 a**: x', '- **BL-500 b**: y', ''].join('\n');
    const r = compactReport(texts({ context: tiny, requirements: null }), DATE);
    expect(file(r, 'development/context.md')).toMatchObject({ ceiling: 0, saving: 0, count: 2 });
    expect(r).toMatchObject({ likelyPerRead: 0, agentTokens: 0 });
    const mixed = compactReport(texts({ context: tiny.replace('- **BL-500 b**: y', LONG_A), requirements: null }), DATE);
    expect(file(mixed, 'development/context.md').ceiling).toBe(Buffer.byteLength(LONG_A) - Buffer.byteLength(marker('BL-500 archived decision')));
  });

  test('requirements: keyed items of at least 4 KB, the 10 largest, a fifth saved', () => {
    const r = compactReport(texts(), DATE);
    expect(file(r, 'project/requirements.md')).toMatchObject({ how: 'likely', count: 3, ceiling: 19000, saving: 3800 });
    const many = ['## Core', ...Array.from({ length: 12 }, (_, i) => item(`REQ-${i}`, 5000 + i)), ''].join('\n');
    const m = file(compactReport(texts({ requirements: many }), DATE), 'project/requirements.md');
    expect(m.count).toBe(10);
    expect(m.ceiling).toBe(Array.from({ length: 10 }, (_, i) => 5011 - i).reduce((s, b) => s + b, 0));
  });

  test('an item already rewritten (an exact ### <key> line in requirements-archive.md) is left out; lookalikes count', () => {
    const archive = '## Archived on x\n\n### REQ-2\n\nReason: r\n\n- old [REQ-2]\n### REQ-1 extra\n- mentions REQ-4 in text\n';
    expect(file(compactReport(texts({ requirementsArchive: archive }), DATE), 'project/requirements.md')).toMatchObject({ count: 2, ceiling: 11000 });
  });

  test('the agent run: finished entries ÷ 4 + 10k + 17k per rewrite; per read is the likely savings ÷ 4', () => {
    const r = compactReport(texts(), DATE);
    const finished = Buffer.byteLength(LONG_A) + 1 + Buffer.byteLength(LONG_B) + 1;
    expect(r.agentTokens).toBe(Math.ceil(finished / 4) + 10_000 + 3 * 17_000);
    expect(r.likelyPerRead).toBe(Math.ceil((file(r, 'development/context.md').saving + 3800) / 4));
  });

  test('missing files have no row', () => {
    const r = compactReport({ tasks: null, tasksArchive: null, prompts: null, context: null, requirements: REQS, requirementsArchive: null }, DATE);
    expect(r.files.map((f) => f.file)).toEqual(['project/requirements.md']);
  });
});
