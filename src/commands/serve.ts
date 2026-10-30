import chalk from 'chalk';
import { spawn } from 'child_process';
import { Command } from 'commander';
import { existsSync, realpathSync, statSync } from 'fs';
import { request } from 'http';
import { connect } from 'net';
import { join, resolve, win32 } from 'path';
import { buildSpecsPayload, displayRoot, SpecServer, startSpecServer } from '../utils/specServer';
import { removeStaleStaging, specsMissing } from '../utils/specSetup';
import { checkOpenPath, homeDir, MAX_PROJECTS, readRegistry, registryPath, sortEntries, upsertEntry, writeRegistry } from '../utils/projectRegistry';
import { Logger } from '../utils/logger';

const packageJson = require('../../package.json');

export interface ServeOptions {
  port?: string;
  poll?: string;
  readOnly?: boolean;
  open?: boolean;
  mcp?: boolean;
  stop?: boolean;
}

const DEFAULT_PORT = 4321;
const DEFAULT_POLL_MS = 1000;
/** Longest a stop signal waits for a running clone to be killed and cleaned up. */
export const STOP_CLONE_MS = 5000;
const MIN_POLL_MS = 250;

/** `SPECPILOT_MCP_TOKEN` (BL-PM-007): at least 32 visible ASCII characters, so it is hard to guess and fits in a header. */
export const MCP_TOKEN_PATTERN = /^[\x21-\x7e]{32,}$/;

/** The one line an IDE's MCP settings take (the page's card builds the same line, ui/route.js). */
export function mcpConfigLine(host: string, token: string): string {
  return JSON.stringify({ mcpServers: { 'specpilot-local': { type: 'http', url: `http://${host}/mcp`, headers: { 'X-SpecPilot-Token': token } } } });
}

/**
 * The program that opens `url`. On Windows `cmd.exe` by its full path, from the home drive's root, so a `cmd.exe` in the
 * served folder cannot run (BL-132; the folder dialog's rule, SEC-002.5 residual (n)). Exported for the tests.
 */
export function browserCommand(url: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): { file: string; args: string[]; cwd?: string } {
  if (platform === 'darwin') return { file: 'open', args: [url], cwd: undefined };
  if (platform === 'win32') return { file: win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), args: ['/c', 'start', '', url], cwd: win32.parse(home).root };
  return { file: 'xdg-open', args: [url], cwd: undefined };
}

/** Open `url` in the default browser. The URL is built here, never taken from input. */
function openBrowser(url: string, logger: Logger): void {
  const { file, args, cwd } = browserCommand(url, process.platform, process.env, homeDir());
  const child = spawn(file, args, { stdio: 'ignore', detached: true, cwd });
  child.on('error', () => logger.warn(`Could not open a browser. Open ${url} yourself.`));
  child.unref();
}

/** The most of `GET /` that `--stop` reads (BL-098). */
const MAX_PAGE_BYTES = 1024 * 1024;

/** One request to 127.0.0.1:<port>: status and body (at most MAX_PAGE_BYTES), no redirect followed. */
function loopback(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveRequest, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers, timeout: 5000, agent: false }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        text += chunk;
        if (text.length > MAX_PAGE_BYTES) req.destroy(new Error('too large'));
      });
      res.on('end', () => resolveRequest({ status: res.statusCode ?? 0, body: text }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Whether something accepts connections on 127.0.0.1:<port>. */
function listening(port: number): Promise<boolean> {
  return new Promise(resolveCheck => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolveCheck(true)));
    socket.once('error', () => resolveCheck(false));
  });
}

/**
 * `specpilot serve --stop` (BL-098): the page's own Quit, sent from here. Reads the page token from `GET /`
 * as any page on this machine can, posts `/api/quit` with it, then waits for the port to close. Never
 * prints the token, signals no process and writes nothing.
 */
