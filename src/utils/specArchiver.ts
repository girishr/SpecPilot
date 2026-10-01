import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { findSectionBounds } from './markdownSections';

export interface ArchiveEntry {
  file: string;
  archiveFile: string;
  linesMoved: number;
}

export interface ArchiveResult {
  entries: ArchiveEntry[];
  /** Files over their limit that archive would not touch, and why (BL-061). */
  refused: { file: string; reason: string }[];
  dryRun: boolean;
}

const SPECS_DIR_CANDIDATES = ['.specs', '.project-spec', 'specs', 'specifications'];

export const PROMPTS_LINE_LIMIT = 100;
/** Trim prompts.md to this many total lines after archiving. */
export const PROMPTS_KEEP_LINES = 80;

// ---- prompts.md (BL-061): move whole entries, always the oldest, in whichever order the log runs.

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
// Longest names first so "September" beats "Sept" beats "Sep"; an abbreviation may end in a dot.
const MONTH_NAMES = 'January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const DATE_RE = new RegExp(`\\b(${MONTH_NAMES})\\.? (\\d{1,2}), (\\d{4})\\b|\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, 'g');

/** The last calendar date in the text as yyyymmdd, or null. No Date objects: no time zone can shift a day. */
export function lastDate(text: string): number | null {
  let key: number | null = null;
  for (const m of text.matchAll(DATE_RE)) {
    const [y, mo, d] = m[1] ? [+m[3], MONTHS[m[1].toLowerCase()], +m[2]] : [+m[4], +m[5], +m[6]];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) key = y * 10000 + mo * 100 + d;
  }
  return key;
}

interface LogEntry {
  start: number; // first line index
  end: number; // one past the last line
  date: number | null;
}

/** The log's entries: list items under "## Latest Entries", else rows under "## Prompt History". */
function findLog(lines: string[]): { entries: LogEntry[]; tableHeader: string[] } | null {
  const list = findSectionBounds(lines, '## Latest Entries', true);
  if (list) {
    const entries: LogEntry[] = [];
    let cur: LogEntry | null = null;
    for (let i = list.start + 1; i < list.end; i++) {
      if (/^[-*+] /.test(lines[i])) entries.push((cur = { start: i, end: i + 1, date: null }));
      else if (cur && /^\s+\S/.test(lines[i])) cur.end = i + 1; // indented continuation of the item
      else cur = null;
    }
    entries.forEach(e => (e.date = lastDate(lines.slice(e.start, e.end).join('\n'))));
    return { entries, tableHeader: [] };
  }
  const table = findSectionBounds(lines, '## Prompt History', true);
  if (!table) return null;
  const header = lines.findIndex((l, i) => i > table.start && i < table.end - 1 && l.trim().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1].trim()));
  if (header === -1) return { entries: [], tableHeader: [] };
  const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const dateCol = cells(lines[header]).findIndex(c => c.toLowerCase() === 'date');
  const entries: LogEntry[] = [];
  for (let i = header + 2; i < table.end && lines[i].trim().startsWith('|'); i++) {
    entries.push({ start: i, end: i + 1, date: lastDate(dateCol >= 0 ? cells(lines[i])[dateCol] ?? '' : lines[i]) });
  }
  return { entries, tableHeader: [lines[header], lines[header + 1]] };
}

export type PromptsArchivePlan = { start: number; end: number; tableHeader: string[] } | { refuse: string } | null;

const excerpt = (line: string) => {
  const t = line.trim();
  return `"${t.length > 60 ? t.slice(0, 60) + '…' : t}"`;
};
const iso = (key: number) => `${Math.floor(key / 10000)}-${String(Math.floor(key / 100) % 100).padStart(2, '0')}-${String(key % 100).padStart(2, '0')}`;

/**
 * Decide what \`specpilot archive\` moves out of prompts.md: the contiguous block of oldest entries
 * that brings the file within PROMPTS_KEEP_LINES, a refusal with a plain reason, or null.
 * The validator reports exactly this, so "validate warns" and "archive acts" cannot disagree.
 */
