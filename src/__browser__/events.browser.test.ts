// The event slots and reads from another page (BL-144, REQ-002.H.63, SEC-002.15 (b), TESTS-002.4): another page cannot
// hold the 8 slots, and the page reopens its stream after the browser gives it up. Fixture rows only.
import { Browser, Page } from 'playwright-core';
import { createServer, request, ClientRequest, Server } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, read, serve, Served, until, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  srv = await serve(env, [env.project, makeProject(join(env.home, 'dev'), 'second-project')]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;
/** Chromium's console line for an EventSource answered with something other than a 200 stream. */
const REFUSED_STREAM = [/EventSource's response has a status 503/, /Failed to load resource: the server responded with a status of 503/];
const port = () => (srv.handle.server.address() as AddressInfo).port;

/** Holds every slot from Node (no fetch headers, so allowed); returns the release. */
async function holdSlots(): Promise<() => Promise<void>> {
  const held: ClientRequest[] = [];
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: port(), path: '/api/events?project=0', headers: { Host: srv.host } }, () => resolve());
      req.on('error', reject);
      req.end();
      held.push(req);
    });
  }
  await until(() => srv.handle.streams() === 8, 'all 8 slots held');
  return async () => {
    held.forEach(r => r.destroy());
    await until(() => srv.handle.streams() === 0, 'the slots released');
  };
}
/** Adds a Current Sprint row to the fixture's tasks.md, outside the page. */
const writeRow = (text: string) => {
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, `| CS-9${Math.floor(Math.random() * 90 + 10)} |  |  | ${text} |`);
  writeFileSync(env.tasks(), lines.join('\n'));
};
const showsRow = (page: Page, text: string) => page.locator('#boardMode .gl[data-col="currentSprint"] .row', { hasText: text }).waitFor({ timeout: 15000 });
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

browserTest('a page on another port opens 8 streams, 8 frames and 8 images to /api/events: none takes a slot, and live reload still works', b, async open => {
  const target = `http://127.0.0.1:${port()}/api/events?project=0`;
  let hostile: Server | null = createServer((_req, res) =>
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      `<!doctype html><script>for (let i = 0; i < 8; i++) new EventSource(${JSON.stringify(target)});</script>` +
        Array.from({ length: 8 }, (_, i) => `<iframe src="${target}&f=${i}"></iframe><img src="${target}&i=${i}">`).join(''),
    ),
  );
  await new Promise<void>(r => hostile!.listen(0, '127.0.0.1', r));
  const ctx = await browser.newContext();
  try {
    const other = await ctx.newPage();
    await other.goto(`http://127.0.0.1:${(hostile.address() as AddressInfo).port}/`);
    await pause(1000);
    expect(srv.handle.streams()).toBe(0);
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    await until(() => srv.handle.streams() === 1, 'the page to hold its stream');
    writeRow('Written while another page tried');
    await showsRow(page, 'Written while another page tried');
  } finally {
    await ctx.close();
    await new Promise(r => hostile!.close(r));
    hostile = null;
  }
});

for (const width of [1280, 420]) {
  browserTest(
    `with every slot held the page's stream is refused; once they close it reopens and catches up (${width} px)`,
    b,
    async open => {
      const release = await holdSlots();
      const { page } = await open(srv, '', { width });
      await waitView(page, 'v-board');
      if (width === 420) expect(await noSideScroll(page)).toBe(true); // refused
      writeRow('Written while refused');
      await release();
      await until(() => srv.handle.streams() === 1, 'the page to reopen its stream', 15000);
      await showsRow(page, 'Written while refused');
      if (width === 420) expect(await noSideScroll(page)).toBe(true); // reopened
    },
    REFUSED_STREAM,
  );
}

browserTest(
  'a project switch during the wait leaves exactly one stream',
  b,
  async open => {
    const release = await holdSlots();
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    await page.evaluate(() => (location.hash = '#1/board'));
    await page.waitForFunction(() => document.querySelector('#projList .tile[data-project="1"]')?.getAttribute('aria-current') === 'true');
    await release();
    await until(() => srv.handle.streams() === 1, 'one reopened stream', 15000);
    await pause(6000);
    expect(srv.handle.streams()).toBe(1);
  },
  REFUSED_STREAM,
);

browserTest(
  'Quit during the wait: no stream is reopened',
  b,
  async open => {
    const release = await holdSlots();
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    page.once('dialog', d => void d.accept());
    await page.click('#quitBtn');
    await page.locator('.stopped').waitFor();
    const events: string[] = [];
    page.on('request', r => {
      if (new URL(r.url()).pathname === '/api/events') events.push(r.url());
    });
    await release();
    await pause(6000);
    expect(events).toEqual([]);
    expect(srv.handle.streams()).toBe(0);
  },
  REFUSED_STREAM,
);
