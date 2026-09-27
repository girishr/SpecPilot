---
mode: agent
description: Archive oversized .specs/ files (tasks.md Completed section, prompts.md) with a branch safety guard
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

  # Mirrors the CLI's planCompletedArchive() line for line. The section runs from
  # "## Completed" to the next "## " heading, not EOF. Sizes use the CLI's arithmetic,
  # which counts one more line than wc -l at EOF, so the EOF section end is total + 2.
  # Entries are numbered-list lines, or else the body rows of a table (header and
  # separator stay put); a table keeps only as many rows as fit the line limit.
  # Prints "<shape> <first> <last> <header>" as 1-based lines to move, or nothing.
  local plan
  plan=$(awk -v total="$(wc -l < "$file")" -v limit="$COMPLETED_LINE_LIMIT" -v keep_max="$COMPLETED_KEEP_ENTRIES" '
    { line[NR] = $0; t = $0; gsub(/^[ \t]+|[ \t]+$/, "", t); trimmed[NR] = t }
    END {
      for (i = 1; i <= NR; i++) if (trimmed[i] == "## Completed") { start = i; break }
      if (!start) exit
      end_ = total + 2
      for (i = start + 1; i <= NR; i++) if (trimmed[i] ~ /^## /) { end_ = i; break }
      size = end_ - start
      if (size <= limit) exit
      for (i = start + 1; i < end_; i++) if (line[i] ~ /^[0-9]+\./) {
        if (end_ - i <= keep_max) exit
        print "list", i, end_ - keep_max - 1, 0
        exit
      }
      for (i = start + 1; i < end_ - 1; i++) if (trimmed[i] ~ /^\|/ && trimmed[i + 1] ~ /^\|[ \t:|-]+$/) {
        body = i + 2; stop = body
        while (stop < end_ && trimmed[stop] ~ /^\|/) stop++
        rows = stop - body
        keep = limit - (size - rows); if (keep < 0) keep = 0; if (keep > keep_max) keep = keep_max
        if (rows <= keep) exit
        print "table", body, stop - keep - 1, i
        exit
      }
    }' "$file")
  [ -n "$plan" ] || return 0
  local shape first last header
  read -r shape first last header <<< "$plan"

  {
    echo "## Archived on $(timestamp)"; echo
    if [ "$shape" = "table" ]; then sed -n "${header},$((header + 1))p" "$file"; fi
    sed -n "${first},${last}p" "$file"
    echo; echo "---"; echo
  } >> "$archive"
  { sed -n "1,$((first - 1))p" "$file"; sed -n "$((last + 1)),\$p" "$file"; } > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "Moved $((last - first + 1)) entries from $file -> $archive"
}

archive_prompts
archive_tasks
```

After running it:
1. Report what the script moved (file, line/entry count, archive destination) using its own output — do not recompute or second-guess the numbers.
2. If nothing exceeded the threshold, say so plainly: "Nothing to archive."
3. IDs are preserved automatically since content is moved verbatim into the archive file, never rewritten or renumbered.

This mirrors CLI `specpilot archive --dry-run --force` (REQ-002.A.8); the branch guard mirrors ARCH-004.19 (warns and requires `y` confirmation when not on `main`/`master`).