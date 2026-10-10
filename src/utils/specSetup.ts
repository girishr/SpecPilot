import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, join, sep } from 'path';
import os from 'os';
import { ProjectDetector, ProjectInfo } from './projectDetector';
import { CodeAnalyzer } from './codeAnalyzer';
import { SpecGenerator, SpecGeneratorOptions } from './specGenerator';
import { getFrameworksForLanguage } from './frameworks';
import { CODEX_PROMPTS_NOTICE } from './slashCommandGenerator';
import {
  AddSpecsAnswers, addSpecsOptions, API_PARADIGM_CHOICES, API_PARADIGM_MESSAGE, detectedLine, FRAMEWORK_MESSAGE, handleMessage, IDE_CHOICES,
  CHAT_ORDER, IDE_MESSAGE, LANGUAGE_MESSAGE, PROJECT_TYPE_CHOICES, PROJECT_TYPE_MESSAGE, QUESTION_CHAT, QUESTION_STEPS, SETUP_STEPS, SUPPORTED_LANGUAGES,
} from './addSpecsQuestions';
import { CONTEXT_QUESTIONS, INIT_PROJECT_TYPE_CHOICES, initOptions, InitAnswers, projectNameError } from './initQuestions';
import { checkOpenPath, HOME_OR_ROOT_ERROR, pathShapeError } from './projectRegistry';
import { render, RenderedFile } from '../core/render';
import { OptionalFields } from '../core/templateEngine';
import { INTEGRATION_CATEGORY_IDS, MAX_LIST_ITEMS, OPTIONAL_FIELD_LIMITS } from '../core/chatFlow';

// Guided setup behind `specpilot serve` (BL-055, ARCH-003.20, SEC-004.12): what `add-specs` does, in a
// named folder that has no `.specs/`, generated into a staging folder inside it and then created in
// place file by file with an exclusive create, so nothing that exists is ever written through.
// A new project (BL-PM-003) is what `init` does, in a new or empty folder, placed the same way.

/** Staging folders live inside the served folder and carry this marker file beside the generated tree. */
export const STAGING_MARKER = '.specpilot-setup';
export const STAGING_PATTERN = /^\.specpilot-setup-[0-9a-f]{12}$/;
const MARKER_TEXT = 'specpilot serve guided setup staging folder; safe to delete\n';

