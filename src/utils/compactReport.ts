// BL-204 (REQ-002.A.21, ARCH-004.84): what each file compact touches costs, and what archive and the agent may save.
import { contextEntries, entryStatus, isMarker, markerLine, taskIds } from './contextCompactor';
import { requirementItems } from './requirementsCompactor';
import { completedArchiveBlock, planCompletedArchive, planPromptsArchive } from './specArchiver';

/** From this repo's trials: BL-202 moved 139 of 258 KB of `finished` entries; BL-203 saved 22.3 of 114.9 KB. */
const CONTEXT_RATE = 0.5;
const REQUIREMENTS_RATE = 0.2;
/** The agent run: the command, listing and plan (BL-202's run), and each requirement rewritten (BL-203's, ~170k for 10). */
const RUN_OVERHEAD = 10_000;
const PER_REWRITE = 17_000;
/** The items `/specpilot-compact` rewrites: keyed, at least 4 KB, the 10 largest (REQ-002.E.19). */
const MIN_ITEM_BYTES = 4096;
const MAX_ITEMS = 10;

export interface ReportTexts {
  tasks: string | null;
  tasksArchive: string | null;
  prompts: string | null;
  context: string | null;
  requirements: string | null;
  requirementsArchive: string | null;
}

export interface FileReport {
  file: string;
  bytes: number;
  /** Bytes saved: exact for archive, the likely figure for the agent. */
  saving: number;
  how: 'exact' | 'refuses' | 'likely';
  /** context.md: the most the agent can save, and the entries it counts. requirements.md: the items' bytes and count. */
  ceiling?: number;
  count?: number;
}

export interface CompactReport {
  files: FileReport[];
  /** The agent's one-off run, ≈tokens; 0 when it has nothing to do. */
  agentTokens: number;
  /** The likely per-read tokens saved in context.md and requirements.md together. */
  likelyPerRead: number;
}

export const tokens = (bytes: number) => Math.ceil(bytes / 4);
const size = (text: string) => Buffer.byteLength(text, 'utf-8');

/** The report for these files' contents; `date` (YYYY-MM-DD) is the marker lines' date. Pure: reads nothing. */
export function compactReport(t: ReportTexts, date: string): CompactReport {
  const files: FileReport[] = [];
  let tasksAfter = t.tasks ?? '';
  let archiveAfter = t.tasksArchive ?? '';

  if (t.tasks !== null) {
    const lines = t.tasks.split('\n');
    const plan = planCompletedArchive(lines);
    let saving = 0;
    if (plan) {
      // Removing lines [start, end) removes them, their line breaks (in the join) and the one after the last.
      saving = size(lines.slice(plan.start, plan.end).join('\n')) + 1;
      tasksAfter = [...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n');
      archiveAfter += completedArchiveBlock(lines, plan);
    }
    files.push({ file: 'planning/tasks.md', bytes: size(t.tasks), saving, how: 'exact' });
  }

  if (t.prompts !== null) {
    const lines = t.prompts.split('\n');
    const plan = planPromptsArchive(lines);
    if (plan && 'refuse' in plan) files.push({ file: 'development/prompts.md', bytes: size(t.prompts), saving: 0, how: 'refuses' });
    else {
      const saving = plan ? size(lines.slice(plan.start, plan.end).join('\n')) + 1 : 0;
      files.push({ file: 'development/prompts.md', bytes: size(t.prompts), saving, how: 'exact' });
    }
  }

  let finishedBytes = 0;
  let likely = 0;
  if (t.context !== null) {
    const eol = t.context.includes('\r\n') ? '\r\n' : '\n';
    const lines = t.context.split(eol);
    // Statuses as the agent will see them: after archive has moved its Completed rows (architect decision BL-204 Q5).
    const ids = taskIds(tasksAfter, archiveAfter);
    let ceiling = 0;
    let count = 0;
    for (const e of contextEntries(lines)) {
      if (isMarker(lines[e.start]) || entryStatus(e.lead, ids) !== 'finished') continue;
      // The entry's lines and the newline after it; its own line breaks are in the join.
      const bytes = size(lines.slice(e.start, e.end).join(eol)) + eol.length;
      finishedBytes += bytes;
      ceiling += Math.max(0, bytes - size(markerLine(e.lead!, date)) - eol.length);
      count++;
    }
    const saving = Math.round(ceiling * CONTEXT_RATE);
    likely += saving;
    files.push({ file: 'development/context.md', bytes: size(t.context), saving, how: 'likely', ceiling, count });
  }

  let rewrites = 0;
  if (t.requirements !== null) {
    const lines = t.requirements.split(t.requirements.includes('\r\n') ? '\r\n' : '\n');
    // An item an earlier run rewrote has its original under an exact `### <key>` line (architect decision BL-204 Q1).
    const done = new Set((t.requirementsArchive ?? '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.startsWith('### ')).map((l) => l.slice(4)));
    const picked = requirementItems(lines)
      .filter((it) => it.key !== null && !done.has(it.key))
      .map((it) => size(lines.slice(it.start, it.end).join('\n')))
      .filter((bytes) => bytes >= MIN_ITEM_BYTES)
      .sort((a, b) => b - a)
      .slice(0, MAX_ITEMS);
    const ceiling = picked.reduce((s, b) => s + b, 0);
    const saving = Math.round(ceiling * REQUIREMENTS_RATE);
    likely += saving;
    rewrites = picked.length;
    files.push({ file: 'project/requirements.md', bytes: size(t.requirements), saving, how: 'likely', ceiling, count: picked.length });
  }

  const likelyPerRead = tokens(likely);
  const agentTokens = likelyPerRead === 0 ? 0 : tokens(finishedBytes) + RUN_OVERHEAD + PER_REWRITE * rewrites;
  return { files, agentTokens, likelyPerRead };
}
