import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import { IdeConfigGenerator } from './ideConfigGenerator';
import { TemplateContext } from './templateEngine';

/**
 * Fingerprint + YAML line for each critical mandate.
 * Fingerprint: unique substring that identifies this mandate in any file.
 * yamlText:    the exact YAML list-item line to insert into project.yaml.
 * mdText:      the markdown numbered list item for copilot-instructions.md.
 * label:       short human-readable name shown in backfill output.
 */
const YAML_MANDATES: { fingerprint: string; yamlText: string; label: string }[] = [
  {
    fingerprint: 'Never commit code to git',
    label: 'Never commit',
    yamlText: '    - "MANDATE: Never commit code to git unless prompted by the developer. Always ask first."',
  },
  {
    fingerprint: 'Never push to git',
    label: 'Never push',
    yamlText: '    - "MANDATE: Never push to git unless prompted by the developer. Always ask first."',
  },
  {
    fingerprint: 'Never deploy, publish, or release',
    label: 'Never deploy / publish / release',
    yamlText: '    - "MANDATE: Never deploy, publish, or release the project unless prompted by the developer. Always ask first."',
  },
  {
    fingerprint: 'Never modify the .specs/ folder',
    label: 'Never modify .specs/ structure',
    yamlText: '    - "MANDATE: Never modify the .specs/ folder structure, subfolder names, or file names. Only update file contents."',
  },
  {
    fingerprint: 'After every code change',
    label: 'Always update .specs/ after changes',
    yamlText:
      '    - "MANDATE: After every code change, addition, or removal — proactively update all affected .specs/ files without being asked: architecture.md for structural changes, requirements.md for feature changes, tests.md for test changes, tasks.md for task status, and CHANGELOG.md for completed work."',
  },
  {
    fingerprint: 'Never describe, quote, or reference file contents',
    label: 'Never describe without reading first',
    yamlText:
      '    - "MANDATE: Never describe, quote, or reference file contents without first reading the file via a tool call in this session. If the file has not been read, say so explicitly before answering."',
  },
  {
    fingerprint: 'Never implement, write code',
    label: 'Never implement unless explicitly asked',
    yamlText:
      '    - "MANDATE: Never implement, write code, or make file changes unless the developer explicitly asks. If the next step seems obvious, ask first — do not assume."',
  },
  {
    fingerprint: 'Spec-First review gate',
    label: 'Spec-First review gate',
    yamlText:
      '    - "MANDATE: Spec-First review gate — before touching any code or non-spec files, read all relevant .specs/ files, update all affected spec files first (requirements.md, architecture.md, tasks.md, CHANGELOG.md), present a Spec Report summarizing what changed, which files were affected, and what the specs now say, then wait for the developer\'s explicit \'yes, proceed\' before writing code. If the developer declines, revert the spec changes and stop."',
  },
];

const MD_MANDATES: { fingerprint: string; mdText: string; label: string }[] = [
  {
    fingerprint: 'NEVER commit',
    label: 'Never commit',
    mdText: '1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.',
  },
  {
    fingerprint: 'NEVER push',
    label: 'Never push',
    mdText: '2. **NEVER push** to git unless the developer explicitly asks. Always ask first.',
  },
  {
    fingerprint: 'NEVER deploy, publish, or release',
    label: 'Never deploy / publish / release',
    mdText: '3. **NEVER deploy, publish, or release** the project unless the developer explicitly asks. Always ask first.',
  },
  {
    fingerprint: 'NEVER modify',
    label: 'Never modify .specs/ structure',
    mdText: '4. **NEVER modify** the `.specs/` folder structure, subfolder names, or file names. Only update file contents.',
  },
  {
    fingerprint: 'ALWAYS update',
    label: 'Always update .specs/ after changes',
    mdText:
      '5. **ALWAYS update** affected `.specs/` files after every code change — without being asked:\n   - Structural changes → `architecture/architecture.md`\n   - Feature changes → `project/requirements.md`\n   - Test changes → `quality/tests.md`\n   - Task status → `planning/tasks.md`\n   - Completed work → `CHANGELOG.md`',
  },
  {
    fingerprint: 'NEVER describe, quote, or reference file contents',
    label: 'Never describe without reading first',
    mdText:
      '6. **NEVER describe, quote, or reference file contents** without first reading the file via a tool call in this session. If you have not read the file yet, say so explicitly before answering.',
  },
  {
    fingerprint: 'NEVER implement, write code, or make file changes',
    label: 'Never implement unless explicitly asked',
    mdText:
      '7. **NEVER implement, write code, or make file changes** unless the developer explicitly asks. If the next step seems obvious, ask first — do not assume.',
  },
  {
    fingerprint: 'SPEC-FIRST review gate',
    label: 'Spec-First review gate',
    mdText:
      '8. **SPEC-FIRST review gate**: Before touching any code or non-spec files, read all relevant `.specs/` files, update all affected spec files first, present a **Spec Report** summarizing what changed, which files were affected, and what the specs now say, then wait for the developer\'s explicit `yes, proceed` before writing code. If the developer declines, revert the spec changes and stop.',
  },
];

