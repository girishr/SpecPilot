import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

  private buildTimestampedBlock(content: string): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `## Archived on ${now}\n\n${content.trimEnd()}\n\n---\n\n`;
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
    let entryStartIdx = allLines.findIndex(l => l.trim().startsWith('## Latest Entries'));
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

    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');

    const completedIdx = allLines.findIndex(l => l.trim() === '## Completed');
    if (completedIdx === -1) return null;

    // The Completed section ends at the next `## ` heading, not at EOF — anything
    // after it (e.g. `## Multi-Dev Notes`) is a separate section and must survive.
    let sectionEndIdx = allLines.findIndex((l, i) => i > completedIdx && /^## /.test(l.trim()));
    if (sectionEndIdx === -1) sectionEndIdx = allLines.length;
    const trailingLines = allLines.slice(sectionEndIdx);

    // Section size consistent with specValidator's check — measured to the section
    // end, not EOF, so trailing sections never inflate it.
    const sectionSize = sectionEndIdx - completedIdx;
    if (sectionSize <= COMPLETED_LINE_LIMIT) return null;

    // Skip past the ## Completed heading and any notes/blank lines to find numbered entries
    let entryStartIdx = completedIdx + 1;
    while (entryStartIdx < sectionEndIdx && !/^\d+\./.test(allLines[entryStartIdx])) {
      entryStartIdx++;
    }
    if (entryStartIdx >= sectionEndIdx) return null;

    const entryLines = allLines.slice(entryStartIdx, sectionEndIdx);
    if (entryLines.length <= COMPLETED_KEEP_ENTRIES) return null;

    const archiveEntries = entryLines.slice(0, entryLines.length - COMPLETED_KEEP_ENTRIES);
    const keepEntries = entryLines.slice(entryLines.length - COMPLETED_KEEP_ENTRIES);
    const linesMoved = archiveEntries.length;

    const archivePath = join(specsDir, 'planning', 'tasks-archive.md');
    const block = this.buildTimestampedBlock(archiveEntries.join('\n'));

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(
        filePath,
        [...allLines.slice(0, entryStartIdx), ...keepEntries, ...trailingLines].join('\n'),
      );
    }

    return {
      file: 'planning/tasks.md',
      archiveFile: 'planning/tasks-archive.md',
      linesMoved,
    };
  }
}
