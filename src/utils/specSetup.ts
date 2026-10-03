import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import os from 'os';
import { ProjectDetector, ProjectInfo } from './projectDetector';
import { CodeAnalyzer } from './codeAnalyzer';
import { TemplateEngine } from './templateEngine';
import { SpecGenerator } from './specGenerator';
import { getFrameworksForLanguage } from './frameworks';
import { CODEX_PROMPTS_NOTICE } from './slashCommandGenerator';
import {
  AddSpecsAnswers, addSpecsOptions, API_PARADIGM_CHOICES, API_PARADIGM_MESSAGE, detectedLine, FRAMEWORK_MESSAGE, handleMessage, IDE_CHOICES,
  IDE_MESSAGE, LANGUAGE_MESSAGE, PROJECT_TYPE_CHOICES, PROJECT_TYPE_MESSAGE, SUPPORTED_LANGUAGES,
} from './addSpecsQuestions';

// Guided setup behind `specpilot serve` (BL-055, ARCH-003.20, SEC-004.12): what `add-specs` does, in a
// named folder that has no `.specs/`, generated into a staging folder inside it and then created in
// place file by file with an exclusive create, so nothing that exists is ever written through.

/** Staging folders live inside the served folder and carry this marker file beside the generated tree. */
export const STAGING_MARKER = '.specpilot-setup';
export const STAGING_PATTERN = /^\.specpilot-setup-[0-9a-f]{12}$/;
const MARKER_TEXT = 'specpilot serve guided setup staging folder; safe to delete\n';

/** What a handle sent over HTTP may be (the CLI's own prompt is unchanged, SEC-004.12). */
export const HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/;

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
  key: keyof AddSpecsAnswers;
  message: string;
  /** Absent for the handle (free text) and for the framework when it depends on the language answer. */
  choices?: { name: string; value: string }[];
}

export interface SetupQuestions {
  questions: SetupQuestion[];
  /** When the language is asked: `none` plus each language's frameworks (a language with none is absent). */
  frameworks?: Record<string, string[]>;
  detected: { language: string; framework: string | null; line: string } | null;
  /** Per IDE choice, the files outside `.specs/` that would be written and already exist (kept). */
  keep: Record<string, string[]>;
}

/** The questions `add-specs` would ask in this folder. Throws when the detector or the OS username fails. */
export async function setupQuestions(root: string): Promise<SetupQuestions> {
  const info = await new ProjectDetector().detectProject(root);
  const username = os.userInfo().username;
  const questions: SetupQuestion[] = [{ key: 'projectType', message: PROJECT_TYPE_MESSAGE, choices: PROJECT_TYPE_CHOICES }];
  let frameworks: Record<string, string[]> | undefined;
  if (!info) {
    questions.push({ key: 'language', message: LANGUAGE_MESSAGE, choices: choices(SUPPORTED_LANGUAGES) });
    frameworks = {};
    for (const language of SUPPORTED_LANGUAGES) {
      const list = getFrameworksForLanguage(language);
      if (list.length) frameworks[language] = ['none', ...list];
    }
    questions.push({ key: 'framework', message: FRAMEWORK_MESSAGE });
  } else if (!info.framework && getFrameworksForLanguage(info.language).length) {
    questions.push({ key: 'framework', message: FRAMEWORK_MESSAGE, choices: choices(['none', ...getFrameworksForLanguage(info.language)]) });
  }
  questions.push(
    { key: 'apiParadigm', message: API_PARADIGM_MESSAGE, choices: API_PARADIGM_CHOICES },
    { key: 'handle', message: handleMessage(username) },
    { key: 'ide', message: IDE_MESSAGE, choices: IDE_CHOICES },
  );
  const generator = new SpecGenerator(new TemplateEngine());
  const keep: Record<string, string[]> = {};
  for (const { value } of IDE_CHOICES) keep[value] = generator.targetsOutsideSpecs(value).filter(rel => exists(join(root, ...rel.split('/'))));
  return {
    questions,
    ...(frameworks ? { frameworks } : {}),
    detected: info ? { language: info.language, framework: info.framework ?? null, line: detectedLine(info) } : null,
    keep,
  };
}

const KEYS = ['projectType', 'language', 'framework', 'apiParadigm', 'handle', 'ide'];
const oneOf = (key: string, values: string[]) => `"${key}" must be one of: ${values.join(', ')}.`;

/** Shape of a setup body, checked before the lock: keys, types, fixed choices, the handle. Null when fine. */
export function answersShapeError(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'The request must be a JSON object with projectType, apiParadigm, handle, ide and, when asked, language and framework.';
  for (const key of Object.keys(b)) if (!KEYS.includes(key)) return `Unexpected field "${key}".`;
  for (const key of ['projectType', 'apiParadigm', 'handle', 'ide']) if (!(key in b)) return `"${key}" is missing.`;
  for (const key of KEYS) if (key in b && typeof b[key] !== 'string') return `"${key}" must be a string.`;
  const lists: [string, string[]][] = [
    ['projectType', PROJECT_TYPE_CHOICES.map(c => c.value)],
    ['apiParadigm', API_PARADIGM_CHOICES.map(c => c.value)],
    ['ide', IDE_CHOICES.map(c => c.value)],
  ];
  for (const [key, values] of lists) if (!values.includes(b[key] as string)) return oneOf(key, values);
  const handle = (b.handle as string).trim();
  if (handle && !HANDLE_PATTERN.test(handle)) {
    return 'The handle must be 1 to 39 characters of letters, digits, dots, underscores and hyphens, starting with a letter or digit.';
  }
  return null;
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
export async function setupProject(root: string, answers: Record<string, string>): Promise<SetupOutcome> {
  if (!specsMissing(root)) return { status: 409, error: '.specs/ already exists in this folder, so there is nothing to set up.', specsExists: true };
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
  const generator = new SpecGenerator(new TemplateEngine());
  const options = addSpecsOptions(
    root,
    info,
    { language, framework, projectType: answers.projectType as AddSpecsAnswers['projectType'], apiParadigm: answers.apiParadigm as AddSpecsAnswers['apiParadigm'], handle, ide: answers.ide },
    analysis,
  );

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
    const order = generator.targetsOutsideSpecs(answers.ide);
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
    return { status: 200, kept, notice: answers.ide.toLowerCase() === 'codex' ? CODEX_PROMPTS_NOTICE : null };
  } catch (err) {
    rollback();
    return { status: 500, error: `Setup could not finish: ${(err as Error).message}. The files it had created were removed.` };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
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
