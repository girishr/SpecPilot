import { ProjectInfo } from './projectDetector';
import { SpecGeneratorOptions } from './specGenerator';

// What `specpilot add-specs` asks, and how its answers become generator options: one copy, used by
// the command's inquirer prompts and by `specpilot serve`'s guided setup (BL-055, ARCH-003.19).

export const SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'python', 'kotlin', 'swift'];

export const PROJECT_TYPE_MESSAGE = 'Is this a greenfield or brownfield project?';
export const PROJECT_TYPE_CHOICES = [
  { name: 'Brownfield — existing codebase, initializing specs retroactively', value: 'brownfield' },
  { name: 'Greenfield — new project, writing code from scratch', value: 'greenfield' },
];

export const LANGUAGE_MESSAGE = 'Choose a language:';
export const FRAMEWORK_MESSAGE = 'Choose a framework:';

export const API_PARADIGM_MESSAGE = 'What API paradigm does this project use?';
export const API_PARADIGM_CHOICES = [
  { name: 'REST / OpenAPI — HTTP endpoints, JSON responses', value: 'rest' },
  { name: 'CLI — command-line tool with commands and flags', value: 'cli' },
  { name: 'GraphQL — schema-first query/mutation API', value: 'graphql' },
  { name: 'None — skip api.yaml (UI library, mobile app, etc.)', value: 'none' },
];

export const handleMessage = (osUsername: string) =>
  `Your short handle is used as a prefix in task IDs (e.g. CD-jsmith-001) and prompt IDs\n  (e.g. PROMPT-jsmith-001) to avoid collisions when multiple devs share the same spec files.\n  Use your GitHub, GitLab, or Bitbucket username, or any short tag of your choice [${osUsername}]:`;

export const IDE_MESSAGE = 'Select your AI IDE/Agent for SpecPilot context:';
export const IDE_CHOICES = [
  { name: 'GitHub Copilot', value: 'vscode' },
  { name: 'Cursor', value: 'Cursor' },
  { name: 'Windsurf', value: 'Windsurf' },
  { name: 'Antigravity', value: 'Antigravity' },
  { name: 'Claude Code', value: 'claude-code' },
  { name: 'Codex', value: 'Codex' },
];

/** The line `add-specs` prints for a detected project. */
export const detectedLine = (info: ProjectInfo) => `✅ Detected ${info.language}${info.framework ? `/${info.framework}` : ''} project`;

export interface AddSpecsAnswers {
  language: string;
  framework?: string;
  projectType: 'greenfield' | 'brownfield';
  apiParadigm?: 'rest' | 'cli' | 'graphql' | 'none';
  handle: string;
  ide: string;
}

/** The `generateSpecs()` options `add-specs` builds from the detector, the analysis and the answers. */
export function addSpecsOptions(
  projectDir: string,
  projectInfo: ProjectInfo | null,
  answers: AddSpecsAnswers,
  analysis: SpecGeneratorOptions['analysis'] | null,
): SpecGeneratorOptions {
  const { language, framework } = answers;
  return {
    projectName: projectInfo?.name || 'my-project',
    language,
    framework,
    targetDir: projectDir,
    specsName: '.specs',
    author: answers.handle,
    description: projectInfo?.description || `A ${language} project${framework ? ` using ${framework}` : ''}`,
    ide: answers.ide,
    analysis: analysis || undefined,
    mode: 'existing',
    projectType: answers.projectType,
    apiParadigm: answers.apiParadigm,
  };
}
