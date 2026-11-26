// BL-203 (REQ-002.A.20, ARCH-004.83): an agent rewrites requirements to current behaviour; the originals are archived.
import { createHash } from 'crypto';
import { Move, putBack } from './contextCompactor';

export interface RequirementItem {
  /** Line indices [start, end). */
  start: number;
  end: number;
  /** The bracketed ID at the end of its last line, or null. */
  key: string | null;
  /** First 8 hex characters of the SHA-256 of the item's lines joined by `\n`. */
  sha8: string;
}

const KEY = /\[([A-Z][A-Za-z]*-[A-Za-z0-9.-]+)\]\s*$/;
const keyOf = (line: string) => KEY.exec(line.replace(/\r$/, ''))?.[1] ?? null;
const sha8 = (lines: string[]) => createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 8);

/** Top-level list items under a heading, each with its indented continuation lines; a blank or unindented line ends one. */
export function requirementItems(lines: string[]): RequirementItem[] {
  const items: { start: number; end: number }[] = [];
  let heading = false;
  let cur: { start: number; end: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      heading = true;
      cur = null;
    } else if (heading && line.startsWith('- ')) items.push((cur = { start: i, end: i + 1 }));
    else if (cur && /^\s+\S/.test(line)) cur.end = i + 1;
    else cur = null;
  }
  return items.map((it) => ({ ...it, key: keyOf(lines[it.end - 1]), sha8: sha8(lines.slice(it.start, it.end)) }));
}

/**
 * The original's backticked strings and `[…]` IDs that the rewrite no longer has: a review aid, never a refusal. A backticked
 * string counts as kept when its text is anywhere in the rewrite, so one merged into a longer span is not flagged.
 */
