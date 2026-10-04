import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync, realpathSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { displayRoot, SpecServer, startSpecServer } from '../utils/specServer';
import { removeStaleStaging, specsMissing } from '../utils/specSetup';
import { homeDir, readRegistry, registryPath, upsertEntry, writeRegistry } from '../utils/projectRegistry';
import { Logger } from '../utils/logger';

const packageJson = require('../../package.json');

export interface ServeOptions {
  port?: string;
  poll?: string;
  readOnly?: boolean;
  open?: boolean;
}

const DEFAULT_PORT = 4321;
const DEFAULT_POLL_MS = 1000;
/** Longest a stop signal waits for a running clone to be killed and cleaned up. */
export const STOP_CLONE_MS = 5000;
const MIN_POLL_MS = 250;

/** Open `url` in the default browser. The URL is built here, never taken from input. */
function openBrowser(url: string, logger: Logger): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  const child = spawn(cmd, args as string[], { stdio: 'ignore', detached: true });
  child.on('error', () => logger.warn(`Could not open a browser. Open ${url} yourself.`));
  child.unref();
}

/**
 * Runs until Ctrl+C; exits the process with 1 on any startup error. `folders` empty = the current
 * directory (BL-054), which must contain `.specs/`; a named folder without one is served for guided
 * setup (BL-055). More folders can be opened from the page and are remembered in the registry (BL-067).
 */
export async function serveCommand(folders: string[], options: ServeOptions): Promise<void> {
  const logger = new Logger();
  const roots: string[] = [];

  if (!folders.length) {
    const root = realpathSync(process.cwd()); // like a named folder, so "already served" compares like for like (BL-067)
    if (!existsSync(join(root, '.specs'))) {
      logger.error('No .specs/ folder in this directory. Run `specpilot serve` from a project root, `specpilot init` first, or `specpilot serve .` to set one up in the browser.');
      return process.exit(1);
    }
    roots.push(root);
  }
  for (const folder of folders) {
    let root: string;
    try {
      root = realpathSync(resolve(folder));
    } catch {
      logger.error(`Folder not found: ${folder}`);
      return process.exit(1);
    }
    if (!statSync(root).isDirectory()) {
      logger.error(`Not a folder: ${folder}`);
      return process.exit(1);
    }
    if (!roots.includes(root)) roots.push(root); // the same folder named twice is served once
  }
  const named = roots.map(() => folders.length > 0);

  const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logger.error(`Invalid --port "${options.port}". Use a whole number from 1 to 65535.`);
    return process.exit(1);
  }

  const pollMs = options.poll === undefined ? DEFAULT_POLL_MS : Number(options.poll);
  if (!Number.isInteger(pollMs) || pollMs < MIN_POLL_MS) {
    logger.error(`Invalid --poll "${options.poll}". Use a whole number of milliseconds, ${MIN_POLL_MS} or more.`);
    return process.exit(1);
  }

  // What an interrupted setup left behind (marked staging folders only); a delete, so never with --read-only.
  if (!options.readOnly) {
    for (const root of roots) for (const dir of removeStaleStaging(root)) console.log(`Removed ${dir}/, left by an interrupted setup.`);
  }

  // The registry (BL-067): the folders named here are recorded only when the file already exists, so
  // plain `specpilot serve` never creates one; a file that cannot be used is said so and left alone.
  const home = homeDir();
  const registry = options.readOnly ? undefined : registryPath(home);
  let registryNote: string | null = null;
  if (registry) {
    const read = readRegistry(registry);
    if (read.error !== null) registryNote = `${displayRoot(registry, home)} could not be read (${read.error}). It was left as it is; projects opened in this run are not remembered.`;
    else if (read.exists) {
      try {
        writeRegistry(registry, roots.reduce((entries, root) => upsertEntry(entries, root, new Date()), read.entries));
      } catch (err) {
        registryNote = `${displayRoot(registry, home)} could not be written (${(err as Error).message}). It was left as it is; projects opened in this run are not remembered.`;
      }
    }
  }

  let handle: SpecServer;
  try {
    handle = await startSpecServer(roots, port, packageJson.version, { pollMs, readOnly: !!options.readOnly, named, registry, log: m => logger.warn(m) });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Pick another with --port, e.g. \`specpilot serve --port ${port === 65535 ? 4322 : port + 1}\`.`);
    } else {
      logger.error(`Could not start the server: ${(err as Error).message}`);
    }
    return process.exit(1);
  }

  const url = `http://127.0.0.1:${port}`;
  if (roots.length === 1) console.log(chalk.green(`SpecPilot is serving ${roots[0]} at ${url}`));
  else {
    console.log(chalk.green(`SpecPilot is serving ${roots.length} projects at ${url}`));
    roots.forEach((root, i) => console.log(`  ${i}  ${root}`));
  }
  const empty = roots.filter(root => specsMissing(root));
  for (const root of empty) console.log(options.readOnly ? `No .specs/ in ${root}.` : `No .specs/ in ${root} yet. Open the page to set it up.`);
  console.log(
    chalk.gray(
      options.readOnly
        ? 'Read-only: nothing will be written. Open pages update when a spec file changes. Press Ctrl+C to stop.'
        : empty.length
          ? 'Tasks can be moved in the page (only .specs/planning/tasks.md is written), and a folder without .specs/ can be set up there (new files only). Open pages update when a spec file changes. Press Ctrl+C to stop.'
          : 'Tasks can be moved in the page (only .specs/planning/tasks.md is written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
    ),
  );
  if (registry) console.log(chalk.gray(`Folders opened in the page are remembered in ${displayRoot(registry, home)}.`));
  if (registryNote) console.log(registryNote);
  if (options.open) openBrowser(url, logger);

  // Ctrl+C, `kill` and a closed terminal end the same way. A clone runs in its own session and would
  // outlive the server, so the signals stay handled until it is stopped and cleaned up (BL-PM-002),
  // for at most STOP_CLONE_MS; after that a second signal ends the process at once, as before.
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    let cap: NodeJS.Timeout;
    const capped = new Promise<boolean>(r => (cap = setTimeout(() => r(false), STOP_CLONE_MS)));
    void Promise.race([handle.stopClone().then(() => true), capped])
      .then(stopped => {
        clearTimeout(cap);
        for (const signal of signals) process.removeListener(signal, stop);
        if (!stopped) {
          logger.warn(`The clone could not be cleaned up within ${STOP_CLONE_MS / 1000} seconds. Its folder may be left behind.`);
          return process.exit(0);
        }
        return handle.close();
      })
      .then(() => process.exit(0));
  };
  for (const signal of signals) process.on(signal, stop);
}
