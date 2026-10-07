import { TemplateContext } from './templateEngine';

// The files outside `.specs/` that depend on the IDE choice: settings, extensions, the AI context
// file, the mandate text and `.gitattributes` (BL-032, phase 1: the content half of
// src/utils/ideConfigGenerator.ts; `writeNew()` and the `.gitattributes` merge stay there).

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

/** The IDE-native AI context file per IDE; anything else gets copilot-instructions.md (ARCH-004.11). */
const AI_CONTEXT_FILES: Record<string, string> = {
  cursor: '.cursor/rules/specpilot.mdc',
  windsurf: '.windsurfrules',
  antigravity: '.antigravity/rules.md',
  'claude-code': 'CLAUDE.md',
};
const COPILOT_INSTRUCTIONS = '.github/copilot-instructions.md';
export const COPILOT_INSTRUCTIONS_FILE = COPILOT_INSTRUCTIONS;

export const GITATTRIBUTES_FILE = '.gitattributes';
export const GITATTRIBUTES_LINES = [
  '.specs/development/prompts*.md merge=union',
  '.specs/planning/tasks.md merge=union',
  'CHANGELOG.md merge=union',
];

/** The settings pair for an IDE, project-relative (BL-055); the content comes from `settingsFiles()`. */
export function settingsTargets(ide: string): string[] {
  const dir = IDE_DIRS[ide.toLowerCase()] ?? '.vscode';
  return [`${dir}/settings.json`, `${dir}/extensions.json`];
}

/** The IDE-native AI context file, project-relative (BL-055). */
export function aiContextTarget(ide: string): string {
  return AI_CONTEXT_FILES[ide.toLowerCase()] ?? COPILOT_INSTRUCTIONS;
}

/**
 * The AI context file for the selected IDE:
 * - vscode / codex → .github/copilot-instructions.md
 * - cursor         → .cursor/rules/specpilot.mdc
 * - windsurf       → .windsurfrules
 * - antigravity    → .antigravity/rules.md
 * - claude-code    → CLAUDE.md
 */
export function aiContextFile(context: TemplateContext, ide: string): { path: string; content: string } {
  const key = ide.toLowerCase();
  const content =
    key === 'claude-code'
      ? buildClaudeMd(context)
      : key === 'cursor'
        ? `---\ndescription: Project mandates and AI coding rules\nglobs:\nalwaysApply: true\n---\n\n` + buildCopilotInstructions(context)
        : buildCopilotInstructions(context);
  return { path: aiContextTarget(key), content };
}

/** The settings.json and extensions.json pair for an IDE (shared base plus per-IDE overlay keys). */
export function settingsFiles(context: TemplateContext, ide: string): { path: string; content: string }[] {
  const key = ide.toLowerCase();
  const overrides = IDE_OVERRIDES[key] ?? {};
  const [settingsRel, extensionsRel] = settingsTargets(key);
  const extensions = {
    recommendations: [
      'esbenp.prettier-vscode',
      'redhat.vscode-yaml',
      'github.copilot',
      'ms-vscode.vscode-typescript-next',
    ],
    unwantedRecommendations: [],
  };
  return [
    { path: settingsRel, content: buildSettingsJson(ide, context, overrides) },
    { path: extensionsRel, content: JSON.stringify(extensions, null, 2) },
  ];
}

/** `.gitattributes` as created in a project that has none (REQ-002.B.8). */
export function gitAttributesContent(): string {
  return GITATTRIBUTES_LINES.join('\n') + '\n';
}

export function buildClaudeMd(context: TemplateContext): string {
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

${buildCriticalMandatesMarkdown()}

## \ud83d\udfe1 Process Mandates

${buildProcessMandatesMarkdown()}

${buildContextRoutingTable()}

${buildCodePhilosophyMarkdown()}

## Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.
For a ready-made re-anchor prompt, see \`.specs/development/prompts.md \u2192 ## Re-Anchor Prompt\`.
`;
  }

export function buildCopilotInstructions(context: TemplateContext): string {
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

${buildCriticalMandatesMarkdown()}

## 🟡 Process Mandates

${buildProcessMandatesMarkdown()}

${buildContextRoutingTable()}

${buildCodePhilosophyMarkdown()}

## Re-Anchor

If you lose context mid-session, read \`.specs/project/project.yaml\` to restore full project context.\nFor a ready-made re-anchor prompt, see \`.specs/development/prompts.md → ## Re-Anchor Prompt\`.
`;
  }

export function buildCriticalMandatesMarkdown(): string {
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

export function buildContextRoutingTable(): string {
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

export function buildProcessMandatesMarkdown(): string {
    return `- **Spec-First:** Update \`.specs/\` before writing code.
- **Log all AI interactions** in \`.specs/development/prompts.md\` with timestamps.
- **Document decisions** in \`.specs/development/context.md\`.`;
  }

export function buildCodePhilosophyMarkdown(): string {
    return `## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.`;
  }

export function buildSettingsJson(
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
