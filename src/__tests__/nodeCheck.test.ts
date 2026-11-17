import { spawnSync, execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { nodeNotice, nodeStatus, printNodeNotice, RELEASE } from '../utils/nodeCheck';

// BL-189 (REQ-002.A.17, ARCH-004.80): the Node.js version check and the CLI notice.

const REPO = join(__dirname, '../..');
const RANGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf-8')).engines.node;
const OUT = nodeStatus('25.9.0');
const LINES = [
  '! Node.js 25.9.0 has known security vulnerabilities, including TLS certificate bypass, memory disclosure and denial of service (Node.js security releases, November 2026).',
  '  Update to 22.23.5, 24.22.3 or 26.13.1 or later.',
  '  Advisory: https://nodejs.org/en/blog/vulnerability',
];
const sink = (isTTY = false) => {
  const s = { isTTY, text: '', write: (t: string) => (s.text += t) };
  return s;
};

describe('nodeStatus()', () => {
  it('reads the shipped engines.node into its three parts and their floors', () => {
    expect(RANGE).toBe('^22.23.5 || ^24.22.3 || >=26.13.1');
    expect(nodeStatus('22.23.5').patched).toEqual(['22.23.5', '24.22.3', '26.13.1']);
    expect(OUT.patched).toEqual(['22.23.5', '24.22.3', '26.13.1']); // a range the parser could not read would give []
    expect(RELEASE).toBe('November 2026');
  });

  it.each([
    ['16.20.0', false],
    ['22.23.4', false],
    ['22.23.5', true],
    ['22.99.0', true],
    ['23.0.0', false],
    ['24.22.2', false],
    ['24.22.3', true],
    ['25.9.0', false],
    ['26.13.0', false],
    ['26.13.1', true],
    ['27.0.0', true],
  ])('%s is %s against the shipped range', (version, ok) => {
    expect(nodeStatus(version)).toEqual({ version, ok, patched: ['22.23.5', '24.22.3', '26.13.1'] });
  });

  it('fails safe (ok, no notice) on a range or version it cannot read', () => {
    expect(nodeStatus('16.0.0', '~22.1.0 || >=26.0.0')).toEqual({ version: '16.0.0', ok: true, patched: [] });
    expect(nodeStatus('16.0.0', '')).toEqual({ version: '16.0.0', ok: true, patched: [] });
    expect(nodeStatus('26.13.1-rc.1').ok).toBe(true);
    expect(nodeStatus('v25.9.0').ok).toBe(true);
    const s = sink();
    printNodeNotice(['list'], s, {}, nodeStatus('26.13.1-rc.1'));
    expect(s.text).toBe('');
  });

  it('defaults to the running Node and package.json', () => {
    expect(nodeStatus()).toEqual(nodeStatus(process.versions.node, RANGE));
  });
});

describe('nodeNotice() and printNodeNotice()', () => {
  it('has the three lines, with the versions taken from the range', () => {
    expect(nodeNotice(OUT)).toEqual(LINES);
    expect(nodeNotice(nodeStatus('1.0.0', '>=999.0.0'))[1]).toBe('  Update to 999.0.0 or later.');
  });

  it('writes them once, plain, when the stream is not a terminal', () => {
    const s = sink();
    printNodeNotice(['list'], s, {}, OUT);
    expect(s.text).toBe(LINES.join('\n') + '\n');
  });

  it('colours the ! amber on a terminal, and not with NO_COLOR', () => {
    const tty = sink(true);
    printNodeNotice(['list'], tty, {}, OUT);
    expect(tty.text).toBe('\u001b[33m!\u001b[39m' + LINES.join('\n').slice(1) + '\n');
    const plain = sink(true);
    printNodeNotice(['list'], plain, { NO_COLOR: '1' }, OUT);
    expect(plain.text).toBe(LINES.join('\n') + '\n');
  });

  it.each([[['-V']], [['--version']], [['-h']], [['--help']], [['init', '--help']], [['help']], [['help', 'init']]])('prints nothing for %j', argv => {
    const s = sink();
    printNodeNotice(argv, s, {}, OUT);
    expect(s.text).toBe('');
  });

  it.each([[[]], [['init', 'help']], [['validate', '-d', 'help']]])('prints it for %j (help only as the first positional)', argv => {
    const s = sink();
    printNodeNotice(argv, s, {}, OUT);
    expect(s.text).toBe(LINES.join('\n') + '\n');
  });

  it('prints nothing on a Node inside the range', () => {
    const s = sink();
    printNodeNotice(['list'], s, {}, nodeStatus('26.13.1'));
    expect(s.text).toBe('');
  });
});

// The wiring in src/cli.ts on any Node: the build in a temp folder with its own package.json, so the range can
// exclude or include the Node running the tests.
describe('specpilot prints the notice on stderr only', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-node-'));
    execFileSync(process.execPath, [join(REPO, 'node_modules/typescript/bin/tsc'), '-p', join(REPO, 'tsconfig.build.json'), '--outDir', join(dir, 'dist')], { env: process.env });
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
    symlinkSync(join(REPO, 'ui'), join(dir, 'ui'));
  }, 120000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (range: string, args: string[]) => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf-8'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, engines: { ...pkg.engines, node: range } }));
    const r = spawnSync(process.execPath, [join(dir, 'dist/cli.js'), ...args], { cwd: dir, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const notice = (v: string) => `! Node.js ${v} has known security vulnerabilities`;

  it('outside the range: the three lines on stderr, none on stdout, the command runs and exits 0', () => {
    const r = run('>=999.0.0', ['list']);
    expect(r.code).toBe(0);
    expect(r.err.startsWith(`${notice(process.versions.node)}`)).toBe(true);
    expect(r.err).toContain('  Update to 999.0.0 or later.\n  Advisory: https://nodejs.org/en/blog/vulnerability\n');
    expect(r.out).not.toContain(notice(process.versions.node));
    expect(r.out).not.toContain('Advisory: ');
    expect(r.out.length).toBeGreaterThan(0);
  });

  it('inside the range: no notice', () => {
    const r = run('>=0.0.1', ['list']);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('has known security vulnerabilities');
  });

  it('--version prints only the version, even outside the range', () => {
    const r = run('>=999.0.0', ['--version']);
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