export function planPromptsArchive(lines: string[]): PromptsArchivePlan {
  if (lines.length <= PROMPTS_LINE_LIMIT) return null;
  const log = findLog(lines);
  if (!log) {
    return { refuse: 'development/prompts.md has no "## Latest Entries" list or "## Prompt History" table, so there is nothing SpecPilot can archive safely.' };
  }
  const { entries } = log;
  if (entries.length < 2) return null; // at least one entry always stays: nothing movable

  // Order from the entries' own dates: every step between dated entries must go the same way.
  let dir = 0; // -1: newest first, +1: oldest first
  let prevStart = -1;
  let prevDate = 0;
  for (const e of entries) {
    if (e.date === null) continue;
    if (prevStart >= 0 && e.date !== prevDate) {
      const step = e.date > prevDate ? 1 : -1;
      if (!dir) dir = step;
      else if (step !== dir) {
        return {
          refuse: `SpecPilot cannot tell which development/prompts.md entries are oldest, because their dates run both ways: ${excerpt(lines[prevStart])} (${iso(prevDate)}) comes right before ${excerpt(lines[e.start])} (${iso(e.date)}) in a log that otherwise runs ${dir < 0 ? 'newest first' : 'oldest first'}. Put those entries in order and run it again.`,
        };
      }
    }
    prevStart = e.start;
    prevDate = e.date;
  }
  if (!dir) return { refuse: 'SpecPilot cannot tell which development/prompts.md entries are oldest: fewer than two entries carry different dates.' };

  // Move oldest entries, one at a time, until the file is within PROMPTS_KEEP_LINES; keep at least one.
  const n = entries.length;
  let start = 0;
  let end = 0;
  for (let k = 1; k < n; k++) {
    [start, end] = dir < 0 ? [entries[n - k].start, entries[n - 1].end] : [entries[0].start, entries[k - 1].end];
    if (lines.length - (end - start) <= PROMPTS_KEEP_LINES) break;
  }
  return { start, end, tableHeader: log.tableHeader };
}

/** Archive tasks.md Completed section when it exceeds this many lines. */
export const COMPLETED_LINE_LIMIT = 40;
/** How many Completed entries to retain in the active file. */
export const COMPLETED_KEEP_ENTRIES = 20;

export interface CompletedArchivePlan {
  /** Line indices [start, end) moved out of tasks.md. */
  start: number;
  end: number;
  /** Table header + separator, repeated above the moved rows in the archive; empty for lists. */
  tableHeader: string[];
}

const TABLE_SEPARATOR = /^\|[\s:|-]+$/;

/**
 * Decide what `specpilot archive` moves out of tasks.md's `## Completed` section, or null
 * if nothing. The validator warns exactly when this returns non-null, so "validate warns"
 * and "archive acts" can never disagree.
 */
export function planCompletedArchive(lines: string[]): CompletedArchivePlan | null {
  // The Completed section ends at the next `## ` heading, not at EOF — anything
  // after it (e.g. `## Multi-Dev Notes`) is a separate section and must survive.
  const bounds = findSectionBounds(lines, '## Completed');
  if (!bounds) return null;
  const { start, end } = bounds;
  const sectionSize = end - start;
  if (sectionSize <= COMPLETED_LINE_LIMIT) return null;

  // List shape: skip past the heading and any notes/blank lines to the first numbered entry,
  // then keep the last COMPLETED_KEEP_ENTRIES lines (oldest entries are at the top).
  let entryStart = start + 1;
  while (entryStart < end && !/^\d+\./.test(lines[entryStart])) entryStart++;
  if (entryStart < end) {
    const entryCount = end - entryStart;
    if (entryCount <= COMPLETED_KEEP_ENTRIES) return null;
    return { start: entryStart, end: entryStart + entryCount - COMPLETED_KEEP_ENTRIES, tableHeader: [] };
  }

  // Table shape: entries are the body rows under the header + separator, oldest first.
  // Keep only as many rows as fit the line limit, so the section passes validation afterwards.
  const header = lines.findIndex(
    (l, i) => i > start && i < end - 1 && l.trim().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1].trim()),
  );
  if (header === -1) return null;
  const bodyStart = header + 2;
  let bodyEnd = bodyStart;
  while (bodyEnd < end && lines[bodyEnd].trim().startsWith('|')) bodyEnd++;
  const rows = bodyEnd - bodyStart;
  const keep = Math.min(COMPLETED_KEEP_ENTRIES, Math.max(0, COMPLETED_LINE_LIMIT - (sectionSize - rows)));
  if (rows <= keep) return null;
  return { start: bodyStart, end: bodyStart + rows - keep, tableHeader: [lines[header], lines[header + 1]] };
}

