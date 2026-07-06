import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

/** A single slash/workflow command, defined once and rendered per IDE. */
export interface SlashCommand {
  name: string;
  description: string;
  body: string;
  argumentHint?: string;
  allowedTools?: string[];
}

/**
 * Commands to generate. Populated one command at a time by CS-080 through
 * CS-087.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'status',
    description: 'Show current sprint status and next milestone at a glance',
    body: `Give a one-screen status summary of the current sprint.

1. Read \`.specs/planning/tasks.md\` and extract the \`## Current Sprint\` section — list each item's ID and a short (<15 word) restatement.
2. Read \`.specs/planning/roadmap.md\` and find the \`## Milestones\` section — identify the next incomplete milestone.
3. Present a compact summary with two headings:
   - **Current Sprint**: bullet list of \`[CS-###] [BL-###]\` items with their short restatement.
   - **Next Milestone**: the next unchecked milestone from roadmap.md.

Keep it to one screen — do not re-print full task descriptions, just IDs and short summaries.`,
  },
  {
    name: 'reanchor',
    description: 'Restore full project context after losing it mid-session',
    body: `Restore operating context for this project.

1. Read \`.specs/project/project.yaml\` in full.
2. Read the \`## Re-Anchor Prompt\` section of \`.specs/development/prompts.md\` verbatim.
3. Restate both as your current operating context for the rest of this session — project identity, stack, rules, and the Re-Anchor Prompt's guidance.

Do not summarize or paraphrase away detail; this command exists specifically to recover full context, not an abbreviated version of it.`,
  },
  {
    name: 'report',
    description: 'Run the Spec-First review gate: classify the change, update specs, then wait for confirmation before coding',
    body: `Formalize the Spec-First review gate (mandate 8) for the pending change.

1. Classify the pending change as trivial, feature, or architectural:
   - Trivial: no spec update required.
   - Feature: touches \`project/requirements.md\` and \`planning/tasks.md\`.
   - Architectural: touches all affected spec files plus \`CHANGELOG.md\`.
2. Read the relevant \`.specs/\` files per the Context routing table (session start → \`project/project.yaml\`; feature/bug → + \`project/requirements.md\`, \`planning/tasks.md\`; architecture → + \`architecture/architecture.md\`; tests → + \`quality/tests.md\`; security → + \`security/threat-model.md\`, \`security/security-decisions.md\`; planning → + \`planning/tasks.md\`, \`planning/roadmap.md\`).
3. Update the affected spec files first — before writing any code.
4. Present a Spec Report: classification, files touched, what changed in each, and what the specs now say.
5. Wait for the user's literal \`yes, proceed\` before writing or editing any code or non-spec file. An ambiguous "ok" or "sure" is not sufficient for an architectural-tier change — ask for the explicit phrase if it wasn't given.`,
  },
  {
    name: 'sync',
    description: 'Compare .specs/ against actual project state and propose fixes for drift',
    body: `Find and fix drift between \`.specs/\` and the real project.

1. Read \`.specs/architecture/architecture.md\`, \`.specs/project/requirements.md\`, and \`.specs/quality/tests.md\`.
2. Compare their claims against the actual \`src/\` structure and \`package.json\` (versions, dependencies, scripts).
3. List concrete discrepancies: stale version numbers, renamed or removed files/modules still referenced, undocumented modules that exist in \`src/\` but aren't mentioned in the specs, stale command or test-suite lists.
4. Propose specific per-file edits to close each discrepancy — do not just describe the problem, show the fix.
5. Wait for the user's confirmation before writing any of the proposed edits.

This is a judgment/comparison task, not a mechanical one — do not attempt to script the diff; read and reason about each file.`,
  },
  {
    name: 'refine',
    description: 'Refine .specs/ requirements from a new requirement description, with a diff preview before writing',
    argumentHint: '<description>',
    body: `Refine the project's spec files with a new requirement.

Requirement description: $ARGUMENTS

1. Read the current \`.specs/project/requirements.md\`, \`.specs/development/context.md\`, and \`.specs/development/prompts.md\`.
2. Propose specific additions or edits to those files that incorporate the requirement description above, following the existing stable-ID conventions (e.g. \`REQ-###.#\`).
3. Show a line-level diff preview of every proposed change — do not just describe it.
4. Wait for the user's confirmation before writing anything.
5. Once confirmed, write the changes.

This mirrors the CLI's \`specpilot refine\` (REQ-002.A.6) as a standalone agent workflow — it has no dependency on the CLI being installed.`,
  },
  {
    name: 'validate',
    description: 'Validate .specs/ structure, front-matter, and cross-references; suggest fixes without auto-applying',
    allowedTools: ['Bash', 'Read'],
    body: `Validate the project's \`.specs/\` files. Run the script below, then summarize the results in plain language.

\`\`\`bash
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
for f in "\${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; missing=1; fi
done
[ "$missing" -eq 0 ] && echo "none"

echo
echo "== Front-matter field checks (fileID, lastUpdated, version, contributors, relatedFiles) =="
clean=1
for f in "\${REQUIRED_FILES[@]}"; do
  [[ "$f" == *.md ]] || continue
  [ -f "$f" ] || continue
  fm=$(sed -n '2,/^---$/p' "$f")
  for field in fileID lastUpdated version contributors relatedFiles; do
    if ! echo "$fm" | grep -q "^\${field}:"; then
      echo "MISSING $field in $f"
      clean=0
    fi
  done
done
[ "$clean" -eq 1 ] && echo "all fields present"

echo
echo "== relatedFiles cross-reference check =="
clean=1
for f in "\${REQUIRED_FILES[@]}"; do
  [[ "$f" == *.md ]] || continue
  [ -f "$f" ] || continue
  refs=$(sed -n '2,/^---$/p' "$f" | sed -n '/^relatedFiles:/,/^[a-zA-Z]/p' | grep -oE '[A-Za-z0-9_.-]+\\.(md|yaml)')
  for ref in $refs; do
    if ! find .specs -name "$ref" | grep -q .; then
      echo "BROKEN REF in $f -> $ref (not found anywhere under .specs/)"
      clean=0
    fi
  done
done
[ "$clean" -eq 1 ] && echo "all cross-references resolve"
\`\`\`

Never eyeball line counts or fingerprints by hand where this script already computes them exactly.

After running it:
1. Summarize each of the three sections in plain language (what's missing, what's wrong, what's broken).
2. For every issue found, suggest a specific fix — but never apply it automatically. Wait for the user to ask before editing any file.
3. If everything passes, say so plainly; do not manufacture issues.

**Known platform limitation**: GitHub Copilot only executes terminal commands in "agent mode." Outside agent mode, this command degrades to prose-only — read the files yourself and reason about the same three checks without the script, which carries a higher error rate than the scripted version.`,
  },
  {
    name: 'archive',
    description: 'Archive oversized .specs/ files (tasks.md Completed section, prompts.md) with a branch safety guard',
    allowedTools: ['Bash', 'Read', 'Edit'],
    body: `Archive oversized \`.specs/\` files: \`.specs/planning/tasks.md\`'s \`## Completed\` section beyond 25 lines, and \`.specs/development/prompts.md\` beyond 100 total lines.

Run the script below — it computes thresholds and moves lines deterministically. Do not hand-count lines or decide what to move yourself; the script's arithmetic is the source of truth.

\`\`\`bash
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

  local preamble_end=0
  if [ "$(sed -n '1p' "$file")" = "---" ]; then
    preamble_end=$(awk 'NR>1 && $0=="---" {print NR; exit}' "$file")
  fi
  local body_start=$((preamble_end + 1))
  local body_lines=$((total - preamble_end))
  local keep=$((PROMPTS_KEEP_LINES - preamble_end))
  if [ "$keep" -lt 50 ]; then keep=50; fi
  if [ "$body_lines" -le "$keep" ]; then return 0; fi

  local archive_count=$((body_lines - keep))
  local archive_end=$((body_start + archive_count - 1))

  { echo "## Archived on $(timestamp)"; echo; sed -n "\${body_start},\${archive_end}p" "$file"; echo; echo "---"; echo; } >> "$archive"
  { sed -n "1,\${preamble_end}p" "$file"; sed -n "$((archive_end + 1)),\\$p" "$file"; } > "$file.tmp"
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
  while [ "$entry_start" -le "$total" ] && ! sed -n "\${entry_start}p" "$file" | grep -qE '^[0-9]+\\.'; do
    entry_start=$((entry_start + 1))
  done
  if [ "$entry_start" -gt "$total" ]; then return 0; fi

  local entry_count=$((total - entry_start + 1))
  if [ "$entry_count" -le "$COMPLETED_KEEP_ENTRIES" ]; then return 0; fi

  local archive_count=$((entry_count - COMPLETED_KEEP_ENTRIES))
  local archive_end=$((entry_start + archive_count - 1))

  { echo "## Archived on $(timestamp)"; echo; sed -n "\${entry_start},\${archive_end}p" "$file"; echo; echo "---"; echo; } >> "$archive"
  { sed -n "1,$((entry_start - 1))p" "$file"; sed -n "$((archive_end + 1)),\\$p" "$file"; } > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "Moved $archive_count entries from $file -> $archive"
}

archive_prompts
archive_tasks
\`\`\`

After running it:
1. Report what the script moved (file, line/entry count, archive destination) using its own output — do not recompute or second-guess the numbers.
2. If nothing exceeded the threshold, say so plainly: "Nothing to archive."
3. IDs are preserved automatically since content is moved verbatim into the archive file, never rewritten or renumbered.

This mirrors CLI \`specpilot archive --dry-run --force\` (REQ-002.A.8); the branch guard mirrors ARCH-004.19 (warns and requires \`y\` confirmation when not on \`main\`/\`master\`).`,
  },
  {
    name: 'backfill',
    description: 'Append missing mandate sections (Critical Mandates, Code Philosophy, Code Rules, Re-Anchor) to existing IDE files',
    allowedTools: ['Bash', 'Read', 'Edit'],
    body: `Backfill missing SpecPilot mandate sections into whichever IDE files already exist in this project. Run the script below — it checks four fingerprints per file and appends whichever are missing, append-only, never overwriting existing content.

\`\`\`bash
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
4. No \`.specs/\` structure changes — content only.
5. Update specs after change:
   - Trivial → \`planning/tasks.md\`
   - Feature → \`project/requirements.md\` + \`planning/tasks.md\`
   - Architectural → all affected files + \`CHANGELOG.md\`
6. Never reference file contents without reading first. If unread, say so.
7. Never write code or change files unless asked. Ask first.
8. Spec-first gate (scale to task size):
   - Trivial → no gate
   - Feature → read 1–2 relevant \`.specs/\` files before coding
   - Architectural → update all affected specs, present Spec Report, wait for \`yes, proceed\`
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

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.
For a ready-made re-anchor prompt, see \`.specs/development/prompts.md → ## Re-Anchor Prompt\`.
BLOCK
}

for f in "\${CANDIDATE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "SKIPPED (not found): $f"
    continue
  fi

  added=()
  has_critical "$f" || { append_critical "$f"; added+=("Critical Mandates"); }
  has_philosophy "$f" || { append_philosophy "$f"; added+=("Code Philosophy"); }
  has_rules "$f" || { append_rules "$f"; added+=("Code Rules"); }
  has_reanchor "$f" || { append_reanchor "$f"; added+=("Re-Anchor"); }

  if [ \${#added[@]} -eq 0 ]; then
    echo "ALREADY CURRENT: $f"
  else
    echo "UPDATED: $f (added: \${added[*]})"
  fi
done

echo
echo "== team.devPrefix check =="
YAML=".specs/project/project.yaml"
if [ -f "$YAML" ] && ! grep -q "devPrefix:" "$YAML"; then
  echo "MISSING: team.devPrefix in $YAML — ask the user for a short handle (e.g. GitHub username) and add it under a team: section."
fi
\`\`\`

After running it:
1. Report per file: updated (with which sections were added), already-current, or skipped (file not found).
2. If the devPrefix check printed a missing-handle line, ask the user for a short handle (their GitHub/GitLab/Bitbucket username or any short tag) and add it under a \`team:\` section in \`project.yaml\` yourself — the script only detects the gap, it does not prompt interactively.
3. Never overwrite existing content in any file; every append goes to the end of the file.

**Maintenance cost**: unlike the CLI's \`specBackfiller.ts\`, this command has no shared source-of-truth constant to import — its four fingerprint blocks above are a literal copy and must be manually kept in sync whenever \`CLAUDE.md\`/\`copilot-instructions.md\` generation changes (\`buildCriticalMandatesMarkdown()\`, \`buildCodePhilosophyMarkdown()\` in \`ideConfigGenerator.ts\`). If this command's output ever looks stale, check those functions first.`,
  },
];

/**
 * Generates per-IDE slash/workflow command files from SLASH_COMMANDS.
 * Parallel to IdeConfigGenerator — each IDE gets its own directory, file
 * naming, and frontmatter format for the same shared command definitions.
 */
