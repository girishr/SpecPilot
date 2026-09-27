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
  dryRun: boolean;
}

const SPECS_DIR_CANDIDATES = ['.specs', '.project-spec', 'specs', 'specifications'];

/** Trim prompts.md to this many total lines after archiving. */
const PROMPTS_LINE_LIMIT = 100;
const PROMPTS_KEEP_LINES = 80;

/** Archive tasks.md Completed section when it exceeds this many lines. */
const COMPLETED_LINE_LIMIT = 25;
/** How many Completed entries to retain in the active file. */
const COMPLETED_KEEP_ENTRIES = 20;

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

    const result: ArchiveResult = { entries: [], dryRun: options.dryRun };

    const promptsEntry = this.archivePrompts(specsDir, options.dryRun);
    if (promptsEntry) result.entries.push(promptsEntry);

    const tasksEntry = this.archiveTasks(specsDir, options.dryRun);
    if (tasksEntry) result.entries.push(tasksEntry);

    return result;
  }

  private buildTimestampedBlock(content: string, trim = true): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `## Archived on ${now}\n\n${trim ? content.trimEnd() : content}\n\n---\n\n`;
  }

  private archivePrompts(specsDir: string, dryRun: boolean): ArchiveEntry | null {
    const filePath = join(specsDir, 'development', 'prompts.md');
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    if (allLines.length <= PROMPTS_LINE_LIMIT) return null;

    // Anchor on the "## Latest Entries" heading (falls back to front matter close,
    // then start of file) so boilerplate sections — Re-Anchor Prompt, etc. — are
    // never mistaken for archivable log content.
    let entryStartIdx = findSectionBounds(allLines, '## Latest Entries', true)?.start ?? -1;
    if (entryStartIdx === -1) {
      entryStartIdx = allLines[0]?.trim() === '---' ? allLines.findIndex((l, i) => i > 0 && l.trim() === '---') : -1;
    }
    entryStartIdx = entryStartIdx === -1 ? 0 : entryStartIdx + 1;

    const preambleLines = allLines.slice(0, entryStartIdx);
    const entryLines = allLines.slice(entryStartIdx);

    const keepBodyCount = Math.max(50, PROMPTS_KEEP_LINES - preambleLines.length);
    if (entryLines.length <= keepBodyCount) return null;

    const archiveLines = entryLines.slice(0, entryLines.length - keepBodyCount);
    const keepLines = entryLines.slice(entryLines.length - keepBodyCount);
    const linesMoved = archiveLines.length;

    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    const block = this.buildTimestampedBlock(archiveLines.join('\n'));

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(filePath, [...preambleLines, ...keepLines].join('\n'));
    }

    return {
      file: 'development/prompts.md',
      archiveFile: 'development/prompts-archive.md',
      linesMoved,
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
