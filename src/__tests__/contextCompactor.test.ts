// BL-202 (REQ-002.A.19, ARCH-004.82): the agent picks, the CLI moves. Pure functions only; the CLI is compact.test.ts.
import { contextEntries, entryStatus, parsePlan, planCompact, putBack, taskIds } from '../utils/contextCompactor';

const TS = '2026-11-26 10:20:30';

const TASKS = `# Tasks

## Backlog

| ID | Type | Priority | Description |
|---|---|---|---|
| BL-300 | feat | P2 | open work, mentions BL-201 in passing |

## Current Sprint

| ID | Type | Priority | Description |
|---|---|---|---|
| BL-301 | | | in progress |

## Review

| ID | Type | Priority | Description |
|---|---|---|---|
| BL-302 | | | in review |

## Completed

| # | ID | Description |
|---|---|---|
| 90 | [CD-x-090] [BL-290] | done, not archived |

## Won't do

| ID | Description | Reason |
|---|---|---|
| BL-303 | dropped | not wanted |
`;

const ARCHIVE = `## Archived on 2026-01-01 00:00:00

| # | ID | Description |
|---|---|---|
| 1 | [CD-x-001] [BL-100] | archived row, describes BL-999 |
| 2 | [CD-x-002] [BL-TB-06] | letters segment |

---

## Archived on 2025-01-01 00:00:00

1. [CS-050] [TASK-007] older list shape

---
`;

const CONTEXT = `---
fileID: CTX-001
- not an entry: front matter
---

# Context

- before any section heading, not an entry

## Key Decisions [CTX-003]

- **BL-100 serve port fallback (2026-01-01)**: decided this.
  continued on an indented line.
- **BL-290 done but not archived**: still in Completed.
- **BL-300 and BL-100 mixed**: one open.
- **BL-303 won't do reason**: never archive.
- **BL-999 only in a description**: unknown.
- **General note**: no task id.
- plain entry without a bold lead
- **BL-TB-06 letters**: whole match.
- **CS-050 and TASK-007 list shape**: archived numbered items.

## Lessons Learned [CTX-006]

- **BL-1 short id**: must not match BL-100 or BL-12.
`;

const lines = (t: string) => t.split('\n');
const plan = (...rows: string[]) => `# Plan\n\n| Entry | Action | Reason |\n|---|---|---|\n${rows.join('\n')}\n`;

describe('contextEntries()', () => {
  test('top-level items under a ## heading, with their indented continuation, heading and lead', () => {
    const entries = contextEntries(lines(CONTEXT));
    expect(entries.map((e) => e.lead)).toEqual([
      'BL-100 serve port fallback (2026-01-01)',
      'BL-290 done but not archived',
      'BL-300 and BL-100 mixed',
      'BL-303 won\'t do reason',
      'BL-999 only in a description',
      'General note',
      null,
      'BL-TB-06 letters',
      'CS-050 and TASK-007 list shape',
      'BL-1 short id',
    ]);
    const first = entries[0];
    expect(lines(CONTEXT).slice(first.start, first.end)).toEqual([
      '- **BL-100 serve port fallback (2026-01-01)**: decided this.',
      '  continued on an indented line.',
    ]);
    expect(first.heading).toBe('## Key Decisions [CTX-003]');
    expect(entries[entries.length - 1].heading).toBe('## Lessons Learned [CTX-006]');
  });

  test('lines before the first ## heading, front matter included, are never entries', () => {
    const entries = contextEntries(lines(CONTEXT));
    expect(entries.some((e) => lines(CONTEXT)[e.start].includes('not an entry'))).toBe(false);
  });
});

