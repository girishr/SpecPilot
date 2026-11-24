jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return { ...real, linkSync: jest.fn(real.linkSync) };
});

import * as fs from 'fs';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import {
  BOTH_ERROR, cursorLegacy, keepBoth, keepListPath, MAX_KEPT, MAX_ONLY_OLD, NO_LINKS_ERROR, NOT_OURS_ERROR, NOTHING_TO_DO,
  readKeepList, removeOldCursorRules, renameCursorRules,
} from '../utils/cursorLegacy';
import { migrateCommand } from '../commands/migrate';
import { SpecValidator } from '../utils/specValidator';

// SpecPilot's old Cursor rules file (BL-194, REQ-002.A.18). Temp folders and a temp HOME only.

const OLD_FRONT = '---\ndescription: Project mandates and AI coding rules\nglobs:\nalwaysApply: true\n---\n\n';
const OLD = '.cursor/rules/project.mdc';
const NEW = '.cursor/rules/specpilot.mdc';
let base: string;
let root: string;
let home: string;
const at = (rel: string) => join(root, rel);
const write = (rel: string, text: string) => {
  mkdirSync(join(at(rel), '..'), { recursive: true });
  writeFileSync(at(rel), text);
};
const sha = () => require('crypto').createHash('sha256').update(readFileSync(at(OLD))).digest('hex') as string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(os.tmpdir(), 'sp-cursor-')));
  root = join(base, 'project');
  home = join(base, 'home');
  mkdirSync(root);
  mkdirSync(home);
});
afterEach(() => {
  jest.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('cursorLegacy() (BL-194)', () => {
  it('is none without a file, and none (yours) for a project.mdc without SpecPilot\'s front matter', () => {
    expect(cursorLegacy(root, home)).toMatchObject({ state: 'none', yours: false, refused: null, sha256: null });
    write(OLD, 'No front matter.\n');
    expect(cursorLegacy(root, home)).toMatchObject({ state: 'none', yours: true });
    write(OLD, '---\ndescription: my own rule\n---\n\nUse tabs.\n');
    expect(cursorLegacy(root, home)).toMatchObject({ state: 'none', yours: true });
    write(OLD, 'Body first\n---\ndescription: Project mandates and AI coding rules\n---\n');
    expect(cursorLegacy(root, home).yours).toBe(true); // front matter only on the first line
  });

  it('is old for SpecPilot\'s file alone, matching the front-matter line trimmed', () => {
    write(OLD, '---\n  description: Project mandates and AI coding rules  \n---\n\nRule.\n');
    expect(cursorLegacy(root, home)).toMatchObject({ state: 'old', sha256: sha(), onlyOld: [], onlyOldCount: 0 });
  });

  it('is duplicate when every old body line is in specpilot.mdc, else edited with the lines in order, each once, capped', () => {
    write(OLD, OLD_FRONT + 'One.\n\n  Two.\n');
    write(NEW, OLD_FRONT + 'Two.\nOne.\nThree.\n');
    expect(cursorLegacy(root, home).state).toBe('duplicate');
    const lines = Array.from({ length: MAX_ONLY_OLD + 5 }, (_, i) => `Mine ${i}.`);
    write(OLD, OLD_FRONT + 'One.\nMine 0.\n' + lines.join('\n') + '\n');
    const s = cursorLegacy(root, home);
    expect(s.state).toBe('edited');
    expect(s.onlyOld).toEqual(lines.slice(0, MAX_ONLY_OLD));
    expect(s.onlyOldCount).toBe(MAX_ONLY_OLD + 5);
  });

  it('is kept only for a keep-list entry naming this project\'s real path, and the CLI step does not read it', () => {
    write(OLD, OLD_FRONT + 'One.\n');
    write(NEW, OLD_FRONT + 'One.\n');
    mkdirSync(join(home, '.specpilot'));
    writeFileSync(keepListPath(home), JSON.stringify({ version: 1, keepBoth: ['/somewhere/else'] }));
    expect(cursorLegacy(root, home).state).toBe('duplicate');
    writeFileSync(keepListPath(home), JSON.stringify({ version: 1, keepBoth: [root] }));
    expect(cursorLegacy(root, home).state).toBe('kept');
    expect(cursorLegacy(root, null).state).toBe('duplicate');
  });

  if (process.platform !== 'win32') {
    it('reads a linked file or folder, or a folder in place of the file, as none with the reason; both writes refuse it', () => {
      write('elsewhere.mdc', OLD_FRONT + 'One.\n');
      mkdirSync(at('.cursor/rules'), { recursive: true });
      symlinkSync(at('elsewhere.mdc'), at(OLD));
      expect(cursorLegacy(root, home)).toMatchObject({ state: 'none', refused: expect.stringContaining('symbolic link') });
      expect(renameCursorRules(root)).toMatchObject({ ok: false, status: 409 });
      rmSync(at('.cursor'), { recursive: true });
      mkdirSync(at('real/rules'), { recursive: true });
      writeFileSync(at('real/rules/project.mdc'), OLD_FRONT + 'One.\n');
      mkdirSync(at('.cursor'));
      symlinkSync(at('real/rules'), at('.cursor/rules'));
      expect(cursorLegacy(root, home).refused).toContain('.cursor/rules is a symbolic link');
      expect(removeOldCursorRules(root)).toMatchObject({ ok: false });
      rmSync(at('.cursor'), { recursive: true });
      mkdirSync(at(OLD), { recursive: true });
      expect(cursorLegacy(root, home).refused).toContain('not a regular file');
    });
  }
});

describe('an unreadable rules file (BL-194)', () => {
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  (process.platform === 'win32' || asRoot ? it.skip : it)('reads as none with the reason, refuses the writes, and validate does not throw', async () => {
    write(OLD, OLD_FRONT + 'One.\n');
    chmodSync(at(OLD), 0o000);
    try {
      expect(cursorLegacy(root, home)).toMatchObject({ state: 'none', refused: `${OLD} could not be read (EACCES).` });
      expect(renameCursorRules(root)).toEqual({ ok: false, status: 409, error: `${OLD} could not be read (EACCES).` });
      mkdirSync(at('.specs'));
      await expect(new SpecValidator().validate(root, { fix: false, verbose: false })).resolves.toBeDefined();
    } finally {
      chmodSync(at(OLD), 0o644);
    }
    write(NEW, OLD_FRONT + 'One.\n');
    chmodSync(at(NEW), 0o000);
    try {
      expect(cursorLegacy(root, home)).toMatchObject({ state: 'edited', onlyOld: ['One.'] });
    } finally {
      chmodSync(at(NEW), 0o644);
    }
  });
});

describe('renameCursorRules() and removeOldCursorRules() (BL-194)', () => {
  it('renames by link then unlink: specpilot.mdc has the old bytes and mode, project.mdc is gone', () => {
    write(OLD, OLD_FRONT + 'One.\n');
    if (process.platform !== 'win32') chmodSync(at(OLD), 0o640);
    const bytes = readFileSync(at(OLD));
    const mode = statSync(at(OLD)).mode;
    expect(renameCursorRules(root, sha())).toEqual({ ok: true, message: `Renamed ${OLD} to ${NEW}.` });
    expect(existsSync(at(OLD))).toBe(false);
    expect(readFileSync(at(NEW))).toEqual(bytes);
    expect(statSync(at(NEW)).mode).toBe(mode);
    expect(lstatSync(at(NEW)).nlink).toBe(1);
  });

  it('never overwrites a specpilot.mdc, even one that appears after the state was read (EEXIST)', () => {
    write(OLD, OLD_FRONT + 'One.\n');
    const real = jest.requireActual('fs').linkSync;
    (fs.linkSync as jest.Mock).mockImplementationOnce((a: string, b: string) => {
      writeFileSync(b, 'made in between\n');
      return real(a, b);
    });
    expect(renameCursorRules(root)).toEqual({ ok: false, status: 409, error: BOTH_ERROR });
    expect(readFileSync(at(NEW), 'utf-8')).toBe('made in between\n');
    expect(readFileSync(at(OLD), 'utf-8')).toBe(OLD_FRONT + 'One.\n');
  });

  it('refuses on a file system without hard links and leaves project.mdc untouched', () => {
    write(OLD, OLD_FRONT + 'One.\n');
    (fs.linkSync as jest.Mock).mockImplementationOnce(() => {
      throw Object.assign(new Error('nope'), { code: 'EPERM' });
    });
    expect(renameCursorRules(root)).toEqual({ ok: false, status: 422, error: NO_LINKS_ERROR });
    expect(readFileSync(at(OLD), 'utf-8')).toBe(OLD_FRONT + 'One.\n');
    expect(existsSync(at(NEW))).toBe(false);
  });

  it('refuses the user\'s file, a stale hash, nothing to rename, and both files', () => {
    expect(renameCursorRules(root)).toEqual({ ok: false, status: 409, error: NOTHING_TO_DO });
    write(OLD, '---\ndescription: mine\n---\n');
    expect(renameCursorRules(root)).toEqual({ ok: false, status: 409, error: NOT_OURS_ERROR });
    expect(removeOldCursorRules(root)).toEqual({ ok: false, status: 409, error: NOT_OURS_ERROR });
    write(OLD, OLD_FRONT + 'One.\n');
    expect(renameCursorRules(root, 'b'.repeat(64))).toMatchObject({ ok: false, status: 409, error: 'The file changed since the page read it.' });
    expect(removeOldCursorRules(root)).toMatchObject({ ok: false, status: 409 }); // no specpilot.mdc
    write(NEW, OLD_FRONT + 'One.\n');
    expect(renameCursorRules(root)).toEqual({ ok: false, status: 409, error: BOTH_ERROR });
    expect(removeOldCursorRules(root, sha())).toEqual({ ok: true, message: `Removed ${OLD}.` });
    expect(existsSync(at(OLD))).toBe(false);
    expect(existsSync(at(NEW))).toBe(true);
  });
});

describe('the keep list ~/.specpilot/cursor-rules.json (BL-194)', () => {
  beforeEach(() => {
    write(OLD, OLD_FRONT + 'One.\n');
    write(NEW, OLD_FRONT + 'One.\n');
  });

  it('is written 0600 in a 0700 folder, by temp file and rename, with the real path', () => {
    expect(keepBoth(root, home, sha())).toEqual({ ok: true, message: 'Kept both files on this machine.' });
    expect(JSON.parse(readFileSync(keepListPath(home), 'utf-8'))).toEqual({ version: 1, keepBoth: [root] });
    if (process.platform !== 'win32') {
      expect(statSync(join(home, '.specpilot')).mode & 0o777).toBe(0o700);
      expect(statSync(keepListPath(home)).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(join(home, '.specpilot'))).toEqual(['cursor-rules.json']);
    expect(cursorLegacy(root, home).state).toBe('kept');
  });

  it('refuses a stale hash once kept', () => {
    expect(keepBoth(root, home, sha()).ok).toBe(true);
    expect(keepBoth(root, home, 'd'.repeat(64))).toEqual({ ok: false, status: 409, error: 'The file changed since the page read it.' });
  });

  it('refuses old state and a stale hash', () => {
    rmSync(at(NEW));
    expect(keepBoth(root, home, sha())).toMatchObject({ ok: false, status: 409 });
    write(NEW, OLD_FRONT + 'One.\n');
    expect(keepBoth(root, home, 'c'.repeat(64))).toMatchObject({ ok: false, status: 409 });
    expect(existsSync(keepListPath(home))).toBe(false);
  });

  const leftAsItIs = (text: string, reason: string) => {
    mkdirSync(join(home, '.specpilot'), { recursive: true });
    writeFileSync(keepListPath(home), text);
    expect(readKeepList(home)).toEqual({ paths: [], error: expect.stringContaining(reason) });
    expect(cursorLegacy(root, home).state).toBe('duplicate');
    const out = keepBoth(root, home, sha());
    expect(out).toMatchObject({ ok: false, status: 422, error: expect.stringContaining(reason) });
    expect(readFileSync(keepListPath(home), 'utf-8')).toBe(text);
  };
  it('leaves bad JSON as it is and refuses keep', () => leftAsItIs('{', 'not valid JSON'));
  it('leaves a wrong shape as it is and refuses keep', () => leftAsItIs(JSON.stringify({ version: 1, keepBoth: ['relative/path'] }), 'could not be used'));
  it('leaves an extra key as it is and refuses keep', () => leftAsItIs(JSON.stringify({ version: 1, keepBoth: [], more: 1 }), 'could not be used'));
  it('refuses a full list of 1000', () => {
    mkdirSync(join(home, '.specpilot'));
    const full = JSON.stringify({ version: 1, keepBoth: Array.from({ length: MAX_KEPT }, (_, i) => `/p/${i}`) });
    writeFileSync(keepListPath(home), full);
    expect(keepBoth(root, home, sha())).toMatchObject({ ok: false, status: 422, error: expect.stringContaining(`${MAX_KEPT} projects`) });
    expect(readFileSync(keepListPath(home), 'utf-8')).toBe(full);
  });
  if (process.platform !== 'win32') {
    it('refuses a linked keep list or a linked .specpilot folder', () => {
      writeFileSync(join(base, 'elsewhere.json'), JSON.stringify({ version: 1, keepBoth: [root] }));
      mkdirSync(join(home, '.specpilot'));
      symlinkSync(join(base, 'elsewhere.json'), keepListPath(home));
      expect(readKeepList(home).error).toContain('symbolic link');
      expect(cursorLegacy(root, home).state).toBe('duplicate');
      rmSync(join(home, '.specpilot'), { recursive: true });
      mkdirSync(join(base, 'sp'));
      symlinkSync(join(base, 'sp'), join(home, '.specpilot'));
      expect(keepBoth(root, home, sha())).toMatchObject({ ok: false, status: 422, error: expect.stringContaining('symbolic link') });
      expect(fs.readdirSync(join(base, 'sp'))).toEqual([]);
    });
  }
});

describe('specpilot migrate --cursor-rules (BL-194)', () => {
  let logs: string[];
  let errs: string[];
  let exit: jest.SpyInstance;
  const run = async (removeOld = false) => {
    logs = [];
    errs = [];
    let code = 0;
    exit.mockImplementation(((c: number) => {
      code = c;
      throw new Error(`exit ${c}`);
    }) as never);
    await migrateCommand({ dir: root, from: 'complex', to: 'simple', backup: false, cursorRules: true, removeOld }).catch(() => {});
    return code;
  };
  beforeEach(() => {
    exit = jest.spyOn(process, 'exit');
    jest.spyOn(console, 'log').mockImplementation((...x: unknown[]) => void logs.push(x.join(' ')));
    jest.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errs.push(x.join(' ')));
  });

  it('says there is nothing to do, exit 0', async () => {
    expect(await run()).toBe(0);
    expect(logs).toEqual([NOTHING_TO_DO]);
  });

  it('renames SpecPilot\'s old file, exit 0', async () => {
    write(OLD, OLD_FRONT + 'One.\n');
    expect(await run()).toBe(0);
    expect(logs).toEqual([`Renamed ${OLD} to ${NEW}.`]);
    expect(existsSync(at(NEW))).toBe(true);
  });

  it('refuses the user\'s own file, exit 1, file left', async () => {
    write(OLD, '---\ndescription: mine\n---\n');
    expect(await run()).toBe(1);
    expect(errs).toEqual([NOT_OURS_ERROR]);
    expect(existsSync(at(OLD))).toBe(true);
  });

  it('with both files refuses without --remove-old (the lost lines listed, as plain text) and removes with it', async () => {
    write(OLD, OLD_FRONT + 'One.\nMine\u001b[31m red.\n');
    write(NEW, OLD_FRONT + 'One.\n');
    expect(await run()).toBe(1);
    expect(logs).toEqual(['It has 1 lines that specpilot.mdc does not have:', '  Mine[31m red.']);
    expect(errs).toEqual([BOTH_ERROR]);
    expect(existsSync(at(OLD))).toBe(true);
    expect(await run(true)).toBe(0);
    expect(logs).toEqual(['It has 1 lines that specpilot.mdc does not have:', '  Mine[31m red.', `Removed ${OLD}.`]);
    expect(existsSync(at(OLD))).toBe(false);
  });

  it('ignores the keep list', async () => {
    write(OLD, OLD_FRONT + 'One.\n');
    write(NEW, OLD_FRONT + 'One.\n');
    keepBoth(root, home, sha());
    expect(await run(true)).toBe(0);
    expect(existsSync(at(OLD))).toBe(false);
  });
});

describe('specpilot validate and the old Cursor rules file (BL-194)', () => {
  const savedHome = process.env.HOME;
  beforeEach(() => {
    process.env.HOME = home;
    mkdirSync(at('.specs'));
  });
  afterEach(() => {
    process.env.HOME = savedHome;
  });
  const cursorWarnings = async () => (await new SpecValidator().validate(root, { fix: false, verbose: false })).warnings.filter(w => w.includes('project.mdc'));

  it('warns for old, for both files, and not for kept or the user\'s file', async () => {
    expect(await cursorWarnings()).toEqual([]);
    write(OLD, '---\ndescription: mine\n---\n');
    expect(await cursorWarnings()).toEqual([]);
    write(OLD, OLD_FRONT + 'One.\n');
    expect(await cursorWarnings()).toEqual([".cursor/rules/project.mdc is SpecPilot's old Cursor rules file (before v2.1.0). Run specpilot migrate --cursor-rules to rename it to specpilot.mdc."]);
    write(NEW, OLD_FRONT + 'Two.\n');
    expect(await cursorWarnings()).toEqual([".cursor/rules/project.mdc is SpecPilot's old Cursor rules file and specpilot.mdc also exists, so Cursor loads the rules twice. Run specpilot migrate --cursor-rules --remove-old, or choose Keep both on the specpilot serve page."]);
    keepBoth(root, home, sha());
    expect(await cursorWarnings()).toEqual([]);
  });
});
