import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { SpecServer, startSpecServer } from '../utils/specServer';
import { Logger } from '../utils/logger';

const packageJson = require('../../package.json');

export interface ServeOptions {
  port?: string;
  poll?: string;
  open?: boolean;
}

const DEFAULT_PORT = 4321;
const DEFAULT_POLL_MS = 1000;
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

/** Runs until Ctrl+C; exits the process with 1 on any startup error. */
export async function serveCommand(options: ServeOptions): Promise<void> {
  const logger = new Logger();
  const root = process.cwd();

  if (!existsSync(join(root, '.specs'))) {
    logger.error('No .specs/ folder in this directory. Run `specpilot serve` from a project root, or `specpilot init` first.');
    return process.exit(1);
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

  let handle: SpecServer;
  try {
    handle = await startSpecServer(root, port, packageJson.version, { pollMs, log: m => logger.warn(m) });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Pick another with --port, e.g. \`specpilot serve --port ${port === 65535 ? 4322 : port + 1}\`.`);
    } else {
      logger.error(`Could not start the server: ${(err as Error).message}`);
    }
    return process.exit(1);
  }

  const url = `http://127.0.0.1:${port}`;
  console.log(chalk.green(`SpecPilot is serving ${root} read-only at ${url}`));
  console.log(chalk.gray('Open pages update when a spec file changes. Press Ctrl+C to stop.'));
  if (options.open) openBrowser(url, logger);

  process.once('SIGINT', () => {
    void handle.close().then(() => process.exit(0));
  });
}
