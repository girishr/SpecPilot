---
mode: agent
description: Validate .specs/ structure, front-matter, and cross-references; suggest fixes without auto-applying
---

Validate the project's `.specs/` files. Run the script below, then summarize the results in plain language.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

REQUIRED_FILES=(
  ".specs/project/project.yaml"
  ".specs/architecture/architecture.md"
  ".specs/project/requirements.md"
  ".specs/architecture/api.yaml"
  ".specs/quality/tests.md"
  ".specs/planning/tasks.md"
  ".specs/development/context.md"
  ".specs/development/prompts.md"
  ".specs/security/threat-model.md"
  ".specs/security/security-decisions.md"
)

echo "== Missing required files =="
missing=0
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; missing=1; fi
done
[ "$missing" -eq 0 ] && echo "none"

echo
echo "== Front-matter field checks (fileID, lastUpdated, version, contributors, relatedFiles) =="
clean=1
for f in "${REQUIRED_FILES[@]}"; do
  [[ "$f" == *.md ]] || continue
  [ -f "$f" ] || continue
  fm=$(sed -n '2,/^---$/p' "$f")
  for field in fileID lastUpdated version contributors relatedFiles; do
    if ! echo "$fm" | grep -q "^${field}:"; then
      echo "MISSING $field in $f"
      clean=0
    fi
  done
done
[ "$clean" -eq 1 ] && echo "all fields present"

echo
echo "== relatedFiles cross-reference check =="
clean=1
for f in "${REQUIRED_FILES[@]}"; do
  [[ "$f" == *.md ]] || continue
  [ -f "$f" ] || continue
  refs=$(sed -n '2,/^---$/p' "$f" | sed -n '/^relatedFiles:/,/^[a-zA-Z]/p' | grep -oE '[A-Za-z0-9_.-]+\.(md|yaml)')
  for ref in $refs; do
    if ! find .specs -name "$ref" | grep -q .; then
      echo "BROKEN REF in $f -> $ref (not found anywhere under .specs/)"
      clean=0
    fi
  done
done
[ "$clean" -eq 1 ] && echo "all cross-references resolve"
```

Never eyeball line counts or fingerprints by hand where this script already computes them exactly.

After running it:
1. Summarize each of the three sections in plain language (what's missing, what's wrong, what's broken).
2. For every issue found, suggest a specific fix — but never apply it automatically. Wait for the user to ask before editing any file.
3. If everything passes, say so plainly; do not manufacture issues.

**Known platform limitation**: GitHub Copilot only executes terminal commands in "agent mode." Outside agent mode, this command degrades to prose-only — read the files yourself and reason about the same three checks without the script, which carries a higher error rate than the scripted version.