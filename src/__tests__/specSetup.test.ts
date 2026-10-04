import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import * as os from 'os';

// The real module objects, which specSetup.ts calls through (a namespace import cannot be spied on).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realFs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realOs = require('os') as typeof import('os');
import { join } from 'path';
import { SpecGenerator } from '../utils/specGenerator';
import { TemplateEngine } from '../utils/templateEngine';
import { addSpecsOptions, IDE_CHOICES, SUPPORTED_LANGUAGES } from '../utils/addSpecsQuestions';
import { ProjectDetector } from '../utils/projectDetector';
import { CodeAnalyzer } from '../utils/codeAnalyzer';
import { CODEX_PROMPTS_NOTICE } from '../utils/slashCommandGenerator';
import {
  answersShapeError, createProject, newProjectQuestions, newProjectShapeError, removeStaleStaging, setupProject, setupQuestions, specsMissing, STAGING_MARKER,
} from '../utils/specSetup';
import { API_PARADIGM_CHOICES } from '../utils/addSpecsQuestions';
import { NOT_SPECIFIED } from '../utils/initQuestions';

jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: jest.fn() } }));
import inquirer from 'inquirer';
import { initCommand } from '../commands/init';

// Guided setup (BL-055): the same bytes as `specpilot add-specs`, never a changed file.

const IDES = IDE_CHOICES.map(c => c.value);

/** Every regular file under `root` (links and folders excluded), `/`-joined relative paths → bytes. */
function tree(root: string, rel = ''): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, tree(root, p));
    else if (e.isFile()) out[p] = readFileSync(join(root, p));
  }
  return out;
}

