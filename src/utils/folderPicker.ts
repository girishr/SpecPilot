import { execFile } from 'child_process';
import { parse, posix, win32 } from 'path';

// Browse for a folder in `specpilot serve` (BL-PM-011, ARCH-003.25, SEC-004.22): the second module that
// starts a process for a request. The system's own folder dialog, started without a shell; its arguments
// are constants, and the home folder reaches zenity and kdialog only, as one whole argument, never script
// text. The path picked is returned as text: nothing here reads, opens or records it.

/** A dialog still open after this long is killed. */
export const BROWSE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PATH = 4096;
const MAX_LINE = 300;
const PROMPT = 'Choose a project folder';
const OSASCRIPT = ['-e', 'activate', '-e', `POSIX path of (choose folder with prompt "${PROMPT}" default location (path to home folder))`];
const POWERSHELL = [
  '-NoProfile',
  '-NonInteractive',
  '-STA',
  '-Command',
  [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$d.Description = '${PROMPT}'`,
    "$d.SelectedPath = [Environment]::GetFolderPath('UserProfile')",
    '$o = New-Object System.Windows.Forms.Form -Property @{TopMost = $true}',
    'if ($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Out.Write($d.SelectedPath + "`n") }',
  ].join('; '),
];

export type PickResult = { path: string | null } | { error: string };
export interface PickOptions {
  /** `process.platform` unless a test picks another branch. */
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  /** Aborting closes the dialog: the page went away, or the server is closing. */
  signal?: AbortSignal;
}
interface Program {
  file: string;
  args: string[];
  /** Exit code and stderr of a cancelled dialog. */
  cancelled: (code: number, stderr: string) => boolean;
}

/** The programs to try, in order, with their arguments. Exported for the tests. */
export function dialogPrograms(home: string, platform: NodeJS.Platform): Program[] {
  if (platform === 'darwin') return [{ file: 'osascript', args: OSASCRIPT, cancelled: (code, err) => code === 1 && err.includes('-128') }];
  if (platform === 'win32') return [{ file: 'powershell.exe', args: POWERSHELL, cancelled: () => false }]; // a cancel exits 0 with no output
  if (platform === 'linux')
    return [
      { file: 'zenity', args: ['--file-selection', '--directory', `--title=${PROMPT}`, `--filename=${home}/`], cancelled: code => code === 1 },
      { file: 'kdialog', args: ['--getexistingdirectory', home, '--title', PROMPT], cancelled: code => code === 1 },
    ];
  return [];
}

/** The folder in a dialog's output: one absolute line without its line ending or a trailing separator (a root keeps it). Null when unusable. */
export function pickedPath(stdout: string, platform: NodeJS.Platform): string | null {
  const flavour = platform === 'win32' ? win32 : posix;
  let p = stdout.replace(/\r?\n$/, '');
  if (p.length > flavour.parse(p).root.length && /[\\/]$/.test(p)) p = p.slice(0, -1);
  if (!p || p.length > MAX_PATH || /[\r\n\0]/.test(p) || !flavour.isAbsolute(p)) return null;
  return p;
}

const firstLine = (s: string) =>
  s
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(Boolean)
    ?.slice(0, MAX_LINE);

function run(program: Program, home: string, opts: PickOptions): Promise<PickResult | 'missing'> {
  const platform = opts.platform ?? process.platform;
  return new Promise(done => {
    const child = execFile(
      program.file,
      program.args,
      { cwd: parse(home).root, env: process.env, windowsHide: true, timeout: opts.timeoutMs ?? BROWSE_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, signal: opts.signal, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (!err) {
          if (!stdout) return done({ path: null }); // PowerShell's cancel
          const path = pickedPath(stdout, platform);
          return done(path ? { path } : { error: 'The folder dialog did not return a usable path.' });
        }
        const e = err as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
        if (e.code === 'ENOENT') return done('missing');
        if (opts.signal?.aborted) return done({ path: null }); // nobody is waiting for the answer
        if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return done({ error: 'The folder dialog did not return a usable path.' });
        if (e.killed) return done({ error: 'The folder dialog was closed after 5 minutes.' });
        if (typeof e.code === 'number' && program.cancelled(e.code, stderr)) return done({ path: null });
        done({ error: `The folder dialog could not be opened: ${firstLine(stderr) ?? `exit code ${e.code}`}` });
      },
    );
    child.stdin?.end();
  });
}

/** Open the platform's folder dialog, started at `home`, and return the folder picked, null on cancel, or why not. */
export async function pickFolder(home: string, opts: PickOptions = {}): Promise<PickResult> {
  for (const program of dialogPrograms(home, opts.platform ?? process.platform)) {
    const out = await run(program, home, opts);
    if (out !== 'missing') return out;
  }
  return { error: 'No folder dialog is available on this machine. Type the path instead.' };
}
