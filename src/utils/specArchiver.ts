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

  private extractFrontMatter(lines: string[]): { preamble: string[]; body: string[] } {
    if (lines[0]?.trim() !== '---') {
      return { preamble: [], body: lines };
    }
    const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (closeIdx === -1) {
      return { preamble: [], body: lines };
    }
    return {
      preamble: lines.slice(0, closeIdx + 1),
      body: lines.slice(closeIdx + 1),
    };
  }

  private archivePrompts(specsDir: string, dryRun: boolean): ArchiveEntry | null {
    const filePath = join(specsDir, 'development', 'prompts.md');
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    if (allLines.length <= PROMPTS_LINE_LIMIT) return null;

    const { preamble, body } = this.extractFrontMatter(allLines);
    // Determine how many body lines to retain so total stays near PROMPTS_KEEP_LINES
    const keepBodyCount = Math.max(50, PROMPTS_KEEP_LINES - preamble.length);
    if (body.length <= keepBodyCount) return null;

    const archiveLines = body.slice(0, body.length - keepBodyCount);
    const keepLines = body.slice(body.length - keepBodyCount);
    const linesMoved = archiveLines.length;

    const archivePath = join(specsDir, 'development', 'prompts-archive.md');
    const block = this.buildTimestampedBlock(archiveLines.join('\n'));

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(filePath, [...preamble, ...keepLines].join('\n'));
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

    // Section size consistent with specValidator's check
    const sectionSize = allLines.length - completedIdx;
    if (sectionSize <= COMPLETED_LINE_LIMIT) return null;

    // Skip past the ## Completed heading and any notes/blank lines to find numbered entries
    let entryStartIdx = completedIdx + 1;
    while (entryStartIdx < allLines.length && !/^\d+\./.test(allLines[entryStartIdx])) {
      entryStartIdx++;
    }
    if (entryStartIdx >= allLines.length) return null;

    const entryLines = allLines.slice(entryStartIdx);
    if (entryLines.length <= COMPLETED_KEEP_ENTRIES) return null;

    const archiveEntries = entryLines.slice(0, entryLines.length - COMPLETED_KEEP_ENTRIES);
    const keepEntries = entryLines.slice(entryLines.length - COMPLETED_KEEP_ENTRIES);
    const linesMoved = archiveEntries.length;

    const archivePath = join(specsDir, 'planning', 'tasks-archive.md');
    const block = this.buildTimestampedBlock(archiveEntries.join('\n'));

    if (!dryRun) {
      const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';
      writeFileSync(archivePath, existing + block);
      writeFileSync(filePath, [...allLines.slice(0, entryStartIdx), ...keepEntries].join('\n'));
    }

    return {
      file: 'planning/tasks.md',
      archiveFile: 'planning/tasks-archive.md',
      linesMoved,
    };
  }
}