/**
 * What is wrong with a handle sent over HTTP, or null; an empty one is fine (the CLI's own prompt is
 * unchanged, SEC-004.12). The rule lives in the page's `ui/route.js`, like the project name's (BL-PM-004).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { handleError, HANDLE_PATTERN } = require('../../ui/route.js') as { handleError: (handle: string) => string | null; HANDLE_PATTERN: RegExp };

/** True when `.specs` does not exist at all (a file, link or folder of that name counts as existing). */
export function specsMissing(root: string): boolean {
  try {
    lstatSync(join(root, '.specs'));
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

const exists = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

const choices = (values: string[]) => values.map(value => ({ name: value, value }));

export interface SetupQuestion {
  key: string;
  message: string;
  /** The step of the page's chat the question belongs to, and its place in the chat's order (BL-PM-004). */
  step: string;
  order: number;
  /** False for an answer the CLI lets pass with Enter. */
  required: boolean;
  /** The chat's friendly line (`{language}` filled by the page) and the recap row's label. */
  chat: string;
  label: string;
  /** The field's example, for a typed answer. */
  placeholder?: string;
  /** Asked only while these answers are selected. */
  when?: Record<string, string>;
  /** Absent for the handle (free text) and for the framework when it depends on the language answer. */
  choices?: { name: string; value: string }[];
}

export interface SetupQuestions {
  questions: SetupQuestion[];
  /** The steps that hold a question, in order. */
  steps: string[];
  /** When the language is asked: `none` plus each language's frameworks (a language with none is absent). */
  frameworks?: Record<string, string[]>;
  /** What will be written: the `.specs/` files per API paradigm and the files outside it per IDE choice. */
  files: GeneratedFiles;
  /** What the detector found; `rows` are the answered rows guided setup shows for it (BL-PM-016). */
  detected: { language: string; framework: string | null; line: string; name: string; platform: string | null; rows: DetectedRow[] } | null;
  /** Per IDE choice, the files outside `.specs/` that would be written and already exist (kept). */
  keep: Record<string, string[]>;
}

/** One answered row of guided setup that the detector filled in: shown, not asked and not sent (REQ-002.H.35). */
export interface DetectedRow {
  key: string;
  step: string;
  label: string;
  value: string;
}

export interface GeneratedFiles {
  specs: Record<string, string[]>;
  outside: Record<string, string[]>;
}

type AskedQuestion = Omit<SetupQuestion, 'step' | 'order' | 'required' | 'chat' | 'label' | 'placeholder'> & { required?: boolean };

/** Each question with its step, whether it is required (every one but the handle, unless it says so) and its chat wording, and the steps in use. */
function inSteps(asked: AskedQuestion[]): { questions: SetupQuestion[]; steps: string[] } {
  const questions = asked.map(q => ({ ...q, step: QUESTION_STEPS[q.key], order: CHAT_ORDER.findIndex(([key]) => key === q.key), required: q.required ?? q.key !== 'handle', ...QUESTION_CHAT[q.key] }));
  return { questions, steps: SETUP_STEPS.filter(step => questions.some(q => q.step === step)) };
}

/** The generators' own path tables, per choice. */
function generatedFiles(generator: SpecGenerator): GeneratedFiles {
  return {
    specs: Object.fromEntries(API_PARADIGM_CHOICES.map(c => [c.value, generator.targetsInSpecs(c.value)])),
    outside: Object.fromEntries(IDE_CHOICES.map(c => [c.value, generator.targetsOutsideSpecs(c.value)])),
  };
}

/** `none` plus its frameworks, for each language that has any. */
function frameworksByLanguage(): Record<string, string[]> {
  const frameworks: Record<string, string[]> = {};
  for (const language of SUPPORTED_LANGUAGES) {
    const list = getFrameworksForLanguage(language);
    if (list.length) frameworks[language] = ['none', ...list];
  }
  return frameworks;
}

/** The questions `add-specs` would ask in this folder. Throws when the detector or the OS username fails. */
export async function setupQuestions(root: string): Promise<SetupQuestions> {
  const info = await new ProjectDetector().detectProject(root);
  const username = os.userInfo().username;
  const questions: AskedQuestion[] = [{ key: 'projectType', message: PROJECT_TYPE_MESSAGE, choices: PROJECT_TYPE_CHOICES }];
  let frameworks: Record<string, string[]> | undefined;
  if (!info) {
    questions.push({ key: 'language', message: LANGUAGE_MESSAGE, choices: choices(SUPPORTED_LANGUAGES) });
    frameworks = frameworksByLanguage();
    questions.push({ key: 'framework', message: FRAMEWORK_MESSAGE });
  } else if (!info.framework && getFrameworksForLanguage(info.language).length) {
    questions.push({ key: 'framework', message: FRAMEWORK_MESSAGE, choices: choices(['none', ...getFrameworksForLanguage(info.language)]) });
  }
  questions.push(
    { key: 'apiParadigm', message: API_PARADIGM_MESSAGE, choices: API_PARADIGM_CHOICES },
    { key: 'handle', message: handleMessage(username) },
    { key: 'ide', message: IDE_MESSAGE, choices: IDE_CHOICES },
  );
  const generator = new SpecGenerator();
  const keep: Record<string, string[]> = {};
  for (const { value } of IDE_CHOICES) keep[value] = generator.targetsOutsideSpecs(value).filter(rel => exists(join(root, ...rel.split('/'))));
  return {
    ...inSteps(questions),
    ...(frameworks ? { frameworks } : {}),
    files: generatedFiles(generator),
    detected: info ? { language: info.language, framework: info.framework ?? null, line: detectedLine(info), name: info.name, platform: info.platform ?? null, rows: detectedRows(info) } : null,
    keep,
  };
}

/** The rows for what `add-specs` takes from the detector without asking: the project name, the language and the framework. */
function detectedRows(info: ProjectInfo): DetectedRow[] {
  const rows: DetectedRow[] = [{ key: 'name', step: SETUP_STEPS[0], label: 'Project name', value: info.name }];
  rows.push({ key: 'language', step: QUESTION_STEPS.language, label: QUESTION_CHAT.language.label, value: info.language });
  if (info.framework) rows.push({ key: 'framework', step: QUESTION_STEPS.framework, label: QUESTION_CHAT.framework.label, value: info.framework });
  return rows;
}

const KEYS = ['projectType', 'language', 'framework', 'apiParadigm', 'handle', 'ide'];
const oneOf = (key: string, values: string[]) => `"${key}" must be one of: ${values.join(', ')}.`;

/** The 23 optional template fields a setup body may also carry (BL-PM-004b, REQ-002.H.28). */
const FIELD_KEYS = Object.keys(OPTIONAL_FIELD_LIMITS);
// What one line typed at the CLI's prompt cannot hold: control characters and the two line separators.
// eslint-disable-next-line no-control-regex
const NOT_ONE_LINE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** The optional fields of a body: each a string, a list or the integration map, short, one line. Null when fine. */
function fieldsShapeError(b: Record<string, unknown>): string | null {
  // `name` is how the message names the value: "platforms", or "platforms" items.
  const text = (name: string, v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return `${name} must be text.`;
    if (v.length > max) return `${name} must be at most ${max} characters.`;
    return NOT_ONE_LINE.test(v) ? `${name} must be one line of text, without control characters.` : null;
  };
  const items = (name: string, v: unknown, max: number): string | null => {
    if (!Array.isArray(v)) return `${name} must be a list.`;
    if (v.length > MAX_LIST_ITEMS) return `${name} must have at most ${MAX_LIST_ITEMS} items.`;
    for (const item of v) {
      const problem = text(`${name} items`, item, max);
      if (problem) return problem;
    }
    return null;
  };
  for (const key of FIELD_KEYS) {
    if (!(key in b)) continue;
    const { kind, max } = OPTIONAL_FIELD_LIMITS[key];
    const v = b[key];
    let problem: string | null = null;
    if (kind === 'text') problem = text(`"${key}"`, v, max);
    else if (kind === 'list') problem = items(`"${key}"`, v, max);
    else if (!v || typeof v !== 'object' || Array.isArray(v)) problem = `"${key}" must be an object of lists.`;
    else {
      for (const [category, vendors] of Object.entries(v)) {
        problem = INTEGRATION_CATEGORY_IDS.includes(category)
          ? items(`"${key}.${category}"`, vendors, max)
          : `"${key}" keys must be one of: ${INTEGRATION_CATEGORY_IDS.join(', ')}.`;
        if (problem) break;
      }
    }
    if (problem) return problem;
  }
  return null;
}

/** The optional fields of a checked body, for the generator. */
function fieldsOf(b: Record<string, unknown>): OptionalFields {
  return Object.fromEntries(FIELD_KEYS.filter(key => key in b).map(key => [key, b[key]])) as OptionalFields;
}

/** Shape of a setup body, checked before the lock: keys, types, fixed choices, the handle. Null when fine. */
export function answersShapeError(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with projectType, apiParadigm, handle, ide and, when asked, language and framework.';
  for (const key of Object.keys(b)) if (!KEYS.includes(key) && !FIELD_KEYS.includes(key)) return `Unexpected field "${key}".`;
  for (const key of ['projectType', 'apiParadigm', 'handle', 'ide']) if (!(key in b)) return `"${key}" is missing.`;
  for (const key of KEYS) if (key in b && typeof b[key] !== 'string') return `"${key}" must be a string.`;
  const lists: [string, string[]][] = [
    ['projectType', PROJECT_TYPE_CHOICES.map(c => c.value)],
    ['apiParadigm', API_PARADIGM_CHOICES.map(c => c.value)],
    ['ide', IDE_CHOICES.map(c => c.value)],
  ];
  for (const [key, values] of lists) if (!values.includes(b[key] as string)) return oneOf(key, values);
  return handleError(b.handle as string) ?? fieldsShapeError(b);
}

/** `language` and `framework` against what the detector found: required when asked, absent otherwise. */
function answersDetectionError(b: Record<string, string>, info: ProjectInfo | null): string | null {
  if (info) {
    if ('language' in b) return 'The language was detected, so "language" must not be sent.';
  } else if (!('language' in b)) return '"language" is missing.';
  else if (!SUPPORTED_LANGUAGES.includes(b.language)) return oneOf('language', SUPPORTED_LANGUAGES);
  const language = info ? info.language : b.language;
  const list = info?.framework ? [] : getFrameworksForLanguage(language);
  if (!list.length) return 'framework' in b ? '"framework" must not be sent for this folder.' : null;
  if (!('framework' in b)) return '"framework" is missing.';
  return ['none', ...list].includes(b.framework) ? null : oneOf('framework', ['none', ...list]);
}

export type SetupOutcome =
  | { status: 200; kept: string[]; notice: string | null }
  | { status: 409; error: string; specsExists: boolean }
  | { status: 422; error: string }
  | { status: 500; error: string };

/** Every regular file under `dir`, as `/`-joined paths relative to it, in sorted walk order. */
function walk(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Run `add-specs` for `root` with `answers` (shape already checked). Synchronous from the `.specs` re-check
 * to the staging folder's removal, so the caller's lock is the only serialisation needed.
 */
export async function setupProject(root: string, answers: Record<string, unknown>): Promise<SetupOutcome> {
  if (!specsMissing(root)) return { status: 409, error: '.specs/ already exists in this folder, so there is nothing to set up.', specsExists: true };
  const options = await setupOptions(root, answers);
  return 'status' in options ? options : placeGenerated(root, options);
}

/** The generator options `add-specs` would use in `root` for `answers` (shape already checked), or a 422. */
async function setupOptions(root: string, body: Record<string, unknown>): Promise<SpecGeneratorOptions | { status: 422; error: string }> {
  const answers = body as Record<string, string>;
  let info: ProjectInfo | null;
  let username: string;
  try {
    info = await new ProjectDetector().detectProject(root);
    username = os.userInfo().username;
  } catch (err) {
    return { status: 422, error: `This folder could not be read: ${(err as Error).message}` };
  }
  const problem = answersDetectionError(answers, info);
  if (problem) return { status: 422, error: problem };
  const language = info ? info.language : answers.language;
  const framework = info?.framework ?? (answers.framework && answers.framework !== 'none' ? answers.framework : undefined);
  const handle = answers.handle.trim() || username;
  const analysis = await new CodeAnalyzer().analyzeCodebase(root);
  return addSpecsOptions(
    root,
    info,
    { language, framework, projectType: answers.projectType as AddSpecsAnswers['projectType'], apiParadigm: answers.apiParadigm as AddSpecsAnswers['apiParadigm'], handle, ide: answers.ide },
    analysis,
    fieldsOf(body),
  );
}

/** What a create would write, nothing written (BL-PM-004b `POST /api/preview`). */
export interface Preview {
  files: RenderedFile[];
  kept: string[];
  onboardingPrompt: string;
}

const previewOf = (options: SpecGeneratorOptions, kept: (path: string) => boolean): Preview => {
  const out = render(options); // targetDir is the writer's; render() ignores it
  return { files: out.files, kept: out.files.map(f => f.path).filter(p => !p.startsWith('.specs/') && kept(p)), onboardingPrompt: out.onboardingPrompt };
};

/** The guided-setup preview for `root` (shape already checked): what `setupProject()` would write. */
export async function previewSetup(root: string, body: Record<string, unknown>): Promise<Preview | { status: 409 | 422; error: string }> {
  if (!specsMissing(root)) return { status: 409, error: '.specs/ already exists in this folder, so there is nothing to set up.' };
  const options = await setupOptions(root, body);
  return 'status' in options ? options : previewOf(options, rel => exists(join(root, ...rel.split('/'))));
}

/** The new-project preview (shape already checked, `parent` not needed): what `createProject()` would write. */
export function previewNewProject(body: Record<string, unknown>): Preview | { status: 422; error: string } {
  const { name, ...answers } = body as Record<string, string>;
  let handle = answers.handle.trim();
  try {
    handle = handle || os.userInfo().username;
  } catch (err) {
    return { status: 422, error: `The OS username could not be read: ${(err as Error).message}` };
  }
  return previewOf(newProjectOptions('', name, { ...answers, handle }, body), () => false);
}

/**
 * Generate with `options` into a marked staging folder inside `root`, then create each staged file in
 * place with an exclusive create: the one writer behind guided setup and a new project. Existing files
 * outside `.specs/` are kept; a failure removes what this call created; the staging folder always goes.
 */
async function placeGenerated(root: string, options: SpecGeneratorOptions): Promise<SetupOutcome> {
  const generator = new SpecGenerator();
  const ide = options.ide || 'vscode';
  const staging = join(root, `.specpilot-setup-${randomBytes(6).toString('hex')}`);
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];
  const rollback = () => {
    for (const f of createdFiles.reverse()) try { unlinkSync(f); } catch { /* already gone */ }
    for (const d of createdDirs.reverse()) try { rmdirSync(d); } catch { /* not empty or already gone: left alone */ }
  };
  try {
    mkdirSync(staging);
    writeFileSync(join(staging, STAGING_MARKER), MARKER_TEXT);
    await generator.generateSpecs({ ...options, targetDir: staging });
    const staged = walk(staging).filter(p => p !== STAGING_MARKER);
    // Outside .specs/ in the generator's own order (what `kept` reports), then the .specs/ files last.
    const order = generator.targetsOutsideSpecs(ide);
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
    const files = [...staged.filter(p => !p.startsWith('.specs/')).sort((a, b) => rank(a) - rank(b)), ...staged.filter(p => p.startsWith('.specs/'))];

    // Every existing folder on the way must be a real folder: no write may follow a link out of the project.
    for (const rel of files) {
      const parts = rel.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = join(root, ...parts.slice(0, i));
        let st;
        try {
          st = lstatSync(dir);
        } catch {
          break; // this and every deeper folder will be created
        }
        if (st.isSymbolicLink()) return { status: 409, error: `${parts.slice(0, i).join('/')} is a symbolic link, so nothing was written.`, specsExists: false };
        if (!st.isDirectory()) return { status: 409, error: `${parts.slice(0, i).join('/')} is not a folder, so nothing was written.`, specsExists: false };
      }
    }

    const kept: string[] = [];
    for (const rel of files) {
      const target = join(root, ...rel.split('/'));
      const missing: string[] = [];
      for (let d = dirname(target); !exists(d); d = dirname(d)) missing.unshift(d);
      try {
        for (const d of missing) {
          mkdirSync(d);
          createdDirs.push(d);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || !rel.startsWith('.specs/')) throw err;
        rollback();
        return { status: 409, error: '.specs/ was created by something else while setup ran, so setup stopped and removed what it had created.', specsExists: true };
      }
      let fd: number;
      try {
        fd = openSync(target, 'wx');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        if (rel.startsWith('.specs/')) {
          rollback();
          return { status: 409, error: '.specs/ was created by something else while setup ran, so setup stopped and removed what it had created.', specsExists: true };
        }
        kept.push(rel);
        continue;
      }
      createdFiles.push(target);
      try {
        writeSync(fd, readFileSync(join(staging, ...rel.split('/'))));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    return { status: 200, kept, notice: ide.toLowerCase() === 'codex' ? CODEX_PROMPTS_NOTICE : null };
  } catch (err) {
    rollback();
    return { status: 500, error: `Setup could not finish: ${(err as Error).message}. The files it had created were removed.` };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// ---- a new project (BL-PM-003): what `specpilot init <name>` does, in `<parent>/<name>`

/** The questions `init` asks, in its order, with the CLI's own text. Throws when the OS username cannot be read. */
export function newProjectQuestions(): { questions: SetupQuestion[]; steps: string[]; frameworks: Record<string, string[]>; files: GeneratedFiles } {
  return {
    ...inSteps([
      { key: 'projectType', message: PROJECT_TYPE_MESSAGE, choices: INIT_PROJECT_TYPE_CHOICES },
      { key: 'language', message: LANGUAGE_MESSAGE, choices: choices(SUPPORTED_LANGUAGES) },
      { key: 'framework', message: FRAMEWORK_MESSAGE },
      { key: 'apiParadigm', message: API_PARADIGM_MESSAGE, choices: API_PARADIGM_CHOICES },
      { key: 'handle', message: handleMessage(os.userInfo().username) },
      { key: 'ide', message: IDE_MESSAGE, choices: IDE_CHOICES },
      ...CONTEXT_QUESTIONS,
    ]),
    frameworks: frameworksByLanguage(),
    files: generatedFiles(new SpecGenerator()),
  };
}

const CONTEXT_KEYS = CONTEXT_QUESTIONS.map(q => q.key as string);
const NEW_KEYS = ['parent', 'name', ...KEYS, ...CONTEXT_KEYS];
/** Longest project-context answer a request may send. */
export const MAX_CONTEXT_LENGTH = 1000;
/** Shape of a new-project body, checked before the lock (a preview's has no `parent`). Null when fine. */
export function newProjectShapeError(body: unknown, preview = false): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with parent, name and the answers to the questions.';
  const keys = preview ? NEW_KEYS.filter(k => k !== 'parent') : NEW_KEYS;
  for (const key of Object.keys(b)) if (!keys.includes(key) && !FIELD_KEYS.includes(key)) return `Unexpected field "${key}".`;
  // The context answers are required for Greenfield only: `init` writes them nowhere for Brownfield (BL-PM-004).
  const required = [...(preview ? [] : ['parent']), 'name', 'projectType', 'language', 'apiParadigm', 'handle', 'ide', ...(b.projectType === 'brownfield' ? [] : ['whatItDoes'])];
  for (const key of required) if (!(key in b)) return `"${key}" is missing.`;
  for (const key of keys) if (key in b && typeof b[key] !== 'string') return `"${key}" must be a string.`;
  const s = b as Record<string, string>;
  const parentProblem = preview ? null : pathShapeError({ path: s.parent });
  if (parentProblem) return parentProblem.replace('"path"', '"parent"');
  const nameProblem = projectNameError(s.name);
  if (nameProblem) return `${nameProblem.message}.`;
  const lists: [string, string[]][] = [
    ['projectType', INIT_PROJECT_TYPE_CHOICES.map(c => c.value)],
    ['language', SUPPORTED_LANGUAGES],
    ['apiParadigm', API_PARADIGM_CHOICES.map(c => c.value)],
    ['ide', IDE_CHOICES.map(c => c.value)],
  ];
  for (const [key, values] of lists) if (!values.includes(s[key])) return oneOf(key, values);
  const frameworks = getFrameworksForLanguage(s.language);
  if (!frameworks.length) {
    if ('framework' in s) return '"framework" must not be sent for this language.';
  } else if (!('framework' in s)) return '"framework" is missing.';
  else if (!['none', ...frameworks].includes(s.framework)) return oneOf('framework', ['none', ...frameworks]);
  const handleProblem = handleError(s.handle);
  if (handleProblem) return handleProblem;
  if (s.projectType === 'greenfield' && !s.whatItDoes.trim()) return '"whatItDoes" must not be empty.';
  for (const key of CONTEXT_KEYS) {
    const value = (s[key] ?? '').trim();
    if (value.length > MAX_CONTEXT_LENGTH) return `"${key}" must be at most ${MAX_CONTEXT_LENGTH} characters.`;
    if (NOT_ONE_LINE.test(value)) return `"${key}" must be one line of text, without control characters.`;
  }
  return fieldsShapeError(b);
}

export type NewProjectOutcome =
  | { status: 200; root: string; kept: string[]; notice: string | null }
  | { status: 409 | 422 | 500; error: string; project?: number };

export type Reserved =
  | { target: string; created: boolean }
  | { status: 409 | 422; error: string; project?: number; notEmpty?: string };

/**
 * The folder a request names as parent + name (REQ-002.H.23 steps 2 to 4), for a new project and for a
 * clone (BL-PM-002): the parent through `checkOpenPath()`, the target `<parent>/<name>` made with one
 * non-recursive `mkdir` when it is missing, or used when it is an empty folder. `cloning` is the folder
 * a running clone holds. Synchronous; nothing that exists is changed.
 */
export function reserveTarget(parent: string, name: string, roots: string[], home: string, cloning: string | null = null): Reserved {
  const check = checkOpenPath(parent, [], home);
  if ('status' in check) return { status: check.status, error: check.error === HOME_OR_ROOT_ERROR ? 'Pick a folder inside your home folder, like ~/dev.' : check.error };
  if (check.root.split(sep).some(segment => segment.toLowerCase() === '.specs')) return { status: 422, error: 'A project cannot be created inside a .specs/ folder.' };
  const target = join(check.root, name);
  if (cloning !== null && (target === cloning || target.startsWith(cloning + sep))) return { status: 409, error: `${cloning} is being cloned. Wait for it to finish.` };
  // Also when the folder is gone: a served root must never be made, or served, a second time.
  const served = roots.indexOf(target);
  if (served >= 0) return { status: 409, error: `${target} is already open as project ${served}.`, project: served };

  let st;
  try {
    st = lstatSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return { status: 422, error: `${target} could not be created (${(err as NodeJS.ErrnoException).code}).` };
  }
  if (st) {
    if (st.isSymbolicLink()) return { status: 409, error: `${target} is a symbolic link, so nothing was created.` };
    if (!st.isDirectory()) return { status: 409, error: `${target} exists and is not a folder, so nothing was created.` };
    const open = checkOpenPath(target, roots, home);
    if ('status' in open) return open;
    let entries: string[];
    try {
      entries = readdirSync(target);
    } catch (err) {
      return { status: 422, error: `${target} could not be read (${(err as NodeJS.ErrnoException).code}).` };
    }
    if (entries.length) return { status: 409, error: `${target} already exists and is not empty. Use the Folder tab to open it and add .specs/ there.`, notEmpty: target };
    return { target, created: false };
  }
  try {
    mkdirSync(target); // not recursive: fails when anything is there, and never makes a parent
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return { status: 409, error: `${target} was created by something else just now, so nothing was written.` };
    return { status: 422, error: `${target} could not be created (${code}).` };
  }
  return { target, created: true };
}

/**
 * Create `<parent>/<name>` when it is missing (one non-recursive `mkdir`), or use it when it is an empty
 * folder, and write there what `init` writes (REQ-002.H.23 steps 2 to 5; body shape already checked).
 * No asynchronous I/O between the checks and the writes, like `setupProject()`. Nothing that exists is changed.
 */
export async function createProject(parent: string, name: string, body: Record<string, unknown>, roots: string[], home: string, cloning: string | null = null): Promise<NewProjectOutcome> {
  const answers = body as Record<string, string>;
  let handle = answers.handle.trim();
  try {
    handle = handle || os.userInfo().username;
  } catch (err) {
    return { status: 422, error: `The OS username could not be read: ${(err as Error).message}` };
  }
  const reserved = reserveTarget(parent, name, roots, home, cloning);
  if ('status' in reserved) return reserved.project === undefined ? { status: reserved.status, error: reserved.error } : { status: reserved.status, error: reserved.error, project: reserved.project };
  const { target, created } = reserved;

  let out: SetupOutcome | undefined;
  try {
    out = await placeGenerated(target, newProjectOptions(target, name, { ...answers, handle }, body));
  } finally {
    // Also when placeGenerated() itself throws: the folder this call made goes, if it is empty again.
    if (out?.status !== 200 && created) try { rmdirSync(target); } catch { /* something else put a file there: the folder stays */ }
  }
  if (out.status === 200) return { status: 200, root: target, kept: out.kept, notice: out.notice };
  return { status: out.status, error: out.error };
}

/** The generator options `init` uses for `answers` (shape checked, handle resolved), with the body's optional fields. */
function newProjectOptions(target: string, name: string, answers: Record<string, string>, body: Record<string, unknown>): SpecGeneratorOptions {
  const framework = answers.framework && answers.framework !== 'none' ? answers.framework : undefined;
  const context = Object.fromEntries(CONTEXT_KEYS.map(key => [key, (answers[key] ?? '').trim()])) as Pick<InitAnswers, 'whatItDoes' | 'targetUsers' | 'expectedScale' | 'constraints'>;
  return initOptions(target, name, {
    language: answers.language, framework, projectType: answers.projectType as InitAnswers['projectType'],
    apiParadigm: answers.apiParadigm as InitAnswers['apiParadigm'], handle: answers.handle, ide: answers.ide, ...context,
  }, '.specs', fieldsOf(body));
}

/**
 * Remove the staging folders an interrupted setup left in `root`: only a real folder named
 * `.specpilot-setup-<12 hex>` that holds the marker as a regular file. Returns what was removed.
 */
export function removeStaleStaging(root: string): string[] {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return removed;
  }
  for (const name of entries.filter(n => STAGING_PATTERN.test(n))) {
    const dir = join(root, name);
    try {
      if (!lstatSync(dir).isDirectory() || !lstatSync(join(dir, STAGING_MARKER)).isFile()) continue;
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
      /* not SpecPilot's, or cannot be removed: left alone */
    }
  }
  return removed;
}
