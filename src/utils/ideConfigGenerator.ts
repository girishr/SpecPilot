import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'fs';
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
  kiro: {
    // ASPIRATIONAL — not in official Kiro docs
    'kiro.ai.contextAware': true,
    'kiro.specs.enabled': true,
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
  kiro: '.kiro',
  antigravity: '.antigravity',
};

/**
 * Generates IDE workspace settings (.vscode, .cursor, .windsurf, .kiro, .antigravity).
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

1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.
2. **NEVER push** to git unless the developer explicitly asks. Always ask first.
3. **NEVER deploy, publish, or release** the project unless the developer explicitly asks. Always ask first.
4. **NEVER modify** the \`.specs/\` folder structure, subfolder names, or file names. Only update file contents.
5. **ALWAYS update** affected \`.specs/\` files after every code change — without being asked:
   - Structural changes → \`architecture/architecture.md\`
   - Feature changes → \`project/requirements.md\`
   - Test changes → \`quality/tests.md\`
   - Task status → \`planning/tasks.md\`
   - Completed work → \`CHANGELOG.md\`

### 🟡 Process Mandates

- **Spec-First:** Update \`.specs/\` before writing code.
- **Log all AI interactions** in \`.specs/development/prompts.md\` with timestamps.
- **Document decisions** in \`.specs/development/context.md\`.

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

1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.
2. **NEVER push** to git unless the developer explicitly asks. Always ask first.
3. **NEVER deploy, publish, or release** the project unless the developer explicitly asks. Always ask first.
4. **NEVER modify** the \`.specs/\` folder structure, subfolder names, or file names. Only update file contents.
5. **ALWAYS update** affected \`.specs/\` files after every code change — without being asked:
   - Structural changes → \`architecture/architecture.md\`
   - Feature changes → \`project/requirements.md\`
   - Test changes → \`quality/tests.md\`
   - Task status → \`planning/tasks.md\`
   - Completed work → \`CHANGELOG.md\`

## 🟡 Process Mandates

- **Spec-First:** Update \`.specs/\` before writing code.
- **Log all AI interactions** in \`.specs/development/prompts.md\` with timestamps.
- **Document decisions** in \`.specs/development/context.md\`.

## Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.\nFor a ready-made re-anchor prompt, see \`.specs/development/prompts.md → ## Re-Anchor Prompt\`.
`;
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
}