async function stopRunningServer(port: number, logger: Logger): Promise<void> {
  const page = await loopback(port, 'GET', '/').catch(() => null);
  const token = page?.status === 200 ? /<meta name="specpilot-token" content="([0-9a-f]{64})">/.exec(page.body)?.[1] : undefined;
  if (!token) {
    logger.error(`No SpecPilot server that --stop can reach is running on port ${port}. A --read-only server stops with Ctrl+C in its terminal.`);
    return process.exit(1);
  }
  const headers = { Origin: `http://127.0.0.1:${port}`, 'X-SpecPilot-Token': token, 'Content-Type': 'application/json' };
  const quit = await loopback(port, 'POST', '/api/quit', headers, '{}').catch(() => null);
  const deadline = Date.now() + STOP_CLONE_MS + 2000;
  while (quit?.status === 202 && Date.now() < deadline) {
    if (!(await listening(port))) {
      console.log(`Stopped the SpecPilot server on port ${port}.`);
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  logger.error(`Asked the server on port ${port} to stop; it is still running.`);
  return process.exit(1);
}

/**
 * Runs until Ctrl+C; exits the process with 1 on any startup error. `folders` empty = the current
 * directory (BL-054) when it contains `.specs/`; without one the server starts with no project open
 * (BL-080; `--read-only` still exits 1); a named folder without one is served for guided setup
 * (BL-055). More folders can be opened from the page; every served folder is remembered in the registry (BL-067, BL-080),
 * and the remembered projects with `.specs/` are reopened after the named ones (BL-114).
 */
export async function serveCommand(folders: string[], options: ServeOptions, command?: Command): Promise<void> {
  const logger = new Logger();

  if (options.stop) {
    const pollGiven = command ? command.getOptionValueSource('poll') === 'cli' : options.poll !== undefined;
    if (folders.length || options.readOnly || options.open || options.mcp !== undefined || pollGiven) {
      logger.error('--stop takes only --port. Run `specpilot serve --stop` or `specpilot serve --stop --port <n>`.');
      return process.exit(1);
    }
    const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      logger.error(`Invalid --port "${options.port}". Use a whole number from 1 to 65535.`);
      return process.exit(1);
    }
    return stopRunningServer(port, logger);
  }
  const roots: string[] = [];
  // `named` per root (REQ-002.H.15): the Setup view is offered in folders the user named, never the current-directory default.
  const named: boolean[] = [];
  let noProject: string | null = null; // the current directory, looked at and not served (BL-080)

  if (!folders.length) {
    const root = realpathSync(process.cwd()); // like a named folder, so "already served" compares like for like (BL-067)
    if (existsSync(join(root, '.specs'))) {
      roots.push(root);
      named.push(false);
    } else if (options.readOnly) {
      // A read-only page has no Home, no Open and no Setup view: nothing to show (REQ-002.H.44).
      logger.error('No .specs/ folder in this directory. Run `specpilot serve` from a project root, `specpilot init` first, or `specpilot serve .` to set one up in the browser.');
      return process.exit(1);
    } else noProject = root;
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
    if (roots.includes(root)) continue; // the same folder named twice is served once
    roots.push(root);
    named.push(true);
  }

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

  // MCP is on unless --no-mcp (BL-105, D3); Commander leaves `mcp` undefined without either flag.
  const mcp = options.mcp !== false;
  // Read here, never written anywhere: with it the IDE's config line survives restarts (BL-PM-007).
  const envToken = mcp ? process.env.SPECPILOT_MCP_TOKEN : undefined;
  if (envToken !== undefined && !MCP_TOKEN_PATTERN.test(envToken)) {
    logger.error('SPECPILOT_MCP_TOKEN must be at least 32 characters, with no spaces or other invisible characters. Set a longer one, or unset it to get a new token each run.');
    return process.exit(1);
  }

  // What an interrupted setup left behind (marked staging folders only); a delete, so never with --read-only,
  // and only in the folders named here, never in a reopened one (BL-114, SEC-004.29): `roots` holds only those yet.
  if (!options.readOnly) {
    for (const root of roots) for (const dir of removeStaleStaging(root)) console.log(`Removed ${dir}/, left by an interrupted setup.`);
  }

  // The registry (BL-067): every served folder is recorded at startup, and the file is created when it
  // is missing (BL-080, D5: it is the desktop app's project list); with nothing served nothing is
  // written; a file that cannot be used is said so and left alone.
  const home = homeDir();
  const registry = options.readOnly ? undefined : registryPath(home);
  let registryNote: string | null = null;
  // The remembered projects reopened after the named ones (BL-114, REQ-002.H.45): the lines they add, printed after the list.
  let reopened = 0;
  const reopenLines: string[] = [];
  if (registry) {
    const read = readRegistry(registry);
    if (read.error !== null) registryNote = `${displayRoot(registry, home)} could not be read (${read.error}). It was left as it is; projects opened in this run are not remembered.`;
    else {
      if (roots.length) {
        try {
          writeRegistry(registry, roots.reduce((entries, root) => upsertEntry(entries, root, new Date()), read.entries));
        } catch (err) {
          registryNote = `${displayRoot(registry, home)} could not be written (${(err as Error).message}). It was left as it is; projects opened in this run are not remembered.`;
        }
      }
      // Every entry in display order that passes the open route's path rule and has .specs/; the registry
      // itself is not rewritten for these (lastOpened stays the user's). Past the cap nothing is read but
      // what the path rule and the .specs/ check need.
      let pastCap = 0;
      for (const entry of sortEntries(read.entries)) {
        const check = checkOpenPath(entry.path, roots, home);
        if (!('root' in check) || specsMissing(check.root)) continue;
        if (roots.length >= MAX_PROJECTS) {
          pastCap++;
          continue;
        }
        try {
          buildSpecsPayload(check.root, packageJson.version); // the read addRoot() makes before serving a folder
        } catch (err) {
          reopenLines.push(`Not reopened: ${check.root} (${(err as Error).message}).`);
          continue;
        }
        roots.push(check.root);
        named.push(true);
        reopened++;
      }
      if (reopened) reopenLines.unshift(`Reopened ${reopened} remembered ${reopened === 1 ? 'project' : 'projects'} from ${displayRoot(registry, home)}.`);
      if (pastCap) reopenLines.push(`${pastCap} remembered ${pastCap === 1 ? 'project' : 'projects'} not reopened: this server already serves ${roots.length}.`);
    }
  }

  let handle: SpecServer;
  try {
    handle = await startSpecServer(roots, port, packageJson.version, { pollMs, readOnly: !!options.readOnly, named, registry, mcp, mcpToken: envToken, log: m => logger.warn(m), onQuit: () => stop() });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Pick another with --port, e.g. \`specpilot serve --port ${port === 65535 ? 4322 : port + 1}\`.`);
    } else {
      logger.error(`Could not start the server: ${(err as Error).message}`);
    }
    return process.exit(1);
  }

  const url = `http://127.0.0.1:${port}`;
  if (!roots.length) console.log(chalk.green(`SpecPilot is running at ${url} with no project open.`));
  else if (roots.length === 1) console.log(chalk.green(`SpecPilot is serving ${roots[0]} at ${url}`));
  else {
    console.log(chalk.green(`SpecPilot is serving ${roots.length} projects at ${url}`));
    roots.forEach((root, i) => console.log(`  ${i}  ${root}`));
  }
  if (noProject !== null) console.log(`No .specs/ folder in ${noProject}. Open a project from the page, or run specpilot serve <folder>.`);
  const empty = roots.filter(root => specsMissing(root));
  for (const root of empty) console.log(options.readOnly ? `No .specs/ in ${root}.` : `No .specs/ in ${root} yet. Open the page to set it up.`);
  for (const line of reopenLines) console.log(line);
  console.log(
    chalk.gray(
      options.readOnly
        ? 'Read-only: nothing will be written. Open pages update when a spec file changes. Press Ctrl+C to stop.'
        : empty.length
          ? 'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written), and a folder without .specs/ can be set up there (new files only). Open pages update when a spec file changes. Press Ctrl+C to stop.'
          : 'Tasks can be moved in the page (only .specs/planning/tasks.md, .specs/planning/tasks-archive.md and specpilot-* command files are written). Open pages update when a spec file changes. Press Ctrl+C to stop.',
    ),
  );
  if (registry) console.log(chalk.gray(`Projects are remembered in ${displayRoot(registry, home)}.`));
  if (registryNote) console.log(registryNote);
  if (mcp) {
    console.log(`MCP endpoint: ${url}/mcp${options.readOnly ? ' (read tools only)' : ''}`);
    console.log(`Add to your IDE's MCP settings: ${mcpConfigLine(`127.0.0.1:${port}`, envToken !== undefined ? '${SPECPILOT_MCP_TOKEN}' : handle.mcpToken!)}`);
  }
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
