import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, appendFileSync, readFileSync } from 'fs';
import inquirer from 'inquirer';
import { TemplateContext } from './templateEngine';

/** IDE-specific overlay keys appended on top of the shared base settings.
 * NOTE: These keys are aspirational — they are NOT confirmed in each IDE's
 * official documentation. Unknown keys are silently ignored, but they are
 * included here as hints for IDEs that may adopt spec-aware settings in future.
 * Remove any keys that cause warnings in your specific IDE version.
 */
const IDE_OVERRIDES: Record<string, Record<string, unknown>> = {
  cursor: {
    // ASPIRATIONAL — not in official Cursor docs
    'cursor.aiAccess': true,
    'cursor.enableAIContext': true,
  },
  windsurf: {
    // ASPIRATIONAL — not in official Windsurf docs
    'windsurf.aiContext.enabled': true,
    'windsurf.specs.integration': true,
    'windsurf.codeCompletion.contextAware': true,
  },
  antigravity: {
    // ASPIRATIONAL — not in official Antigravity docs
    'antigravity.ai.enabled': true,
    'antigravity.contextual': true,
    'antigravity.specs.integration': true,
  },
};

/** IDE directory names used for settings files. */
const IDE_DIRS: Record<string, string> = {
  vscode: '.vscode',
  cursor: '.cursor',
  windsurf: '.windsurf',
  antigravity: '.antigravity',
};

/**
 * Generates IDE workspace settings (.vscode, .cursor, .windsurf, .antigravity).
 * Each IDE gets a settings.json and extensions.json with a shared base config
 * plus per-IDE overlay keys.
 */
export class IdeConfigGenerator {
  /** Entry point — routes to the correct IDE settings generator. */
  async generate(projectDir: string, context: TemplateContext, ide: string): Promise<void> {
    await this.generateIDESettings(projectDir, context, ide);
  }

  /**
   * Generates .github/copilot-instructions.md with critical mandates.
   * Read automatically by GitHub Copilot, Cursor, and other AI tools on every request.
   * Always generated regardless of IDE choice.
   *
   * If the file already exists:
   *   - noPrompts=false → asks user: overwrite / append / skip
   *   - noPrompts=true  → auto-skips and prints a warning
   */
  /**
   * Routes to the correct IDE-native AI context file based on the selected IDE.
   * - vscode / codex → .github/copilot-instructions.md
   * - cursor         → .cursor/rules/specpilot.mdc
   * - windsurf       → .windsurfrules
   * - antigravity    → .antigravity/rules.md
   */
  async generateAiContextFile(
    projectDir: string,
    context: TemplateContext,
    ide: string,
    noPrompts = false,
  ): Promise<void> {
    const key = ide.toLowerCase();
    if (key === 'cursor') {
      await this.generateCursorRules(projectDir, context);
    } else if (key === 'windsurf') {
      await this.generateWindsurfRules(projectDir, context);
    } else if (key === 'antigravity') {
      await this.generateAntigravityRules(projectDir, context);
    } else if (key === 'claude-code') {
      await this.generateClaudeMd(projectDir, context, noPrompts);
    } else {
      // vscode, codex, and unknown IDEs → copilot-instructions.md
      await this.generateCopilotInstructions(projectDir, context, noPrompts);
    }
  }

