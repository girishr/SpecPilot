import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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
}

export class SpecBackfiller {
  async backfill(projectDir: string, specsName: string, dryRun: boolean): Promise<BackfillResult> {
    const specsDir = join(projectDir, specsName);

    if (!existsSync(specsDir)) {
      throw new Error(
        `No ${specsName}/ folder found in ${projectDir}.\n` +
          `Run \`specpilot init\` to create a new project or \`specpilot add-specs\` to add specs to an existing project.`,
      );
    }

    const yamlResult = this.backfillProjectYaml(specsDir, dryRun);
    const copilotResult = await this.backfillCopilotInstructions(projectDir, specsDir, dryRun);

    return { projectYaml: yamlResult, copilotInstructions: copilotResult };
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
}