export interface BackfillFileResult {
  action: 'updated' | 'created' | 'skipped' | 'missing';
  found: number;
  total: number;
  added: string[];
  reason?: string;
}

export interface BackfillResult {
  projectYaml: BackfillFileResult;
  copilotInstructions: BackfillFileResult;
  tasksMd: BackfillFileResult;
}

export class SpecBackfiller {
  async backfill(
    projectDir: string,
    specsName: string,
    dryRun: boolean,
    noPrompts: boolean = false,
  ): Promise<BackfillResult> {
    const specsDir = join(projectDir, specsName);

    if (!existsSync(specsDir)) {
      throw new Error(
        `No ${specsName}/ folder found in ${projectDir}.\n` +
          `Run \`specpilot init\` to create a new project or \`specpilot add-specs\` to add specs to an existing project.`,
      );
    }

    // Ensure team.devPrefix exists before patching tasks.md
    await this.ensureDevPrefix(specsDir, dryRun, noPrompts);

    const yamlResult = this.backfillProjectYaml(specsDir, dryRun);
    const copilotResult = await this.backfillCopilotInstructions(projectDir, specsDir, dryRun);
    const tasksResult = this.backfillTasksMd(specsDir, dryRun);

    return { projectYaml: yamlResult, copilotInstructions: copilotResult, tasksMd: tasksResult };
  }

  // ---------------------------------------------------------------------------
  // project.yaml
  // ---------------------------------------------------------------------------

