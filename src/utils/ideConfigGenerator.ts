import { join } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { TemplateContext } from '../core/templateEngine';
import { buildCopilotInstructions, COPILOT_INSTRUCTIONS_FILE, GITATTRIBUTES_FILE, GITATTRIBUTES_LINES } from '../core/ideConfig';
import { writeError, writeInside } from './specPaths';

export { GITATTRIBUTES_FILE };

/**
 * Create `path` with `content` only if nothing is there (BL-073): an existing file, or a link at the
 * path itself, is never written or written through. Returns false when it was kept (EEXIST).
 */
export function writeNew(path: string, content: string): boolean {
  try {
    writeFileSync(path, content, { flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

/**
 * The Node side of the IDE files (BL-032): what `specpilot backfill` creates and what the writer
 * merges. The content of every IDE file is in `src/core/ideConfig.ts`.
 */
export class IdeConfigGenerator {
  /**
   * Generates .github/copilot-instructions.md with critical mandates (`specpilot backfill`, when it is
   * missing). Read automatically by GitHub Copilot, Cursor, and other AI tools on every request.
   */
  generateCopilotInstructions(projectDir: string, context: TemplateContext): void {
    writeInside(projectDir, COPILOT_INSTRUCTIONS_FILE, buildCopilotInstructions(context), { create: true });
  }

  /**
   * Generates (or updates) .gitattributes at project root with merge=union rules
   * for append-heavy spec files, preventing git merge conflicts on shared branches.
   * If the file already exists, only missing lines are appended. Returns how many were appended.
   * Never through a link (BL-130): a linked or non-regular `.gitattributes` throws before it is read.
   */
  generateGitAttributes(projectDir: string): number {
    const error = writeError(projectDir, GITATTRIBUTES_FILE);
    if (error) throw new Error(error);
    const filePath = join(projectDir, GITATTRIBUTES_FILE);

    if (!existsSync(filePath)) {
      writeInside(projectDir, GITATTRIBUTES_FILE, GITATTRIBUTES_LINES.join('\n') + '\n');
      return 0;
    }

    const existing = readFileSync(filePath, 'utf8');
    const missing = GITATTRIBUTES_LINES.filter(line => !existing.includes(line));
    if (missing.length > 0) {
      const suffix = existing.endsWith('\n') ? '' : '\n';
      writeInside(projectDir, GITATTRIBUTES_FILE, existing + suffix + missing.join('\n') + '\n');
    }
    return missing.length;
  }
}
