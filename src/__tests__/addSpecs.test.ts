import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';

// The real module objects, which add-specs.ts calls through (a namespace import cannot be spied on).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realOs = require('os') as typeof import('os');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const questions = require('../utils/addSpecsQuestions') as typeof import('../utils/addSpecsQuestions');

import { addSpecsCommand, AddSpecsOptions } from '../commands/add-specs';
import { CodeAnalyzer } from '../utils/codeAnalyzer';

// BL-074: Commander stores --no-analysis as `analysis: false`; add-specs read `noAnalysis`, so the analysis always ran.

let dir: string;
let cwd: string;
let printed: string[];

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-add-specs-')));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'kit', version: '1.0.0', dependencies: { express: '4.0.0' } }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'app.ts'), '// TODO: one thing\nexport const x = 1;\n');
  cwd = process.cwd();
  process.chdir(dir);
  printed = [];
  jest.spyOn(realOs, 'userInfo').mockReturnValue({ username: 'osuser' } as os.UserInfo<string>);
  jest.spyOn(console, 'log').mockImplementation((...args) => void printed.push(stripVTControlCharacters(args.join(' '))));
  jest.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`exit ${code}`);
  });
});

afterEach(() => {
  process.chdir(cwd);
  jest.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const run = (over: Partial<AddSpecsOptions> = {}) => addSpecsCommand({ prompts: false, ...over });
const ANALYSIS_LINES = ['Analyzing codebase', 'Detected typescript', 'TODOs/FIXMEs', 'testing framework', 'components'];

describe('specpilot add-specs --no-analysis (BL-074, REQ-002.D.5)', () => {
  it('skips the analysis: the analyzer is not called, the generator gets none and no analysis line is printed', async () => {
    const analyze = jest.spyOn(CodeAnalyzer.prototype, 'analyzeCodebase');
    const build = jest.spyOn(questions, 'addSpecsOptions');
    await run({ analysis: false });
    expect(analyze).not.toHaveBeenCalled();
    expect(build.mock.calls[0][3]).toBeNull();
    for (const line of ANALYSIS_LINES) expect(printed.join('\n')).not.toContain(line);
    expect(printed.join('\n')).toContain('.specs folder created successfully');
  });

  it('runs the analysis once without the flag and passes it to the generator', async () => {
    const analyze = jest.spyOn(CodeAnalyzer.prototype, 'analyzeCodebase');
    const build = jest.spyOn(questions, 'addSpecsOptions');
    await run();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][3]).toBe(await analyze.mock.results[0].value);
    expect(printed.join('\n')).toContain('Found 1 TODOs/FIXMEs');
  });
});

describe('the add-specs options as src/cli.ts defines them (BL-074)', () => {
  let argv: string[];
  beforeEach(() => {
    argv = process.argv;
  });
  afterEach(() => {
    process.argv = argv;
  });

  /** Requires src/cli.ts fresh with these arguments; returns what add-specs was called with, or what Commander printed on stderr. */
  function parse(...args: string[]): { options?: Record<string, unknown>; error: string } {
    let options: Record<string, unknown> | undefined;
    let error = '';
    jest.spyOn(process.stderr, 'write').mockImplementation(chunk => ((error += String(chunk)), true));
    process.argv = ['node', 'specpilot', 'add-specs', ...args];
    jest.isolateModules(() => {
      jest.doMock('../commands/add-specs', () => ({ addSpecsCommand: (o: Record<string, unknown>) => void (options = { ...o }) }));
      try {
        require('../cli');
      } catch (err) {
        error += `[${(err as Error).message}]`;
      }
    });
    return { options, error };
  }

  it('gives analysis: false for --no-analysis, and no deepAnalysis key', () => {
    const { options } = parse('--no-analysis', '--no-prompts');
    expect(options).toMatchObject({ analysis: false, prompts: false });
    expect(options).not.toHaveProperty('deepAnalysis');
  });

  it('rejects --deep-analysis as an unknown option and exits 1', () => {
    const { options, error } = parse('--deep-analysis', '--no-prompts');
    expect(options).toBeUndefined();
    expect(error).toContain("unknown option '--deep-analysis'");
    expect(error).toContain('[exit 1]');
  });
});