export function droppedTokens(original: string, rewrite: string): string[] {
  const tokens = [...new Set([...(original.match(/`[^`\n]+`/g) ?? []), ...(original.match(/\[[A-Z][A-Za-z]*-[^\]\s]+\]/g) ?? [])])];
  return tokens.filter((t) => !rewrite.includes(t.startsWith('`') ? t.slice(1, -1) : t));
}

export interface RequirementsBlock {
  key: string;
  sha: string;
  reason: string;
  lines: string[];
}

/** The plan's `### <key> <sha>` blocks, each with its `Reason:` line and the new item in a ```text fence. */
export function parseRequirementsPlan(text: string): { blocks: RequirementsBlock[] } | { refuse: string[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: RequirementsBlock[] = [];
  const refuse: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('### ')) continue;
    const n = blocks.length + refuse.length + 1;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith('### ')) end++;
    const head = /^### (\S+) ([0-9a-f]{8})\s*$/.exec(lines[i]);
    if (!head) {
      refuse.push(`Requirements block ${n}: the heading "${lines[i]}" is not "### <key> <sha>".`);
      i = end - 1;
      continue;
    }
    const body = lines.slice(i + 1, end);
    const reason = body.find((l) => l.startsWith('Reason:'))?.slice('Reason:'.length).trim() ?? '';
    const open = body.findIndex((l) => l.trim() === '```text');
    const close = open === -1 ? -1 : body.findIndex((l, k) => k > open && l.trim() === '```');
    if (close === -1) refuse.push(`Requirements block ${n} (${head[1]}): no \`\`\`text fence.`);
    else blocks.push({ key: head[1], sha: head[2], reason, lines: body.slice(open + 1, close) });
    i = end - 1;
  }
  if (refuse.length) return { refuse };
  if (blocks.length === 0) return { refuse: ['The requirements plan has no ### <key> <sha> blocks.'] };
  return { blocks };
}

export type RequirementsPlan =
  | { refuse: string[] }
  | { rewritten: number; saved: number; archiveBlock: string; newRequirements: string; moves: Move[]; changes: { key: string; before: string; after: string }[] };

/**
 * What `specpilot compact --apply` writes for the requirements plan: refusals (nothing written), or the block for
 * requirements-archive.md and the new requirements.md, each named item replaced in place by its rewrite.
 */
export function planRequirements(requirementsText: string, planText: string, timestamp: string): RequirementsPlan {
  const parsed = parseRequirementsPlan(planText);
  if ('refuse' in parsed) return parsed;
  const eol = requirementsText.includes('\r\n') ? '\r\n' : '\n';
  const lines = requirementsText.split(eol);
  const items = requirementItems(lines);
  const refuse: string[] = [];
  const seen = new Map<string, number>();
  const picked: { item: RequirementItem; block: RequirementsBlock }[] = [];

  parsed.blocks.forEach((block, i) => {
    const n = i + 1;
    const say = (text: string) => refuse.push(`Requirements block ${n}: ${text}`);
    if (seen.has(block.key)) return say(`${block.key} is already in block ${seen.get(block.key)}.`);
    seen.set(block.key, n);
    const matches = items.filter((it) => it.key === block.key);
    if (matches.length === 0) return say(`no item has the key ${block.key}.`);
    if (matches.length > 1) return say(`${matches.length} items have the key ${block.key}.`);
    const item = matches[0];
    const problems: string[] = [];
    if (item.sha8 !== block.sha) problems.push(`${block.key} changed since the plan (sha ${block.sha}, now ${item.sha8}).`);
    if (!block.reason) problems.push(`${block.key} needs a reason.`);
    const neu = block.lines;
    if (!neu[0]?.startsWith('- ')) problems.push(`the new item for ${block.key} does not start with "- ".`);
    const bad = neu.findIndex((l, k) => k > 0 && !/^\s+\S/.test(l));
    if (bad !== -1) problems.push(`line ${bad + 1} of the new item is blank, unindented or a heading.`);
    if (neu.length && keyOf(neu[neu.length - 1]) !== block.key) problems.push(`the new item does not end with [${block.key}].`);
    const before = Buffer.byteLength(lines.slice(item.start, item.end).map((l) => l.replace(/\r$/, '')).join('\n'));
    const after = Buffer.byteLength(neu.join('\n'));
    if (after >= before) problems.push(`${block.key} is not shorter (${after} bytes, was ${before}).`);
    if (problems.length) return problems.forEach(say);
    picked.push({ item, block });
  });
  if (refuse.length) return { refuse };

  picked.sort((a, b) => a.item.start - b.item.start);
  const out: string[] = [];
  const moves: Move[] = [];
  const archive: string[] = [`## Archived on ${timestamp}`, ''];
  const changes: { key: string; before: string; after: string }[] = [];
  let next = 0;
  for (const { item, block } of picked) {
    out.push(...lines.slice(next, item.start));
    const original = lines.slice(item.start, item.end);
    moves.push({ index: out.length, count: block.lines.length, lines: original });
    out.push(...block.lines);
    archive.push(`### ${block.key}`, '', `Reason: ${block.reason}`, '', ...original.map((l) => l.replace(/\r$/, '')), '');
    changes.push({ key: block.key, before: original.map((l) => l.replace(/\r$/, '')).join('\n'), after: block.lines.join('\n') });
    next = item.end;
  }
  out.push(...lines.slice(next));
  archive.push('---', '', '');
  const newRequirements = out.join(eol);

  const keys = (text: string) => requirementItems(text.split(eol)).map((it) => it.key).filter(Boolean).sort().join('\n');
  if (putBack(newRequirements, moves) !== requirementsText || keys(newRequirements) !== keys(requirementsText)) {
    return { refuse: ['The rewritten requirements do not put back to the original requirements.md, so nothing was written.'] };
  }
  const saved = changes.reduce((s, c) => s + Buffer.byteLength(c.before) - Buffer.byteLength(c.after), 0);
  return { rewritten: picked.length, saved, archiveBlock: archive.join(eol), newRequirements, moves, changes };
}