export class SpecArchiver {
  private findSpecsDir(projectDir: string): string | null {
    for (const name of SPECS_DIR_CANDIDATES) {
      const p = join(projectDir, name);
      if (existsSync(p)) return p;
    }
    return null;
  }

  async archive(projectDir: string, options: { dryRun: boolean }): Promise<ArchiveResult> {
    const specsDir = this.findSpecsDir(projectDir);
    if (!specsDir) {
      throw new Error('No .specs directory found. Run `specpilot init` first.');
    }

    const result: ArchiveResult = { entries: [], refused: [], dryRun: options.dryRun };

    const promptsEntry = this.archivePrompts(specsDir, options.dryRun, result.refused);
    if (promptsEntry) result.entries.push(promptsEntry);

    const tasksEntry = this.archiveTasks(specsDir, options.dryRun);
    if (tasksEntry) result.entries.push(tasksEntry);

    return result;
  }

  private buildTimestampedBlock(content: string, trim = true): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `## Archived on ${now}\n\n${trim ? content.trimEnd() : content}\n\n---\n\n`;
  }

  private archivePrompts(specsDir: string, dryRun: boolean, refused: ArchiveResult['refused']): ArchiveEntry | null {
    const filePath = join(specsDir, 'development', 'prompts.md');
    if (!existsSync(filePath)) return null;

    const allLines = readFileSync(filePath, 'utf-8').split('\n');
    const plan = planPromptsArchive(allLines);
    if (!plan) return null;
    if ('refuse' in plan) {
      refused.push({ file: 'development/prompts.md', reason: plan.refuse });
      return null;
    }

    const moved = allLines.slice(plan.start, plan.end);
    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    // Entries move byte for byte; a table block repeats its header and separator.
    const block = this.buildTimestampedBlock([...plan.tableHeader, ...moved].join('\n'), false);

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(filePath, [...allLines.slice(0, plan.start), ...allLines.slice(plan.end)].join('\n'));
    }

    return {
      file: 'development/prompts.md',
      archiveFile: 'development/prompts-archive.md',
      linesMoved: moved.length,
    };
  }

  private archiveTasks(specsDir: string, dryRun: boolean): ArchiveEntry | null {
    const filePath = join(specsDir, 'planning', 'tasks.md');
    if (!existsSync(filePath)) return null;

    const allLines = readFileSync(filePath, 'utf-8').split('\n');
    const plan = planCompletedArchive(allLines);
    if (!plan) return null;

    const moved = allLines.slice(plan.start, plan.end);
    const linesMoved = moved.length;

    const archivePath = join(specsDir, 'planning', 'tasks-archive.md');
    // Table rows move byte for byte, so the table block is not trimmed.
    const block = plan.tableHeader.length
      ? this.buildTimestampedBlock([...plan.tableHeader, ...moved].join('\n'), false)
      : this.buildTimestampedBlock(moved.join('\n'));

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(filePath, [...allLines.slice(0, plan.start), ...allLines.slice(plan.end)].join('\n'));
    }

    return {
      file: 'planning/tasks.md',
      archiveFile: 'planning/tasks-archive.md',
      linesMoved,
    };
  }
}
