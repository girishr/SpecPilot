import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { compactReport, tokens } from '../utils/compactReport';
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
  report?: boolean;
  calls?: string;
}

const say = (text: string) => console.log(terminalText(text));
const fail = (text: string) => {
  console.error(terminalText(text));
  process.exitCode = 1;
};
const readOr = (path: string) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');
const kb = (bytes: number) => (bytes / 1024).toFixed(1);
const tok = (n: number) => (n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`);

/** BL-204 (REQ-002.A.21): the report, from the files' contents; it reads nothing else and writes nothing. */
function printReport(text: (file: string) => string | null, calls: number, date: string): void {
  const r = compactReport({
    tasks: text('planning/tasks.md'),
    tasksArchive: text('planning/tasks-archive.md'),
    prompts: text('development/prompts.md'),
    context: text('development/context.md'),
    requirements: text('project/requirements.md'),
    requirementsArchive: text('project/requirements-archive.md'),
  }, date);
  say(`Compact report. Tokens ≈ bytes ÷ 4; per task = per read × ${calls} calls (--calls), mostly cache reads. Every number not marked exact is an estimate.`);
  say('');
  say(`${'file'.padEnd(24)} ${'size'.padStart(10)} ${'≈tokens'.padStart(8)} ${'saving'.padStart(10)} ${'per read'.padStart(9)} ${'per task'.padStart(9)}  how`);
  const row = (name: string, size: string, toks: string, saving: number | null, how: string) => {
    const per = saving === null ? '-' : tok(tokens(saving));
    const task = saving === null ? '-' : tok(tokens(saving) * calls);
    say(`${name.padEnd(24)} ${size.padStart(10)} ${toks.padStart(8)} ${(saving === null ? '-' : `${kb(saving)} KB`).padStart(10)} ${per.padStart(9)} ${task.padStart(9)}  ${how}`.trimEnd());
  };
  for (const f of r.files) {
    const how = f.how === 'exact' ? 'exact (archive)'
      : f.how === 'refuses' ? 'archive refuses'
      : f.file === 'development/context.md' ? `likely (agent): half of ${kb(f.ceiling!)} KB in ${f.count} finished entries`
      : `likely (agent): a fifth of ${kb(f.ceiling!)} KB in ${f.count} items`;
    row(f.file, `${kb(f.bytes)} KB`, tok(tokens(f.bytes)), f.how === 'refuses' ? null : f.saving, how);
  }
  row('total', '', '', r.files.reduce((s, f) => s + f.saving, 0), '');
  say('');
  if (r.likelyPerRead === 0) return say('Nothing for the agent to compact.');
  say(`Agent run: ≈${tok(r.agentTokens)} tokens once (finished context entries + 10k, 17k per requirement rewritten, from SpecPilot's own trials); paid back after ${Math.ceil(r.agentTokens / r.likelyPerRead)} reads`);
}

/**
 * BL-202 (REQ-002.A.19), BL-203 (REQ-002.A.20): list context.md's entries and requirements.md's items for an agent to
 * judge, or with --apply move the context plan's archive rows and rewrite the requirements plan's items, all or nothing.
 */
export async function compactCommand(options: CompactOptions): Promise<void> {
  const root = resolve(options.dir ?? '.');
  if (options.report && options.apply) return fail('--report cannot be used with --apply.');
  if (options.calls !== undefined && !options.report && !(options.apply && options.dryRun)) return fail('--calls works only with --report or --apply --dry-run.');
  const calls = options.calls === undefined ? 50 : /^\d+$/.test(options.calls) ? Number(options.calls) : NaN;
  if (!(calls >= 1 && calls <= 1000)) return fail('--calls must be a whole number from 1 to 1000.');
  try {
    const specs = SPECS_DIR_CANDIDATES.find((name) => existsSync(join(root, name)));
    if (!specs) return fail('No .specs directory found. Run `specpilot init` first.');
    const rel = (file: string) => `${specs}/${file}`;
    const path = (file: string) => join(root, specs, ...file.split('/'));
    if (options.report) return printReport((file) => (existsSync(path(file)) ? readFileSync(path(file), 'utf-8') : null), calls, archivedOn().slice(0, 10));
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
      // BL-204 (REQ-002.A.21): the exact saving per file the plans would change.
      const exact = (file: string, after: string) => {
        const before = readFileSync(path(file), 'utf-8');
        const fewer = tokens(Buffer.byteLength(before)) - tokens(Buffer.byteLength(after));
        const n = Math.abs(fewer);
        say(`${file}: ${kb(Buffer.byteLength(before))} KB → ${kb(Buffer.byteLength(after))} KB, ≈${tok(n)} ${fewer < 0 ? 'more' : 'fewer'} tokens per read, ≈${tok(n * calls)} over a ${calls}-call task`);
      };
      if (moved) exact('development/context.md', moved.newContext);
      if (rewrite) exact('project/requirements.md', rewrite.newRequirements);
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
