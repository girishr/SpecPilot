import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
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
import { answersShapeError, removeStaleStaging, setupProject, setupQuestions, specsMissing, STAGING_MARKER } from '../utils/specSetup';

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
