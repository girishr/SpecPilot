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
  /** Backlog, Current Sprint and Review (BL-125): the Type and Priority cells as written, trimmed; null in a plain table. */
  type: string | null;
  priority: string | null;
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

/** A `## Review` row (BL-113): the cell verbatim, plus what its closing markers say. */
export interface ReviewRow extends TaskRow {
  /** The date of a closing ` Approved YYYY-MM-DD` marker, else null. */
  approved: string | null;
  /** Every ` Sent back YYYY-MM-DD: <note>` (or `.`) marker in order; `note` is '' for the dot form. */
  history: { date: string; note: string }[];
}

/** A `## Won't do` row (BL-113): three columns, as this repository writes them. */
export interface WontDoRow {
  id: string;
  description: string;
  reason: string;
  /** The row's 1-based line in tasks.md, as an editor shows it (BL-PM-008). */
  line: number;
}

export interface TasksData {
  backlog: TaskRow[];
  currentSprint: TaskRow[];
  review: ReviewRow[];
  completed: CompletedRow[];
  wontDo: WontDoRow[];
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

// Heading, column count (for the first three the plain shape's; their header picks the shape, BL-125), and (BL-113) whether the section is optional: `## Won't do` is read when present and
// never asked for; the other four are required (missing, the validator's warning, the `--fix` stub).
const TASK_SECTIONS = {
  backlog: ['## Backlog', 2, false],
  currentSprint: ['## Current Sprint', 2, false],
  review: ['## Review', 2, false],
  completed: ['## Completed', 3, false],
  wontDo: ["## Won't do", 3, true],
} as const;
export type TaskSection = keyof typeof TASK_SECTIONS;

/** The section headings the board, the task writer and `specpilot validate` know, in lane order (BL-112; five since BL-113). */
export const TASK_HEADINGS: string[] = Object.values(TASK_SECTIONS).map(([heading]) => heading);
/** The headings a tasks.md must have: what `missing` counts and the `--fix` stub writes (BL-113). */
export const REQUIRED_TASK_HEADINGS: string[] = Object.values(TASK_SECTIONS).filter(([, , optional]) => !optional).map(([heading]) => heading);

export interface TaskHeadings {
  /** Every `## ` heading of the file, trimmed, in file order. */
  found: string[];
  /** The REQUIRED_TASK_HEADINGS the file lacks: a heading is present when a line's trimmed text equals it, findSectionBounds()'s rule. */
  missing: string[];
  /** The found headings that are not TASK_HEADINGS; the rows under them are not served. */
  unknown: string[];
  /** Each missing heading → every heading line of any level carrying its name ignoring case, in file order (D10). */
  variants: Record<string, string[]>;
  /** Each unknown heading → the count of table rows under it. */
  unknownRows: Record<string, number>;
  /** Each known heading → its table's column names as its lane is read (BL-125: the typed four for a typed lane), else as it is written. */
  columns: Record<string, string[]>;
  /** Backlog, Current Sprint and Review present with a table → the shape its header names (BL-125). */
  shapes: Record<string, LaneShape>;
  /** Each known heading present without a table → the count of non-blank lines under it, `[TODO]` aside (BL-116). */
  untabled: Record<string, number>;
  /** Each known heading whose table header has another cell count than its lane reads → that count, the header's names and the section's
   *  malformed rows (BL-120); for Backlog, Current Sprint and Review, a header that names neither shape (BL-125). */
  columnsFound: Record<string, { columns: number; names: string[]; unread: number }>;
}

// BL-125: Backlog, Current Sprint and Review are read in one of two shapes, told apart by the header's names.
export type LaneShape = 'typed' | 'plain';
export const TYPED_COLUMNS = ['ID', 'Type', 'Priority', 'Description'];
export const PLAIN_COLUMNS = ['ID', 'Description'];
export const TASK_TYPES = ['feat', 'bug', 'chore'];
export const TASK_PRIORITIES = ['P1', 'P2', 'P3'];
/** The headings whose rows move between lanes, and so may carry Type and Priority. */
export const SHAPED_HEADINGS = ['## Backlog', '## Current Sprint', '## Review'];

/** Each known heading's column names as the template and the `--fix` stub write them (BL-116; the typed shape since BL-125). */
export const TASK_COLUMNS: Record<string, string[]> = {};
for (const [heading, cols] of Object.values(TASK_SECTIONS)) TASK_COLUMNS[heading] = heading === "## Won't do" ? ['ID', 'Description', 'Reason'] : cols === 3 ? ['#', 'ID', 'Description'] : TYPED_COLUMNS;

/** A section's table header: the `|` line straight above its first separator (BL-120's rule), its cells trimmed; null when there is none. */
function headerCells(lines: string[], b: SectionBounds): string[] | null {
  const { separator } = tableRows(lines, b, 1, []);
  const header = separator === null ? '' : lines[separator - 1].trim();
  if (separator === null || separator - 1 <= b.start || !header.startsWith('|')) return null;
  return header.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

const sameNames = (cells: string[], names: string[]) => cells.length === names.length && cells.every((c, i) => c.toLowerCase() === names[i].toLowerCase());

/** The columns a section is read with: for the three shaped lanes the typed four when the header names them, case ignored, else the plain two. */
function readColumns(lines: string[], heading: string, b: SectionBounds): string[] {
  if (!SHAPED_HEADINGS.includes(heading)) return TASK_COLUMNS[heading];
  const cells = headerCells(lines, b);
  return cells && sameNames(cells, TYPED_COLUMNS) ? TYPED_COLUMNS : PLAIN_COLUMNS;
}

/** tasks.md's headings as the page's messages and the validator's check report them (BL-112). */
export function taskHeadings(lines: string[]): TaskHeadings {
  const trimmed = lines.map(l => l.trim());
  const found = trimmed.filter(l => /^## /.test(l));
  const missing = REQUIRED_TASK_HEADINGS.filter(h => !found.includes(h));
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
  // BL-120: a table whose header row is wider or narrower than its lane is read at the lane's count, rows misplaced;
  // BL-125: for the shaped lanes, a header that names neither shape, read in the plain one
  const columnsFound: Record<string, { columns: number; names: string[]; unread: number }> = {};
  const columns: Record<string, string[]> = { ...TASK_COLUMNS };
  const shapes: Record<string, LaneShape> = {};
  for (const h of TASK_HEADINGS) {
    const b = findSectionBounds(trimmed, h);
    if (!b) continue;
    const names = headerCells(trimmed, b);
    if (!names) continue;
    const read = readColumns(trimmed, h, b);
    const unread: string[] = [];
    tableRows(trimmed, b, read.length, unread);
    if (SHAPED_HEADINGS.includes(h)) {
      columns[h] = read;
      shapes[h] = read === TYPED_COLUMNS ? 'typed' : 'plain';
      if (sameNames(names, read)) continue;
    } else if (names.length === read.length) continue;
    columnsFound[h] = { columns: names.length, names, unread: unread.length };
  }
  return { found, missing, unknown, variants, unknownRows, columns, shapes, untabled, columnsFound };
}

function parseTasks(lines: string[]): TasksData {
  const malformed: string[] = [];
  const rows = (heading: string): { cells: string[]; line: number }[] => {
    const b = findSectionBounds(lines, heading);
    return b ? tableRows(lines, b, readColumns(lines, heading, b).length, malformed).rows : [];
  };
  // BL-125: a typed row's cells are ID, Type, Priority, Description; a plain row has no Type or Priority
  const task = ({ cells, line }: { cells: string[]; line: number }): TaskRow =>
    cells.length === 4
      ? { id: cells[0], type: cells[1], priority: cells[2], description: cells[3], line: line + 1 }
      : { id: cells[0], type: null, priority: null, description: cells[1], line: line + 1 };
  return {
    backlog: rows('## Backlog').map(task),
    currentSprint: rows('## Current Sprint').map(task),
    review: rows('## Review').map(r => {
      const t = task(r);
      return { ...t, ...reviewMarks(t.description) };
    }),
    completed: rows('## Completed').map(({ cells: [num, id, description], line }) => ({ num, id, description, line: line + 1 })),
    wontDo: rows("## Won't do").map(({ cells: [id, description, reason], line }) => ({ id, description, reason, line: line + 1 })),
    malformed,
    headings: taskHeadings(lines),
  };
}

// ---- Review markers (BL-113, REQ-002.H.55): the page writes them at the end of a Review row's description cell,
// the reader parses them here, and the writer's undo checks use the same test, so the chip and the undo agree.

const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
/** A marker start: at the cell's start or after a space; `Approved <date>` ends the cell or precedes the next marker. */
const MARK = new RegExp(String.raw`(?:^| )(?:Approved (${DATE})(?= |$)|Sent back (${DATE})(?:\.(?= |$)|: ))`, 'g');

/** Whether `text` ends with ` Approved <date>` (any date, or the given `YYYY-MM-DD`), the writer's and the reader's one test. */
export function endsWithApproved(text: string, date?: string): boolean {
  return new RegExp(String.raw`(?:^| )Approved ${date ?? DATE}$`).test(text);
}

/** What a Review row's closing markers say: the chip's date and the History list. */
export function reviewMarks(description: string): { approved: string | null; history: { date: string; note: string }[] } {
  const marks: { index: number; end: number; approvedOn: string | null; sentOn: string | null; dot: boolean }[] = [];
  for (const m of description.matchAll(MARK)) marks.push({ index: m.index!, end: m.index! + m[0].length, approvedOn: m[1] ?? null, sentOn: m[2] ?? null, dot: m[0].endsWith('.') });
  const history = marks.flatMap((k, i) => {
    if (k.sentOn === null) return [];
    const note = k.dot ? '' : description.slice(k.end, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    return [{ date: k.sentOn, note }];
  });
  return { approved: endsWithApproved(description) ? marks[marks.length - 1].approvedOn : null, history };
}

export interface TaskRowLines {
  /** Each parsed row's ID cell and its index in `content.split('\n')`, in file order. */
  rows: { id: string; line: number }[];
  /** Index of the table's separator row (`|---|---|`), or null when the section has no table. */
  separator: number | null;
  /** Backlog, Current Sprint and Review with a table: the shape they are read in (BL-125); otherwise null. */
  shape: LaneShape | null;
}

/**
 * Where tasks.md's rows sit, for writers that move whole lines (BL-053): the same walk as
 * readSpecs(), reporting line indices instead of cells. Sections that are absent are null.
 */
export function taskRowLines(content: string): Record<TaskSection, TaskRowLines | null> {
  const lines = content.split('\n');
  const out = {} as Record<TaskSection, TaskRowLines | null>;
  for (const [key, [heading]] of Object.entries(TASK_SECTIONS) as [TaskSection, readonly [string, number, boolean]][]) {
    const b = findSectionBounds(lines, heading);
    if (!b) {
      out[key] = null;
      continue;
    }
    const cols = readColumns(lines, heading, b);
    const t = tableRows(lines, b, cols.length, []);
    const shape = SHAPED_HEADINGS.includes(heading) && t.separator !== null ? (cols === TYPED_COLUMNS ? 'typed' : 'plain') : null;
    out[key] = { rows: t.rows.map(r => ({ id: key === 'completed' ? r.cells[1] : r.cells[0], line: r.line })), separator: t.separator, shape };
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
