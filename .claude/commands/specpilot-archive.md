---
description: Archive oversized .specs/ files (tasks.md Completed section, prompts.md) with a branch safety guard
allowed-tools: Bash, Read, Edit
---

Archive oversized `.specs/` files: `.specs/planning/tasks.md`'s `## Completed` section beyond 40 lines, and `.specs/development/prompts.md` beyond 100 total lines.

Run the script below — it computes thresholds and moves lines deterministically. Do not hand-count lines or decide what to move yourself; the script's arithmetic is the source of truth.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PROMPTS_LINE_LIMIT=100
PROMPTS_KEEP_LINES=80
COMPLETED_LINE_LIMIT=40
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

  # Mirrors the CLI's planPromptsArchive() line for line. The log is the list under
  # "## Latest Entries", else the table under "## Prompt History". Each entry's date is the
  # last "Month D, YYYY", "Mon. D, YYYY" or "YYYY-MM-DD" in it (a table row: its Date cell).
  # All dated entries must run one way; the oldest whole entries then move until the file
  # is within PROMPTS_KEEP_LINES, keeping at least one. Line counts use the CLI's arithmetic
  # (wc -l + 1). Prints "MOVE <first> <last> <header>" (1-based lines; header 0 for a list),
  # "REFUSE <reason>", or nothing.
  local plan
  plan=$(LC_ALL=C awk -v total="$(wc -l < "$file")" -v limit="$PROMPTS_LINE_LIMIT" -v keep="$PROMPTS_KEEP_LINES" '
    function trim(s) { sub(/^[ \t\r]+/, "", s); sub(/[ \t\r]+$/, "", s); return s }
    function word(c) { return c ~ /[A-Za-z0-9_]/ }
    function iso(k) { return sprintf("%04d-%02d-%02d", int(k / 10000), int(k / 100) % 100, k % 100) }
    function lastdate(s,   key, pos, a, b, t, p, m, y, mo, d) {
      key = 0; pos = 0
      while (match(substr(s, pos + 1), /(January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.? [0-9][0-9]?, [0-9][0-9][0-9][0-9]|[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/)) {
        a = pos + RSTART; b = a + RLENGTH; t = substr(s, a, RLENGTH)
        # a > 1 guard: on macOS awk substr(s, 0, 1) returns the first character, not ""
        if ((a > 1 && word(substr(s, a - 1, 1))) || word(substr(s, b, 1))) { pos = a; continue }
        if (t ~ /^[0-9]/) { y = substr(t, 1, 4) + 0; mo = substr(t, 6, 2) + 0; d = substr(t, 9, 2) + 0 }
        else { split(t, p, " "); m = p[1]; sub(/\.$/, "", m); mo = MON[tolower(m)]; d = p[2] + 0; y = p[3] + 0 }
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) key = y * 10000 + mo * 100 + d
        pos = b - 1
      }
      return key
    }
    function excerpt(s,   t, i, c, n, out) {
      t = trim(s); n = 0; out = ""
      for (i = 1; i <= length(t); i++) {
        c = substr(t, i, 1)
        if (ORD[c] < 128 || ORD[c] >= 192) n++
        if (n > 60) return "\"" out "…\""
        out = out c
      }
      return "\"" t "\""
    }
    BEGIN {
      split("january jan february feb march mar april apr may june jun july jul august aug september sept sep october oct november nov december dec", nm, " ")
      split("1 1 2 2 3 3 4 4 5 6 6 7 7 8 8 9 9 9 10 10 11 11 12 12", nv, " ")
      for (i = 1; i <= 24; i++) MON[nm[i]] = nv[i] + 0
      for (i = 1; i < 256; i++) ORD[sprintf("%c", i)] = i
    }
    { line[NR] = $0; tl[NR] = trim($0) }
    END {
      L = total + 1
      if (L <= limit) exit
      n = 0; hdr = 0; s = 0
      for (i = 1; i <= NR; i++) if (index(tl[i], "## Latest Entries") == 1) { s = i; break }
      if (s) {
        e = L + 1; for (i = s + 1; i <= NR; i++) if (tl[i] ~ /^## /) { e = i; break }
        cur = 0
        for (i = s + 1; i < e && i <= NR; i++) {
          if (line[i] ~ /^[-*+] /) { n++; st[n] = i; en[n] = i; cur = 1 }
          else if (cur && line[i] ~ /^[ \t\r]+[^ \t\r]/) en[n] = i
          else cur = 0
        }
        for (k = 1; k <= n; k++) { txt = line[st[k]]; for (i = st[k] + 1; i <= en[k]; i++) txt = txt "\n" line[i]; dt[k] = lastdate(txt) }
      } else {
        for (i = 1; i <= NR; i++) if (index(tl[i], "## Prompt History") == 1) { s = i; break }
        if (!s) { print "REFUSE development/prompts.md has no \"## Latest Entries\" list or \"## Prompt History\" table, so there is nothing SpecPilot can archive safely."; exit }
        e = L + 1; for (i = s + 1; i <= NR; i++) if (tl[i] ~ /^## /) { e = i; break }
        for (i = s + 1; i < e - 1 && i < NR; i++) if (tl[i] ~ /^\|/ && tl[i + 1] ~ /^\|[ \t:|-]+$/) { hdr = i; break }
        if (hdr) {
          col = 0; h = tl[hdr]; sub(/^\|/, "", h); sub(/\|$/, "", h); m = split(h, hc, "|")
          for (j = 1; j <= m; j++) if (tolower(trim(hc[j])) == "date") { col = j; break }
          for (i = hdr + 2; i < e && i <= NR && tl[i] ~ /^\|/; i++) {
            n++; st[n] = i; en[n] = i
            if (col) { r = tl[i]; sub(/^\|/, "", r); sub(/\|$/, "", r); split(r, rc, "|"); dt[n] = lastdate(trim(rc[col])) }
            else dt[n] = lastdate(line[i])
          }
        }
      }
      if (n < 2) exit
      dir = 0; ps = 0; pd = 0
      for (k = 1; k <= n; k++) {
        if (!dt[k]) continue
        if (ps && dt[k] != pd) {
          step = dt[k] > pd ? 1 : -1
          if (!dir) dir = step
          else if (step != dir) {
            print "REFUSE SpecPilot cannot tell which development/prompts.md entries are oldest, because their dates run both ways: " excerpt(line[ps]) " (" iso(pd) ") comes right before " excerpt(line[st[k]]) " (" iso(dt[k]) ") in a log that otherwise runs " (dir < 0 ? "newest first" : "oldest first") ". Put those entries in order and run it again."
            exit
          }
        }
        ps = st[k]; pd = dt[k]
      }
      if (!dir) { print "REFUSE SpecPilot cannot tell which development/prompts.md entries are oldest: fewer than two entries carry different dates."; exit }
      for (k = 1; k < n; k++) {
        if (dir < 0) { a = st[n - k + 1]; b = en[n] } else { a = st[1]; b = en[k] }
        if (L - (b - a + 1) <= keep) break
      }
      print "MOVE", a, b, hdr
    }' "$file")
  [ -n "$plan" ] || return 0
  case "$plan" in
    REFUSE\ *) echo "Not archived: ${plan#REFUSE }"; return 0 ;;
  esac
  local kind first last header
  read -r kind first last header <<< "$plan"

  # A file with no line break after its last line, whose moved block reaches that line: the
  # CLI joins lines with "\n", so the block still ends with a blank line in the archive and the
  # kept file ends, still without a line break, at the line before the block.
  local at_end=0
  if [ -n "$(tail -c 1 "$file")" ] && [ "$last" -eq $(( $(wc -l < "$file") + 1 )) ]; then at_end=1; fi
  {
    echo "## Archived on $(timestamp)"; echo
    if [ "$header" -gt 0 ]; then sed -n "${header},$((header + 1))p" "$file"; fi
    sed -n "${first},${last}p" "$file"
    if [ "$at_end" = 1 ]; then echo; fi
    echo; echo "---"; echo
  } >> "$archive"
  if [ "$at_end" = 1 ]; then
    awk -v n=$((first - 1)) 'NR <= n { printf "%s%s", (NR > 1 ? "\n" : ""), $0 }' "$file" > "$file.tmp"
  else
    { sed -n "1,$((first - 1))p" "$file"; sed -n "$((last + 1)),\$p" "$file"; } > "$file.tmp"
  fi
  mv "$file.tmp" "$file"
  echo "Moved $((last - first + 1)) lines from $file -> $archive"
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