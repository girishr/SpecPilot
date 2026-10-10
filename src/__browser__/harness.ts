// Shared harness of the browser suite (BL-079, ARCH-004.51, TESTS-002.4): the built server in process,
// scratch projects under a temp HOME, headless Chromium through playwright-core, a fenced network and
// failure artifacts. Never part of `npm test` and never built into dist/.
import { Browser, BrowserContext, chromium, Page } from 'playwright-core';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';

export const REPO = join(__dirname, '..', '..');
const VERSION: string = require(join(REPO, 'package.json')).version;
const PLAYWRIGHT: string = require('playwright-core/package.json').version;

// The built modules, so the server serves what ships (dist/core/chatFlow.js is the page's chat core).
if (!existsSync(join(REPO, 'dist', 'utils', 'specServer.js'))) throw new Error('dist/ is missing: run `npm run test:browser`, which builds first.');
type ServerModule = typeof import('../utils/specServer');
type RegistryModule = typeof import('../utils/projectRegistry');
export const server: ServerModule = require(join(REPO, 'dist', 'utils', 'specServer.js'));
export const registry: RegistryModule = require(join(REPO, 'dist', 'utils', 'projectRegistry.js'));
export const taskMover: typeof import('../utils/taskMover') = require(join(REPO, 'dist', 'utils', 'taskMover.js'));
// The page's own helpers, as the browser runs them.
export const routeJs: {
  editorUrl: (path: string, line?: number, scheme?: string) => string;
  cursorPromptUrl: (text: string) => string | null;
  onboardingPrompt: (src: string) => string;
  mcpConfigLine: (host: string, token: string) => string;
} = require(join(REPO, 'ui', 'route.js'));

/** A condition polled every 50 ms until it holds: never a fixed sleep. */
export async function until(check: () => boolean | Promise<boolean>, what: string, ms = 10000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`Timed out after ${ms} ms waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    throw new Error(
      `Chromium for playwright-core ${PLAYWRIGHT} could not be started. Install its browser once with ` +
        '`npx playwright-core install chromium-headless-shell`, then run `npm run test:browser` again.\n' +
        (err as Error).message,
      { cause: err },
    );
  }
}

export interface Env {
  base: string;
  home: string;
  /** A project with a copy of this repo's .specs/ and CLAUDE.md, on branch main. */
  project: string;
  registryFile: string;
  tasks: (root?: string) => string;
  cleanup: () => void;
}

/** A project folder under `parent`: this repo's .specs/ and CLAUDE.md, a .git/HEAD on main. */
export function makeProject(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  cpSync(join(REPO, '.specs'), join(root, '.specs'), { recursive: true });
  cpSync(join(REPO, 'CLAUDE.md'), join(root, 'CLAUDE.md'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return realpathSync(root);
}

/** A temp HOME with one project in it; HOME points there until cleanup(). */
export function makeEnv(): Env {
  const base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-browser-')));
  const home = join(base, 'home');
  mkdirSync(join(home, 'dev'), { recursive: true });
  const realHome = process.env.HOME;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const registryFile = registry.registryPath(home);
  if (realHome && registryFile.startsWith(realHome + '/')) throw new Error('the registry path would be the real one');
  const project = makeProject(join(home, 'dev'), 'spec-project');
  return {
    base,
    home,
    project,
    registryFile,
    tasks: (root = project) => join(root, '.specs', 'planning', 'tasks.md'),
    cleanup: () => {
      process.env.HOME = realHome;
      process.env.USERPROFILE = realHome;
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** Write the registry with these folders, newest first. */
export function remember(env: Env, paths: string[]): void {
  const now = Date.now();
  let entries: import('../utils/projectRegistry').RegistryEntry[] = [];
  paths.forEach((p, i) => (entries = registry.upsertEntry(entries, p, new Date(now - i * 60000))));
  mkdirSync(join(env.home, '.specpilot'), { recursive: true });
  registry.writeRegistry(env.registryFile, entries);
}

export interface Served {
  url: string;
  host: string;
  handle: import('../utils/specServer').SpecServer;
  close: () => Promise<void>;
}

export async function serve(env: Env, roots: string[], opts: import('../utils/specServer').SpecServerOptions = {}): Promise<Served> {
  const handle = await server.startSpecServer(roots, 0, VERSION, {
    pollMs: 250,
    registry: opts.readOnly ? undefined : env.registryFile,
    ...opts,
  });
  const host = `127.0.0.1:${(handle.server.address() as import('net').AddressInfo).port}`;
  return { url: `http://${host}`, host, handle, close: () => handle.close() };
}

