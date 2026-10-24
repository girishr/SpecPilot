import { endsWithApproved, readSpecs, REQUIRED_TASK_HEADINGS, reviewMarks, TASK_COLUMNS, TASK_HEADINGS, taskHeadings, taskRowLines } from '../utils/specReader';
import { render } from '../core/render';

// Shaped like the real .specs/planning/tasks.md: 2-column Backlog / Current Sprint,
// a stray "_(empty …)_" line after the sprint table, 3-column Completed with
// multi-ID cells and a literal `|` inside backticks, and a section after Completed.
const BACKLOG_ROWS = [
  '| BL-009 | Implement enhanced `add-specs` command with codebase analysis |',
  '| BL-032 | **[DEFERRED]** Extract `@specpilot/spec-core` — pure `render(context) → { path, content }[]` core |',
];
const SPRINT_ROWS = ['| CS-078 | Force AI to write tests for every feature — two-part enforcement, not text-only |'];
const COMPLETED_ROWS = [
  "| 95 | [CD-girishr-013] [CS-070] [BL-036] | Conditional `api.yaml` — `apiParadigm: 'rest' | 'cli' | 'graphql' | 'none'` added |",
  '| 124 | [CD-girishr-033] [CS-090] | Fix same bug in the `specpilot-archive` copy |',
];
// BL-113: Review rows with their marker chains, and a three-column Won't do as the real file has it
const REVIEW_ROWS = [
  '| BL-113 | Review lane Sent back 2026-10-18: tests \\| docs missing Approved 2026-10-20 |',
  '| CS-078 | Force AI to write tests Approved 2026-10-01 Sent back 2026-10-02. |',
  '| BL-050 | Plain, nothing yet |',
];
const WONTDO_ROWS = ["| BL-009 | Enhanced `add-specs` | Superseded by BL-103/BL-104 (2026-10-15): the IDE writes the specs |"];

const TASKS_MD = [
  '---',
  'fileID: TASKS-001',
  'lastUpdated: 2026-09-05 (BL-049 cross-ref: remote MCP server; BL-048 unchanged)',
  'version: 5.10',
  'contributors: [girishr]',
  'relatedFiles: [roadmap.md, project.yaml, requirements.md, tasks-archive.md]',
  '---',
  '',
  '# Task Tracking',
  '',
  '## Backlog',
  '',
  '| ID | Description |',
  '|---|---|',
  ...BACKLOG_ROWS,
  '',
  '## Current Sprint',
  '',
  '| ID | Description |',
  '|---|---|',
  ...SPRINT_ROWS,
  '',
  '_(empty — all sprint items completed; see Completed section below)_',
  '',
  '## Review',
  '',
  '| ID | Description |',
  '|---|---|',
  ...REVIEW_ROWS,
  '',
  '## Completed',
  '',
  '> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).',
  '',
  '| # | ID | Description |',
  '|---|---|---|',
  ...COMPLETED_ROWS,
  '',
  "## Won't do",
  '',
  '| ID | Description | Reason |',
  '|---|---|---|',
  ...WONTDO_ROWS,
  '',
  '## Multi-Dev Notes',
  '',
  '| Not | A | Task |',
  '|---|---|---|',
  '| x | y | z |',
  '',
].join('\n');

