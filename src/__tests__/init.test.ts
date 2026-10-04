import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { stripVTControlCharacters } from 'util';

// The real module object, which init.ts calls through (a namespace import cannot be spied on).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realOs = require('os') as typeof import('os');

jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: jest.fn() } }));
import inquirer from 'inquirer';
import { initCommand, InitOptions } from '../commands/init';
import { SpecGenerator } from '../utils/specGenerator';

// BL-075: `init` takes its question lists from the shared modules. What it asks, prints and passes to
// the generator must not change: the snapshots below were recorded before the lists moved.

let dir: string;
let transcript: string[];
const prompt = inquirer.prompt as unknown as jest.Mock;

const clean = (s: string) =>
  stripVTControlCharacters(s)
    .split(dir).join('<dir>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
    .replace(/v\d+\.\d+\.\d+/g, 'v<version>');

/** Answer every question by name; each question asked is written into the transcript as the terminal would show it. */
function answer(answers: Record<string, string>) {
  prompt.mockImplementation(async (questions: { name: string; message: string; choices?: unknown[] }[]) => {
    const out: Record<string, string> = {};
    for (const q of questions) {
      transcript.push(clean(`? ${q.message}${q.choices ? '\n' + q.choices.map(c => '    ' + JSON.stringify(c)).join('\n') : ''}`));
      out[q.name] = answers[q.name] ?? '';
    }
    return out;
  });
}

const options = (over: Partial<InitOptions> = {}): InitOptions => ({ lang: 'typescript', dir, specsName: '.specs', prompts: true, ...over });

/** Run `init`; a `process.exit()` ends the run as it would in the terminal. */
async function run(name: string, opts: InitOptions): Promise<string> {
  try {
    await initCommand(name, opts);
  } catch (err) {
    transcript.push(`[${(err as Error).message}]`);
  }
  return transcript.join('\n');
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-init-')));
  transcript = [];
  prompt.mockReset();
  jest.spyOn(realOs, 'userInfo').mockReturnValue({ username: 'osuser' } as os.UserInfo<string>);
  jest.spyOn(console, 'log').mockImplementation((...args) => void transcript.push(clean(args.join(' '))));
  jest.spyOn(console, 'error').mockImplementation((...args) => void transcript.push(clean(args.join(' '))));
  jest.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`exit ${code}`);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const ANSWERS = {
  projectType: 'greenfield', framework: 'react', apiParadigm: 'rest', developerName: 'jsmith', ide: 'claude-code',
  whatItDoes: 'Tracks parcels', targetUsers: 'Couriers', expectedScale: '', constraints: 'Offline first',
};

describe('specpilot init: terminal output (BL-075)', () => {
  it('asks and prints the same with prompts on', async () => {
    answer(ANSWERS);
    expect(await run('demo', options())).toMatchSnapshot();
  });

  it('prints the Codex notice and asks no framework for a language without frameworks', async () => {
    answer({ ...ANSWERS, ide: 'Codex', developerName: '' });
    expect(await run('demo', options({ lang: 'javascript' }))).toMatchSnapshot();
  });

  it('prints the same with --no-prompts', async () => {
    expect(await run('demo', options({ lang: 'python', prompts: false }))).toMatchSnapshot();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prints the same for --dry-run', async () => {
    expect(await run('demo', options({ dryRun: true }))).toMatchSnapshot();
  });

  it.each([['empty', ' '], ['too long', 'a'.repeat(215)], ['outside the allowlist', 'my project'], ['a path', '../x']])(
    'refuses a name that is %s with the same text', async (_label, name) => {
      expect(await run(name, options())).toMatchSnapshot();
    });

  it('refuses an unsupported language with the same text', async () => {
    expect(await run('demo', options({ lang: 'rust' }))).toMatchSnapshot();
  });

  it('refuses a folder that already has .specs/ with the same text', async () => {
    mkdirSync(join(dir, 'demo', '.specs'), { recursive: true });
    answer(ANSWERS);
    expect(await run('demo', options())).toMatchSnapshot();
  });
});

describe('specpilot init: the generateSpecs() call (BL-075)', () => {
  const NOT_SPECIFIED = 'Not specified — use your judgment and mark as [ASSUMPTION]';

  it('passes the options it always passed, with prompts on', async () => {
    const spy = jest.spyOn(SpecGenerator.prototype, 'generateSpecs');
    answer(ANSWERS);
    await run('demo', options());
    expect(spy.mock.calls).toEqual([[{
      projectName: 'demo', language: 'typescript', framework: 'react', targetDir: join(dir, 'demo'), specsName: '.specs', author: 'jsmith',
      ide: 'claude-code', mode: 'new', projectType: 'greenfield', apiParadigm: 'rest',
      projectContext: { whatItDoes: 'Tracks parcels', targetUsers: 'Couriers', expectedScale: NOT_SPECIFIED, constraints: 'Offline first' },
    }]]);
  });

  it('passes the options it always passed, with --no-prompts and --specs-name', async () => {
    const spy = jest.spyOn(SpecGenerator.prototype, 'generateSpecs');
    await run('demo', options({ prompts: false, framework: 'express', specsName: 'docs' }));
    expect(spy.mock.calls).toEqual([[{
      projectName: 'demo', language: 'typescript', framework: 'express', targetDir: join(dir, 'demo'), specsName: 'docs', author: 'osuser',
      ide: 'vscode', mode: 'new', projectType: 'greenfield', apiParadigm: undefined,
      projectContext: { whatItDoes: NOT_SPECIFIED, targetUsers: NOT_SPECIFIED, expectedScale: NOT_SPECIFIED, constraints: NOT_SPECIFIED },
    }]]);
  });
});
