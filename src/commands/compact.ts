import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { contextEntries, entryStatus, isMarker, planCompact, taskIds } from '../utils/contextCompactor';
import { terminalText } from '../utils/logger';
import { droppedTokens, planRequirements, requirementItems } from '../utils/requirementsCompactor';
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
const kb = (bytes: number) => (bytes / 1024).toFixed(1);

/**
 * BL-202 (REQ-002.A.19), BL-203 (REQ-002.A.20): list context.md's entries and requirements.md's items for an agent to
 * judge, or with --apply move the context plan's archive rows and rewrite the requirements plan's items, all or nothing.
 */
export async function compactCommand(options: CompactOptions): Promise<void> {
  const root = resolve(options.dir ?? '.');
  try {
    const specs = SPECS_DIR_CANDIDATES.find((name) => existsSync(join(root, name)));
    if (!specs) return fail('No .specs directory found. Run `specpilot init` first.');
    const rel = (file: string) => `${specs}/${file}`;
    const path = (file: string) => join(root, specs, ...file.split('/'));
    const tasks = readOr(path('planning/tasks.md'));
    const tasksArchive = readOr(path('planning/tasks-archive.md'));
    if (!existsSync(path('development/context.md'))) return fail(`No ${rel('development/context.md')} found.`);

    if (!options.apply) {
      const lines = readFileSync(path('development/context.md'), 'utf-8').split('\n');
      const ids = taskIds(tasks, tasksArchive);
      const entries = contextEntries(lines).filter((e) => !isMarker(lines[e.start]));
      const counts = new Map<string, number>();
      for (const e of entries) {
        const status = entryStatus(e.lead, ids);
        counts.set(status, (counts.get(status) ?? 0) + 1);
        const size = kb(Buffer.byteLength(lines.slice(e.start, e.end).join('\n')));
        say(`${status.padEnd(9)} ${String(e.end - e.start).padStart(4)} ${size.padStart(6)} KB  ${e.lead ?? lines[e.start].replace(/\r$/, '').slice(0, 80)}`);
      }
      say('');
      say(`${entries.length} entries: ${[...counts].map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}. Statuses are hints; /specpilot-compact decides.`);

      if (existsSync(path('project/requirements.md'))) {
        const req = readFileSync(path('project/requirements.md'), 'utf-8');
        const rl = req.split(req.includes('\r\n') ? '\r\n' : '\n');
        const items = requirementItems(rl).map((it) => ({ ...it, bytes: Buffer.byteLength(rl.slice(it.start, it.end).join('\n')) }));
        items.sort((a, b) => b.bytes - a.bytes || a.start - b.start);
        say('');
        say('requirements.md (largest first): key, sha, size, lines');
        for (const it of items) {
          const head = it.key ? `${it.key.padEnd(16)} ${it.sha8}` : `${'no-id'.padEnd(16)} --------`;
          say(`${head} ${kb(it.bytes).padStart(6)} KB ${String(it.end - it.start).padStart(4)}${it.key ? '' : `  ${rl[it.start].slice(0, 60)}`}`);
        }
        say('');
        const untagged = items.filter((it) => !it.key).length;
        say(`${items.length} requirements items, ${kb(items.reduce((s, it) => s + it.bytes, 0))} KB; ${untagged} without a key (never rewritten).`);
      }
      return;
    }

    if (!options.dryRun && !options.force) {
      const branch = currentBranch(root);
      if (branch && branch !== 'main' && branch !== 'master') {
        say(`⚠ You're on branch '${branch}'. Compact is recommended only on the default branch after merging.`);
        if (!(await askConfirmation('Continue? [y/N] '))) return say('Compact cancelled.');
      }
    }

    const files = ['development/compact-plan.md', 'development/context.md', 'development/context-archive.md', 'development/compact-requirements.md', 'project/requirements.md', 'project/requirements-archive.md'];
    for (const file of files) {
      const refused = writeError(root, rel(file));
      if (refused) return fail(refused);
    }
    const hasContextPlan = existsSync(path('development/compact-plan.md'));
    const hasRequirementsPlan = existsSync(path('development/compact-requirements.md'));
    if (!hasContextPlan && !hasRequirementsPlan) {
      return fail(`No plan: neither ${rel('development/compact-plan.md')} nor ${rel('development/compact-requirements.md')} was found. Run /specpilot-compact first.`);
    }

    const timestamp = archivedOn();
    const refusals: string[] = [];
    const context = hasContextPlan
      ? planCompact(readFileSync(path('development/context.md'), 'utf-8'), readFileSync(path('development/compact-plan.md'), 'utf-8'), tasks, tasksArchive, timestamp)
      : null;
    if (context && 'refuse' in context) refusals.push(...context.refuse);
    let requirements: ReturnType<typeof planRequirements> | null = null;
    if (hasRequirementsPlan) {
      if (!existsSync(path('project/requirements.md'))) refusals.push(`No ${rel('project/requirements.md')} found for the requirements plan.`);
      else {
        requirements = planRequirements(readFileSync(path('project/requirements.md'), 'utf-8'), readFileSync(path('development/compact-requirements.md'), 'utf-8'), timestamp);
        if ('refuse' in requirements) refusals.push(...requirements.refuse);
      }
    }
    if (refusals.length) {
      refusals.forEach((line) => console.error(terminalText(line)));
      return fail('Nothing was written.');
    }

    const moved = context && 'newContext' in context ? context : null;
    const rewrite = requirements && 'newRequirements' in requirements ? requirements : null;
    if (!moved && !rewrite) return say('Nothing to move: the plan has no archive rows');

    if (options.dryRun) {
      if (moved) {
        for (const m of moved.moves) say(`  ${/\*\*(.+?)\*\*/.exec(m.lines[0])![1]}`);
        say(`Would move ${moved.moved} entries to context-archive.md (dry run, nothing written).`);
      }
      if (rewrite) {
        for (const c of rewrite.changes) {
          say(`  ${c.key}  ${Buffer.byteLength(c.before)} → ${Buffer.byteLength(c.after)} bytes`);
          const dropped = droppedTokens(c.before, c.after);
          if (dropped.length) say(`    dropped: ${dropped.join(' ')}`);
        }
        say(`Would rewrite ${rewrite.rewritten} requirements (${kb(rewrite.saved)} KB shorter) (dry run, nothing written).`);
      }
      return;
    }

    if (moved) writeInside(root, rel('development/context-archive.md'), readOr(path('development/context-archive.md')) + moved.archiveBlock);
    if (rewrite) writeInside(root, rel('project/requirements-archive.md'), readOr(path('project/requirements-archive.md')) + rewrite.archiveBlock);
    if (moved) writeInside(root, rel('development/context.md'), moved.newContext);
    if (rewrite) writeInside(root, rel('project/requirements.md'), rewrite.newRequirements);
    if (hasContextPlan) unlinkSync(path('development/compact-plan.md'));
    if (hasRequirementsPlan) unlinkSync(path('development/compact-requirements.md'));
    if (moved) say(`Moved ${moved.moved} entries to context-archive.md`);
    if (rewrite) say(`Rewrote ${rewrite.rewritten} requirements (${kb(rewrite.saved)} KB shorter); originals in requirements-archive.md`);
  } catch (error) {
    fail(`Compact failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