export class SlashCommandGenerator {
  generate(projectDir: string, ide: string, commands: SlashCommand[] = SLASH_COMMANDS): void {
    if (commands.length === 0) return;

    const key = ide.toLowerCase();
    for (const command of commands) {
      const target = this.resolveTarget(key, command);
      this.write(projectDir, target.dir, target.fileName, target.content);
    }

    if (key === 'codex') {
      console.log(
        '⚠️  SpecPilot slash commands were written to .codex/prompts/ for reference.\n' +
        '   Codex only auto-discovers prompts from ~/.codex/prompts/ — copy them there manually:\n' +
        '   cp .codex/prompts/specpilot-*.md ~/.codex/prompts/',
      );
    }
  }

  /**
   * Writes only the command files missing on disk for the given IDE —
   * used by `specpilot backfill` for existing projects. Never overwrites.
   * Returns the names of the commands that were (or, in dry-run, would be) added.
   */
  backfillMissing(
    projectDir: string,
    ide: string,
    dryRun: boolean,
    commands: SlashCommand[] = SLASH_COMMANDS,
  ): string[] {
    const key = ide.toLowerCase();
    const added: string[] = [];
    for (const command of commands) {
      const target = this.resolveTarget(key, command);
      const filePath = join(projectDir, ...target.dir.split('/'), target.fileName);
      if (existsSync(filePath)) continue;
      added.push(command.name);
      if (!dryRun) {
        this.write(projectDir, target.dir, target.fileName, target.content);
      }
    }
    return added;
  }

