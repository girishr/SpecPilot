import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SlashCommandGenerator, SlashCommand, SLASH_COMMANDS } from '../utils/slashCommandGenerator';

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
    expect(content).toContain('COMPLETED_LINE_LIMIT=25');
    expect(content).toContain('PROMPTS_LINE_LIMIT=100');
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

  it('writes a Codex reference copy to .codex/prompts and prints a one-time manual-copy notice', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    generator.generate(projectDir, 'codex', fixture);
    expect(existsSync(join(projectDir, '.codex', 'prompts', 'specpilot-status.md'))).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('~/.codex/prompts/');
    logSpy.mockRestore();
  });
});
