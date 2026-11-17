// Back and Forward move between the page's sections (BL-192, REQ-002.H.77), TESTS-002.4.
// Two copies of the fixture project: spec-project (index 0) and second-project (index 1), both in the registry.
import { Browser, Page } from 'playwright-core';
import { rmSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, remember, serve, Served, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let second: string;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  second = makeProject(join(env.home, 'dev'), 'second-project');
  remember(env, [env.project, second]);
  srv = await serve(env, [env.project, second]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const len = (page: Page) => page.evaluate(() => history.length);
const hash = (page: Page) => page.evaluate(() => location.hash);
const back = async (page: Page, view: string, h: string) => {
  await page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
  await page.waitForFunction(x => location.hash === x, h);
  await waitView(page, view);
};
const forward = async (page: Page, view: string, h: string) => {
  await page.goForward({ waitUntil: 'commit' }).catch(() => undefined);
  await page.waitForFunction(x => location.hash === x, h);
  await waitView(page, view);
};
const row = (page: Page, v: string, f?: string) => page.click(f ? `.src .srow[data-v="${v}"][data-f="${f}"]` : `.src .srow[data-v="${v}"]`);

browserTest('each section opened adds one entry; Back and Forward walk them; a repeated click or a task\'s details add none', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  const start = await len(page);
  await row(page, 'board');
  await waitView(page, 'v-board');
  await row(page, 'board'); // the same section again
  await page.locator('#boardMode .row[data-col="backlog"][data-i="0"]').click(); // details, not a section
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  await page.keyboard.press('Escape');
  await row(page, 'file', 'planning/roadmap.md');
  await waitView(page, 'v-file');
  await page.locator('#content').focus();
  await page.keyboard.press('4'); // Explorer by its digit key
  await waitView(page, 'v-explorer');
  expect(await len(page)).toBe(start + 3);
  await back(page, 'v-file', '#file/planning/roadmap.md');
  await back(page, 'v-board', '#board');
  await back(page, 'v-overview', '#overview');
  await forward(page, 'v-board', '#board');
  await forward(page, 'v-file', '#file/planning/roadmap.md');
  expect(await len(page)).toBe(start + 3); // walking adds nothing
});

browserTest('an Overview card link adds an entry; a project tile adds one and Back returns to the first project', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  const start = await len(page);
  await page.locator('#ovBox [data-card="files"] .ovcf .ovlink').click();
  await waitView(page, 'v-explorer');
  await page.click('#projList [data-project="1"]');
  await page.waitForFunction(() => location.hash === '#1/overview');
  await waitView(page, 'v-overview');
  expect(await page.textContent('#subPath')).toContain('second-project');
  expect(await len(page)).toBe(start + 2);
  await back(page, 'v-explorer', '#explorer');
  await page.waitForFunction(() => document.querySelector('#subPath')?.textContent?.includes('spec-project') ?? false);
});

browserTest('a hash the page resolves on load is replaced, not added: Back leaves no #nope behind', b, async o => {
  const { page } = await o(srv, '#board');
  await waitView(page, 'v-board');
  await page.goto(`${srv.url}/#nope`);
  await page.waitForFunction(() => location.hash === '#overview');
  await waitView(page, 'v-overview');
  await back(page, 'v-board', '#board');
});

browserTest('closing the shown project goes Home without an entry, and Back does not loop or draw the closed project', b, async o => {
  const { page } = await o(srv, '#1/board');
  await waitView(page, 'v-board');
  await page.click('#homeBtn');
  await waitView(page, 'v-home');
  const before = await len(page);
  await page.click(`#homeBox [data-remove="${second}"]`);
  await waitToast(page, /was closed\.$/);
  expect(await hash(page)).toBe('#home');
  expect(await len(page)).toBe(before);
  await page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
  await page.waitForFunction(() => location.hash === '#home');
  await waitView(page, 'v-home');
  expect(await page.locator('#projList [data-project="1"]').count()).toBe(0);
  expect(await len(page)).toBe(before);
});

browserTest('a live reload that forces the setup view replaces the entry', b, async o => {
  const { page } = await o(srv, '#board');
  await waitView(page, 'v-board');
  const before = await len(page);
  rmSync(join(env.project, '.specs'), { recursive: true, force: true });
  await waitView(page, 'v-setup');
  expect(await len(page)).toBe(before);
  expect(await hash(page)).toBe('#setup');
});

browserTest('where the browser refuses URLs in history, the in-memory hash still switches views with no error', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  await page.addInitScript(() => {
    const no = () => { throw new DOMException('refused', 'SecurityError'); };
    history.pushState = no;
    history.replaceState = no;
  });
  await page.reload();
  await waitView(page, 'v-overview');
  const before = await len(page);
  await row(page, 'board');
  await waitView(page, 'v-board');
  await row(page, 'explorer');
  await waitView(page, 'v-explorer');
  expect(await len(page)).toBe(before);
});

for (const isLight of [false, true]) {
  browserTest(`at 420px Back and Forward work with the drawer, and nothing scrolls sideways after a close and in the forced setup view (${isLight ? 'light' : 'dark'})`, b, async o => {
    const { page } = await o(srv, '#board', { width: 420, light: isLight });
    await waitView(page, 'v-board');
    await page.click('#menuBtn');
    await row(page, 'explorer');
    await waitView(page, 'v-explorer');
    await back(page, 'v-board', '#board');
    expect(await noSideScroll(page)).toBe(true);
    await forward(page, 'v-explorer', '#explorer');
    expect(await noSideScroll(page)).toBe(true);
    await page.goto(`${srv.url}/#1/board`);
    await waitView(page, 'v-board');
    await page.goto(`${srv.url}/#home`);
    await waitView(page, 'v-home');
    await page.click(`#homeBox [data-remove="${second}"]`);
    await waitToast(page, /was closed\.$/);
    expect(await noSideScroll(page)).toBe(true); // after the close
    await page.goto(`${srv.url}/#board`);
    await waitView(page, 'v-board');
    rmSync(join(env.project, '.specs'), { recursive: true, force: true });
    await waitView(page, 'v-setup');
    expect(await noSideScroll(page)).toBe(true); // the forced setup view
  }, [/Failed to load resource/]);
}
