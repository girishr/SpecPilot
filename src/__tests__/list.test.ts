// BL-200 (REQ-002.A.4): `specpilot list` is read from the setup lists, not a fixed catalog.
import { readFileSync } from 'fs';
import { join } from 'path';
import { listCommand } from '../commands/list';
import { SUPPORTED_LANGUAGES } from '../utils/addSpecsQuestions';
import { getFrameworksForLanguage } from '../utils/frameworks';
import { targetsInSpecs } from '../core/render';

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function run(options: { lang?: string; verbose: boolean }) {
  const out: string[] = [];
  const log = jest.spyOn(console, 'log').mockImplementation((m?: unknown) => void out.push(plain(String(m))));
  const exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  let code = 0;
  try {
    await listCommand(options);
  } catch (e) {
    code = Number(/exit (\d+)/.exec(String(e))?.[1] ?? NaN);
  } finally {
    log.mockRestore();
    exit.mockRestore();
  }
  return { text: out.join('\n'), lines: out.join('\n').split('\n'), code };
}

/** The `  ✓ …` lines under each `📦 LANGUAGE` heading. */
function groups(lines: string[]) {
  const g: Record<string, string[]> = {};
  let cur: string | null = null;
  for (const l of lines) {
    const h = /^📦 (\S+)$/.exec(l);
    if (h) g[(cur = h[1].toLowerCase())] = [];
    else if (cur && l.startsWith('  ✓ ')) g[cur].push(l.slice(4));
    else if (!l.trim()) cur = null;
  }
  return g;
}

describe('specpilot list (BL-200)', () => {
  test('every supported language, generic first, then exactly its frameworks', async () => {
    const r = await run({ verbose: false });
    expect(r.code).toBe(0);
    expect(r.text).toContain('Supported Languages and Frameworks');
    const g = groups(r.lines);
    expect(Object.keys(g)).toEqual(SUPPORTED_LANGUAGES);
    for (const lang of SUPPORTED_LANGUAGES) expect(g[lang]).toEqual(['generic (no framework)', ...getFrameworksForLanguage(lang)]);
    expect(r.lines).not.toContain('📦 JAVA');
    for (const gone of ['spring-boot', 'data-science', 'docs.md', 'Available Templates']) expect(r.text.toLowerCase()).not.toContain(gone.toLowerCase());
  });

  test('--lang shows that language only', async () => {
    expect(groups((await run({ lang: 'kotlin', verbose: false })).lines)).toEqual({ kotlin: ['generic (no framework)', ...getFrameworksForLanguage('kotlin')] });
    expect(groups((await run({ lang: 'javascript', verbose: false })).lines)).toEqual({ javascript: ['generic (no framework)'] });
  });

  test('an unknown --lang is refused as init refuses it, without the Initializing line, exit 1', async () => {
    const r = await run({ lang: 'java', verbose: false });
    expect(r.code).toBe(1);
    expect(r.text).toContain('Unsupported Language');
    expect(r.text).toContain(`Language "java" is not supported`);
    expect(r.text).toContain(`Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
    expect(r.text).not.toContain('Initializing');
  });

  test('a --lang with ESC and a control character prints neither (REQ-002.A.11)', async () => {
    const out: string[] = [];
    const log = jest.spyOn(console, 'log').mockImplementation((m?: unknown) => void out.push(String(m)));
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    try {
      await listCommand({ lang: 'x\x1b]52;c;aGk=\x07\r', verbose: false }).catch(() => undefined);
    } finally {
      log.mockRestore();
      exit.mockRestore();
    }
    const text = plain(out.join('\n'));
    expect(text).toContain('Language "x]52;c;aGk=" is not supported');
    expect(text).not.toMatch(/[\x07\x1b\r]/);
  });

  test('--verbose lists the .specs/ files init writes, once', async () => {
    const r = await run({ verbose: true });
    const files = targetsInSpecs('rest').map((f) => (f.endsWith('/api.yaml') ? `${f} (unless the API paradigm is none)` : f));
    const at = r.lines.findIndex((l) => l.startsWith('Files init writes in .specs/'));
    expect(at).toBeGreaterThan(-1);
    expect(r.lines.slice(at + 1, at + 1 + files.length)).toEqual(files.map((f) => `  ${f}`));
    expect(r.lines.filter((l) => l.startsWith('Files init writes')).length).toBe(1);
    expect(groups(r.lines)).toEqual(groups((await run({ verbose: false })).lines));
  });

  test('the list help names languages and frameworks', () => {
    const cli = readFileSync(join(__dirname, '..', 'cli.ts'), 'utf-8');
    const block = cli.slice(cli.indexOf(".command('list')"), cli.indexOf('.action(listCommand)'));
    expect(block).toContain(".description('List supported languages and frameworks')");
    expect(block).toContain(".option('--verbose', 'Also list the files init writes in .specs/')");
  });
});