describe('entryStatus()', () => {
  const ids = taskIds(TASKS, ARCHIVE);
  const status = (lead: string | null) => entryStatus(lead, ids);

  test('each of the six statuses, first match wins', () => {
    expect(status(null)).toBe('no-lead');
    expect(status('General note')).toBe('no-id');
    expect(status('BL-300 backlog')).toBe('open');
    expect(status('BL-301 sprint')).toBe('open');
    expect(status('BL-302 review')).toBe('open');
    expect(status('BL-303 won\'t do')).toBe('open');
    expect(status('BL-999 nowhere')).toBe('unknown');
    expect(status('BL-100 archived')).toBe('finished');
    expect(status('BL-290 in Completed')).toBe('completed');
    expect(status('BL-290 and BL-100')).toBe('completed');
  });

  test('a lead mixing open and finished IDs is open; open beats unknown', () => {
    expect(status('BL-300 and BL-100')).toBe('open');
    expect(status('BL-999 and BL-300')).toBe('open');
  });

  test('IDs from ID cells and numbered-item prefixes only, never a description', () => {
    expect(status('BL-201 named only in a backlog description')).toBe('unknown');
    expect(status('BL-999 named only in an archive description')).toBe('unknown');
    expect(status('CS-050 and TASK-007')).toBe('finished');
  });

  test('BL-TB-06 is matched whole, and BL-1 does not match BL-100 or BL-12', () => {
    expect(status('BL-TB-06')).toBe('finished');
    expect(status('BL-1')).toBe('unknown');
    expect(taskIds('| ID | Description |\n|---|---|\n| BL-12 | x |\n', '').open.has('BL-1')).toBe(false);
  });
});

describe('parsePlan()', () => {
  test('GFM cells: \\| is a literal pipe in the cell value, the raw cell is kept', () => {
    const p = parsePlan(plan('| a \\| b | archive | why \\| not |'));
    expect('rows' in p && p.rows[0]).toMatchObject({ lead: 'a | b', action: 'archive', reason: 'why | not', rawLead: 'a \\| b', rawReason: 'why \\| not' });
  });

  test('a row with other than three cells is refused', () => {
    const p = parsePlan(plan('| a | archive | why | extra |'));
    expect('refuse' in p && p.refuse[0]).toMatch(/row 1 has 4 cells, not 3/);
  });

  test('a file without the | Entry | Action | Reason | table is refused', () => {
    expect(parsePlan('# Plan\n\nnothing here\n')).toEqual({ refuse: ['The plan is not a | Entry | Action | Reason | table.'] });
  });
});