  private resolveTarget(ide: string, command: SlashCommand): { dir: string; fileName: string; content: string } {
    switch (ide) {
      case 'claude-code':
        return { dir: '.claude/commands', fileName: `specpilot-${command.name}.md`, content: this.claudeFrontmatter(command) + command.body };
      case 'cursor':
        return { dir: '.cursor/commands', fileName: `specpilot-${command.name}.md`, content: this.simpleFrontmatter(command) + command.body };
      case 'windsurf':
        return { dir: '.windsurf/workflows', fileName: `specpilot-${command.name}.md`, content: this.simpleFrontmatter(command) + command.body };
      case 'antigravity':
        return { dir: '.agent/workflows', fileName: `specpilot-${command.name}.md`, content: this.simpleFrontmatter(command) + command.body };
      case 'codex':
        return { dir: '.codex/prompts', fileName: `specpilot-${command.name}.md`, content: this.simpleFrontmatter(command) + command.body };
      default:
        // vscode and unknown IDEs → GitHub Copilot prompt files
        return { dir: '.github/prompts', fileName: `specpilot-${command.name}.prompt.md`, content: this.copilotFrontmatter(command) + command.body };
    }
  }

  private write(projectDir: string, dir: string, fileName: string, content: string): void {
    const fullDir = join(projectDir, ...dir.split('/'));
    mkdirSync(fullDir, { recursive: true });
    writeFileSync(join(fullDir, fileName), content);
  }

  private claudeFrontmatter(command: SlashCommand): string {
    const lines = [`description: ${command.description}`];
    if (command.argumentHint) lines.push(`argument-hint: ${command.argumentHint}`);
    if (command.allowedTools) lines.push(`allowed-tools: ${command.allowedTools.join(', ')}`);
    return `---\n${lines.join('\n')}\n---\n\n`;
  }

  private simpleFrontmatter(command: SlashCommand): string {
    return `---\ndescription: ${command.description}\n---\n\n`;
  }

  private copilotFrontmatter(command: SlashCommand): string {
    return `---\nmode: agent\ndescription: ${command.description}\n---\n\n`;
  }
}