describe('readSpecs', () => {
  it('parses front-matter metadata without coercing values', () => {
    const { files } = readSpecs({ 'planning/tasks.md': TASKS_MD });
    expect(files['planning/tasks.md']).toEqual({
      fileID: 'TASKS-001',
      lastUpdated: '2026-09-05 (BL-049 cross-ref: remote MCP server; BL-048 unchanged)',
      version: '5.10',
      contributors: ['girishr'],
      relatedFiles: ['roadmap.md', 'project.yaml', 'requirements.md', 'tasks-archive.md'],
    });
  });

  it('parses a multi-line flow list and a block list', () => {
    const md = [
      '---',
      'fileID: ARCH-001',
      'contributors:',
      '  - girishr',
      '  - jsmith',
      'relatedFiles:',
      '  [',
      '    project.yaml,',
      '    security/threat-model.md,',
      '  ]',
      '---',
      '# Body',
    ].join('\n');
    const meta = readSpecs({ 'architecture/architecture.md': md }).files['architecture/architecture.md'];
    expect(meta.contributors).toEqual(['girishr', 'jsmith']);
    expect(meta.relatedFiles).toEqual(['project.yaml', 'security/threat-model.md']);
  });

  it("reads a yaml file's metadata from its leading # comments only", () => {
    const yaml = [
      '# SpecPilot SDD CLI - Project Configuration',
      '# fileID: PROJ-001',
      '# lastUpdated: 2026-06-26',
      'name: "SpecPilot SDD CLI"',
      'version: "2.2.3"',
      'contributors: [girishr]',
    ].join('\n');
    expect(readSpecs({ 'project/project.yaml': yaml }).files['project/project.yaml']).toEqual({
      fileID: 'PROJ-001',
      lastUpdated: '2026-06-26',
    });
  });

  it('returns Backlog, Current Sprint and Completed rows, ignoring the stray empty-sprint line', () => {
    const tasks = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    expect(tasks.backlog.map(r => r.id)).toEqual(['BL-009', 'BL-032']);
    expect(tasks.currentSprint).toEqual([
      { id: 'CS-078', type: null, priority: null, description: 'Force AI to write tests for every feature — two-part enforcement, not text-only', line: 22 },
    ]);
    expect(tasks.completed[0]).toEqual({
      num: '95',
      id: '[CD-girishr-013] [CS-070] [BL-036]',
      description: "Conditional `api.yaml` — `apiParadigm: 'rest' | 'cli' | 'graphql' | 'none'` added",
      line: 40,
    });
    expect(tasks.malformed).toEqual([]);
  });

  it('serves Review rows with what their markers say, and Won\'t do rows with their Reason (BL-113)', () => {
    const tasks = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    expect(tasks.review).toEqual([
      { id: 'BL-113', type: null, priority: null, description: 'Review lane Sent back 2026-10-18: tests \\| docs missing Approved 2026-10-20', line: 30, approved: '2026-10-20', history: [{ date: '2026-10-18', note: 'tests \\| docs missing' }] },
      { id: 'CS-078', type: null, priority: null, description: 'Force AI to write tests Approved 2026-10-01 Sent back 2026-10-02.', line: 31, approved: null, history: [{ date: '2026-10-02', note: '' }] },
      { id: 'BL-050', type: null, priority: null, description: 'Plain, nothing yet', line: 32, approved: null, history: [] },
    ]);
    expect(tasks.wontDo).toEqual([{ id: 'BL-009', description: 'Enhanced `add-specs`', reason: 'Superseded by BL-103/BL-104 (2026-10-15): the IDE writes the specs', line: 47 }]);
    expect(tasks.malformed).toEqual([]);
    // a two-cell Won't do row is malformed like any short row; the rest of the lane is served
    const short = readSpecs({ 'planning/tasks.md': TASKS_MD.replace(WONTDO_ROWS[0], '| BL-010 | No reason cell |\n' + WONTDO_ROWS[0]) }).tasks!;
    expect(short.malformed).toEqual(['| BL-010 | No reason cell |']);
    expect(short.wontDo.map(r => r.id)).toEqual(['BL-009']);
  });

  it('reviewMarks and endsWithApproved: the chain at the end of the cell, one rule for the reader and the writer (BL-113)', () => {
    expect(reviewMarks('Done Approved 2026-10-20')).toEqual({ approved: '2026-10-20', history: [] });
    expect(reviewMarks('Approved 2026-10-20')).toEqual({ approved: '2026-10-20', history: [] }); // an otherwise empty cell
    expect(reviewMarks('Done Sent back 2026-10-18: fix it Approved 2026-10-20')).toEqual({ approved: '2026-10-20', history: [{ date: '2026-10-18', note: 'fix it' }] });
    expect(reviewMarks('Done Approved 2026-10-19 Sent back 2026-10-20: again')).toEqual({ approved: null, history: [{ date: '2026-10-20', note: 'again' }] });
    expect(reviewMarks('Done Sent back 2026-10-18. Sent back 2026-10-19: two')).toEqual({ approved: null, history: [{ date: '2026-10-18', note: '' }, { date: '2026-10-19', note: 'two' }] });
    expect(reviewMarks('Approved 2026-10-01 by the team')).toEqual({ approved: null, history: [] }); // running text, not a marker
    expect(reviewMarks('See Approved2026-10-01 and Sent back 2026-10-02:x')).toEqual({ approved: null, history: [] });
    expect(reviewMarks('')).toEqual({ approved: null, history: [] });
    expect(endsWithApproved('Done Approved 2026-10-20')).toBe(true);
    expect(endsWithApproved('Done Approved 2026-10-20', '2026-10-20')).toBe(true);
    expect(endsWithApproved('Done Approved 2026-10-20', '2026-10-19')).toBe(false);
    expect(endsWithApproved('DoneApproved 2026-10-20')).toBe(false);
    expect(endsWithApproved('Approved 2026-10-01 by the team')).toBe(false);
  });

  it('gives every row its 1-based line in the file, front matter counted, the same with CRLF (BL-PM-008)', () => {
    const lines = (md: string) => {
      const t = readSpecs({ 'planning/tasks.md': md }).tasks!;
      return [t.backlog, t.currentSprint, t.completed].map(rows => rows.map(r => r.line));
    };
    expect(lines(TASKS_MD)).toEqual([[15, 16], [22], [40, 41]]);
    expect(lines(TASKS_MD.replace(/\n/g, '\r\n'))).toEqual([[15, 16], [22], [40, 41]]);
    const all = TASKS_MD.split('\n');
    const t = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    for (const r of [...t.backlog, ...t.currentSprint, ...t.review, ...t.completed, ...t.wontDo]) expect(all[r.line - 1]).toContain(`| ${r.id} |`); // the line holds that row
  });

  it('keeps the lines right after a header row and after a malformed row (BL-PM-008)', () => {
    const md = ['## Backlog', '| ID | Description |', '|---|---|', '| BL-001 | One |', '| broken', '| BL-002 | Two |', '## Current Sprint', '| ID | Description |', '|---|---|'].join('\n');
    const t = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(t.backlog).toEqual([{ id: 'BL-001', type: null, priority: null, description: 'One', line: 4 }, { id: 'BL-002', type: null, priority: null, description: 'Two', line: 6 }]);
    expect(t.malformed).toEqual(['| broken']);
  });

  it('round-trips every cell byte for byte', () => {
    const tasks = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    expect([...tasks.backlog, ...tasks.currentSprint].map(r => `| ${r.id} | ${r.description} |`)).toEqual([
      ...BACKLOG_ROWS,
      ...SPRINT_ROWS,
    ]);
    expect(tasks.completed.map(r => `| ${r.num} | ${r.id} | ${r.description} |`)).toEqual(COMPLETED_ROWS);
    expect(tasks.review.map(r => `| ${r.id} | ${r.description} |`)).toEqual(REVIEW_ROWS);
    expect(tasks.wontDo.map(r => `| ${r.id} | ${r.description} | ${r.reason} |`)).toEqual(WONTDO_ROWS);
  });

  it('does not let a section after ## Completed bleed into it', () => {
    const tasks = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    expect(tasks.completed).toHaveLength(2);
    expect(tasks.completed.some(r => r.num === 'x')).toBe(false);
  });

  it('parses a section that appears after ## Completed', () => {
    const md = [
      '## Completed',
      '| # | ID | Description |',
      '|---|---|---|',
      '| 1 | [CD-001] | Done |',
      '## Backlog',
      '| ID | Description |',
      '|---|---|',
      '| BL-001 | Later |',
    ].join('\n');
    const tasks = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(tasks.completed).toEqual([{ num: '1', id: '[CD-001]', description: 'Done', line: 4 }]);
    expect(tasks.backlog).toEqual([{ id: 'BL-001', type: null, priority: null, description: 'Later', line: 8 }]);
  });

  it('returns an empty list for a missing section', () => {
    const md = TASKS_MD.replace(/## Current Sprint[\s\S]*?(?=## Completed)/, '');
    const tasks = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(tasks.currentSprint).toEqual([]);
    expect(tasks.backlog).toHaveLength(2);
    expect(tasks.completed).toHaveLength(2);
  });

  it('reports a malformed table row instead of guessing its cells', () => {
    const md = TASKS_MD.replace(BACKLOG_ROWS[1], '| BL-099 no second cell |');
    const tasks = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(tasks.backlog.map(r => r.id)).toEqual(['BL-009']);
    expect(tasks.malformed).toEqual(['| BL-099 no second cell |']);
  });

  it('reports the headings found, missing and unknown, the candidates, the row counts and the columns, the same with CRLF (BL-112)', () => {
    const h = (md: string) => readSpecs({ 'planning/tasks.md': md }).tasks!.headings;
    // the fixture's three moving lanes are plain tables, read as they are written (BL-125); a lane with no table names the typed shape it would be written in
    const columns = { '## Backlog': ['ID', 'Description'], '## Current Sprint': ['ID', 'Description'], '## Review': ['ID', 'Description'], '## Completed': ['#', 'ID', 'Description'], "## Won't do": ['ID', 'Description', 'Reason'] };
    const shapes = { '## Backlog': 'plain', '## Current Sprint': 'plain', '## Review': 'plain' };
    const all = { found: ['## Backlog', '## Current Sprint', '## Review', '## Completed', "## Won't do", '## Multi-Dev Notes'], missing: [], unknown: ['## Multi-Dev Notes'], variants: {}, unknownRows: { '## Multi-Dev Notes': 1 }, columns, shapes, untabled: {}, columnsFound: {} };
    const noBacklog = { columns: { ...columns, '## Backlog': ['ID', 'Type', 'Priority', 'Description'] }, shapes: { '## Current Sprint': 'plain', '## Review': 'plain' } };
    expect(h(TASKS_MD)).toEqual(all);
    expect(h(TASKS_MD.replace(/\n/g, '\r\n'))).toEqual(all);
    expect(taskHeadings(TASKS_MD.split('\n'))).toEqual(all);
    expect(h(TASKS_MD.replace('## Backlog', '### Backlog'))).toEqual({ ...all, ...noBacklog, found: ['## Current Sprint', '## Review', '## Completed', "## Won't do", '## Multi-Dev Notes'], missing: ['## Backlog'], variants: { '## Backlog': ['### Backlog'] } });
    expect(h(TASKS_MD.replace('## Backlog', '## backlog'))).toEqual({ ...all, ...noBacklog, found: ['## backlog', '## Current Sprint', '## Review', '## Completed', "## Won't do", '## Multi-Dev Notes'], missing: ['## Backlog'], unknown: ['## backlog', '## Multi-Dev Notes'], variants: { '## Backlog': ['## backlog'] }, unknownRows: { '## backlog': 2, '## Multi-Dev Notes': 1 } });
    // BL-113: `## Review` is required, `## Won't do` optional and never unknown
    expect(h(TASKS_MD.replace('## Review', '## Reviewing'))).toMatchObject({ missing: ['## Review'], unknown: ['## Reviewing', '## Multi-Dev Notes'], variants: { '## Review': [] } });
    expect(h(TASKS_MD.replace("## Won't do", '## Dropped'))).toMatchObject({ missing: [], unknown: ['## Dropped', '## Multi-Dev Notes'], variants: {} });
    expect(TASK_HEADINGS).toEqual(['## Backlog', '## Current Sprint', '## Review', '## Completed', "## Won't do"]);
    expect(REQUIRED_TASK_HEADINGS).toEqual(['## Backlog', '## Current Sprint', '## Review', '## Completed']);
    expect(h(TASKS_MD.replace('## Backlog', '## backlog\n\n### Backlog')).variants).toEqual({ '## Backlog': ['## backlog', '### Backlog'] }); // two candidates, in file order
    expect(h(TASKS_MD + '## Later\n\nNothing tabled yet.\n').unknownRows).toEqual({ '## Multi-Dev Notes': 1, '## Later': 0 });
    expect(h('# Tasks\n\n- one\n')).toEqual({ found: [], missing: ['## Backlog', '## Current Sprint', '## Review', '## Completed'], unknown: [], variants: { '## Backlog': [], '## Current Sprint': [], '## Review': [], '## Completed': [] }, unknownRows: {}, columns: TASK_COLUMNS, shapes: {}, untabled: {}, columnsFound: {} });
  });

  it('counts the lines of a known section that has no table, [TODO] aside, and names the columns a table needs (BL-116)', () => {
    const u = (md: string) => readSpecs({ 'planning/tasks.md': md }).tasks!.headings.untabled;
    expect(u(TASKS_MD)).toEqual({}); // every section has a table
    const nine = Array.from({ length: 9 }, (_, i) => `[BL-00${i + 1}-handle] Task ${i + 1}`).join('\n');
    const lines = `## Backlog\n\n${nine}\n\n## Current Sprint\n\n[TODO]\n\n## Completed\n\n1. [CD-001] Initialise .specs directory (2026-10-20)\n\n## Won't do\n\n- BL-009 dropped\n`;
    expect(u(lines)).toEqual({ '## Backlog': 9, '## Completed': 1, "## Won't do": 1 }); // the init template's own list shape counts; its [TODO] placeholder does not
    expect(u(lines.replace(/\n/g, '\r\n'))).toEqual({ '## Backlog': 9, '## Completed': 1, "## Won't do": 1 });
    expect(u('## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | One |\n\nA note beside the table.\n')).toEqual({}); // a table: prose beside it is ignored, as today
    expect(u('## Backlog\n\n| ID | Description |\n')).toEqual({ '## Backlog': 1 }); // a header row with no separator is not a table
    expect(u('## Backlog\n\n\n\n## Completed\n')).toEqual({});
    const typed = ['ID', 'Type', 'Priority', 'Description']; // BL-125: the shape the template and the stub write
    expect(TASK_COLUMNS).toEqual({ '## Backlog': typed, '## Current Sprint': typed, '## Review': typed, '## Completed': ['#', 'ID', 'Description'], "## Won't do": ['ID', 'Description', 'Reason'] });
  });

  it('reports a table whose header has another column count than its lane, with the rows it cannot read, the same with CRLF (BL-120)', () => {
    const r = (md: string) => readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(r(TASKS_MD).headings.columnsFound).toEqual({}); // every header matches
    const two = '## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | One |\n\n## Completed\n\n| ID | Task |\n|---|---|\n| CD-001 | First |\n| CD-002 | Second |\n| CD-003 | Third |\n';
    for (const md of [two, two.replace(/\n/g, '\r\n')]) {
      const t = r(md);
      expect(t.headings.columnsFound).toEqual({ '## Completed': { columns: 2, names: ['ID', 'Task'], unread: 3 } });
      expect(t.malformed.map(l => l.trim())).toEqual(['| CD-001 | First |', '| CD-002 | Second |', '| CD-003 | Third |']);
      expect(t.backlog).toEqual([{ id: 'BL-001', type: null, priority: null, description: 'One', line: 5 }]);
    }
    const wide = r('## Backlog\n\n| ID | Description | Owner |\n|---|---|---|\n| BL-001 | One | me |\n');
    expect(wide.headings.columnsFound).toEqual({ '## Backlog': { columns: 3, names: ['ID', 'Description', 'Owner'], unread: 0 } });
    expect(wide.backlog[0].description).toBe('One | me'); // the extra cell runs into the description
    expect(r('## Completed\n\n| ID | Task |\n|---|---|\n').headings.columnsFound).toEqual({ '## Completed': { columns: 2, names: ['ID', 'Task'], unread: 0 } }); // an empty table still warns
    expect(r('## Backlog\n\n|---|---|---|\n| BL-001 | One |\n').headings.columnsFound).toEqual({}); // a separator with no header row
    const lines = r('## Backlog\n\n[BL-001] One\n').headings;
    expect(lines.untabled).toEqual({ '## Backlog': 1 }); // no table: BL-116's, not this
    expect(lines.columnsFound).toEqual({});
  });

  it('reads Backlog, Current Sprint and Review in the typed or the plain shape by their header names, case ignored (BL-125)', () => {
    const md = [
      '## Backlog', '', '| ID | Type | Priority | Description |', '|---|---|---|---|',
      '| BL-001 | feat | P1 | One |', '| BL-002 |  |  | Two `a | b` |', '| BL-003 | high | soon | Three |', '| BL-004 | feat | Short |', '',
      '## Current Sprint', '', '| id | TYPE | priority | description |', '|---|---|---|---|', '  | CS-001 | bug | P3 | Lead |', '',
      '## Review', '', '| ID | Description |', '|---|---|', '| BL-005 | Plain Approved 2026-10-24 |', '',
      '## Completed', '', '| # | ID | Description |', '|---|---|---|', '| 1 | [CD-001] | Done |', '',
    ].join('\n');
    for (const text of [md, md.replace(/\n/g, '\r\n')]) {
      const t = readSpecs({ 'planning/tasks.md': text }).tasks!;
      expect(t.backlog).toEqual([
        { id: 'BL-001', type: 'feat', priority: 'P1', description: 'One', line: 5 },
        { id: 'BL-002', type: '', priority: '', description: 'Two `a | b`', line: 6 },
        { id: 'BL-003', type: 'high', priority: 'soon', description: 'Three', line: 7 }, // served as written
      ]);
      expect(t.malformed.map(l => l.trim())).toEqual(['| BL-004 | feat | Short |']); // three cells in a typed lane: no row
      expect(t.currentSprint).toEqual([{ id: 'CS-001', type: 'bug', priority: 'P3', description: 'Lead', line: 14 }]);
      expect(t.review).toEqual([{ id: 'BL-005', type: null, priority: null, description: 'Plain Approved 2026-10-24', line: 20, approved: '2026-10-24', history: [] }]);
      expect(t.completed).toEqual([{ num: '1', id: '[CD-001]', description: 'Done', line: 26 }]);
      expect(t.headings.shapes).toEqual({ '## Backlog': 'typed', '## Current Sprint': 'typed', '## Review': 'plain' });
      expect(t.headings.columns['## Backlog']).toEqual(['ID', 'Type', 'Priority', 'Description']);
      expect(t.headings.columns['## Review']).toEqual(['ID', 'Description']);
      expect(t.headings.columnsFound).toEqual({});
    }
    // BL-120 by names for the three lanes: a four-column header that is not the typed one is read plain and reported with its names
    const status = readSpecs({ 'planning/tasks.md': '## Backlog\n\n| ID | Status | Priority | Description |\n|---|---|---|---|\n| BL-001 | open | high | One |\n' }).tasks!;
    expect(status.headings.shapes).toEqual({ '## Backlog': 'plain' });
    expect(status.headings.columnsFound).toEqual({ '## Backlog': { columns: 4, names: ['ID', 'Status', 'Priority', 'Description'], unread: 0 } });
    expect(status.backlog[0]).toMatchObject({ type: null, priority: null, description: 'open | high | One' });
    // Completed keeps BL-120's count rule: other names with the right count are not reported
    expect(readSpecs({ 'planning/tasks.md': '## Completed\n\n| # | Task | Text |\n|---|---|---|\n' }).tasks!.headings.columnsFound).toEqual({});
    const where = taskRowLines(md);
    expect([where.backlog!.shape, where.currentSprint!.shape, where.review!.shape, where.completed!.shape]).toEqual(['typed', 'typed', 'plain', null]);
  });

  it('the tasks.md the core renders has the tables the board reads, headers equal to TASK_COLUMNS (BL-118)', () => {
    // the core cannot import the reader (REQ-002.I.2), so the template's literal headers are pinned here
    const md = render({ projectName: 'p', language: 'typescript', author: 'jsmith', date: '2031-02-03' }).files.find(f => f.path === '.specs/planning/tasks.md')!.content;
    for (const heading of REQUIRED_TASK_HEADINGS) expect(md).toContain(`${heading}\n\n| ${TASK_COLUMNS[heading].join(' | ')} |\n|${TASK_COLUMNS[heading].map(() => '---').join('|')}|\n`);
    expect(md).not.toContain("## Won't do"); // optional: the template does not write it (BL-113)
    expect(md.indexOf('## Review')).toBeGreaterThan(md.indexOf('## Current Sprint'));
    expect(md.indexOf('## Review')).toBeLessThan(md.indexOf('## Completed'));
    const t = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(t.headings.missing).toEqual([]);
    expect(t.headings.unknown).toEqual([]);
    expect(t.headings.untabled).toEqual({});
    expect(t.backlog).toEqual([]);
    expect(t.currentSprint).toEqual([]);
    expect(t.review).toEqual([]);
    expect(t.wontDo).toEqual([]);
    expect(t.completed.map(r => [r.num, r.id, r.description])).toEqual([['1', '[CD-jsmith-001]', 'Initialise .specs directory (2031-02-03)']]);
    expect(t.malformed).toEqual([]);
  });

  it('only parses tasks for planning/tasks.md', () => {
    expect(readSpecs({ 'quality/tests.md': TASKS_MD }).tasks).toBeUndefined();
  });
});
