---
description: Append missing mandate sections (Critical Mandates, Code Philosophy, Code Rules, Re-Anchor) to existing IDE files
allowed-tools: Bash, Read, Edit
---

Backfill missing SpecPilot mandate sections into whichever IDE files already exist in this project. Run the script below — it checks four fingerprints per file and appends whichever are missing, append-only, never overwriting existing content.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

CANDIDATE_FILES=(
  ".github/copilot-instructions.md"
  "CLAUDE.md"
  ".cursor/rules/specpilot.mdc"
  ".windsurfrules"
  ".antigravity/rules.md"
)

has_critical() { grep -qF "Critical Mandates" "$1"; }
has_philosophy() { grep -qF "## Code Philosophy — Write Only What Needed" "$1"; }
has_rules() { grep -qF "## Code Rules" "$1"; }
has_reanchor() { grep -qF "## Re-Anchor" "$1"; }

append_critical() {
  cat <<'BLOCK' >> "$1"

## 🔴 Critical Mandates — Never violate, no exceptions

1. No commit unless asked.
2. No push unless asked.
3. No deploy/publish/release unless asked.
4. No `.specs/` structure changes — content only.
5. Update specs after change:
   - Trivial → `planning/tasks.md`
   - Feature → `project/requirements.md` + `planning/tasks.md`
   - Architectural → all affected files + `CHANGELOG.md`
6. Never reference file contents without reading first. If unread, say so.
7. Never write code or change files unless asked. Ask first.
8. Spec-first gate (scale to task size):
   - Trivial → no gate
   - Feature → read 1–2 relevant `.specs/` files before coding
   - Architectural → update all affected specs, present Spec Report, wait for `yes, proceed`
BLOCK
}

append_philosophy() {
  cat <<'BLOCK' >> "$1"

## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.
BLOCK
}

append_rules() {
  cat <<'BLOCK' >> "$1"

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.
BLOCK
}

append_reanchor() {
  cat <<'BLOCK' >> "$1"

## Re-Anchor

If you lose context mid-session, read `.specs/project/project.yaml` to restore full project context.
For a ready-made re-anchor prompt, see `.specs/development/prompts.md → ## Re-Anchor Prompt`.
BLOCK
}

for f in "${CANDIDATE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "SKIPPED (not found): $f"
    continue
  fi

  added=()
  has_critical "$f" || { append_critical "$f"; added+=("Critical Mandates"); }
  has_philosophy "$f" || { append_philosophy "$f"; added+=("Code Philosophy"); }
  has_rules "$f" || { append_rules "$f"; added+=("Code Rules"); }
  has_reanchor "$f" || { append_reanchor "$f"; added+=("Re-Anchor"); }

  if [ ${#added[@]} -eq 0 ]; then
    echo "ALREADY CURRENT: $f"
  else
    echo "UPDATED: $f (added: ${added[*]})"
  fi
done

echo
echo "== team.devPrefix check =="
YAML=".specs/project/project.yaml"
if [ -f "$YAML" ] && ! grep -q "devPrefix:" "$YAML"; then
  echo "MISSING: team.devPrefix in $YAML — ask the user for a short handle (e.g. GitHub username) and add it under a team: section."
fi
```

After running it:
1. Report per file: updated (with which sections were added), already-current, or skipped (file not found).
2. If the devPrefix check printed a missing-handle line, ask the user for a short handle (their GitHub/GitLab/Bitbucket username or any short tag) and add it under a `team:` section in `project.yaml` yourself — the script only detects the gap, it does not prompt interactively.
3. Never overwrite existing content in any file; every append goes to the end of the file.

**Maintenance cost**: unlike the CLI's `specBackfiller.ts`, this command has no shared source-of-truth constant to import — its four fingerprint blocks above are a literal copy and must be manually kept in sync whenever `CLAUDE.md`/`copilot-instructions.md` generation changes (`buildCriticalMandatesMarkdown()`, `buildCodePhilosophyMarkdown()` in `ideConfigGenerator.ts`). If this command's output ever looks stale, check those functions first.