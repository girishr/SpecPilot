---
description: Archive oversized .specs/ files (tasks.md Completed section, prompts.md) with a branch safety guard
allowed-tools: Bash, Read, Edit
---

Archive oversized `.specs/` files: `.specs/planning/tasks.md`'s `## Completed` section beyond 25 lines, and `.specs/development/prompts.md` beyond 100 total lines.

Run the script below — it computes thresholds and moves lines deterministically. Do not hand-count lines or decide what to move yourself; the script's arithmetic is the source of truth.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PROMPTS_LINE_LIMIT=100
PROMPTS_KEEP_LINES=80
COMPLETED_LINE_LIMIT=25
COMPLETED_KEEP_ENTRIES=20

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -n "$branch" ] && [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
  echo "WARNING: on branch '$branch'. Archive is recommended only on the default branch after merging."
  read -p "Continue? [y/N] " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Archive cancelled."
    exit 0
  fi
fi

timestamp() { date -u +"%Y-%m-%d %H:%M:%S"; }

archive_prompts() {
  local file=".specs/development/prompts.md"
  local archive=".specs/development/prompts-archive.md"
  [ -f "$file" ] || return 0
  local total
  total=$(wc -l < "$file")
  if [ "$total" -le "$PROMPTS_LINE_LIMIT" ]; then return 0; fi

  # Anchor on "## Latest Entries" so boilerplate (Re-Anchor Prompt, etc.) is never
  # mistaken for archivable log content; fall back to front-matter close, then line 0.
  local anchor_line
  anchor_line=$(grep -n '^## Latest Entries' "$file" | head -1 | cut -d: -f1)
  if [ -z "$anchor_line" ]; then
    if [ "$(sed -n '1p' "$file")" = "---" ]; then
      anchor_line=$(awk 'NR>1 && $0=="---" {print NR; exit}' "$file")
    else
      anchor_line=0
    fi
  fi
  local body_start=$((anchor_line + 1))
  local body_lines=$((total - anchor_line))
  local keep=$((PROMPTS_KEEP_LINES - anchor_line))
  if [ "$keep" -lt 50 ]; then keep=50; fi
  if [ "$body_lines" -le "$keep" ]; then return 0; fi

  local archive_count=$((body_lines - keep))
  local archive_end=$((body_start + archive_count - 1))

  { echo "## Archived on $(timestamp)"; echo; sed -n "${body_start},${archive_end}p" "$file"; echo; echo "---"; echo; } >> "$archive"
  { sed -n "1,${anchor_line}p" "$file"; sed -n "$((archive_end + 1)),\$p" "$file"; } > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "Moved $archive_count lines from $file -> $archive"
}

archive_tasks() {
  local file=".specs/planning/tasks.md"
  local archive=".specs/planning/tasks-archive.md"
  [ -f "$file" ] || return 0
  local total
  total=$(wc -l < "$file")
  local completed_line
  completed_line=$(grep -n '^## Completed$' "$file" | head -1 | cut -d: -f1)
  [ -n "$completed_line" ] || return 0

  local section_size=$((total - completed_line + 1))
  if [ "$section_size" -le "$COMPLETED_LINE_LIMIT" ]; then return 0; fi

  local entry_start=$((completed_line + 1))
  while [ "$entry_start" -le "$total" ] && ! sed -n "${entry_start}p" "$file" | grep -qE '^[0-9]+\.'; do
    entry_start=$((entry_start + 1))
  done
  if [ "$entry_start" -gt "$total" ]; then return 0; fi

  local entry_count=$((total - entry_start + 1))
  if [ "$entry_count" -le "$COMPLETED_KEEP_ENTRIES" ]; then return 0; fi

  local archive_count=$((entry_count - COMPLETED_KEEP_ENTRIES))
  local archive_end=$((entry_start + archive_count - 1))

  { echo "## Archived on $(timestamp)"; echo; sed -n "${entry_start},${archive_end}p" "$file"; echo; echo "---"; echo; } >> "$archive"
  { sed -n "1,$((entry_start - 1))p" "$file"; sed -n "$((archive_end + 1)),\$p" "$file"; } > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "Moved $archive_count entries from $file -> $archive"
}

archive_prompts
archive_tasks
```

After running it:
1. Report what the script moved (file, line/entry count, archive destination) using its own output — do not recompute or second-guess the numbers.
2. If nothing exceeded the threshold, say so plainly: "Nothing to archive."
3. IDs are preserved automatically since content is moved verbatim into the archive file, never rewritten or renumbered.

This mirrors CLI `specpilot archive --dry-run --force` (REQ-002.A.8); the branch guard mirrors ARCH-004.19 (warns and requires `y` confirmation when not on `main`/`master`).