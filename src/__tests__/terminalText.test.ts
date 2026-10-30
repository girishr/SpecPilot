import chalk from 'chalk';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { Logger, terminalText } from '../utils/logger';
import { ProjectMigrator } from '../utils/projectMigrator';
import { SpecValidator } from '../utils/specValidator';
import { validateCommand } from '../commands/validate';
import { refineCommand } from '../commands/refine';
import { migrateCommand } from '../commands/migrate';
import { addSpecsCommand } from '../commands/add-specs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const realOs = require('os') as typeof import('os');

// BL-133 (REQ-002.A.11; audit run-1 item 14, SEC-002.12 (e)): repository text reaches the terminal without control characters.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

let printed: string[];
let level: typeof chalk.level;
beforeEach(() => {
  printed = [];
  level = chalk.level;
  chalk.level = 0;
  const keep = (...args: unknown[]) => void printed.push(args.map(String).join(' '));
  jest.spyOn(console, 'log').mockImplementation(keep);
  jest.spyOn(console, 'error').mockImplementation(keep);
  jest.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`exit ${code}`);
  });
});
afterEach(() => {
  chalk.level = level;
  jest.restoreAllMocks();
});
const out = () => printed.join('\n');

describe('terminalText() (BL-133)', () => {
  test('removes the control characters, the rest of a sequence prints as text', () => {
    expect(terminalText('a\rb\bc')).toBe('abc');
    expect(terminalText('x\x1b[2Ky')).toBe('x[2Ky');
    expect(terminalText('\x1b]0;t\x07z')).toBe(']0;tz');
    expect(terminalText('\x1b]52;c;eA==\x07')).toBe(']52;c;eA==');
    expect(terminalText('\x1b]8;;http://x\x1b\\L\x1b]8;;\x1b\\')).toBe(']8;;http://x\\L]8;;\\');
    expect(terminalText('a\x7fb\u0085c\u009bd\u2028e\u202ef\u2066g')).toBe('abcdefg');
  });
  test('keeps line feed, tab and printable text', () => {
    expect(terminalText('a\nb\tc é 日本 🚀')).toBe('a\nb\tc é 日本 🚀');
  });
});

describe('Logger (BL-133)', () => {
  test('every level prints the filtered message', () => {
    const logger = new Logger();
    process.env.DEBUG = '1';
    for (const level of ['info', 'success', 'warn', 'error', 'debug'] as const) logger[level](`${level}\x1b[2K\r!`);
    delete process.env.DEBUG;
    expect(printed).toEqual(['info[2K!', 'success[2K!', 'warn[2K!', 'error[2K!', 'debug[2K!']);
  });

  test('the display functions filter the values they are given', () => {
    const logger = new Logger();
    logger.displayValidationResults(false, ['e\x1b]0;t\x07'], ['w\x1b[2K']);
    logger.displayError('T', 'm\x1b[31mx');
    logger.displayInfo('T', 'i\x1b]52;c;eA==\x07');
    logger.displayInitTree('kit\x1b]0;t\x07', '/tmp/p', '/tmp/p/.specs');
    expect(out()).not.toMatch(CONTROL);
    expect(out()).toContain('• e]0;t');
    expect(out()).toContain('• w[2K');
    expect(out()).toContain('m[31mx');
    expect(out()).toContain('✅ Project "kit]0;t" created');
  });

  test('with colour on, SpecPilot\'s own SGR stays and the repository\'s ESC goes', () => {
    chalk.level = 1;
    new Logger().info('a\x1b]0;t\x07b');
    expect(printed).toEqual([chalk.blue('a]0;tb')]);
  });
});

