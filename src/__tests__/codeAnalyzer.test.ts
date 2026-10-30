import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { CodeAnalyzer } from '../utils/codeAnalyzer';

// BL-136 (REQ-002.D.6; audit run-1 items 9 and 10, SEC-002.13 (c)): the analysis follows no link and is bounded.
const MB = 1024 * 1024;

(process.platform === 'win32' ? describe.skip : describe)('CodeAnalyzer walks (BL-136)', () => {
  let base: string;
  let root: string;
  let outside: string;
  const analyze = () => new CodeAnalyzer().analyzeCodebase(root);
  const treeLines = (tree: string) => tree.split('\n').filter(Boolean);
  /** A `.ts` file of exactly `size` bytes that starts with a TODO. */
  const sized = (path: string, size: number) => writeFileSync(path, '// TODO: big\n'.padEnd(size, 'x'));
  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-analyzer-')));
    root = join(base, 'root');
    outside = join(base, 'outside');
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(outside);
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  test('normal input still works: a TODO, a test file and the tree', async () => {
    writeFileSync(join(root, 'src', 'app.ts'), '// TODO: one thing\nexport const x = 1;\n');
    // at the root: a test file in a subfolder is stored relative to that folder and not counted (BL-149)
    writeFileSync(join(root, 'app.test.ts'), "test('x', () => {});\n");
    const r = await analyze();
    expect(r.todos.map(t => t.text)).toEqual(['one thing']);
    expect(r.tests.testFiles).toHaveLength(1);
    expect(r.tests.testCount).toBe(1);
    expect(r.architecture.directories).toContain('app.ts');
  });

  test('a folder linked outside is not entered: no outside name anywhere', async () => {
    writeFileSync(join(outside, 'OUTSIDE.ts'), '// TODO: OUTSIDE-TODO\n');
    writeFileSync(join(outside, 'outside.test.ts'), "test('x', () => {});\n");
    symlinkSync(outside, join(root, 'linked'));
    const text = JSON.stringify(await analyze());
    expect(text).not.toMatch(/OUTSIDE|outside\.test|linked/);
  });

  test('a link to a file inside the project is not listed', async () => {
    writeFileSync(join(root, 'src', 'app.ts'), 'export const x = 1;\n');
    symlinkSync(join(root, 'src', 'app.ts'), join(root, 'alias.ts'));
    expect((await analyze()).architecture.directories).not.toContain('alias.ts');
  });

  test('two links to the root and a link to /dev/zero: the walk returns at once', async () => {
    symlinkSync(root, join(root, 'loop1'));
    symlinkSync(root, join(root, 'src', 'loop2'));
    symlinkSync('/dev/zero', join(root, 'x.ts'));
    const started = Date.now();
    await analyze();
    expect(Date.now() - started).toBeLessThan(2000);
  }, 5000);

  test('a file of exactly 1 MB is read, one byte more is not', async () => {
    sized(join(root, 'src', 'a.ts'), MB);
    expect((await analyze()).todos).toHaveLength(1);
    sized(join(root, 'src', 'a.ts'), MB + 1);
    expect((await analyze()).todos).toHaveLength(0);
  });

  test('one run reads at most 8 MB: nine 1 MB files give eight TODOs', async () => {
    for (let i = 0; i < 9; i++) sized(join(root, 'src', `f${i}.ts`), MB);
    expect((await analyze()).todos).toHaveLength(8);
  });

  test('2100 files: TODOs, test files and tree lines each at most 2000', async () => {
    for (let i = 0; i < 2100; i++) writeFileSync(join(root, 'src', `f${i}.test.ts`), "// TODO: x\ntest('x', () => {});\n");
    const r = await analyze();
    expect(r.todos.length).toBeLessThanOrEqual(2000);
    expect(r.tests.testFiles.length).toBeLessThanOrEqual(2000);
    expect(treeLines(r.architecture.directories).length).toBeLessThanOrEqual(2000);
  });

  test('a TODO 20 folders deep is found, one 21 deep is not', async () => {
    const deep = (n: number) => join(root, ...Array.from({ length: n }, (_, i) => `d${i}`));
    mkdirSync(deep(21), { recursive: true });
    writeFileSync(join(deep(20), 'at20.ts'), '// TODO: at twenty\n');
    writeFileSync(join(deep(21), 'at21.ts'), '// TODO: at twenty-one\n');
    expect((await analyze()).todos.map(t => t.text)).toEqual(['at twenty']);
  });
});
