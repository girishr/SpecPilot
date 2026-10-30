import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { writeError, writeInside } from '../utils/specPaths';

// BL-130 (REQ-002.E.18): the CLI's one no-follow writer.
(process.platform === 'win32' ? describe.skip : describe)('writeInside() and writeError() (BL-130)', () => {
  let base: string;
  let project: string;
  let outside: string;
  beforeEach(() => {
    base = mkdtempSync(join(os.tmpdir(), 'specpilot-specpaths-'));
    project = join(base, 'project');
    outside = join(base, 'outside');
    mkdirSync(join(project, '.specs', 'planning'), { recursive: true });
    mkdirSync(outside);
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  test('an existing file is replaced, keeping its mode', () => {
    const file = join(project, '.specs', 'planning', 'tasks.md');
    writeFileSync(file, 'old\n');
    chmodSync(file, 0o640);
    expect(writeInside(project, '.specs/planning/tasks.md', 'new\n')).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('new\n');
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(readdirSync(join(project, '.specs', 'planning'))).toEqual(['tasks.md']);
  });

  test('missing folders and the file are created', () => {
    expect(writeInside(project, '.specs/security/deep/x.md', 'x')).toBe(true);
    expect(readFileSync(join(project, '.specs', 'security', 'deep', 'x.md'), 'utf-8')).toBe('x');
  });

  test('with create, an existing file is kept and false returned', () => {
    const file = join(project, '.specs', 'planning', 'tasks.md');
    writeFileSync(file, 'mine');
    expect(writeInside(project, '.specs/planning/tasks.md', 'theirs', { create: true })).toBe(false);
    expect(readFileSync(file, 'utf-8')).toBe('mine');
  });

  test('a linked file is refused and its target unchanged', () => {
    writeFileSync(join(outside, 'rc.txt'), 'ORIGINAL\n');
    symlinkSync(join(outside, 'rc.txt'), join(project, '.specs', 'planning', 'tasks-archive.md'));
    expect(writeError(project, '.specs/planning/tasks-archive.md')).toBe('.specs/planning/tasks-archive.md is a symbolic link, so nothing was written.');
    expect(() => writeInside(project, '.specs/planning/tasks-archive.md', 'echo PWNED\n')).toThrow('.specs/planning/tasks-archive.md is a symbolic link, so nothing was written.');
    expect(readFileSync(join(outside, 'rc.txt'), 'utf-8')).toBe('ORIGINAL\n');
  });

  test('a dangling link is refused and its target not created', () => {
    symlinkSync(join(outside, 'new.txt'), join(project, '.specs', 'planning', 'tasks-archive.md'));
    expect(() => writeInside(project, '.specs/planning/tasks-archive.md', 'x', { create: true })).toThrow('is a symbolic link, so nothing was written.');
    expect(existsSync(join(outside, 'new.txt'))).toBe(false);
  });

  test('a linked folder on the way is refused, also when it points inside the project', () => {
    rmSync(join(project, '.specs'), { recursive: true });
    mkdirSync(join(project, 'shared', 'planning'), { recursive: true });
    symlinkSync(join(project, 'shared'), join(project, '.specs'));
    expect(() => writeInside(project, '.specs/planning/tasks.md', 'x')).toThrow('.specs is a symbolic link, so nothing was written.');
    expect(readdirSync(join(project, 'shared', 'planning'))).toEqual([]);
  });

  test('a folder at the file\'s path is refused as not a regular file', () => {
    mkdirSync(join(project, '.specs', 'planning', 'tasks.md'));
    expect(writeError(project, '.specs/planning/tasks.md')).toBe('.specs/planning/tasks.md is not a regular file, so nothing was written.');
  });

  test('nothing in the way → null', () => {
    expect(writeError(project, '.specs/planning/tasks.md')).toBeNull();
    expect(writeError(project, '.gitattributes')).toBeNull();
  });
});
