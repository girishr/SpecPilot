import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// A pass-through copy of fs whose functions can be spied on (the real module's cannot be redefined).
jest.mock('fs', () => ({ ...jest.requireActual('fs') }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsModule: typeof import('fs') = require('fs');
import { CODEX_PROMPTS_NOTICE, isSpecPilotCommand, SlashCommandGenerator, SlashCommand, SLASH_COMMANDS, KNOWN_COMMAND_HASHES } from '../utils/slashCommandGenerator';
import { COMPLETED_KEEP_ENTRIES, COMPLETED_LINE_LIMIT, PROMPTS_KEEP_LINES, PROMPTS_LINE_LIMIT } from '../utils/specArchiver';

describe('SlashCommandGenerator', () => {
  let projectDir: string;
  let generator: SlashCommandGenerator;
  const fixture: SlashCommand[] = [
    { name: 'status', description: 'Show sprint status', body: 'Read tasks.md and summarize.' },
  ];

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'specpilot-slash-'));
    generator = new SlashCommandGenerator();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('does nothing when an empty command list is passed', () => {
    generator.generate(projectDir, 'claude-code', []);
    expect(existsSync(join(projectDir, '.claude'))).toBe(false);
  });

  it('generates all 8 commands from SLASH_COMMANDS by default', () => {
    expect(SLASH_COMMANDS.map(c => c.name)).toEqual(
      expect.arrayContaining(['status', 'reanchor', 'report', 'sync', 'refine', 'validate', 'archive', 'backfill']),
    );
    generator.generate(projectDir, 'claude-code');
    expect(existsSync(join(projectDir, '.claude', 'commands', 'specpilot-status.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'specpilot-reanchor.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'specpilot-report.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'specpilot-sync.md'))).toBe(true);
    const refineContent = readFileSync(join(projectDir, '.claude', 'commands', 'specpilot-refine.md'), 'utf8');
    expect(refineContent).toContain('argument-hint: <description>');
    expect(refineContent).toContain('$ARGUMENTS');
  });

  it('includes allowed-tools in the specpilot-validate Claude Code frontmatter and embeds a runnable bash script', () => {
    generator.generate(projectDir, 'claude-code');
    const content = readFileSync(join(projectDir, '.claude', 'commands', 'specpilot-validate.md'), 'utf8');
    expect(content).toContain('allowed-tools: Bash, Read');
    expect(content).toContain('```bash');
    expect(content).toContain('REQUIRED_FILES=(');
    expect(content).toContain('GitHub Copilot only executes terminal commands in "agent mode."');
  });

  it('includes allowed-tools in the specpilot-archive Claude Code frontmatter and embeds the branch guard', () => {
    generator.generate(projectDir, 'claude-code');
    const content = readFileSync(join(projectDir, '.claude', 'commands', 'specpilot-archive.md'), 'utf8');
    expect(content).toContain('allowed-tools: Bash, Read, Edit');
    expect(content).toContain('```bash');
    expect(content).toContain("git rev-parse --abbrev-ref HEAD");
    expect(content).toContain(`COMPLETED_LINE_LIMIT=${COMPLETED_LINE_LIMIT}\n`);
    expect(content).toContain(`PROMPTS_LINE_LIMIT=${PROMPTS_LINE_LIMIT}\n`);
    expect(content).toContain(`COMPLETED_KEEP_ENTRIES=${COMPLETED_KEEP_ENTRIES}\n`);
    expect(content).toContain(`PROMPTS_KEEP_LINES=${PROMPTS_KEEP_LINES}\n`);
  });

  it('includes allowed-tools in the specpilot-backfill Claude Code frontmatter and embeds all four fingerprint blocks cleanly (no stray backslashes)', () => {
    generator.generate(projectDir, 'claude-code');
    const content = readFileSync(join(projectDir, '.claude', 'commands', 'specpilot-backfill.md'), 'utf8');
    expect(content).toContain('allowed-tools: Bash, Read, Edit');
    expect(content).toContain('```bash');
    expect(content).toContain('has_critical()');
    expect(content).toContain('devPrefix');
    expect(content).toContain('No `.specs/` structure changes');
    expect(content).not.toContain('\\`');
  });

  it('routes Claude Code commands to .claude/commands with description frontmatter', () => {
    generator.generate(projectDir, 'claude-code', fixture);
    const filePath = join(projectDir, '.claude', 'commands', 'specpilot-status.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('description: Show sprint status');
    expect(content).toContain('Read tasks.md and summarize.');
  });

  it('includes argument-hint and allowed-tools in Claude Code frontmatter when present', () => {
    const command: SlashCommand[] = [
      { name: 'refine', description: 'Refine specs', body: 'Body.', argumentHint: '<description>', allowedTools: ['Bash', 'Read'] },
    ];
    generator.generate(projectDir, 'claude-code', command);
    const content = readFileSync(join(projectDir, '.claude', 'commands', 'specpilot-refine.md'), 'utf8');
    expect(content).toContain('argument-hint: <description>');
    expect(content).toContain('allowed-tools: Bash, Read');
  });

  it('routes Cursor commands to .cursor/commands', () => {
    generator.generate(projectDir, 'cursor', fixture);
    expect(existsSync(join(projectDir, '.cursor', 'commands', 'specpilot-status.md'))).toBe(true);
  });

  it('routes Windsurf commands to .windsurf/workflows', () => {
    generator.generate(projectDir, 'windsurf', fixture);
    expect(existsSync(join(projectDir, '.windsurf', 'workflows', 'specpilot-status.md'))).toBe(true);
  });

  it('routes Antigravity commands to .agent/workflows (not .antigravity/)', () => {
    generator.generate(projectDir, 'antigravity', fixture);
    expect(existsSync(join(projectDir, '.agent', 'workflows', 'specpilot-status.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.antigravity', 'workflows', 'specpilot-status.md'))).toBe(false);
  });

  it('routes GitHub Copilot (vscode) commands to .github/prompts with .prompt.md extension', () => {
    generator.generate(projectDir, 'vscode', fixture);
    const filePath = join(projectDir, '.github', 'prompts', 'specpilot-status.prompt.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toContain('mode: agent');
  });

  it('writes a Codex reference copy to .codex/prompts and prints nothing; the manual-copy notice is a constant the commands print (BL-055)', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    generator.generate(projectDir, 'codex', fixture);
    expect(existsSync(join(projectDir, '.codex', 'prompts', 'specpilot-status.md'))).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
    expect(CODEX_PROMPTS_NOTICE).toContain('cp .codex/prompts/specpilot-*.md ~/.codex/prompts/');
    logSpy.mockRestore();
  });

  it.each(['claude-code', 'cursor', 'windsurf', 'antigravity', 'codex', 'vscode'])('targets(%s) lists exactly the files generate() writes, in order', ide => {
    generator.generate(projectDir, ide);
    const targets = generator.targets(ide);
    expect(targets).toHaveLength(SLASH_COMMANDS.length);
    for (const rel of targets) expect(existsSync(join(projectDir, ...rel.split('/')))).toBe(true);
    expect(targets[0]).toMatch(/specpilot-status(\.prompt)?\.md$/);
  });
});

describe('SlashCommandGenerator.refreshCommands (BL-058)', () => {
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
  const command: SlashCommand = { name: 'status', description: 'Show sprint status', body: 'Current body.\n' };
  const current = '---\ndescription: Show sprint status\n---\n\nCurrent body.\n';
  const old = '---\ndescription: Show sprint status\n---\n\nOld body.\nSecond line.\n';
  const path = '.claude/commands/specpilot-status.md';
  const known = { [path]: [sha(old), sha(current)] };
  let projectDir: string;
  let outside: string;
  let file: string;
  const refresh = (dryRun = false) => new SlashCommandGenerator().refreshCommands(projectDir, 'claude-code', dryRun, [command], known);
  const put = (content: string | Buffer) => {
    mkdirSync(join(projectDir, '.claude', 'commands'), { recursive: true });
    writeFileSync(file, content);
  };

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'specpilot-refresh-'));
    outside = mkdtempSync(join(tmpdir(), 'specpilot-outside-'));
    file = join(projectDir, '.claude', 'commands', 'specpilot-status.md');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('lists the hash of every command file the current source generates, for every IDE', () => {
    const missing: string[] = [];
    for (const ide of ['claude-code', 'cursor', 'windsurf', 'antigravity', 'codex', 'vscode']) {
      const dir = mkdtempSync(join(tmpdir(), 'specpilot-manifest-'));
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        new SlashCommandGenerator().generate(dir, ide);
        for (const sub of ['.claude/commands', '.cursor/commands', '.windsurf/workflows', '.agent/workflows', '.codex/prompts', '.github/prompts']) {
          if (!existsSync(join(dir, sub))) continue;
          for (const f of readdirSync(join(dir, sub))) {
            const rel = `${sub}/${f}`;
            if (!(KNOWN_COMMAND_HASHES[rel] ?? []).includes(sha(readFileSync(join(dir, sub, f))))) missing.push(rel);
          }
        }
      } finally {
        log.mockRestore();
        rmSync(dir, { recursive: true, force: true });
      }
    }
    // A command body changed: run `node scripts/command-hashes.js` and paste its output.
    expect(missing).toEqual([]);
    expect(Object.keys(KNOWN_COMMAND_HASHES)).toHaveLength(SLASH_COMMANDS.length * 6);
  });

  it('adds a missing file', () => {
    expect(refresh()).toEqual({ added: ['status'], updated: [], kept: [] });
    expect(readFileSync(file, 'utf8')).toBe(current);
  });

  it('reports nothing and writes nothing when the file is already current', () => {
    put(current);
    const before = statSync(file).mtimeMs;
    expect(refresh()).toEqual({ added: [], updated: [], kept: [] });
    expect(statSync(file).mtimeMs).toBe(before);
  });

  it('replaces a known older version with the current content, keeping its mode and leaving no temp file', () => {
    put(old);
    if (process.platform !== 'win32') chmodSync(file, 0o640);
    expect(refresh()).toEqual({ added: [], updated: ['status'], kept: [] });
    expect(readFileSync(file, 'utf8')).toBe(current);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(readdirSync(join(projectDir, '.claude', 'commands'))).toEqual(['specpilot-status.md']);
  });

  it('dry-run reports the update and leaves the file as it was', () => {
    put(old);
    expect(refresh(true)).toEqual({ added: [], updated: ['status'], kept: [] });
    expect(readFileSync(file, 'utf8')).toBe(old);
  });

  it('keeps a known version with CRLF line endings and reports it', () => {
    const crlf = old.replace(/\n/g, '\r\n');
    put(crlf);
    expect(refresh()).toEqual({ added: [], updated: [], kept: [{ name: 'status', path, reason: 'CRLF line endings' }] });
    expect(readFileSync(file, 'utf8')).toBe(crlf);
  });

  it('keeps an edited file byte for byte and reports it as modified', () => {
    const edited = old.replace('Old body.', 'My own body.');
    put(edited);
    expect(refresh()).toEqual({ added: [], updated: [], kept: [{ name: 'status', path, reason: 'modified' }] });
    expect(readFileSync(file, 'utf8')).toBe(edited);
  });

  it('keeps an edited file with CRLF line endings as modified, not CRLF', () => {
    put(old.replace('Old body.', 'Mine.').replace(/\n/g, '\r\n'));
    expect(refresh().kept).toEqual([{ name: 'status', path, reason: 'modified' }]);
  });

  (process.platform === 'win32' ? it.skip : it)('never writes through a symbolic link, even to a known version', () => {
    const target = join(outside, 'target.md');
    writeFileSync(target, old);
    mkdirSync(join(projectDir, '.claude', 'commands'), { recursive: true });
    symlinkSync(target, file);
    expect(refresh()).toEqual({ added: [], updated: [], kept: [{ name: 'status', path, reason: 'symbolic link' }] });
    expect(readFileSync(target, 'utf8')).toBe(old);
  });

  (process.platform === 'win32' ? it.skip : it)('never creates a file through a dangling symbolic link', () => {
    const target = join(outside, 'missing.md');
    mkdirSync(join(projectDir, '.claude', 'commands'), { recursive: true });
    symlinkSync(target, file);
    expect(refresh().kept).toEqual([{ name: 'status', path, reason: 'symbolic link' }]);
    expect(existsSync(target)).toBe(false);
  });

  it('keeps a directory at the target path', () => {
    mkdirSync(file, { recursive: true });
    expect(refresh().kept).toEqual([{ name: 'status', path, reason: 'not a regular file' }]);
  });

  it('only accepts a hash listed for that exact target path', () => {
    put(old);
    const other = { '.cursor/commands/specpilot-status.md': [sha(old)] };
    expect(new SlashCommandGenerator().refreshCommands(projectDir, 'claude-code', false, [command], other).kept).toEqual([
      { name: 'status', path, reason: 'modified' },
    ]);
    expect(readFileSync(file, 'utf8')).toBe(old);
  });
  // ── BL-PM-006: folders on the way, and one failing file does not stop the rest ──

  (process.platform === 'win32' ? it.skip : it)('keeps the file when .claude is a symbolic link, writing nothing through it', () => {
    symlinkSync(outside, join(projectDir, '.claude'));
    expect(refresh()).toEqual({ added: [], updated: [], kept: [{ name: 'status', path, reason: 'folder is a symbolic link or not a folder' }] });
    expect(readdirSync(outside)).toEqual([]);
  });

  (process.platform === 'win32' ? it.skip : it)('keeps a known version under a linked .claude/commands instead of replacing it', () => {
    writeFileSync(join(outside, 'specpilot-status.md'), old);
    mkdirSync(join(projectDir, '.claude'));
    symlinkSync(outside, join(projectDir, '.claude', 'commands'));
    expect(refresh().kept).toEqual([{ name: 'status', path, reason: 'folder is a symbolic link or not a folder' }]);
    expect(readFileSync(join(outside, 'specpilot-status.md'), 'utf8')).toBe(old);
    expect(readdirSync(outside)).toEqual(['specpilot-status.md']);
  });

  it('keeps a known version that an editor changes between the hash and the rename, leaving no temp file', () => {
    put(old);
    const real = fsModule.readFileSync;
    let reads = 0;
    // the second read of the file is replace()'s last look: an editor saved in between
    const spy = jest.spyOn(fsModule, 'readFileSync').mockImplementation(((p: unknown, o?: unknown) =>
      p === file && ++reads === 2 ? Buffer.from('saved by an editor\n') : (real as (a: unknown, b?: unknown) => unknown)(p, o)) as typeof readFileSync);
    try {
      expect(refresh()).toEqual({ added: [], updated: [], kept: [{ name: 'status', path, reason: 'modified' }] });
    } finally {
      spy.mockRestore();
    }
    expect(reads).toBe(2);
    expect(readFileSync(file, 'utf8')).toBe(old);
    expect(readdirSync(join(projectDir, '.claude', 'commands'))).toEqual(['specpilot-status.md']);
  });

  it('keeps the file when a folder on the way is a file', () => {
    writeFileSync(join(projectDir, '.claude'), 'not a folder\n');
    expect(refresh().kept).toEqual([{ name: 'status', path, reason: 'folder is a symbolic link or not a folder' }]);
    expect(readFileSync(join(projectDir, '.claude'), 'utf8')).toBe('not a folder\n');
  });

  it('dry-run reports a missing file as added and creates no folder', () => {
    expect(refresh(true)).toEqual({ added: ['status'], updated: [], kept: [] });
    expect(existsSync(join(projectDir, '.claude'))).toBe(false);
  });

  (process.platform === 'win32' || process.getuid?.() === 0 ? it.skip : it)('reports a file it could not write and goes on with the next', () => {
    const other: SlashCommand = { name: 'sync', description: 'Sync', body: 'Body.\n' };
    const otherPath = '.claude/commands/specpilot-sync.md';
    const oldOther = '---\ndescription: Sync\n---\n\nOld.\n';
    put(old);
    writeFileSync(join(projectDir, '.claude', 'commands', 'specpilot-sync.md'), oldOther);
    const dir = join(projectDir, '.claude', 'commands');
    chmodSync(dir, 0o500);
    try {
      const out = new SlashCommandGenerator().refreshCommands(projectDir, 'claude-code', false, [command, other], { ...known, [otherPath]: [sha(oldOther)] });
      expect(out).toEqual({
        added: [],
        updated: [],
        kept: [
          { name: 'status', path, reason: 'could not be written: EACCES' },
          { name: 'sync', path: otherPath, reason: 'could not be written: EACCES' },
        ],
      });
    } finally {
      chmodSync(dir, 0o700);
    }
    expect(readFileSync(file, 'utf8')).toBe(old);
    expect(readdirSync(dir).sort()).toEqual(['specpilot-status.md', 'specpilot-sync.md']);
  });
});

describe('isSpecPilotCommand (BL-PM-006)', () => {
  const sha = (b: string) => createHash('sha256').update(b).digest('hex');
  const path = '.claude/commands/specpilot-status.md';
  const known = { [path]: [sha('old\n'), sha('current\n')] };
  let projectDir: string;
  let outside: string;
  const put = (content: string) => {
    mkdirSync(join(projectDir, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(projectDir, path), content);
  };
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'specpilot-known-'));
    outside = mkdtempSync(join(tmpdir(), 'specpilot-outside-'));
  });
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('is true for the current and an older known version', () => {
    put('current\n');
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(true);
    put('old\n');
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(true);
  });

  it('is false for an edited file, CRLF line endings, a missing file and a path with no known versions', () => {
    put('old, edited\n');
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(false);
    put('old\r\n');
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(false);
    expect(isSpecPilotCommand(projectDir, '.claude/commands/specpilot-sync.md', known)).toBe(false);
    put('current\n');
    expect(isSpecPilotCommand(projectDir, '.claude/commands/mine.md', { ...known, '.claude/commands/mine.md': [] })).toBe(false);
  });

  (process.platform === 'win32' ? it.skip : it)('is false for a link to known bytes and for a file under a linked folder', () => {
    writeFileSync(join(outside, 'specpilot-status.md'), 'current\n');
    mkdirSync(join(projectDir, '.claude', 'commands'), { recursive: true });
    symlinkSync(join(outside, 'specpilot-status.md'), join(projectDir, path));
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(false);
    rmSync(join(projectDir, '.claude'), { recursive: true });
    mkdirSync(join(projectDir, '.claude'));
    symlinkSync(outside, join(projectDir, '.claude', 'commands'));
    expect(isSpecPilotCommand(projectDir, path, known)).toBe(false);
  });

  it('is true for the real current files of every IDE, as generated', () => {
    const ides = ['claude-code', 'cursor', 'windsurf', 'antigravity', 'codex', 'vscode'];
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      for (const ide of ides) new SlashCommandGenerator().generate(projectDir, ide);
    } finally {
      log.mockRestore();
    }
    const files = ides.flatMap(ide => new SlashCommandGenerator().targets(ide));
    expect(files).toHaveLength(48);
    expect(files.filter(rel => !isSpecPilotCommand(projectDir, rel))).toEqual([]);
  });
});
