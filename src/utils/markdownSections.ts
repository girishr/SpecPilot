export interface SectionBounds {
  /** Index of the heading line. */
  start: number;
  /** Index of the next `## ` heading, or `lines.length` — a section ends there, not at EOF. */
  end: number;
}

/**
 * Locate a `## ` section. The heading is matched against each line's trimmed text:
 * exactly by default, or as a prefix when `prefix` is true (for headings that carry
 * an ID suffix, e.g. `## Latest Entries [PROMPT-002]`). Returns null when absent.
 */
export function findSectionBounds(lines: string[], heading: string, prefix = false): SectionBounds | null {
  const start = lines.findIndex(l => (prefix ? l.trim().startsWith(heading) : l.trim() === heading));
  if (start === -1) return null;
  const next = lines.findIndex((l, i) => i > start && /^## /.test(l.trim()));
  return { start, end: next === -1 ? lines.length : next };
}