/** A fresh base with a `proj` folder (same name every time, so the analysed tree matches across copies). */
function makeFolder(files: Record<string, string> = {}): { base: string; root: string } {
  const base = mkdtempSync(join(os.tmpdir(), 'specpilot-setup-'));
  const root = join(base, 'proj');
  mkdirSync(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return { base, root };
}

const NODE_REACT = { 'package.json': JSON.stringify({ name: 'fixture-app', description: 'A fixture', dependencies: { react: '18.0.0' }, devDependencies: { typescript: '5.0.0' } }), 'src/app.ts': '// TODO: one\n' };
const NODE_PLAIN = { 'package.json': JSON.stringify({ name: 'plain-app', devDependencies: { typescript: '5.0.0' } }), 'src/index.ts': 'export const one = 1;\n' };
const FULL = { projectType: 'brownfield', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode' };

/** What `add-specs` itself writes for the same folder and answers, generated straight into `root`. */
async function cliOutput(root: string, answers: Record<string, string>): Promise<Record<string, Buffer>> {
  const info = await new ProjectDetector().detectProject(root);
  const analysis = await new CodeAnalyzer().analyzeCodebase(root);
  const language = info ? info.language : answers.language;
  const framework = info?.framework ?? (answers.framework && answers.framework !== 'none' ? answers.framework : undefined);
  await new SpecGenerator(new TemplateEngine()).generateSpecs(
    addSpecsOptions(root, info, { language, framework, projectType: answers.projectType as 'brownfield', apiParadigm: answers.apiParadigm as 'rest', handle: answers.handle, ide: answers.ide }, analysis),
  );
  return tree(root);
}

const bases: string[] = [];
afterEach(() => {
  jest.restoreAllMocks();
  while (bases.length) rmSync(bases.pop()!, { recursive: true, force: true });
});
const folder = (files?: Record<string, string>) => {
  const f = makeFolder(files);
  bases.push(f.base);
  return f.root;
};

describe('targetsOutsideSpecs() is what generateSpecs() writes outside .specs/', () => {
  it.each(IDES)('for %s', async ide => {
    const root = folder();
    const generator = new SpecGenerator(new TemplateEngine());
    await generator.generateSpecs({ projectName: 'p', language: 'typescript', targetDir: root, specsName: '.specs', ide });
    const written = Object.keys(tree(root)).filter(p => !p.startsWith('.specs/'));
    const listed = generator.targetsOutsideSpecs(ide);
    expect([...listed].sort()).toEqual([...written].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('setupQuestions()', () => {
  it('asks what add-specs asks for a detected project, with no language or framework question when both are detected', async () => {
    const root = folder(NODE_REACT);
    const q = await setupQuestions(root);
    expect(q.questions.map(x => x.key)).toEqual(['projectType', 'apiParadigm', 'handle', 'ide']);
    expect(q.detected).toEqual({ language: 'typescript', framework: 'react', line: '✅ Detected typescript/react project' });
    expect(q.frameworks).toBeUndefined();
    expect(q.questions[2].message).toContain(`[${os.userInfo().username}]:`);
    expect(q.questions[3].choices).toEqual(IDE_CHOICES);
    expect(Object.keys(q.keep)).toEqual(IDES);
    for (const ide of IDES) expect(q.keep[ide]).toEqual([]);
  });

  it('asks for the framework when the language is detected without one', async () => {
    const q = await setupQuestions(folder(NODE_PLAIN));
    expect(q.questions.map(x => x.key)).toEqual(['projectType', 'framework', 'apiParadigm', 'handle', 'ide']);
    expect(q.questions[1]).toEqual({ key: 'framework', message: 'Choose a framework:', choices: ['none', 'react', 'express', 'next', 'nest', 'vue', 'angular'].map(v => ({ name: v, value: v })) });
  });

  it('asks for the language, with the frameworks of each, when nothing is detected', async () => {
    const q = await setupQuestions(folder());
    expect(q.questions.map(x => x.key)).toEqual(['projectType', 'language', 'framework', 'apiParadigm', 'handle', 'ide']);
    expect(q.questions[1]).toEqual({ key: 'language', message: 'Choose a language:', choices: SUPPORTED_LANGUAGES.map(v => ({ name: v, value: v })) });
    expect(q.questions[2]).toEqual({ key: 'framework', message: 'Choose a framework:' });
    expect(Object.keys(q.frameworks!)).toEqual(['typescript', 'python', 'kotlin', 'swift']); // javascript has none
    expect(q.frameworks!.python).toEqual(['none', 'fastapi', 'django', 'flask', 'streamlit']);
    expect(q.detected).toBeNull();
  });

  it('lists, per IDE choice, the files outside .specs/ that already exist', async () => {
    const root = folder({ '.gitattributes': 'x\n', '.vscode/settings.json': '{}', 'CLAUDE.md': '# mine\n', '.claude/commands/specpilot-status.md': 'old\n' });
    const q = await setupQuestions(root);
    expect(q.keep.vscode).toEqual(['.vscode/settings.json', '.gitattributes']);
    expect(q.keep['claude-code']).toEqual(['CLAUDE.md', '.claude/commands/specpilot-status.md', '.gitattributes']);
    expect(q.keep.Cursor).toEqual(['.gitattributes']);
  });

  it('throws when the detector cannot read the folder, or the OS username cannot be read', async () => {
    await expect(setupQuestions(folder({ 'package.json': '{not json' }))).rejects.toThrow();
    await expect(setupQuestions(folder({ 'package.json': '{"name":"n","author":null}' }))).rejects.toThrow();
    jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('no user');
    });
    await expect(setupQuestions(folder())).rejects.toThrow('no user');
  });
});

describe('answersShapeError()', () => {
  it('accepts the fixed choices and a well-formed or empty handle', () => {
    expect(answersShapeError(FULL)).toBeNull();
    expect(answersShapeError({ ...FULL, handle: '' })).toBeNull();
    expect(answersShapeError({ ...FULL, handle: '  a.b_c-9  ' })).toBeNull();
    expect(answersShapeError({ ...FULL, language: 'python', framework: 'none' })).toBeNull();
  });

  it.each([
    [null, 'JSON object'],
    [[], 'JSON object'],
    ['x', 'JSON object'],
    [{ ...FULL, extra: 1 }, 'Unexpected field "extra"'],
    [{ projectType: 'brownfield', apiParadigm: 'rest', ide: 'vscode' }, '"handle" is missing'],
    [{ ...FULL, ide: 7 }, '"ide" must be a string'],
    [{ ...FULL, projectType: 'blue' }, '"projectType" must be one of'],
    [{ ...FULL, apiParadigm: 'soap' }, '"apiParadigm" must be one of'],
    [{ ...FULL, ide: 'vim' }, '"ide" must be one of'],
    [{ ...FULL, handle: 'j smith' }, 'The handle must be'],
    [{ ...FULL, handle: '{{x}}' }, 'The handle must be'],
    [{ ...FULL, handle: '.hidden' }, 'The handle must be'],
    [{ ...FULL, handle: 'a\nb' }, 'The handle must be'],
    [{ ...FULL, handle: 'a'.repeat(40) }, 'The handle must be'],
  ])('refuses %j', (body, message) => {
    expect(answersShapeError(body)).toContain(message);
  });

  it('accepts a 39-character handle', () => {
    expect(answersShapeError({ ...FULL, handle: 'a'.repeat(39) })).toBeNull();
  });
});

describe('setupProject() writes what add-specs writes', () => {
  it.each(IDES)('byte for byte, for %s, in a detected project', async ide => {
    const [a, b] = [folder(NODE_REACT), folder(NODE_REACT)];
    const out = await setupProject(a, { ...FULL, ide });
    expect(out).toEqual({ status: 200, kept: [], notice: ide === 'Codex' ? CODEX_PROMPTS_NOTICE : null });
    const expected = await cliOutput(b, { ...FULL, ide });
    const got = tree(a);
    expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    for (const p of Object.keys(expected)) expect([p, got[p].equals(expected[p])]).toEqual([p, true]);
    expect(readdirSync(a).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
    expect(specsMissing(a)).toBe(false);
  });

  it('byte for byte when nothing is detected and the page chose the language and framework', async () => {
    const [a, b] = [folder(), folder()];
    const answers = { ...FULL, language: 'python', framework: 'django', ide: 'Cursor' };
    expect((await setupProject(a, answers)).status).toBe(200);
    const expected = await cliOutput(b, answers);
    const got = tree(a);
    expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    for (const p of Object.keys(expected)) expect([p, got[p].equals(expected[p])]).toEqual([p, true]);
    expect(readFileSync(join(a, '.specs/project/project.yaml'), 'utf-8')).toContain('python');
  });

  it('uses the OS username for an empty handle, as the CLI does', async () => {
    const a = folder(NODE_PLAIN);
    expect((await setupProject(a, { ...FULL, framework: 'express', handle: '   ' })).status).toBe(200);
    expect(readFileSync(join(a, '.specs/project/project.yaml'), 'utf-8')).toContain(`devPrefix: "${os.userInfo().username}"`);
  });

  it('runs the analysis before the staging folder exists', async () => {
    const a = folder(NODE_REACT);
    await setupProject(a, FULL);
    expect(readFileSync(join(a, '.specs/architecture/architecture.md'), 'utf-8')).not.toContain('.specpilot-setup-');
  });
});

describe('setupProject() keeps every existing file outside .specs/', () => {
  const existing = {
    '.gitattributes': '* text=auto\n', // add-specs would append its merge=union lines to this
    'CLAUDE.md': '# my own CLAUDE.md\n',
    '.github/copilot-instructions.md': 'mine\n',
    '.github/workflows/ci.yml': 'on: push\n',
    '.claude/commands/specpilot-status.md': 'old command\n',
  };

  it('keeps them byte for byte, lists them in generator order, and creates the rest', async () => {
    const root = folder({ ...NODE_REACT, ...existing });
    mkdirSync(join(root, '.claude/commands/specpilot-report.md')); // a folder at a target path
    symlinkSync(join(root, 'nowhere'), join(root, '.claude/commands/specpilot-sync.md')); // a dangling link at a target path
    const outside = join(root, '..', 'elsewhere.md');
    writeFileSync(outside, 'outside\n');
    symlinkSync(outside, join(root, '.claude/commands/specpilot-refine.md')); // a live link to a file outside the folder
    const before = tree(root);
    const out = await setupProject(root, { ...FULL, ide: 'claude-code' });
    expect(out).toEqual({
      status: 200,
      kept: ['CLAUDE.md', '.claude/commands/specpilot-status.md', '.claude/commands/specpilot-report.md', '.claude/commands/specpilot-sync.md', '.claude/commands/specpilot-refine.md', '.gitattributes'],
      notice: null,
    });
    const after = tree(root);
    for (const p of Object.keys(before)) expect([p, after[p].equals(before[p])]).toEqual([p, true]);
    expect(readFileSync(join(root, '.gitattributes'), 'utf-8')).toBe('* text=auto\n');
    expect(readFileSync(outside, 'utf-8')).toBe('outside\n');
    expect(lstatSync(join(root, '.claude/commands/specpilot-sync.md')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(root, '.claude/commands/specpilot-report.md')).isDirectory()).toBe(true);
    expect(after['.claude/skills/specpilot-project/SKILL.md']).toBeDefined();
    expect(after['.claude/commands/specpilot-archive.md']).toBeDefined();
    expect(after['.specs/planning/tasks.md']).toBeDefined();
    expect(readdirSync(root).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
  });

  it('uses an existing real folder on the way as it is (Copilot choice beside .github/workflows/)', async () => {
    const root = folder({ ...NODE_REACT, '.github/workflows/ci.yml': 'on: push\n' });
    expect(await setupProject(root, FULL)).toEqual({ status: 200, kept: [], notice: null });
    expect(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf-8')).toBe('on: push\n');
    expect(tree(root)['.github/copilot-instructions.md']).toBeDefined();
  });

  it('refuses when a folder on the way is a regular file or a link, writing nothing', async () => {
    const asFile = folder({ ...NODE_REACT, '.github': 'not a folder\n' });
    const before = tree(asFile);
    expect(await setupProject(asFile, FULL)).toEqual({ status: 409, error: '.github is not a folder, so nothing was written.', specsExists: false });
    expect(tree(asFile)).toEqual(before);

    const linked = folder(NODE_REACT);
    const outsideDir = join(linked, '..', 'outside-dir');
    mkdirSync(outsideDir);
    symlinkSync(outsideDir, join(linked, '.github'));
    const before2 = tree(linked);
    expect(await setupProject(linked, FULL)).toEqual({ status: 409, error: '.github is a symbolic link, so nothing was written.', specsExists: false });
    expect(tree(linked)).toEqual(before2);
    expect(readdirSync(outsideDir)).toEqual([]);
    expect(specsMissing(linked)).toBe(true);
  });
});

describe('setupProject() preconditions and refusals', () => {
  it.each([
    ['a folder', (root: string) => mkdirSync(join(root, '.specs'))],
    ['a file', (root: string) => writeFileSync(join(root, '.specs'), 'x')],
    ['a link', (root: string) => symlinkSync(join(root, 'src'), join(root, '.specs'))],
  ])('answers 409 when .specs exists as %s', async (_what, make) => {
    const root = folder(NODE_REACT);
    make(root);
    const before = tree(root);
    const out = await setupProject(root, FULL);
    expect(out.status).toBe(409);
    expect((out as { specsExists: boolean }).specsExists).toBe(true);
    expect(tree(root)).toEqual(before);
    expect(specsMissing(root)).toBe(false);
  });

  it.each([
    ['language sent when detected', NODE_REACT, { ...FULL, language: 'python' }, '"language" must not be sent'],
    ['framework sent when detected', NODE_REACT, { ...FULL, framework: 'vue' }, '"framework" must not be sent'],
    ['language missing when not detected', {}, FULL, '"language" is missing'],
    ['language not supported', {}, { ...FULL, language: 'cobol' }, '"language" must be one of'],
    ['framework missing when the language has some', {}, { ...FULL, language: 'typescript' }, '"framework" is missing'],
    ['framework of another language', {}, { ...FULL, language: 'typescript', framework: 'django' }, '"framework" must be one of'],
    ['framework sent for a language without any', {}, { ...FULL, language: 'javascript', framework: 'none' }, '"framework" must not be sent'],
    ['framework missing when the detected language has some', NODE_PLAIN, FULL, '"framework" is missing'],
  ])('answers 422 for %s', async (_what, files, answers, message) => {
    const root = folder(files as Record<string, string>);
    const before = tree(root);
    const out = await setupProject(root, answers);
    expect(out.status).toBe(422);
    expect((out as { error: string }).error).toContain(message);
    expect(tree(root)).toEqual(before);
    expect(readdirSync(root).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
  });

  it('answers 422 with the reason when the detector or the OS username fails, and makes no staging folder', async () => {
    const bad = folder({ 'package.json': '{not json' });
    const out = await setupProject(bad, FULL);
    expect(out.status).toBe(422);
    expect(readdirSync(bad)).toEqual(['package.json']);
    jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('no user');
    });
    const plain = folder(NODE_REACT);
    expect(await setupProject(plain, FULL)).toEqual({ status: 422, error: 'This folder could not be read: no user' });
  });

  it('rolls back only what it created when a write fails, and leaves what another process put there', async () => {
    const root = folder(NODE_REACT);
    const before = tree(root);
    const real = realFs.openSync;
    let opens = 0;
    jest.spyOn(realFs, 'openSync').mockImplementation(((path: import('fs').PathLike, flags: import('fs').OpenMode, mode?: import('fs').Mode) => {
      // Placement opens only: the generator's own writes into the staging folder are `wx` too (BL-073).
      if (flags === 'wx' && !String(path).includes('.specpilot-setup-') && ++opens === 3) {
        writeFileSync(join(root, '.github', 'foreign.txt'), 'someone else\n'); // lands in a folder setup just created
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }
      return real(path, flags, mode);
    }) as typeof realFs.openSync);
    const out = await setupProject(root, FULL);
    expect(out).toEqual({ status: 500, error: 'Setup could not finish: disk full. The files it had created were removed.' });
    const after = tree(root);
    expect(after).toEqual({ ...before, '.github/foreign.txt': Buffer.from('someone else\n') });
    expect(readdirSync(root).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
    expect(specsMissing(root)).toBe(true);
  });

  it('rolls back and answers 409 when .specs appears during the creates', async () => {
    const root = folder(NODE_REACT);
    const before = tree(root);
    const real = realFs.openSync;
    jest.spyOn(realFs, 'openSync').mockImplementation(((path: import('fs').PathLike, flags: import('fs').OpenMode, mode?: import('fs').Mode) => {
      if (flags === 'wx' && String(path).includes(`${join(root, '.specs')}`) && !realFs.existsSync(join(root, '.specs', 'README.md'))) {
        writeFileSync(join(root, '.specs', 'README.md'), 'someone else\n'); // another writer, the instant before ours
      }
      return real(path, flags, mode);
    }) as typeof realFs.openSync);
    const out = await setupProject(root, FULL);
    expect(out).toEqual({ status: 409, error: '.specs/ was created by something else while setup ran, so setup stopped and removed what it had created.', specsExists: true });
    expect(tree(root)).toEqual({ ...before, '.specs/README.md': Buffer.from('someone else\n') });
    expect(readdirSync(root).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
  });
});

describe('removeStaleStaging()', () => {
  const marked = (root: string, name: string) => {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, STAGING_MARKER), 'marker\n');
    writeFileSync(join(root, name, 'CLAUDE.md'), 'staged\n');
  };

  it('removes only a real, marked staging folder and names it', () => {
    const root = folder();
    marked(root, '.specpilot-setup-0123456789ab');
    mkdirSync(join(root, '.specpilot-setup-ffffffffffff')); // no marker
    mkdirSync(join(root, '.specpilot-setup-aaaaaaaaaaaa'));
    mkdirSync(join(root, '.specpilot-setup-aaaaaaaaaaaa', STAGING_MARKER)); // marker that is a folder
    writeFileSync(join(root, '.specpilot-setup-bbbbbbbbbbbb'), 'a file\n');
    marked(root, 'my-setup-notes'); // marked, wrong name
    const elsewhere = join(root, '..', 'elsewhere');
    marked(join(root, '..'), 'elsewhere');
    symlinkSync(elsewhere, join(root, '.specpilot-setup-cccccccccccc')); // a link to a marked folder
    expect(removeStaleStaging(root)).toEqual([join(root, '.specpilot-setup-0123456789ab')]);
    expect(readdirSync(root).sort()).toEqual(
      ['.specpilot-setup-aaaaaaaaaaaa', '.specpilot-setup-bbbbbbbbbbbb', '.specpilot-setup-cccccccccccc', '.specpilot-setup-ffffffffffff', 'my-setup-notes'].sort(),
    );
    expect(readFileSync(join(elsewhere, 'CLAUDE.md'), 'utf-8')).toBe('staged\n');
  });

  it('removes a marked folder in a project that has .specs/ too, and returns nothing for a folder it cannot read', () => {
    const root = folder({ '.specs/project/project.yaml': 'name: x\n' });
    marked(root, '.specpilot-setup-0123456789ab');
    expect(removeStaleStaging(root)).toHaveLength(1);
    expect(removeStaleStaging(join(root, 'does-not-exist'))).toEqual([]);
  });
});

// ---- a new project (BL-PM-003): the same bytes as `specpilot init`, in a new or empty folder

/** A temp base (real path) to create projects in, and a separate temp home. */
function makeBase(): { base: string; home: string } {
  const base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-new-')));
  const home = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-newhome-')));
  bases.push(base, home);
  return { base, home };
}

const NEW = {
  projectType: 'greenfield', language: 'typescript', framework: 'react', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode',
  whatItDoes: 'Tracks parcels', targetUsers: 'Couriers', expectedScale: '', constraints: 'Offline first',
};

/** What the real `specpilot init <name>` writes in `dir` for the same answers (inquirer answered by question name). */
async function initOutput(dir: string, name: string, a: Record<string, string>): Promise<Record<string, Buffer>> {
  const answers: Record<string, string> = { ...a, developerName: a.handle };
  (inquirer.prompt as unknown as jest.Mock).mockImplementation(async (questions: { name: string }[]) =>
    Object.fromEntries(questions.map(q => [q.name, answers[q.name] ?? ''])));
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await initCommand(name, { lang: a.language, dir, specsName: '.specs', prompts: true });
  log.mockRestore();
  return tree(join(dir, name));
}

const sameTree = (got: Record<string, Buffer>, expected: Record<string, Buffer>) => {
  expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
  for (const p of Object.keys(expected)) expect([p, got[p].equals(expected[p])]).toEqual([p, true]);
};

describe('createProject() writes what specpilot init writes', () => {
  it.each(IDES)('byte for byte, for %s, in a folder it creates', async ide => {
    const [a, b] = [makeBase(), makeBase()];
    const out = await createProject(a.base, 'demo', { ...NEW, ide }, [], a.home);
    expect(out).toEqual({ status: 200, root: join(a.base, 'demo'), kept: [], notice: ide === 'Codex' ? CODEX_PROMPTS_NOTICE : null });
    sameTree(tree(join(a.base, 'demo')), await initOutput(b.base, 'demo', { ...NEW, ide }));
    expect(readdirSync(join(a.base, 'demo')).some(n => n.startsWith('.specpilot-setup-'))).toBe(false);
    expect(readdirSync(a.base)).toEqual(['demo']);
  });

  it('byte for byte for brownfield, a language without frameworks, an empty handle and only the required context answer', async () => {
    const [a, b] = [makeBase(), makeBase()];
    const answers = { projectType: 'brownfield', language: 'javascript', apiParadigm: 'none', handle: '  ', ide: 'claude-code', whatItDoes: ' A thing ' };
    expect((await createProject(a.base, 'app_v2.x', answers, [], a.home)).status).toBe(200);
    sameTree(tree(join(a.base, 'app_v2.x')), await initOutput(b.base, 'app_v2.x', { ...answers, handle: '' }));
    expect(readFileSync(join(a.base, 'app_v2.x/.specs/project/project.yaml'), 'utf-8')).toContain(`devPrefix: "${os.userInfo().username}"`);
  });

  it('writes the context answers into onboarding.md as plain text, NOT_SPECIFIED for an empty one, and "none" as no framework', async () => {
    const a = makeBase();
    expect((await createProject(a.base, 'demo', { ...NEW, framework: 'none', whatItDoes: 'Uses {{author}} & <b>' }, [], a.home)).status).toBe(200);
    const onboarding = readFileSync(join(a.base, 'demo/.specs/development/onboarding.md'), 'utf-8');
    expect(onboarding).toContain('- **What it does:** Uses {{author}} & <b>\n');
    expect(onboarding).toContain(`- **Expected scale:** ${NOT_SPECIFIED}\n`);
    expect(onboarding).toContain('Tech stack: typescript\n');
  });

  it('uses an existing empty folder as it is', async () => {
    const [a, b] = [makeBase(), makeBase()];
    mkdirSync(join(a.base, 'demo'), { mode: 0o750 });
    expect((await createProject(a.base, 'demo', NEW, [], a.home)).status).toBe(200);
    sameTree(tree(join(a.base, 'demo')), await initOutput(b.base, 'demo', NEW));
    expect(lstatSync(join(a.base, 'demo')).mode & 0o777).toBe(0o750);
  });

  it('resolves ~/ against the given home, builds the target under a linked parent\'s real path, and allows a served folder as parent', async () => {
    const a = makeBase();
    mkdirSync(join(a.home, 'dev'));
    expect(await createProject('~/dev', 'one', NEW, [], a.home)).toMatchObject({ status: 200, root: join(a.home, 'dev', 'one') });
    symlinkSync(join(a.home, 'dev'), join(a.base, 'link'));
    expect(await createProject(join(a.base, 'link'), 'two', NEW, [join(a.home, 'dev')], a.home)).toMatchObject({ status: 200, root: join(a.home, 'dev', 'two') });
    expect(readdirSync(a.base)).toEqual(['link']);
  });
});

describe('createProject() refusals: nothing created, nothing changed', () => {
  const refused = async (parent: (a: { base: string; home: string }) => string, name: string, expected: object, prepare?: (a: { base: string; home: string }) => void, roots: (a: { base: string }) => string[] = () => []) => {
    const a = makeBase();
    prepare?.(a);
    const before = [tree(a.base), tree(a.home), readdirSync(a.base), readdirSync(a.home)];
    expect(await createProject(parent(a), name, NEW, roots(a), a.home)).toEqual(expected);
    expect([tree(a.base), tree(a.home), readdirSync(a.base), readdirSync(a.home)]).toEqual(before);
    return a;
  };

  it('a relative, missing or non-folder parent, with checkOpenPath()\'s own words', async () => {
    await refused(() => 'dev', 'demo', { status: 422, error: 'The path must be absolute, e.g. /Users/you/project or ~/project.' });
    await refused(a => join(a.base, 'nope'), 'demo', { status: 422, error: expect.stringMatching(/^Folder not found: .*nope$/) });
    await refused(a => join(a.base, 'f.txt'), 'demo', { status: 422, error: expect.stringMatching(/^Not a folder: .*f\.txt$/) }, a => writeFileSync(join(a.base, 'f.txt'), 'x'));
  });

  it('the home folder or a root as parent, with the parent field\'s own message', async () => {
    const error = 'Pick a folder inside your home folder, like ~/dev.';
    await refused(() => '~', 'demo', { status: 422, error });
    await refused(a => a.home, 'demo', { status: 422, error });
    await refused(() => '/', 'specpilot-must-not-exist', { status: 422, error });
    expect(existsSync('/specpilot-must-not-exist')).toBe(false);
  });

  it('a parent that is a .specs folder, under one, or .SPECS', async () => {
    const error = 'A project cannot be created inside a .specs/ folder.';
    const prepare = (a: { base: string }) => mkdirSync(join(a.base, 'proj', '.specs', 'planning'), { recursive: true });
    await refused(a => join(a.base, 'proj', '.specs'), 'demo', { status: 422, error }, prepare);
    await refused(a => join(a.base, 'proj', '.specs', 'planning'), 'demo', { status: 422, error }, prepare);
    await refused(a => join(a.base, '.SPECS'), 'demo', { status: 422, error }, a => mkdirSync(join(a.base, '.SPECS')));
    // a folder inside a project that is not .specs is fine
    const a = makeBase();
    mkdirSync(join(a.base, 'proj', '.specs'), { recursive: true });
    mkdirSync(join(a.base, 'proj', 'packages'));
    expect((await createProject(join(a.base, 'proj', 'packages'), 'demo', NEW, [join(a.base, 'proj')], a.home)).status).toBe(200);
  });

  it('a target that is a link (to a folder, or dangling), a file, or a folder with anything in it', async () => {
    const link = (a: { base: string }) => expect.objectContaining({ status: 409, error: `${join(a.base, 'demo')} is a symbolic link, so nothing was created.` });
    let a = makeBase();
    mkdirSync(join(a.base, 'real'));
    symlinkSync(join(a.base, 'real'), join(a.base, 'demo'));
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual(link(a));
    expect(readdirSync(join(a.base, 'real'))).toEqual([]);
    a = makeBase();
    symlinkSync(join(a.base, 'gone'), join(a.base, 'demo'));
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual(link(a));
    expect(existsSync(join(a.base, 'gone'))).toBe(false);
    await refused(x => x.base, 'demo', { status: 409, error: expect.stringMatching(/demo exists and is not a folder, so nothing was created\.$/) }, x => writeFileSync(join(x.base, 'demo'), 'x'));
    const notEmpty = { status: 409, error: expect.stringMatching(/demo already exists and is not empty\. Use the Folder tab to open it and add \.specs\/ there\.$/) };
    await refused(x => x.base, 'demo', notEmpty, x => { mkdirSync(join(x.base, 'demo')); writeFileSync(join(x.base, 'demo', 'README.md'), 'mine\n'); });
    await refused(x => x.base, 'demo', notEmpty, x => { mkdirSync(join(x.base, 'demo')); writeFileSync(join(x.base, 'demo', '.DS_Store'), ''); });
    await refused(x => x.base, 'demo', notEmpty, x => mkdirSync(join(x.base, 'demo', 'sub'), { recursive: true }));
  });

  it('a target that is already served: an empty served folder, and a served root whose folder is gone', async () => {
    const served = (a: { base: string }) => ({ status: 409, error: `${join(a.base, 'demo')} is already open as project 1.`, project: 1 });
    let a = makeBase();
    mkdirSync(join(a.base, 'demo'));
    expect(await createProject(a.base, 'demo', NEW, ['/x', join(a.base, 'demo')], a.home)).toEqual(served(a));
    expect(readdirSync(join(a.base, 'demo'))).toEqual([]);
    a = makeBase();
    expect(await createProject(a.base, 'demo', NEW, ['/x', join(a.base, 'demo')], a.home)).toEqual(served(a));
    expect(readdirSync(a.base)).toEqual([]);
  });

  it('a target that is the home folder gets checkOpenPath()\'s refusal', async () => {
    const base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-new-')));
    bases.push(base);
    mkdirSync(join(base, 'me'));
    expect(await createProject(base, 'me', NEW, [], join(base, 'me'))).toEqual({ status: 422, error: 'SpecPilot does not open your home folder or the root of a drive.' });
    expect(readdirSync(join(base, 'me'))).toEqual([]);
  });

  it('a mkdir that fails: the target appeared since the lstat (409), or the parent is not writable (422)', async () => {
    let a = makeBase();
    const real = realFs.mkdirSync;
    jest.spyOn(realFs, 'mkdirSync').mockImplementationOnce(((path: import('fs').PathLike) => {
      real(path); // something else makes it first
      writeFileSync(join(String(path), 'theirs.txt'), 'x');
      return real(path); // ours then fails with EEXIST
    }) as typeof realFs.mkdirSync);
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual({ status: 409, error: `${join(a.base, 'demo')} was created by something else just now, so nothing was written.` });
    expect(tree(a.base)).toEqual({ 'demo/theirs.txt': Buffer.from('x') });
    jest.restoreAllMocks();
    a = makeBase();
    mkdirSync(join(a.base, 'ro'), { mode: 0o555 });
    const out = await createProject(join(a.base, 'ro'), 'demo', NEW, [], a.home);
    chmodSync(join(a.base, 'ro'), 0o755);
    if (process.getuid?.() !== 0) expect(out).toEqual({ status: 422, error: `${join(a.base, 'ro', 'demo')} could not be created (EACCES).` });
    if (process.getuid?.() !== 0) expect(readdirSync(join(a.base, 'ro'))).toEqual([]);
  });

  it('an OS username that cannot be read, when the handle is empty', async () => {
    const a = makeBase();
    jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('no passwd entry');
    });
    expect(await createProject(a.base, 'demo', { ...NEW, handle: '' }, [], a.home)).toEqual({ status: 422, error: 'The OS username could not be read: no passwd entry' });
    expect(readdirSync(a.base)).toEqual([]);
    expect((await createProject(a.base, 'demo', NEW, [], a.home)).status).toBe(200); // a handle was given: the username is not needed
  });
});

describe('createProject() rollback', () => {
  const failThirdCreate = (onFail: () => void) => {
    const real = realFs.openSync;
    let opens = 0;
    jest.spyOn(realFs, 'openSync').mockImplementation(((path: import('fs').PathLike, flags: import('fs').OpenMode, mode?: import('fs').Mode) => {
      if (flags === 'wx' && !String(path).includes('.specpilot-setup-') && ++opens === 3) {
        onFail();
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }
      return real(path, flags, mode);
    }) as typeof realFs.openSync);
  };
  const failed = { status: 500, error: 'Setup could not finish: disk full. The files it had created were removed.' };

  it('removes the files, the staging folder and the folder it created', async () => {
    const a = makeBase();
    failThirdCreate(() => undefined);
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual(failed);
    expect(readdirSync(a.base)).toEqual([]);
  });

  it('leaves an existing empty folder it used, empty', async () => {
    const a = makeBase();
    mkdirSync(join(a.base, 'demo'));
    failThirdCreate(() => undefined);
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual(failed);
    expect(readdirSync(a.base)).toEqual(['demo']);
    expect(readdirSync(join(a.base, 'demo'))).toEqual([]);
  });

  it('keeps the folder, and the file, when something else put a file there during the run', async () => {
    const a = makeBase();
    failThirdCreate(() => writeFileSync(join(a.base, 'demo', 'theirs.txt'), 'someone else\n'));
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toEqual(failed);
    expect(tree(a.base)).toEqual({ 'demo/theirs.txt': Buffer.from('someone else\n') });
    expect(readdirSync(join(a.base, 'demo'))).toEqual(['theirs.txt']);
  });

  it('keeps a file that appears outside .specs/ during the run and reports it', async () => {
    const a = makeBase();
    const real = realFs.openSync;
    jest.spyOn(realFs, 'openSync').mockImplementation(((path: import('fs').PathLike, flags: import('fs').OpenMode, mode?: import('fs').Mode) => {
      if (flags === 'wx' && String(path) === join(a.base, 'demo', '.gitattributes')) writeFileSync(String(path), 'theirs\n');
      return real(path, flags, mode);
    }) as typeof realFs.openSync);
    expect(await createProject(a.base, 'demo', NEW, [], a.home)).toMatchObject({ status: 200, kept: ['.gitattributes'] });
    expect(readFileSync(join(a.base, 'demo', '.gitattributes'), 'utf-8')).toBe('theirs\n');
  });
});

describe('newProjectQuestions()', () => {
  it('returns init\'s questions in its order, with the CLI\'s own text, Greenfield first', () => {
    const q = newProjectQuestions();
    expect(q.questions.map(x => x.key)).toEqual(['projectType', 'language', 'framework', 'apiParadigm', 'handle', 'ide', 'whatItDoes', 'targetUsers', 'expectedScale', 'constraints']);
    expect(q.questions[0]).toEqual({
      key: 'projectType', message: 'Is this a greenfield or brownfield project?',
      choices: [
        { name: 'Greenfield — new project, writing code from scratch', value: 'greenfield' },
        { name: 'Brownfield — existing codebase, initializing specs retroactively', value: 'brownfield' },
      ],
    });
    expect(q.questions[1]).toEqual({ key: 'language', message: 'Choose a language:', choices: SUPPORTED_LANGUAGES.map(v => ({ name: v, value: v })) });
    expect(q.questions[2]).toEqual({ key: 'framework', message: 'Choose a framework:' });
    expect(q.questions[3].choices).toBe(API_PARADIGM_CHOICES);
    expect(q.questions[4].message).toContain(`[${os.userInfo().username}]:`);
    expect(q.questions[5].choices).toBe(IDE_CHOICES);
    expect(q.questions.slice(6).map(x => x.message)).toEqual([
      'What does your project do? (required):', 'Who are the target users? (Enter to skip):', 'What\'s the expected scale? (Enter to skip):', 'Any key constraints or requirements? (Enter to skip):',
    ]);
    expect(q.frameworks.typescript).toEqual(['none', 'react', 'express', 'next', 'nest', 'vue', 'angular']);
    expect(q.frameworks.javascript).toBeUndefined();
  });

  it('throws when the OS username cannot be read', () => {
    jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('no passwd entry');
    });
    expect(() => newProjectQuestions()).toThrow('no passwd entry');
  });
});

describe('newProjectShapeError()', () => {
  const body = (over: Record<string, unknown> = {}, drop: string[] = []) => {
    const b: Record<string, unknown> = { parent: '/tmp/x', name: 'demo', ...NEW, ...over };
    for (const k of drop) delete b[k];
    return b;
  };
  const NAME = 'Project name must start with a letter or number and contain only letters, numbers, dots, hyphens, and underscores.';

  it('accepts a full body, one without the optional context answers, and a language without frameworks', () => {
    expect(newProjectShapeError(body())).toBeNull();
    expect(newProjectShapeError(body({}, ['targetUsers', 'expectedScale', 'constraints']))).toBeNull();
    expect(newProjectShapeError(body({ language: 'javascript' }, ['framework']))).toBeNull();
    expect(newProjectShapeError(body({ framework: 'none', handle: '' }))).toBeNull();
    expect(newProjectShapeError(body({ name: 'a'.repeat(214), whatItDoes: 'x'.repeat(1000) }))).toBeNull();
  });

  it.each([
    ['not an object', null, 'The request must be a JSON object with parent, name and the answers to the questions.'],
    ['an array', [], 'The request must be a JSON object with parent, name and the answers to the questions.'],
    ['an unknown key', body({ dir: '/' }), 'Unexpected field "dir".'],
    ['a value that is not a string', body({ whatItDoes: 3 }), '"whatItDoes" must be a string.'],
    ['an empty parent', body({ parent: '' }), '"parent" must be 1 to 4096 characters.'],
    ['a parent of 4097 characters', body({ parent: '/' + 'a'.repeat(4096) }), '"parent" must be 1 to 4096 characters.'],
    ['a parent with NUL', body({ parent: '/tmp/a' + String.fromCharCode(0) }), '"parent" must not contain a NUL character.'],
    ['an empty name', body({ name: '' }), 'Project name is required and cannot be empty.'],
    ['a name of 215 characters', body({ name: 'a'.repeat(215) }), 'Project name must be 214 characters or fewer.'],
    ['a name with ..', body({ name: '../x' }), NAME],
    ['a name with a separator', body({ name: 'a/b' }), NAME],
    ['a hidden name', body({ name: '.specs' }), NAME],
    ['a name with a space', body({ name: 'my project' }), NAME],
    ['a name with template syntax', body({ name: '{{x}}' }), NAME],
    ['a bad project type', body({ projectType: 'new' }), '"projectType" must be one of: greenfield, brownfield.'],
    ['a bad language', body({ language: 'rust' }), '"language" must be one of: typescript, javascript, python, kotlin, swift.'],
    ['a bad API paradigm', body({ apiParadigm: 'soap' }), '"apiParadigm" must be one of: rest, cli, graphql, none.'],
    ['a bad IDE', body({ ide: 'vim' }), '"ide" must be one of: vscode, Cursor, Windsurf, Antigravity, claude-code, Codex.'],
    ['a missing framework', body({}, ['framework']), '"framework" is missing.'],
    ['a framework of another language', body({ framework: 'django' }), '"framework" must be one of: none, react, express, next, nest, vue, angular.'],
    ['a framework for a language without any', body({ language: 'javascript' }), '"framework" must not be sent for this language.'],
    ['a bad handle', body({ handle: 'a b' }), 'The handle must be 1 to 39 characters of letters, digits, dots, underscores and hyphens, starting with a letter or digit.'],
    ['an empty whatItDoes', body({ whatItDoes: '' }), '"whatItDoes" must not be empty.'],
    ['a blank whatItDoes', body({ whatItDoes: '   ' }), '"whatItDoes" must not be empty.'],
    ['a context answer of 1001 characters', body({ constraints: 'x'.repeat(1001) }), '"constraints" must be at most 1000 characters.'],
  ])('refuses %s', (_label, b, message) => {
    expect(newProjectShapeError(b)).toBe(message);
  });

  it.each(['parent', 'name', 'projectType', 'language', 'apiParadigm', 'handle', 'ide', 'whatItDoes'])('refuses a body without %s', key => {
    expect(newProjectShapeError(body({}, [key]))).toBe(`"${key}" is missing.`);
  });

  it.each([['a line feed', 10], ['a tab', 9], ['NUL', 0], ['U+0085', 0x85], ['U+2028', 0x2028], ['U+2029', 0x2029], ['DEL', 0x7f]])('refuses a context answer with %s inside it', (_label, code) => {
    for (const key of ['whatItDoes', 'targetUsers', 'expectedScale', 'constraints']) {
      expect(newProjectShapeError(body({ [key]: `one${String.fromCharCode(code)}two` }))).toBe(`"${key}" must be one line of text, without control characters.`);
    }
  });
});
