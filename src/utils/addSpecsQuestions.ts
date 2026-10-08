import { ProjectInfo } from './projectDetector';
import { SpecGeneratorOptions } from './specGenerator';
import { OptionalFields } from '../core/templateEngine';

// What `specpilot add-specs` asks, and how its answers become generator options: one copy, used by
// the command's inquirer prompts and by `specpilot serve`'s guided setup (BL-055, ARCH-003.19).

/** The steps `specpilot serve` asks the questions in, named as init.specpilot.dev names them (BL-PM-004). */
export const SETUP_STEPS = ['Project identity', 'Platform & IDE', 'Target users', 'Scale & deploy', 'Architecture & data', 'Constraints & non-goals'];
/**
 * The chat's friendly line for each question, a short recap label and, for a typed answer, the field's
 * example (REQ-002.H.27). `{language}` is filled by the page with the language choice's text. The CLI's own
 * message is shown under the line, verbatim; none of this reaches the terminal.
 */
export const QUESTION_CHAT: Record<string, { chat: string; label: string; placeholder?: string }> = {
  projectType: { chat: 'Got it. Is this a new build, or are we adding specs to an existing codebase?', label: 'Type' },
  whatItDoes: { chat: 'Describe it in plain words. As short or as detailed as you like.', label: 'What it does', placeholder: 'A tracker for courier parcels with live status for customers' },
  handle: { chat: "Last thing for this part: your short handle? Optional. It prefixes task IDs, like CD-jsmith-001. Skip and I'll use your OS username.", label: 'Handle', placeholder: 'e.g. jsmith' },
  language: { chat: 'Which language is it in?', label: 'Language' },
  framework: { chat: 'Any framework on top of {language}?', label: 'Framework' },
  ide: { chat: 'Which AI IDE do you use, so I can write its context files?', label: 'AI IDE' },
  targetUsers: { chat: "Who's going to use it? Optional.", label: 'Users', placeholder: 'Couriers and the customers waiting for parcels' },
  expectedScale: { chat: "What's the expected scale? Optional.", label: 'Scale', placeholder: 'About 5,000 parcels a day in one city' },
  apiParadigm: { chat: 'What kind of API does it expose? This decides whether api.yaml is written.', label: 'API' },
  constraints: { chat: 'Any key constraints or requirements? Optional.', label: 'Constraints', placeholder: 'Must work offline on cheap Android phones' },
};
/** The questions in the order the chat asks them, each with its step (the page's parent-folder question comes first). */
export const CHAT_ORDER: [string, string][] = [
  ['projectType', SETUP_STEPS[0]], ['whatItDoes', SETUP_STEPS[0]], ['handle', SETUP_STEPS[0]],
  ['language', SETUP_STEPS[1]], ['framework', SETUP_STEPS[1]], ['ide', SETUP_STEPS[1]],
  ['targetUsers', SETUP_STEPS[2]], ['expectedScale', SETUP_STEPS[3]], ['apiParadigm', SETUP_STEPS[4]], ['constraints', SETUP_STEPS[5]],
];
/** Question key → its step. */
export const QUESTION_STEPS: Record<string, string> = Object.fromEntries(CHAT_ORDER);

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
  fields: OptionalFields = {},
): SpecGeneratorOptions {
  const { language, framework } = answers;
  return {
    ...fields,
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