  private generateCursorRules(projectDir: string, context: TemplateContext): void {
    const rulesDir = join(projectDir, '.cursor', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    const filePath = join(rulesDir, 'specpilot.mdc');
    const content =
      `---\ndescription: Project mandates and AI coding rules\nglobs:\nalwaysApply: true\n---\n\n` +
      this.buildCopilotInstructions(context);
    writeFileSync(filePath, content);
  }

  private generateWindsurfRules(projectDir: string, context: TemplateContext): void {
    const filePath = join(projectDir, '.windsurfrules');
    writeFileSync(filePath, this.buildCopilotInstructions(context));
  }

  private generateAntigravityRules(projectDir: string, context: TemplateContext): void {
    const rulesDir = join(projectDir, '.antigravity');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, 'rules.md'), this.buildCopilotInstructions(context));
  }

  private async generateClaudeMd(
    projectDir: string,
    context: TemplateContext,
    noPrompts = false,
  ): Promise<void> {
    const filePath = join(projectDir, 'CLAUDE.md');

    if (!existsSync(filePath)) {
      writeFileSync(filePath, this.buildClaudeMd(context));
      return;
    }

    // File already exists
    if (noPrompts) {
      console.log(
        '\u26a0\ufe0f  CLAUDE.md already exists \u2014 skipping (--no-prompts).\n' +
        '   Manually merge the SpecPilot mandates shown below into that file:\n\n' +
        this.buildClaudeMdSection(context),
      );
      return;
    }

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: '\u26a0\ufe0f  CLAUDE.md already exists. What would you like to do?',
        choices: [
          { name: 'Overwrite with SpecPilot template', value: 'o' },
          { name: 'Append SpecPilot section to existing file', value: 'a' },
          { name: 'Skip (keep existing file unchanged)', value: 's' },
        ],
      },
    ]);

    if (action === 'o') {
      writeFileSync(filePath, this.buildClaudeMd(context));
    } else if (action === 'a') {
      appendFileSync(filePath, '\n\n' + this.buildClaudeMdSection(context));
    }
    // action === 's' → leave file unchanged
  }

  private buildClaudeMd(context: TemplateContext): string {
    const stack = context.framework
      ? `${context.language} / ${context.framework}`
      : context.language;
    return `# CLAUDE.md \u2014 ${context.projectName}

> This file is the primary instructions file for Claude Code.
> Keep it lean \u2014 use it as a router to your \`.specs/\` files, not a dumping ground.
> Full project context is in \`.specs/project/project.yaml\`.

## Project

- **Name:** ${context.projectName}
- **Stack:** ${stack}
- **Specs location:** \`.specs/\`

## \ud83d\udd34 Critical Mandates \u2014 Never violate, no exceptions

${this.buildCriticalMandatesMarkdown()}

## \ud83d\udfe1 Process Mandates

${this.buildProcessMandatesMarkdown()}

${this.buildContextRoutingTable()}

## Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.
For a ready-made re-anchor prompt, see \`.specs/development/prompts.md \u2192 ## Re-Anchor Prompt\`.
`;
  }

  private buildClaudeMdSection(context: TemplateContext): string {
    const stack = context.framework
      ? `${context.language} / ${context.framework}`
      : context.language;
    return `## SpecPilot Mandates \u2014 ${context.projectName}

> Added by \`specpilot add-specs\`. These mandates apply alongside your existing instructions.
> Full context is in \`.specs/project/project.yaml\`.

### Project

- **Name:** ${context.projectName}
- **Stack:** ${stack}
- **Specs location:** \`.specs/\`

### \ud83d\udd34 Critical Mandates \u2014 Never violate, no exceptions

${this.buildCriticalMandatesMarkdown()}

### \ud83d\udfe1 Process Mandates

${this.buildProcessMandatesMarkdown()}

${this.buildContextRoutingTable()}
`;
  }

  async generateCopilotInstructions(
    projectDir: string,
    context: TemplateContext,
    noPrompts = false,
  ): Promise<void> {
    const githubDir = join(projectDir, '.github');
    mkdirSync(githubDir, { recursive: true });
    const filePath = join(githubDir, 'copilot-instructions.md');

    if (!existsSync(filePath)) {
      writeFileSync(filePath, this.buildCopilotInstructions(context));
      return;
    }

    // File already exists
    if (noPrompts) {
      console.log(
        '\u26a0\ufe0f  .github/copilot-instructions.md already exists \u2014 skipping (--no-prompts).\n' +
        '   Manually merge the SpecPilot mandates shown below into that file:\n\n' +
        this.buildCopilotSection(context),
      );
      return;
    }

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: '⚠️  .github/copilot-instructions.md already exists. What would you like to do?',
        choices: [
          { name: 'Overwrite with SpecPilot template', value: 'o' },
          { name: 'Append SpecPilot section to existing file', value: 'a' },
          { name: 'Skip (keep existing file unchanged)', value: 's' },
        ],
      },
    ]);

    if (action === 'o') {
      writeFileSync(filePath, this.buildCopilotInstructions(context));
    } else if (action === 'a') {
      appendFileSync(filePath, '\n\n' + this.buildCopilotSection(context));
    }
    // action === 's' → leave file unchanged
  }

  /**
   * Builds just the SpecPilot mandates block — used in append mode and
   * in the --no-prompts warning message.
   */
  private buildCopilotSection(context: TemplateContext): string {
    const stack = context.framework
      ? `${context.language} / ${context.framework}`
      : context.language;
    return `## SpecPilot Mandates — ${context.projectName}

> Added by \`specpilot add-specs\`. These mandates apply alongside your existing instructions.
> Full context is in \`.specs/project/project.yaml\`.

### Project

- **Name:** ${context.projectName}
- **Stack:** ${stack}
- **Specs location:** \`.specs/\`

### 🔴 Critical Mandates — Never violate, no exceptions

${this.buildCriticalMandatesMarkdown()}

### 🟡 Process Mandates

${this.buildProcessMandatesMarkdown()}

${this.buildContextRoutingTable()}

### Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.
For a ready-made re-anchor prompt, see \`.specs/development/prompts.md → ## Re-Anchor Prompt\`.
`;
  }

  private buildCopilotInstructions(context: TemplateContext): string {
    const stack = context.framework
      ? `${context.language} / ${context.framework}`
      : context.language;
    return `# AI Coding Instructions — ${context.projectName}

> This file is automatically read by GitHub Copilot, Cursor, and other AI tools on every request.
> Keep this file short — only critical mandates. Full context is in \`.specs/project/project.yaml\`.

## Project

- **Name:** ${context.projectName}
- **Stack:** ${stack}
- **Specs location:** \`.specs/\`

## 🔴 Critical Mandates — Never violate, no exceptions

${this.buildCriticalMandatesMarkdown()}

## 🟡 Process Mandates

${this.buildProcessMandatesMarkdown()}

${this.buildContextRoutingTable()}

## Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.\nFor a ready-made re-anchor prompt, see \`.specs/development/prompts.md → ## Re-Anchor Prompt\`.
`;
  }

  private buildCriticalMandatesMarkdown(): string {
    return `1. No commit unless asked.
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
   - Architectural → update all affected specs, present Spec Report, wait for \`yes, proceed\``;
  }

  private buildContextRoutingTable(): string {
    return `## Context — read on demand by task type

| Task type | Read |
|---|---|
| Session start | \`.specs/project/project.yaml\` |
| Feature / bug | + \`project/requirements.md\`, \`planning/tasks.md\` |
| Architecture | + \`architecture/architecture.md\` |
| Tests | + \`quality/tests.md\` |
| Security | + \`security/threat-model.md\`, \`security/security-decisions.md\` |
| Planning | + \`planning/tasks.md\`, \`planning/roadmap.md\` |`;
  }

  private buildProcessMandatesMarkdown(): string {
    return `- **Spec-First:** Update \`.specs/\` before writing code.
- **Log all AI interactions** in \`.specs/development/prompts.md\` with timestamps.
- **Document decisions** in \`.specs/development/context.md\`.`;
  }

  private async generateIDESettings(projectDir: string, context: TemplateContext, ide: string): Promise<void> {
    const key = ide.toLowerCase();
    const ideDir = IDE_DIRS[key] ?? '.vscode';
    const overrides = IDE_OVERRIDES[key] ?? {};
    const fullDir = join(projectDir, ideDir);
    mkdirSync(fullDir, { recursive: true });

    const settingsWithComment = this.buildSettingsJson(ide, context, overrides);
    writeFileSync(join(fullDir, 'settings.json'), settingsWithComment);

    const extensions = {
      recommendations: [
        'esbenp.prettier-vscode',
        'redhat.vscode-yaml',
        'github.copilot',
        'ms-vscode.vscode-typescript-next',
      ],
      unwantedRecommendations: [],
    };
    writeFileSync(join(fullDir, 'extensions.json'), JSON.stringify(extensions, null, 2));
  }

  private buildSettingsJson(
    ide: string,
    context: TemplateContext,
    overrides: Record<string, unknown>
  ): string {
    const displayName = ide === 'vscode' ? 'VS Code' : ide.charAt(0).toUpperCase() + ide.slice(1);
    const noteComment =
      ide === 'vscode'
        ? '// Copy the "First-Use Onboarding Prompt" and paste into your AI agent to populate specs'
        : `// Copy the "First-Use Onboarding Prompt" and paste into ${displayName}'s AI chat to populate specs`;

    // Build override lines
    const overrideLines = Object.entries(overrides)
      .map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`)
      .join('\n');
    const overrideBlock = overrideLines
      ? `\n  // ${displayName}-specific AI settings (ASPIRATIONAL — not confirmed in official docs; unknown keys are silently ignored)\n${overrideLines}\n`
      : '';

    return `{
  // SpecPilot AI IDE Configuration${ide !== 'vscode' ? ` for ${displayName}` : ''}
  // This file configures ${displayName} to work effectively with SpecPilot specs

  // AI CONTEXT: The recommended way to give AI agents access to your .specs files
  // is via .github/copilot-instructions.md (VS Code Copilot) or your IDE's equivalent
  // custom instructions file. See .specs/development/prompts.md for guidelines.
  ${noteComment}

  // Ensure .specs folder is included in workspace search (not excluded)
  "search.exclude": {
    "**/.specs/*": false
  },

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, api.yaml)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation (requires redhat.vscode-yaml extension)
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}"
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  }${overrideBlock}
}`;
  }

  /**
   * Generates (or updates) .gitattributes at project root with merge=union rules
   * for append-heavy spec files, preventing git merge conflicts on shared branches.
   * If the file already exists, only missing lines are appended.
   */
  generateGitAttributes(projectDir: string): void {
    const GITATTRIBUTES_LINES = [
      '.specs/development/prompts*.md merge=union',
      '.specs/planning/tasks.md merge=union',
      'CHANGELOG.md merge=union',
    ];

    const filePath = join(projectDir, '.gitattributes');

    if (!existsSync(filePath)) {
      writeFileSync(filePath, GITATTRIBUTES_LINES.join('\n') + '\n');
      return;
    }

    const existing = readFileSync(filePath, 'utf8');
    const missing = GITATTRIBUTES_LINES.filter(line => !existing.includes(line));
    if (missing.length > 0) {
      const suffix = existing.endsWith('\n') ? '' : '\n';
      appendFileSync(filePath, suffix + missing.join('\n') + '\n');
    }
  }
}
