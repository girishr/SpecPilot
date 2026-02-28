import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
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