export interface Tracked {
  page: Page;
  errors: string[];
  offHost: string[];
  loads: number;
}

/**
 * One browser test: `fn` gets `open()` for pages on `served`. After `fn`, every page must have had no page
 * error, no console error other than those matching `allow`, and no request to another host. On any
 * failure each page's screenshot and HTML are written to a folder kept on disk, and the paths printed.
 */
export function browserTest(
  name: string,
  getBrowser: () => Browser,
  fn: (open: (served: Served, hash?: string, o?: { width?: number; light?: boolean }) => Promise<Tracked>) => Promise<void>,
  allow: RegExp[] = [],
): void {
  test(name, async () => {
    const contexts: BrowserContext[] = [];
    const pages: Tracked[] = [];
    const open = async (served: Served, hash = '', o: { width?: number; light?: boolean } = {}) => {
      const ctx = await getBrowser().newContext({ viewport: { width: o.width ?? 1280, height: 900 } });
      contexts.push(ctx);
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: served.url });
      if (o.light) await ctx.addInitScript(() => localStorage.setItem('sp-theme', 'light'));
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const t: Tracked = { page, errors: [], offHost: [], loads: 0 };
      pages.push(t);
      page.on('pageerror', e => t.errors.push('pageerror: ' + e.message));
      page.on('console', m => {
        if (m.type() === 'error' && !allow.some(a => a.test(m.text()))) t.errors.push('console: ' + m.text());
      });
      page.on('load', () => t.loads++);
      await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.host === served.host) return route.continue();
        t.offHost.push(route.request().url());
        return route.abort();
      });
      await page.goto(`${served.url}/${hash}`);
      await page.waitForFunction(() => document.querySelector('#projList .tile') !== null || !!document.querySelector('#loadErr:not([hidden])'));
      return t;
    };
    try {
      await fn(open);
      for (const t of pages) {
        expect(t.errors).toEqual([]);
        expect(t.offHost).toEqual([]);
      }
    } catch (err) {
      const dir = mkdtempSync(join(os.tmpdir(), 'specpilot-browser-failure-'));
      const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
      const saved: string[] = [];
      for (const [i, t] of pages.entries()) {
        try {
          const png = join(dir, `${slug}-${i}.png`);
          const html = join(dir, `${slug}-${i}.html`);
          await t.page.screenshot({ path: png, fullPage: true });
          writeFileSync(html, await t.page.content());
          saved.push(png, html);
        } catch {
          // the page may be gone; the error below still says what failed
        }
      }
      console.error(`Browser test failed: ${name}\n${saved.map(p => '  ' + p).join('\n') || '  (no page to save)'}`);
      throw err;
    } finally {
      for (const c of contexts) await c.close();
    }
  });
}

/** The page's visible view id (`v-board`, `v-home`, ...). */
export const viewOf = (page: Page) => page.evaluate(() => document.querySelector('.content>.view.on')?.id ?? null);
export const waitView = (page: Page, id: string) => page.waitForFunction(v => document.querySelector('.content>.view.on')?.id === v, id);
export const toastText = (page: Page) => page.evaluate(() => document.querySelector('#toast')?.textContent ?? '');
export const waitToast = (page: Page, re: RegExp) => page.waitForFunction(src => new RegExp(src).test(document.querySelector('#toast')?.textContent ?? ''), re.source);
/** No sideways scroll at the current width. */
export const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
export const read = (p: string) => readFileSync(p, 'utf-8');