  private backfillProjectYaml(specsDir: string, dryRun: boolean): BackfillFileResult {
    const filePath = join(specsDir, 'project', 'project.yaml');

    if (!existsSync(filePath)) {
      return {
        action: 'missing',
        found: 0,
        total: YAML_MANDATES.length,
        added: [],
        reason: 'file not found — run `specpilot init` or `specpilot add-specs` first',
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const missing = YAML_MANDATES.filter((m) => !content.includes(m.fingerprint));

    if (missing.length === 0) {
      return { action: 'skipped', found: YAML_MANDATES.length, total: YAML_MANDATES.length, added: [] };
    }

    if (!dryRun) {
      const newContent = this.insertYamlMandates(content, missing.map((m) => m.yamlText));
      writeFileSync(filePath, newContent, 'utf-8');
    }

    return {
      action: 'updated',
      found: YAML_MANDATES.length - missing.length,
      total: YAML_MANDATES.length,
      added: missing.map((m) => m.label),
    };
  }

  /**
   * Text-based (not yaml.dump) insertion — preserves comments, emoji, and formatting.
   *
   * Strategy: find the last `    - "MANDATE:` line in the file and insert
   * missing mandate lines immediately after it.  If no MANDATE lines exist yet,
   * find the `  critical:` key and append after it.  As a final fallback, append
   * a complete `critical:` block at the end of the file.
   */
  private insertYamlMandates(content: string, lines: string[]): string {
    const insertion = '\n' + lines.join('\n');

    // Strategy 1: insert after the last existing MANDATE line
    const lastMandateIdx = content.lastIndexOf('\n    - "MANDATE:');
    if (lastMandateIdx !== -1) {
      const lineEnd = content.indexOf('\n', lastMandateIdx + 1);
      const insertPos = lineEnd !== -1 ? lineEnd : content.length;
      return content.slice(0, insertPos) + insertion + content.slice(insertPos);
    }

    // Strategy 2: insert after the `  critical:` key
    const criticalIdx = content.indexOf('\n  critical:');
    if (criticalIdx !== -1) {
      const afterKey = criticalIdx + '\n  critical:'.length;
      return content.slice(0, afterKey) + insertion + content.slice(afterKey);
    }

    // Strategy 3: append a complete rules block at the end
    return (
      content.trimEnd() +
      '\n\n  # Backfilled by specpilot backfill\n  critical:\n' +
      lines.join('\n') +
      '\n'
    );
  }

  // ---------------------------------------------------------------------------
  // copilot-instructions.md
  // ---------------------------------------------------------------------------

  private async backfillCopilotInstructions(
    projectDir: string,
    specsDir: string,
    dryRun: boolean,
  ): Promise<BackfillFileResult> {
    const filePath = join(projectDir, '.github', 'copilot-instructions.md');

    if (!existsSync(filePath)) {
      if (!dryRun) {
        const projectName = this.readProjectField(specsDir, 'name') ?? require('path').basename(projectDir);
        const language = this.readProjectField(specsDir, 'language') ?? 'typescript';
        const framework = this.readProjectField(specsDir, 'framework');
        const context: TemplateContext = { projectName, language, framework };
        mkdirSync(join(projectDir, '.github'), { recursive: true });
        const ideGen = new IdeConfigGenerator();
        await ideGen.generateCopilotInstructions(projectDir, context, /* noPrompts */ true);
      }
      return {
        action: 'created',
        found: 0,
        total: MD_MANDATES.length,
        added: MD_MANDATES.map((m) => m.label),
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const missing = MD_MANDATES.filter((m) => !content.includes(m.fingerprint));

    if (missing.length === 0) {
      return { action: 'skipped', found: MD_MANDATES.length, total: MD_MANDATES.length, added: [] };
    }

    if (!dryRun) {
      const backfillBlock = this.buildMdBackfillBlock(missing.map((m) => m.mdText));
      writeFileSync(filePath, content.trimEnd() + '\n\n' + backfillBlock + '\n', 'utf-8');
    }

    return {
      action: 'updated',
      found: MD_MANDATES.length - missing.length,
      total: MD_MANDATES.length,
      added: missing.map((m) => m.label),
    };
  }

  private buildMdBackfillBlock(lines: string[]): string {
    return (
      '## SpecPilot Mandates (backfilled by `specpilot backfill`)\n\n' +
      '### 🔴 Critical Mandates — Never violate, no exceptions\n\n' +
      lines.join('\n')
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads the first entry from `contributors:` list in project.yaml.
   * Handles both inline (`contributors: ["girishr"]`) and block-list forms.
   * Falls back to os.userInfo().username if not found.
   */
  private readContributorsFirst(specsDir: string): string {
    const yamlPath = join(specsDir, 'project', 'project.yaml');
    if (existsSync(yamlPath)) {
      try {
        const content = readFileSync(yamlPath, 'utf-8');
        // Inline array: contributors: ["girishr", ...] or contributors: [girishr, ...]
        const inline = content.match(/^contributors:\s*\[\s*["']?([^"'\],]+)["']?/m);
        if (inline) return inline[1].trim();
        // Block list: contributors:\n  - "girishr"
        const block = content.match(/^contributors:\s*\n\s+-\s+["']?([^"'\n]+)["']?/m);
        if (block) return block[1].trim();
      } catch {
        // ignore
      }
    }
    return os.userInfo().username;
  }

  /**
   * Writes `team:\n  devPrefix: "<handle>"` into project.yaml after the `license:` line.
   * If a `team:` block already exists (but devPrefix is missing), inserts devPrefix inside it.
   * Text-based insertion — does not parse YAML to preserve formatting.
   */
  private writeDevPrefix(specsDir: string, handle: string): void {
    const yamlPath = join(specsDir, 'project', 'project.yaml');
    let content = readFileSync(yamlPath, 'utf-8');

    // If there's already a team: block, insert devPrefix inside it
    const teamBlockMatch = content.match(/^(team:\s*\n)((?:\s+[^\n]+\n)*)/m);
    if (teamBlockMatch) {
      // Append devPrefix at the end of the team block
      const insertAfter = teamBlockMatch[0];
      const insertPos = content.indexOf(insertAfter) + insertAfter.length;
      content = content.slice(0, insertPos) + `  devPrefix: "${handle}"\n` + content.slice(insertPos);
    } else {
      // Insert entire team: block after license: line
      const licenseMatch = content.match(/^license:.*$/m);
      if (licenseMatch) {
        const insertPos = content.indexOf(licenseMatch[0]) + licenseMatch[0].length;
        content = content.slice(0, insertPos) + `\nteam:\n  devPrefix: "${handle}"` + content.slice(insertPos);
      } else {
        // Fallback: append at end
        content = content.trimEnd() + `\nteam:\n  devPrefix: "${handle}"\n`;
      }
    }

    writeFileSync(yamlPath, content, 'utf-8');
  }

  /**
   * When team.devPrefix is absent from project.yaml:
   * - Reads contributors[0] as suggestion (fallback: os.userInfo().username)
   * - Prompts user (unless noPrompts or dryRun), looping until non-empty
   * - Writes devPrefix into project.yaml (skipped on dryRun)
   */
  private async ensureDevPrefix(specsDir: string, dryRun: boolean, noPrompts: boolean): Promise<void> {
    if (this.readDevPrefix(specsDir) !== undefined) return; // already set

    const suggestion = this.readContributorsFirst(specsDir);

    let handle: string;
    if (noPrompts || dryRun) {
      handle = suggestion;
      if (!dryRun) {
        process.stdout.write(
          `\n⚠️  team.devPrefix missing — using "${handle}" from contributors as your short handle.\n`,
        );
      }
    } else {
      handle = await this.promptHandle(suggestion);
    }

    if (!dryRun) {
      this.writeDevPrefix(specsDir, handle);
    }
  }

  /**
   * Prompts the user for their short handle, suggesting contributors[0].
   * Loops until a non-empty value is provided.
   */
  private promptHandle(suggestion: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = () => {
        rl.question(`\n⚠️  team.devPrefix missing in project.yaml.\nEnter your short handle [${suggestion}]: `, (answer) => {
          const trimmed = answer.trim();
          if (trimmed) {
            rl.close();
            resolve(trimmed);
          } else if (suggestion) {
            rl.close();
            resolve(suggestion);
          } else {
            process.stdout.write('  Handle cannot be empty. Try again.\n');
            ask();
          }
        });
      };
      ask();
    });
  }

  /**
   * Reads a top-level scalar field from project.yaml using a simple regex.
   * Handles both quoted (`name: "My Project"`) and unquoted (`name: my-project`) values.
   * Does not parse YAML to preserve formatting safety.
   */
  private readProjectField(specsDir: string, field: string): string | undefined {
    const yamlPath = join(specsDir, 'project', 'project.yaml');
    if (!existsSync(yamlPath)) return undefined;
    try {
      const content = readFileSync(yamlPath, 'utf-8');
      // Try double-quoted value first
      const quoted = content.match(new RegExp(`^${field}:\\s+"([^"]+)"`, 'm'));
      if (quoted) return quoted[1].trim();
      // Try single-quoted
      const singleQuoted = content.match(new RegExp(`^${field}:\\s+'([^']+)'`, 'm'));
      if (singleQuoted) return singleQuoted[1].trim();
      // Try unquoted (stop at newline or comment)
      const unquoted = content.match(new RegExp(`^${field}:\\s+([^\\n#]+)`, 'm'));
      return unquoted ? unquoted[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Reads `team.devPrefix` from project.yaml.
   * The field is nested under a `team:` block, e.g.:
   *   team:
   *     devPrefix: "girishr"
   */
  private readDevPrefix(specsDir: string): string | undefined {
    const yamlPath = join(specsDir, 'project', 'project.yaml');
    if (!existsSync(yamlPath)) return undefined;
    try {
      const content = readFileSync(yamlPath, 'utf-8');
      // Match `  devPrefix: "value"` or `  devPrefix: value` (indented under team:)
      const quoted = content.match(/^\s+devPrefix:\s+"([^"]+)"/m);
      if (quoted) return quoted[1].trim();
      const singleQuoted = content.match(/^\s+devPrefix:\s+'([^']+)'/m);
      if (singleQuoted) return singleQuoted[1].trim();
      const unquoted = content.match(/^\s+devPrefix:\s+([^\n#]+)/m);
      return unquoted ? unquoted[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // planning/tasks.md
  // ---------------------------------------------------------------------------

  private backfillTasksMd(specsDir: string, dryRun: boolean): BackfillFileResult {
    const filePath = join(specsDir, 'planning', 'tasks.md');

    if (!existsSync(filePath)) {
      return {
        action: 'missing',
        found: 0,
        total: 2,
        added: [],
        reason: 'file not found — run `specpilot init` or `specpilot add-specs` first',
      };
    }

    const devPrefix = this.readDevPrefix(specsDir);
    if (!devPrefix) {
      return {
        action: 'skipped',
        found: 0,
        total: 2,
        added: [],
        reason: 'team.devPrefix not found in project.yaml — run `specpilot backfill` after `specpilot init`',
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const added: string[] = [];

    const conventionFingerprint = `CD-${devPrefix}-###`;
    const hasConvention = content.includes(conventionFingerprint);
    const hasMultiDevNotes = content.includes('## Multi-Dev Notes');

    if (hasConvention && hasMultiDevNotes) {
      return { action: 'skipped', found: 2, total: 2, added: [] };
    }

    let newContent = content;

    // Insert `CD-{devPrefix}-###` convention line after `- CS-###:` line
    if (!hasConvention) {
      const csLineMatch = newContent.match(/^- CS-###:.*$/m);
      if (csLineMatch) {
        const insertAfter = csLineMatch[0];
        const insertPos = newContent.indexOf(insertAfter) + insertAfter.length;
        const conventionLine = `\n- CD-${devPrefix}-###: Completed items (e.g. CD-${devPrefix}-001)`;
        newContent = newContent.slice(0, insertPos) + conventionLine + newContent.slice(insertPos);
      } else {
        // Fallback: append to convention block before Notes section
        const notesIdx = newContent.search(/^Notes$/m);
        if (notesIdx !== -1) {
          newContent =
            newContent.slice(0, notesIdx) +
            `- CD-${devPrefix}-###: Completed items (e.g. CD-${devPrefix}-001)\n` +
            newContent.slice(notesIdx);
        }
      }
      added.push(`CD-${devPrefix}-### convention line`);
    }

    // Insert ## Multi-Dev Notes section before ## Backlog
    if (!hasMultiDevNotes) {
      const backlogIdx = newContent.search(/^## Backlog$/m);
      if (backlogIdx !== -1) {
        const multiDevSection =
          `## Multi-Dev Notes\n\n` +
          `> **ID collisions are the #1 source of merge conflicts in shared spec files.**\n` +
          `> Follow these rules when more than one person commits to this repo:\n` +
          `>\n` +
          `> - Always \`git pull\` before appending to the Completed section.\n` +
          `> - Use your personal prefix in all Completed IDs: \`CD-${devPrefix}-###\`\n` +
          `>   so two devs never claim the same number independently.\n` +
          `> - Only run \`specpilot archive\` on the default branch (main/master) **after** merging,\n` +
          `>   never on a feature branch — diverged trim points break the archive history.\n\n`;
        newContent = newContent.slice(0, backlogIdx) + multiDevSection + newContent.slice(backlogIdx);
      } else {
        // Fallback: append at end
        newContent =
          newContent.trimEnd() +
          `\n\n## Multi-Dev Notes\n\n` +
          `> Always \`git pull\` before appending to Completed. Use \`CD-${devPrefix}-###\` prefix. ` +
          `Only run \`specpilot archive\` on the default branch.\n`;
      }
      added.push('## Multi-Dev Notes section');
    }

    if (!dryRun && added.length > 0) {
      writeFileSync(filePath, newContent, 'utf-8');
    }

    return {
      action: added.length > 0 ? 'updated' : 'skipped',
      found: (hasConvention ? 1 : 0) + (hasMultiDevNotes ? 1 : 0),
      total: 2,
      added,
    };
  }
}
