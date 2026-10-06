import { AddSpecsAnswers, PROJECT_TYPE_CHOICES } from './addSpecsQuestions';
import { SpecGeneratorOptions } from './specGenerator';

// What only `specpilot init` asks, and how its answers become generator options: one copy, used by the
// command's inquirer prompts and by `specpilot serve`'s new-project route (BL-075, BL-PM-003,
// ARCH-003.22). The lists `init` shares with `add-specs` are in addSpecsQuestions.ts.

/** `init` lists Greenfield first. */
export const INIT_PROJECT_TYPE_CHOICES = [PROJECT_TYPE_CHOICES[1], PROJECT_TYPE_CHOICES[0]];

/**
 * What is wrong with a project name, in `init`'s words (`hint` is the terminal's extra line), or null.
 * The allowlist prevents filesystem issues and Handlebars template injection (SEC-004.1). The rule lives
 * in the page's `ui/route.js`, which checks the name as it is typed in, so there is one copy (BL-PM-004).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { projectNameError } = require('../../ui/route.js') as { projectNameError: (name: string) => { message: string; hint?: string } | null };

/** `specpilot serve` asks the context questions only for Greenfield: `init` writes them nowhere for Brownfield (BL-082). */
const GREENFIELD_ONLY = { projectType: 'greenfield' };
/** The four project-context questions, in order; only the first is required. */
export const CONTEXT_QUESTIONS = [
  { key: 'whatItDoes', message: 'What does your project do? (required):', required: true, when: GREENFIELD_ONLY },
  { key: 'targetUsers', message: 'Who are the target users? (Enter to skip):', required: false, when: GREENFIELD_ONLY },
  { key: 'expectedScale', message: 'What\'s the expected scale? (Enter to skip):', required: false, when: GREENFIELD_ONLY },
  { key: 'constraints', message: 'Any key constraints or requirements? (Enter to skip):', required: false, when: GREENFIELD_ONLY },
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
