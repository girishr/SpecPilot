// BL-202 (REQ-002.A.19, ARCH-004.82): an agent decides which context.md entries leave; these pure functions do the move.

export type EntryStatus = 'no-lead' | 'no-id' | 'open' | 'unknown' | 'finished' | 'completed';

export interface ContextEntry {
  /** Line indices [start, end). */
  start: number;
  end: number;
  /** The `## ` heading line the entry sits under, as written. */
  heading: string;
  /** The text inside the first `**…**` on its first line, or null. */
  lead: string | null;
}

const LEAD = /\*\*(.+?)\*\*/;
const TASK_ID = /\b(?:BL|CS|TASK)-(?:[A-Za-z]+-)?\d+\b/g;
const MARKER = /^- \*\*.+?\*\*: moved to context-archive\.md on \d{4}-\d{2}-\d{2}\.$/;
const SEPARATOR = /^\|[\s:|-]+$/;

/** Top-level list items under a `## ` heading, each with its indented continuation lines; nothing before the first `## `. */
export function contextEntries(lines: string[]): ContextEntry[] {
  const entries: ContextEntry[] = [];
  let heading: string | null = null;
  let cur: ContextEntry | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      heading = line;
      cur = null;
    } else if (heading !== null && line.startsWith('- ')) {
      entries.push((cur = { start: i, end: i + 1, heading, lead: LEAD.exec(line)?.[1] ?? null }));
    } else if (cur && /^\s+\S/.test(line)) {
      cur.end = i + 1;
    } else {
      cur = null;
    }
  }
  return entries;
}

export interface TaskIds {
  open: Set<string>;
  completed: Set<string>;
  archived: Set<string>;
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

/** Every task ID in an ID position of the text, with the `## ` heading it sits under: table ID cells and numbered-item `[…]` prefixes. */
function idsByHeading(text: string): { heading: string; id: string }[] {
  const found: { heading: string; id: string }[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let heading = '';
  let idCol = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (line.startsWith('## ')) {
      heading = line;
      idCol = -1;
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && SEPARATOR.test(lines[i + 1].trim())) {
      idCol = cells(t).findIndex((c) => c === 'ID');
      i++;
      continue;
    }
    if (t.startsWith('|')) {
      if (idCol >= 0) for (const id of (cells(t)[idCol] ?? '').match(TASK_ID) ?? []) found.push({ heading, id });
      continue;
    }
    idCol = -1;
    const prefix = /^\d+\.\s+((?:\[[^\]]*\]\s*)+)/.exec(line);
    if (prefix) for (const id of prefix[1].match(TASK_ID) ?? []) found.push({ heading, id });
  }
  return found;
}

