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
  /** The row's 1-based line in tasks.md, as an editor shows it (BL-PM-008). */
  line: number;
}

export interface CompletedRow {
  num: string;
  id: string;
  description: string;
  /** The row's 1-based line in tasks.md, as an editor shows it (BL-PM-008). */
  line: number;
}

export interface TasksData {
  backlog: TaskRow[];
  currentSprint: TaskRow[];
  completed: CompletedRow[];
  /** Table rows with fewer cells than their section's columns, verbatim. */
  malformed: string[];
  /** The file's `## ` headings, the known ones it lacks and the found ones the board does not know (BL-112). */
  headings: TaskHeadings;
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

/** The section headings the board, the task writer and `specpilot validate` know, in lane order (BL-112). */
export const TASK_HEADINGS: string[] = Object.values(TASK_SECTIONS).map(([heading]) => heading);

export interface TaskHeadings {
  /** Every `## ` heading of the file, trimmed, in file order. */
  found: string[];
  /** The TASK_HEADINGS the file lacks: a heading is present when a line's trimmed text equals it, findSectionBounds()'s rule. */
  missing: string[];
  /** The found headings that are not TASK_HEADINGS; the rows under them are not served. */
  unknown: string[];
  /** Each missing heading → every heading line of any level carrying its name ignoring case, in file order (D10). */
  variants: Record<string, string[]>;
  /** Each unknown heading → the count of table rows under it. */
  unknownRows: Record<string, number>;
  /** Each known heading → its table's column names, by the count its lane is read with. */
  columns: Record<string, string[]>;
  /** Each known heading present without a table → the count of non-blank lines under it, `[TODO]` aside (BL-116). */
  untabled: Record<string, number>;
}

const COLUMN_NAMES: Record<number, string[]> = { 2: ['ID', 'Description'], 3: ['#', 'ID', 'Description'] };

/** Each known heading's column names, by the count its lane is read with (BL-116): what `columns` reports and the `--fix` stub writes. */
export const TASK_COLUMNS: Record<string, string[]> = {};
for (const [heading, cols] of Object.values(TASK_SECTIONS)) TASK_COLUMNS[heading] = COLUMN_NAMES[cols];

/** tasks.md's headings as the page's messages and the validator's check report them (BL-112). */
export function taskHeadings(lines: string[]): TaskHeadings {
  const trimmed = lines.map(l => l.trim());
  const found = trimmed.filter(l => /^## /.test(l));
  const missing = TASK_HEADINGS.filter(h => !found.includes(h));
  const variants: Record<string, string[]> = {};
  for (const h of missing) {
    const name = h.slice(3).toLowerCase();
    variants[h] = trimmed.filter(l => /^#{1,6}\s+/.test(l) && l.replace(/^#+\s+/, '').toLowerCase() === name);
  }
  const unknown = found.filter(h => !TASK_HEADINGS.includes(h));
  const unknownRows: Record<string, number> = {};
  for (const h of unknown) {
    const b = findSectionBounds(trimmed, h);
    unknownRows[h] = b ? tableRows(trimmed, b, 1, []).rows.length : 0; // one column: every `|` line but the header and separator
  }
  // BL-116: a known section with lines but no separator row holds tasks the board cannot read
  const untabled: Record<string, number> = {};
  for (const h of TASK_HEADINGS) {
    const b = findSectionBounds(trimmed, h);
    if (!b || tableRows(trimmed, b, 1, []).separator !== null) continue;
    const n = trimmed.slice(b.start + 1, b.end).filter(l => l && l !== '[TODO]').length;
    if (n) untabled[h] = n;
  }
  return { found, missing, unknown, variants, unknownRows, columns: { ...TASK_COLUMNS }, untabled };
}

function parseTasks(lines: string[]): TasksData {
  const malformed: string[] = [];
  const rows = (heading: string, cols: number): { cells: string[]; line: number }[] => {
    const b = findSectionBounds(lines, heading);
    return b ? tableRows(lines, b, cols, malformed).rows : [];
  };
  return {
    backlog: rows('## Backlog', 2).map(({ cells: [id, description], line }) => ({ id, description, line: line + 1 })),
    currentSprint: rows('## Current Sprint', 2).map(({ cells: [id, description], line }) => ({ id, description, line: line + 1 })),
    completed: rows('## Completed', 3).map(({ cells: [num, id, description], line }) => ({ num, id, description, line: line + 1 })),
    malformed,
    headings: taskHeadings(lines),
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
