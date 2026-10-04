import { AddSpecsAnswers, PROJECT_TYPE_CHOICES } from './addSpecsQuestions';
import { SpecGeneratorOptions } from './specGenerator';

// What only `specpilot init` asks, and how its answers become generator options: one copy, used by the
// command's inquirer prompts and by `specpilot serve`'s new-project route (BL-075, BL-PM-003,
// ARCH-003.22). The lists `init` shares with `add-specs` are in addSpecsQuestions.ts.

/** `init` lists Greenfield first. */
export const INIT_PROJECT_TYPE_CHOICES = [PROJECT_TYPE_CHOICES[1], PROJECT_TYPE_CHOICES[0]];

export const MAX_PROJECT_NAME_LENGTH = 214; // npm limit
/** Allowlist: prevents filesystem issues and Handlebars template injection (SEC-004.1). */
export const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** What is wrong with a project name, in `init`'s words (`hint` is the terminal's extra line), or null. */
export function projectNameError(name: string): { message: string; hint?: string } | null {
  if (!name) return { message: 'Project name is required and cannot be empty', hint: '💡 Usage: specpilot init <project-name>' };
  if (name.length > MAX_PROJECT_NAME_LENGTH) return { message: `Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer` };
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return {
      message: 'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores',
      hint: '💡 Example: my-project, app_v2, project.name',
    };
  }
  return null;
}

/** The four project-context questions, in order; only the first is required. */
export const CONTEXT_QUESTIONS = [
  { key: 'whatItDoes', message: 'What does your project do? (required):' },
  { key: 'targetUsers', message: 'Who are the target users? (Enter to skip):' },
  { key: 'expectedScale', message: 'What\'s the expected scale? (Enter to skip):' },
  { key: 'constraints', message: 'Any key constraints or requirements? (Enter to skip):' },
] as const;

export const NOT_SPECIFIED = 'Not specified — use your judgment and mark as [ASSUMPTION]';

/** `init`'s answers; a context answer left empty becomes NOT_SPECIFIED. */
export interface InitAnswers extends AddSpecsAnswers {
  whatItDoes: string;
  targetUsers: string;
  expectedScale: string;
  constraints: string;
}

/** The `generateSpecs()` options `init` builds from the project name and the answers. */
export function initOptions(targetDir: string, projectName: string, answers: InitAnswers, specsName = '.specs'): SpecGeneratorOptions {
  return {
    projectName,
    language: answers.language,
    framework: answers.framework,
    targetDir,
    specsName,
    author: answers.handle,
    ide: answers.ide,
    mode: 'new',
    projectType: answers.projectType,
    apiParadigm: answers.apiParadigm,
    projectContext: {
      whatItDoes: answers.whatItDoes || NOT_SPECIFIED,
      targetUsers: answers.targetUsers || NOT_SPECIFIED,
      expectedScale: answers.expectedScale || NOT_SPECIFIED,
      constraints: answers.constraints || NOT_SPECIFIED,
    },
  };
}