/** Where each task ID stands: open in tasks.md (Backlog, Current Sprint, Review, Won't do), in its Completed, or in tasks-archive.md. */
export function taskIds(tasksText: string, tasksArchiveText: string): TaskIds {
  const ids: TaskIds = { open: new Set(), completed: new Set(), archived: new Set() };
  for (const { heading, id } of idsByHeading(tasksText)) {
    if (/^## Completed\b/i.test(heading)) ids.completed.add(id);
    else if (/^## (Backlog|Current Sprint|Review|Won't do)\b/i.test(heading)) ids.open.add(id);
  }
  for (const { id } of idsByHeading(tasksArchiveText)) ids.archived.add(id);
  return ids;
}

/** One status per lead, the first that applies. Only `open` stops an archive; the rest are hints for the agent. */
export function entryStatus(lead: string | null, ids: TaskIds): EntryStatus {
  if (lead === null) return 'no-lead';
  const named = lead.match(TASK_ID) ?? [];
  if (named.length === 0) return 'no-id';
  if (named.some((id) => ids.open.has(id))) return 'open';
  if (named.some((id) => !ids.completed.has(id) && !ids.archived.has(id))) return 'unknown';
  if (named.every((id) => ids.archived.has(id))) return 'finished';
  return 'completed';
}

export const isMarker = (line: string) => MARKER.test(line.replace(/\r$/, ''));

export interface PlanRow {
  lead: string;
  action: string;
  reason: string;
  /** The Entry and Reason cells as written, escapes kept, for the Reasons table. */
  rawLead: string;
  rawReason: string;
}

const unescape = (cell: string) => cell.replace(/\\\|/g, '|');

/** The plan's `| Entry | Action | Reason |` table (GFM cells, `\|` a literal pipe), or the reasons it cannot be read. */
export function parsePlan(text: string): { rows: PlanRow[] } | { refuse: string[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const header = lines.findIndex(
    (l, i) => i + 1 < lines.length && l.trim().startsWith('|') && SEPARATOR.test(lines[i + 1].trim())
      && cells(l).map((c) => c.toLowerCase()).join('|') === 'entry|action|reason',
  );
  if (header === -1) return { refuse: ['The plan is not a | Entry | Action | Reason | table.'] };
  const rows: PlanRow[] = [];
  const refuse: string[] = [];
  for (let i = header + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const c = cells(lines[i]);
    if (c.length !== 3) {
      refuse.push(`Plan row ${rows.length + refuse.length + 1} has ${c.length} cells, not 3: ${lines[i].trim()}`);
      continue;
    }
    rows.push({ lead: unescape(c[0]), action: c[1], reason: unescape(c[2]), rawLead: c[0], rawReason: c[2] });
  }
  return refuse.length ? { refuse } : { rows };
}

export interface Move {
  /** The marker's line index in the new context.md. */
  index: number;
  /** The entry's lines, as they were. */
  lines: string[];
}

/** The new context.md with each marker put back as its entry: the round-trip check (equal to the original, or nothing is written). */
export function putBack(newContext: string, moves: Move[]): string {
  const eol = newContext.includes('\r\n') ? '\r\n' : '\n';
  const lines = newContext.split(eol);
  for (const m of [...moves].sort((a, b) => b.index - a.index)) lines.splice(m.index, 1, ...m.lines);
  return lines.join(eol);
}

export type CompactPlan =
  | { refuse: string[] }
  | { moved: 0 }
  | { moved: number; archiveBlock: string; newContext: string; moves: Move[] };

/**
 * What `specpilot compact --apply` writes for `planText`: refusals (nothing written), nothing to move, or the block for
 * context-archive.md and the new context.md, each archived entry replaced by one marker line.
 */
export function planCompact(contextText: string, planText: string, tasksText: string, tasksArchiveText: string, timestamp: string): CompactPlan {
  const parsed = parsePlan(planText);
  if ('refuse' in parsed) return parsed;
  const eol = contextText.includes('\r\n') ? '\r\n' : '\n';
  const lines = contextText.split(eol);
  const entries = contextEntries(lines);
  const ids = taskIds(tasksText, tasksArchiveText);
  const refuse: string[] = [];
  const seen = new Map<string, number>();
  const picked: { entry: ContextEntry; row: PlanRow }[] = [];

  parsed.rows.forEach((row, i) => {
    const n = i + 1;
    const say = (text: string) => refuse.push(`Plan row ${n}: ${text}`);
    if (seen.has(row.lead)) return say(`"${row.lead}" is already listed in row ${seen.get(row.lead)}.`);
    seen.set(row.lead, n);
    if (row.action !== 'keep' && row.action !== 'archive') return say(`the action is "${row.action}", not keep or archive.`);
    const matches = entries.filter((e) => e.lead === row.lead);
    if (matches.length === 0) return say(`no entry has the title "${row.lead}".`);
    if (matches.length > 1) return say(`${matches.length} entries have the title "${row.lead}".`);
    if (row.action === 'keep') return;
    const entry = matches[0];
    if (!row.reason) return say('an archive row needs a reason.');
    if (isMarker(lines[entry.start])) return say(`"${row.lead}" is already a marker for an archived entry.`);
    const open = (row.lead.match(TASK_ID) ?? []).find((id) => ids.open.has(id));
    if (open) return say(`"${row.lead}" names ${open}, which is still open in tasks.md, so it stays.`);
    picked.push({ entry, row });
  });
  if (refuse.length) return { refuse };
  if (picked.length === 0) return { moved: 0 };

  // Archive block: entries byte for byte, grouped under their heading in file order, then the reasons.
  picked.sort((a, b) => a.entry.start - b.entry.start);
  const block: string[] = [`## Archived on ${timestamp}`, ''];
  let heading: string | null = null;
  for (const { entry } of picked) {
    if (entry.heading !== heading) {
      if (heading !== null) block.push('');
      heading = entry.heading;
      block.push(`#${heading}`, '');
    }
    block.push(...lines.slice(entry.start, entry.end));
  }
  block.push('', '### Reasons', '', '| Entry | Reason |', '|---|---|', ...picked.map(({ row }) => `| ${row.rawLead} | ${row.rawReason} |`), '', '---', '', '');

  // New context.md: each entry becomes one marker line.
  const date = timestamp.slice(0, 10);
  const out: string[] = [];
  const moves: Move[] = [];
  let next = 0;
  for (const { entry, row } of picked) {
    out.push(...lines.slice(next, entry.start));
    moves.push({ index: out.length, lines: lines.slice(entry.start, entry.end) });
    out.push(`- **${row.lead}**: moved to context-archive.md on ${date}.`);
    next = entry.end;
  }
  out.push(...lines.slice(next));
  const newContext = out.join(eol);

  if (putBack(newContext, moves) !== contextText) {
    return { refuse: ['The moved entries do not put back to the original context.md, so nothing was written.'] };
  }
  return { moved: picked.length, archiveBlock: block.join(eol), newContext, moves };
}