describe('the commands print repository text filtered (BL-133)', () => {
  let dir: string;
  let cwd: string;
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-terminal-')));
    cwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('validate: a tasks.md heading with ESC', async () => {
    mkdirSync(join(dir, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(dir, '.specs', 'planning', 'tasks.md'), '# Tasks\n\n## Backl\x1b[2Kog\n\n## Current Sprint\n');
    await validateCommand({ dir, fix: false, verbose: false } as never).catch(() => undefined);
    expect(out()).toContain('Backl[2Kog');
    expect(out()).not.toMatch(CONTROL);
  });

  // Today every fix prompt and rename token is SpecPilot's own text, so these two sinks are stubbed: the filter is kept
  // at the sink so a later prompt that quotes a repository line is covered too.
  const result = (over: object) => ({ isValid: false, errors: ['e'], warnings: [], fixable: [], fixPrompts: [], filesChecked: 1, mandatesVerified: 0, ...over });

  test('validate: the AI fix prompts (phase 2) are filtered', async () => {
    jest.spyOn(SpecValidator.prototype, 'validate').mockResolvedValue(result({ fixPrompts: [{ issue: 'i\x1b[2Kx', prompt: 'p\x1b]0;t\x07q\nr' }] }) as never);
    await validateCommand({ dir, fix: false, verbose: false } as never).catch(() => undefined);
    expect(out()).toContain('▸ i[2Kx');
    expect(out()).toContain('  p]0;tq\n  r');
    expect(out()).not.toMatch(CONTROL);
  });

  test('validate --fix: the fixed-issue label is filtered', async () => {
    const token = 'rename-heading:## Backl\x1b[2Kog:## Backlog';
    jest.spyOn(SpecValidator.prototype, 'validate')
      .mockResolvedValueOnce(result({ fixable: [token] }) as never)
      .mockResolvedValueOnce(result({ isValid: true, errors: [] }) as never);
    jest.spyOn(SpecValidator.prototype, 'autoFix').mockResolvedValue([token]);
    await validateCommand({ dir, fix: true, verbose: false } as never).catch(() => undefined);
    expect(out()).toContain('• Renamed heading: ## Backl[2Kog → ## Backlog in planning/tasks.md');
    expect(out()).not.toMatch(CONTROL);
  });

  test('refine: a requirements.md line with an OSC sequence; the Proposed changes line has no stray SGR text', async () => {
    mkdirSync(join(dir, '.specs', 'project'), { recursive: true });
    writeFileSync(join(dir, '.specs', 'project', 'project.yaml'), 'name: kit\nlanguage: typescript\n');
    writeFileSync(join(dir, '.specs', 'project', 'requirements.md'), '# Requirements\n\nOld \x1b]0;pwned\x07 line\n');
    chalk.level = 1;
    await refineCommand('d', { dir, specsName: '.specs', prompts: false, update: false });
    // eslint-disable-next-line no-control-regex
    const visible = out().replace(/\x1b\[[0-9;]*m/g, '');
    expect(visible).not.toMatch(CONTROL);
    expect(visible).toContain('Old ]0;pwned line');
    expect(visible).toContain('📋 Proposed changes:');
    expect(visible).not.toMatch(/\[3\d?m/);
  });

  test('migrate: a warning naming a repository file with ESC', async () => {
    jest.spyOn(ProjectMigrator.prototype, 'checkMigrationNeeded').mockResolvedValue({ needed: true } as never);
    jest.spyOn(ProjectMigrator.prototype, 'validateSource').mockResolvedValue(true);
    jest.spyOn(ProjectMigrator.prototype, 'migrate').mockResolvedValue({ filesMigrated: 0, filesMerged: 0, filesCreated: 0, warnings: ['Target file a\x1b[2Kb already exists, skipping'] } as never);
    await migrateCommand({ dir, from: 'simple', to: 'simple', backup: false });
    expect(out()).toContain('• Target file a[2Kb already exists, skipping');
    expect(out()).not.toMatch(CONTROL);
  });

  test('add-specs: a package.json name with an OSC sequence in the init tree; the lines that stopped pre-colouring', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'kit\x1b]0;t\x07', version: '1.0.0' }));
    process.chdir(dir);
    jest.spyOn(realOs, 'userInfo').mockReturnValue({ username: 'osuser' } as os.UserInfo<string>);
    chalk.level = 1;
    await addSpecsCommand({ prompts: false });
    // eslint-disable-next-line no-control-regex
    const visible = out().replace(/\x1b\[[0-9;]*m/g, '');
    expect(visible).not.toMatch(CONTROL);
    expect(visible).toContain('Detected javascript project');
    expect(visible).toContain('✅ Project "kit]0;t" created');
    expect(visible).not.toMatch(/\[3\d?m/);
  });
});
