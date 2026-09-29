import { findSectionBounds, SectionBounds } from './markdownSections';

// Pure and fs-free by design: takes file contents, never paths, and must not import
// `fs` or `path`, so it can move into @specpilot/spec-core (BL-032) unchanged.

export interface SpecMeta {
  fileID?: string;
  version?: string;
  lastUpdated?: string;
  contributors?: string[];
  relatedFiles?: string[];
}

export interface TaskRow {
  id: string;
  description: string;
}

export interface CompletedRow {
  num: string;
  id: string;
  description: string;
}

export interface TasksData {
  backlog: TaskRow[];
  currentSprint: TaskRow[];
  completed: CompletedRow[];
  /** Table rows with fewer cells than their section's columns, verbatim. */
  malformed: string[];
}

export interface SpecsData {
  files: Record<string, SpecMeta>;
  tasks?: TasksData;
}

const SCALAR_KEYS = ['fileID', 'version', 'lastUpdated'] as const;
const LIST_KEYS = ['contributors', 'relatedFiles'] as const;

/** Parse `.specs/`-relative path → contents into per-file metadata and tasks.md rows. */
export function readSpecs(files: Record<string, string>): SpecsData {
  const result: SpecsData = { files: {} };
  for (const [path, content] of Object.entries(files)) {
    const lines = content.split('\n');
    result.files[path] = parseMeta(/\.ya?ml$/.test(path) ? yamlCommentLines(lines) : frontMatterLines(lines));
    if (path === 'planning/tasks.md') result.tasks = parseTasks(lines);
  }
  return result;
}

function frontMatterLines(lines: string[]): string[] {
  if (lines[0]?.trim() !== '---') return [];
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return close === -1 ? [] : lines.slice(1, close);
}

function yamlCommentLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (!l.trim().startsWith('#')) break;
    out.push(l.trim().replace(/^#\s?/, ''));
  }
  return out;
}

function unquote(v: string): string {
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

// Hand-parsed rather than js-yaml: real front matter such as
// `lastUpdated: 2026-09-05 (BL-049 cross-ref: …)` makes js-yaml throw, and its
// default schema would coerce dates and versions (`5.10` → 5.1).
function parseMeta(lines: string[]): SpecMeta {
  const meta: SpecMeta = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\w+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.trim();
    if ((SCALAR_KEYS as readonly string[]).includes(key)) {
      meta[key as (typeof SCALAR_KEYS)[number]] = unquote(value);
    } else if ((LIST_KEYS as readonly string[]).includes(key)) {
      let text = value;
      if (text === '' && lines[i + 1]?.trim().startsWith('[')) text = lines[++i].trim();
      let items: string[];
      if (text === '') {
        // Block list: `contributors:\n  - a`
        items = [];
        while (lines[i + 1]?.trim().startsWith('- ')) items.push(lines[++i].trim().slice(2));
      } else if (text.startsWith('[')) {
        // Flow list, possibly spread over lines: `relatedFiles:\n  [\n    a,\n    b,\n  ]`
        while (!text.includes(']') && i + 1 < lines.length) text += ' ' + lines[++i].trim();
        const close = text.indexOf(']');
        items = text.slice(1, close === -1 ? undefined : close).split(',');
      } else {
        items = [text];
      }
      meta[key as (typeof LIST_KEYS)[number]] = items.map(s => unquote(s.trim())).filter(Boolean);
    }
  }
  return meta;
}

const TASK_SECTIONS = { backlog: ['## Backlog', 2], currentSprint: ['## Current Sprint', 2], completed: ['## Completed', 3] } as const;
type TaskSection = keyof typeof TASK_SECTIONS;

function parseTasks(lines: string[]): TasksData {
  const malformed: string[] = [];
  const rows = (heading: string, cols: number): string[][] => {
    const b = findSectionBounds(lines, heading);
    return b ? tableRows(lines, b, cols, malformed).rows.map(r => r.cells) : [];
  };
  return {
    backlog: rows('## Backlog', 2).map(([id, description]) => ({ id, description })),
    currentSprint: rows('## Current Sprint', 2).map(([id, description]) => ({ id, description })),
    completed: rows('## Completed', 3).map(([num, id, description]) => ({ num, id, description })),
    malformed,
  };
}

export interface TaskRowLines {
  /** Each parsed row's ID cell and its index in `content.split('\n')`, in file order. */
  rows: { id: string; line: number }[];
  /** Index of the table's separator row (`|---|---|`), or null when the section has no table. */
  separator: number | null;
}

/**
 * Where tasks.md's rows sit, for writers that move whole lines (BL-053): the same walk as
 * readSpecs(), reporting line indices instead of cells. Sections that are absent are null.
 */
export function taskRowLines(content: string): Record<TaskSection, TaskRowLines | null> {
  const lines = content.split('\n');
  const out = {} as Record<TaskSection, TaskRowLines | null>;
  for (const [key, [heading, cols]] of Object.entries(TASK_SECTIONS) as [TaskSection, readonly [string, number]][]) {
    const b = findSectionBounds(lines, heading);
    if (!b) {
      out[key] = null;
      continue;
    }
    const t = tableRows(lines, b, cols, []);
    out[key] = { rows: t.rows.map(r => ({ id: cols === 3 ? r.cells[1] : r.cells[0], line: r.line })), separator: t.separator };
  }
  return out;
}

const SEPARATOR = /^\|[\s:|-]+$/;

// Splits on the first `cols - 1` pipes only; the last cell takes the rest of the row,
// because descriptions contain literal `|` inside backticks (e.g. `'rest' | 'cli'`).
function tableRows(
  lines: string[],
  { start, end }: SectionBounds,
  cols: number,
  malformed: string[],
): { rows: { cells: string[]; line: number }[]; separator: number | null } {
  const out: { cells: string[]; line: number }[] = [];
  let separator: number | null = null;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i].trim();
    if (SEPARATOR.test(line) && separator === null) separator = i;
    if (!line.startsWith('|') || SEPARATOR.test(line)) continue;
    if (SEPARATOR.test(lines[i + 1]?.trim() ?? '')) continue; // header row
    let rest = line.slice(1);
    if (rest.endsWith('|')) rest = rest.slice(0, -1);
    const cells: string[] = [];
    for (let c = 0; c < cols - 1; c++) {
      const p = rest.indexOf('|');
      if (p === -1) break;
      cells.push(rest.slice(0, p).trim());
      rest = rest.slice(p + 1);
    }
    if (cells.length < cols - 1) {
      malformed.push(lines[i]);
      continue;
    }
    cells.push(rest.trim());
    out.push({ cells, line: i });
  }
  return { rows: out, separator };
}
