import { readSpecs, TASK_COLUMNS, taskHeadings } from '../utils/specReader';

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
  '## Completed',
  '',
  '> CD-001 through CD-039 have been archived to [tasks-archive.md](tasks-archive.md).',
  '',
  '| # | ID | Description |',
  '|---|---|---|',
  ...COMPLETED_ROWS,
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
      { id: 'CS-078', description: 'Force AI to write tests for every feature — two-part enforcement, not text-only', line: 22 },
    ]);
    expect(tasks.completed[0]).toEqual({
      num: '95',
      id: '[CD-girishr-013] [CS-070] [BL-036]',
      description: "Conditional `api.yaml` — `apiParadigm: 'rest' | 'cli' | 'graphql' | 'none'` added",
      line: 32,
    });
    expect(tasks.malformed).toEqual([]);
  });

  it('gives every row its 1-based line in the file, front matter counted, the same with CRLF (BL-PM-008)', () => {
    const lines = (md: string) => {
      const t = readSpecs({ 'planning/tasks.md': md }).tasks!;
      return [t.backlog, t.currentSprint, t.completed].map(rows => rows.map(r => r.line));
    };
    expect(lines(TASKS_MD)).toEqual([[15, 16], [22], [32, 33]]);
    expect(lines(TASKS_MD.replace(/\n/g, '\r\n'))).toEqual([[15, 16], [22], [32, 33]]);
    const all = TASKS_MD.split('\n');
    const t = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    for (const r of [...t.backlog, ...t.currentSprint, ...t.completed]) expect(all[r.line - 1]).toContain(`| ${r.id} |`); // the line holds that row
  });

  it('keeps the lines right after a header row and after a malformed row (BL-PM-008)', () => {
    const md = ['## Backlog', '| ID | Description |', '|---|---|', '| BL-001 | One |', '| broken', '| BL-002 | Two |', '## Current Sprint', '| ID | Description |', '|---|---|'].join('\n');
    const t = readSpecs({ 'planning/tasks.md': md }).tasks!;
    expect(t.backlog).toEqual([{ id: 'BL-001', description: 'One', line: 4 }, { id: 'BL-002', description: 'Two', line: 6 }]);
    expect(t.malformed).toEqual(['| broken']);
  });

  it('round-trips every cell byte for byte', () => {
    const tasks = readSpecs({ 'planning/tasks.md': TASKS_MD }).tasks!;
    expect([...tasks.backlog, ...tasks.currentSprint].map(r => `| ${r.id} | ${r.description} |`)).toEqual([
      ...BACKLOG_ROWS,
      ...SPRINT_ROWS,
    ]);
    expect(tasks.completed.map(r => `| ${r.num} | ${r.id} | ${r.description} |`)).toEqual(COMPLETED_ROWS);
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
    expect(tasks.backlog).toEqual([{ id: 'BL-001', description: 'Later', line: 8 }]);
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
    const columns = { '## Backlog': ['ID', 'Description'], '## Current Sprint': ['ID', 'Description'], '## Completed': ['#', 'ID', 'Description'] };
    const all = { found: ['## Backlog', '## Current Sprint', '## Completed', '## Multi-Dev Notes'], missing: [], unknown: ['## Multi-Dev Notes'], variants: {}, unknownRows: { '## Multi-Dev Notes': 1 }, columns, untabled: {} };
    expect(h(TASKS_MD)).toEqual(all);
    expect(h(TASKS_MD.replace(/\n/g, '\r\n'))).toEqual(all);
    expect(taskHeadings(TASKS_MD.split('\n'))).toEqual(all);
    expect(h(TASKS_MD.replace('## Backlog', '### Backlog'))).toEqual({ ...all, found: ['## Current Sprint', '## Completed', '## Multi-Dev Notes'], missing: ['## Backlog'], variants: { '## Backlog': ['### Backlog'] } });
    expect(h(TASKS_MD.replace('## Backlog', '## backlog'))).toEqual({ ...all, found: ['## backlog', '## Current Sprint', '## Completed', '## Multi-Dev Notes'], missing: ['## Backlog'], unknown: ['## backlog', '## Multi-Dev Notes'], variants: { '## Backlog': ['## backlog'] }, unknownRows: { '## backlog': 2, '## Multi-Dev Notes': 1 } });
    expect(h(TASKS_MD.replace('## Backlog', '## backlog\n\n### Backlog')).variants).toEqual({ '## Backlog': ['## backlog', '### Backlog'] }); // two candidates, in file order
    expect(h(TASKS_MD + '## Later\n\nNothing tabled yet.\n').unknownRows).toEqual({ '## Multi-Dev Notes': 1, '## Later': 0 });
    expect(h('# Tasks\n\n- one\n')).toEqual({ found: [], missing: ['## Backlog', '## Current Sprint', '## Completed'], unknown: [], variants: { '## Backlog': [], '## Current Sprint': [], '## Completed': [] }, unknownRows: {}, columns, untabled: {} });
  });

  it('counts the lines of a known section that has no table, [TODO] aside, and names the columns a table needs (BL-116)', () => {
    const u = (md: string) => readSpecs({ 'planning/tasks.md': md }).tasks!.headings.untabled;
    expect(u(TASKS_MD)).toEqual({}); // every section has a table
    const nine = Array.from({ length: 9 }, (_, i) => `[BL-00${i + 1}-handle] Task ${i + 1}`).join('\n');
    const lines = `## Backlog\n\n${nine}\n\n## Current Sprint\n\n[TODO]\n\n## Completed\n\n1. [CD-001] Initialise .specs directory (2026-10-20)\n`;
    expect(u(lines)).toEqual({ '## Backlog': 9, '## Completed': 1 }); // the init template's own list shape counts; its [TODO] placeholder does not
    expect(u(lines.replace(/\n/g, '\r\n'))).toEqual({ '## Backlog': 9, '## Completed': 1 });
    expect(u('## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | One |\n\nA note beside the table.\n')).toEqual({}); // a table: prose beside it is ignored, as today
    expect(u('## Backlog\n\n| ID | Description |\n')).toEqual({ '## Backlog': 1 }); // a header row with no separator is not a table
    expect(u('## Backlog\n\n\n\n## Completed\n')).toEqual({});
    expect(TASK_COLUMNS).toEqual({ '## Backlog': ['ID', 'Description'], '## Current Sprint': ['ID', 'Description'], '## Completed': ['#', 'ID', 'Description'] });
  });

  it('only parses tasks for planning/tasks.md', () => {
    expect(readSpecs({ 'quality/tests.md': TASKS_MD }).tasks).toBeUndefined();
  });
});