describe('planCompact()', () => {
  const run = (p: string, ctx = CONTEXT) => planCompact(ctx, p, TASKS, ARCHIVE, TS);

  test('moves the archive rows byte for byte under their headings, with the Reasons table, and leaves one marker each', () => {
    const r = run(plan(
      '| BL-100 serve port fallback (2026-01-01) | archive | now REQ-002.E.9 |',
      '| General note | keep | still binds |',
      '| BL-1 short id | archive | obsolete |',
    ));
    if (!('newContext' in r)) throw new Error(JSON.stringify(r));
    expect(r.moved).toBe(2);
    expect(r.archiveBlock).toBe([
      '## Archived on 2026-11-26 10:20:30',
      '',
      '### Key Decisions [CTX-003]',
      '',
      '- **BL-100 serve port fallback (2026-01-01)**: decided this.',
      '  continued on an indented line.',
      '',
      '### Lessons Learned [CTX-006]',
      '',
      '- **BL-1 short id**: must not match BL-100 or BL-12.',
      '',
      '### Reasons',
      '',
      '| Entry | Reason |',
      '|---|---|',
      '| BL-100 serve port fallback (2026-01-01) | now REQ-002.E.9 |',
      '| BL-1 short id | obsolete |',
      '',
      '---',
      '',
      '',
    ].join('\n'));
    expect(r.newContext).toBe(CONTEXT
      .replace('- **BL-100 serve port fallback (2026-01-01)**: decided this.\n  continued on an indented line.\n', '- **BL-100 serve port fallback (2026-01-01)**: moved to context-archive.md on 2026-11-26.\n')
      .replace('- **BL-1 short id**: must not match BL-100 or BL-12.\n', '- **BL-1 short id**: moved to context-archive.md on 2026-11-26.\n'));
  });

  test('keep rows and unlisted entries stay; CRLF is kept', () => {
    const crlf = CONTEXT.replace(/\n/g, '\r\n');
    const r = run(plan('| General note | archive | obsolete |'), crlf);
    if (!('newContext' in r)) throw new Error(JSON.stringify(r));
    expect(r.newContext).toBe(crlf.replace('- **General note**: no task id.', '- **General note**: moved to context-archive.md on 2026-11-26.'));
    expect(r.archiveBlock).toContain('\r\n- **General note**: no task id.\r\n');
    expect(r.archiveBlock.replace(/\r\n/g, '')).not.toContain('\n');
  });

  test('a plan with only keep rows moves nothing', () => {
    expect(run(plan('| General note | keep | binds |'))).toEqual({ moved: 0 });
  });

  test('a pipe in a lead matches through \\|', () => {
    const ctx = CONTEXT.replace('**General note**', '**A | B note**');
    const r = run(plan('| A \\| B note | archive | obsolete \\| really |'), ctx);
    if (!('newContext' in r)) throw new Error(JSON.stringify(r));
    expect(r.archiveBlock).toContain('| A \\| B note | obsolete \\| really |');
  });

  test.each([
    ['a lead with no match', '| No such entry | archive | x |', /row 1: no entry has the title "No such entry"/],
    ['a bad action', '| General note | delete | x |', /row 1: the action is "delete", not keep or archive/],
    ['an empty reason', '| General note | archive |  |', /row 1: an archive row needs a reason/],
    ['an open ID', '| BL-300 and BL-100 mixed | archive | x |', /row 1: "BL-300 and BL-100 mixed" names BL-300, which is still open in tasks.md/],
    ['a won\'t do ID', '| BL-303 won\'t do reason | archive | x |', /names BL-303, which is still open/],
    ['an entry without a bold lead', '| plain entry without a bold lead | archive | x |', /row 1: no entry has the title/],
  ])('refuses %s, nothing to write', (_name, row, message) => {
    const r = run(plan(row));
    expect('refuse' in r && r.refuse.join('\n')).toMatch(message);
  });

  test('refuses a lead matching two entries, a row listed twice, and a marker named again', () => {
    const twice = CONTEXT.replace('- **General note**: no task id.', '- **General note**: no task id.\n- **General note**: again.');
    expect(run(plan('| General note | archive | x |'), twice)).toEqual({ refuse: ['Plan row 1: 2 entries have the title "General note".'] });
    expect(run(plan('| General note | archive | x |', '| General note | keep | y |'))).toEqual({ refuse: ['Plan row 2: "General note" is already listed in row 1.'] });
    const marked = CONTEXT.replace('- **General note**: no task id.', '- **General note**: moved to context-archive.md on 2026-01-02.');
    expect(run(plan('| General note | archive | x |'), marked)).toEqual({ refuse: ['Plan row 1: "General note" is already a marker for an archived entry.'] });
  });

  test('every problem is reported at once', () => {
    const r = run(plan('| Nope | archive | x |', '| General note | maybe | x |'));
    expect('refuse' in r && r.refuse).toHaveLength(2);
  });

  test('putBack() expands each marker to its entry, the round-trip check planCompact() runs; a tampered result does not round-trip', () => {
    const r = run(plan('| General note | archive | x |'));
    if (!('newContext' in r)) throw new Error(JSON.stringify(r));
    expect(putBack(r.newContext, r.moves)).toBe(CONTEXT);
    expect(putBack(r.newContext.replace('Key Decisions', 'Key Decision'), r.moves)).not.toBe(CONTEXT);
    expect(putBack(r.newContext, [{ index: r.moves[0].index - 1, lines: r.moves[0].lines }])).not.toBe(CONTEXT);
  });
});
