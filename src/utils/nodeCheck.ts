import chalk from 'chalk';

// The Node.js version check (BL-189, REQ-002.A.17, ARCH-004.80): `engines.node` read from package.json, never
// restated here. Shared by the CLI's notice and, from BL-190, the serve page's banner. Warn only.

const pkg = require('../../package.json');

/** The month of the Node.js security release `engines.node` is raised to; a release that raises the range updates it (docs/RELEASING.md). */
export const RELEASE = 'November 2026';
export const ADVISORY = 'https://nodejs.org/en/blog/vulnerability';

export interface NodeStatus {
  version: string;
  /** Inside the range, or a range or version this check cannot read (fail-safe: no notice). */
  ok: boolean;
  /** Each range part's floor, in order: the versions to update to. */
  patched: string[];
}

const triple = (s: string) => (/^\d+\.\d+\.\d+$/.test(s) ? s.split('.').map(Number) : null);
const below = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** `version` against `range`, whose `||` parts are each `^X.Y.Z` (X.Y.Z up to the next major) or `>=X.Y.Z`. */
export function nodeStatus(version: string = process.versions.node, range: string = pkg.engines.node): NodeStatus {
  const parts = range.split('||').map(p => /^(\^|>=)(\d+\.\d+\.\d+)$/.exec(p.trim()));
  const v = triple(version);
  if (!v || parts.some(p => !p)) return { version, ok: true, patched: [] };
  const ok = parts.some(p => {
    const floor = triple(p![2])!;
    return below(v, floor) >= 0 && (p![1] === '>=' || v[0] === floor[0]);
  });
  return { version, ok, patched: parts.map(p => p![2]) };
}

const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs.join(''));

/** The three lines of the notice, plain text. */
export function nodeNotice(s: NodeStatus): string[] {
  return [
    `! Node.js ${s.version} has known security vulnerabilities, including TLS certificate bypass, memory disclosure and denial of service (Node.js security releases, ${RELEASE}).`,
    `  Update to ${orList(s.patched)} or later.`,
    `  Advisory: ${ADVISORY}`,
  ];
}

const SKIP = new Set(['-V', '--version', '-h', '--help']);

/** Writes the notice to `stream` (stderr) unless Node.js is in range or the arguments ask for the version or help. */
export function printNodeNotice(argv: string[], stream: { isTTY?: boolean; write(s: string): unknown }, env: NodeJS.ProcessEnv = process.env, status: NodeStatus = nodeStatus()): void {
  if (status.ok || argv.some(a => SKIP.has(a)) || argv.find(a => !a.startsWith('-')) === 'help') return;
  const lines = nodeNotice(status);
  if (stream.isTTY && !env.NO_COLOR) lines[0] = new chalk.Instance({ level: 1 }).yellow('!') + lines[0].slice(1);
  stream.write(lines.join('\n') + '\n');
}
