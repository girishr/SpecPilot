import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { TemplateContext } from './templateEngine';

/** IDE-specific overlay keys appended on top of the shared base settings. */
const IDE_OVERRIDES: Record<string, Record<string, unknown>> = {
  cursor: {
    'cursor.aiAccess': true,
    'cursor.enableAIContext': true,
  },
  windsurf: {
    'windsurf.aiContext.enabled': true,
    'windsurf.specs.integration': true,
    'windsurf.codeCompletion.contextAware': true,
  },
  kiro: {
    'kiro.ai.contextAware': true,
    'kiro.specs.enabled': true,
  },
  antigravity: {
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
      ? `\n  // ${displayName}-specific AI settings\n${overrideLines}\n`
      : '';

    return `{
  // SpecPilot AI IDE Configuration${ide !== 'vscode' ? ` for ${displayName}` : ''}
  // This file configures ${displayName} to work effectively with SpecPilot specs
  
  // For ${displayName} AI: The .specs folder structure is configured${ide === 'vscode' ? ' as a workspace folder' : ' for AI context'}
  // and included in AI${ide === 'vscode' ? '' : ' suggestions'}. Refer to .specs/development/prompts.md for AI guidelines.
  
  // Configure ${displayName} AI context for SpecPilot specifications
  "chat.agent.enabled": true,
  "chat.contextAware": true,
  "chat.includeWorkspaceContext": true,
  
  // Include .specs in AI context for better suggestions
  "prompt.fileContext": [".specs/**"],
  
  // Ensure .specs folder is searchable for ${ide === 'vscode' ? 'AI agents' : `${displayName} AI`}
  "search.exclude": {
    "**/.specs/*": false
  },

  // Workspace folders - main project + specifications
  "workspace.folders": [
    {
      "path": ".",
      "name": "${context.projectName}"
    },
    {
      "path": ".specs",
      "name": "${context.projectName} - Specifications"
    }
  ],

  // Markdown formatting for spec files
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },

  // YAML formatting for spec files (project.yaml, etc.)
  "[yaml]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 2
  },

  // YAML validation
  "yaml.validate": true,
  "yaml.schemas": {
    "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
    ".specs/**/project.yaml": true
  },

  // General file exclusions
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/__pycache__": true
  },${overrideBlock}
  // Recommended extensions for SpecPilot development
  "extensions.recommendations": [
    "esbenp.prettier-vscode",
    "redhat.vscode-yaml",
    "github.copilot"
  ],

  // Note: For full AI onboarding instructions, see .specs/development/prompts.md
  ${noteComment}
}`;
  }
}
