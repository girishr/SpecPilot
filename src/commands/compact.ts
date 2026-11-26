import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { contextEntries, entryStatus, isMarker, planCompact, taskIds } from '../utils/contextCompactor';
import { terminalText } from '../utils/logger';
import { archivedOn, SPECS_DIR_CANDIDATES } from '../utils/specArchiver';
import { writeError, writeInside } from '../utils/specPaths';
import { askConfirmation, currentBranch } from './archive';

export interface CompactOptions {
  dir?: string;
  apply?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

const say = (text: string) => console.log(terminalText(text));
const fail = (text: string) => {
  console.error(terminalText(text));
  process.exitCode = 1;
};
const readOr = (path: string) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');

/** BL-202 (REQ-002.A.19): list context.md's entries for an agent to judge, or with --apply move the plan's archive rows. */
export async function compactCommand(options: CompactOptions): Promise<void> {
  const root = resolve(options.dir ?? '.');
  try {
    const specs = SPECS_DIR_CANDIDATES.find((name) => existsSync(join(root, name)));
    if (!specs) return fail('No .specs directory found. Run `specpilot init` first.');
    const rel = (file: string) => `${specs}/development/${file}`;
    const path = (file: string) => join(root, specs, 'development', file);
    const tasks = readOr(join(root, specs, 'planning', 'tasks.md'));
    const tasksArchive = readOr(join(root, specs, 'planning', 'tasks-archive.md'));
    if (!existsSync(path('context.md'))) return fail(`No ${rel('context.md')} found.`);

    if (!options.apply) {
      const lines = readFileSync(path('context.md'), 'utf-8').split('\n');
      const ids = taskIds(tasks, tasksArchive);
      const entries = contextEntries(lines).filter((e) => !isMarker(lines[e.start]));
      const counts = new Map<string, number>();
      for (const e of entries) {
        const status = entryStatus(e.lead, ids);
        counts.set(status, (counts.get(status) ?? 0) + 1);
        const kb = (Buffer.byteLength(lines.slice(e.start, e.end).join('\n')) / 1024).toFixed(1);
        say(`${status.padEnd(9)} ${String(e.end - e.start).padStart(4)} ${kb.padStart(6)} KB  ${e.lead ?? lines[e.start].replace(/\r$/, '').slice(0, 80)}`);
      }
      say('');
      say(`${entries.length} entries: ${[...counts].map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}. Statuses are hints; /specpilot-compact decides.`);
      return;
    }

    if (!options.dryRun && !options.force) {
      const branch = currentBranch(root);
      if (branch && branch !== 'main' && branch !== 'master') {
        say(`⚠ You're on branch '${branch}'. Compact is recommended only on the default branch after merging.`);
        if (!(await askConfirmation('Continue? [y/N] '))) return say('Compact cancelled.');
      }
    }

    for (const file of ['compact-plan.md', 'context.md', 'context-archive.md']) {
      const refused = writeError(root, rel(file));
      if (refused) return fail(refused);
    }
    if (!existsSync(path('compact-plan.md'))) return fail(`No plan: ${rel('compact-plan.md')} not found. Run /specpilot-compact first.`);

    const context = readFileSync(path('context.md'), 'utf-8');
    const timestamp = archivedOn();
    const plan = planCompact(context, readFileSync(path('compact-plan.md'), 'utf-8'), tasks, tasksArchive, timestamp);
    if ('refuse' in plan) {
      plan.refuse.forEach((line) => console.error(terminalText(line)));
      return fail('Nothing was written.');
    }
    if (!('newContext' in plan)) return say('Nothing to move: the plan has no archive rows');

    if (options.dryRun) {
      for (const m of plan.moves) say(`  ${/\*\*(.+?)\*\*/.exec(m.lines[0])![1]}`);
      return say(`Would move ${plan.moved} entries to context-archive.md (dry run, nothing written).`);
    }
    writeInside(root, rel('context-archive.md'), readOr(path('context-archive.md')) + plan.archiveBlock);
    writeInside(root, rel('context.md'), plan.newContext);
    unlinkSync(path('compact-plan.md'));
    say(`Moved ${plan.moved} entries to context-archive.md`);
  } catch (error) {
    fail(`Compact failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
