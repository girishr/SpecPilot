// Removing an open project on Home closes it (BL-166, REQ-002.H.75, SEC-004.37), TESTS-002.4.
// Two copies of the fixture project: spec-project (index 0) and second-project (index 1), both in the registry.
import { Browser, Page } from 'playwright-core';
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

const tiles = (page: Page) => page.$$eval('#projList [data-project]', els => els.map(e => (e as HTMLElement).dataset.project));
const removeOnHome = (page: Page, path: string) => page.click(`#homeBox [data-remove="${path}"]`);
const closedToast = /^fixture-project was closed\.$/;

browserTest('removing the shown project on Home takes its tile off the rail, stays on Home with the toast, and the other project still opens', b, async o => {
  const { page } = await o(srv, '#1/board');
  await waitView(page, 'v-board');
  expect(await tiles(page)).toEqual(['0', '1']);
  await page.click('#homeBtn');
  await waitView(page, 'v-home');
  await removeOnHome(page, second);
  await waitToast(page, closedToast);
  await page.waitForFunction(() => document.querySelectorAll('#projList [data-project]').length === 1);
  expect(await tiles(page)).toEqual(['0']);
  expect(await page.locator(`#homeBox [data-remove="${second}"]`).count()).toBe(0);
  await waitView(page, 'v-home');
  await page.click('#projList [data-project="0"]');
  await waitView(page, 'v-overview');
  expect(await page.evaluate(() => location.hash)).toBe('#overview');
});

browserTest('removing another open project keeps the shown one', b, async o => {
  const { page } = await o(srv, '#home');
  await waitView(page, 'v-home');
  await removeOnHome(page, second);
  await waitToast(page, closedToast);
  expect(await tiles(page)).toEqual(['0']);
  await page.click('#projList [data-project="0"]');
  await waitView(page, 'v-overview');
  expect(await page.textContent('#subPath')).toContain('spec-project');
});

browserTest('a second page showing the closed project goes Home on event: closed', b, async o => {
  const { page: viewer } = await o(srv, '#1/board');
  await waitView(viewer, 'v-board');
  const { page } = await o(srv, '#home');
  await waitView(page, 'v-home');
  await removeOnHome(page, second);
  await waitToast(viewer, closedToast);
  await waitView(viewer, 'v-home');
  expect(await tiles(viewer)).toEqual(['0']);
}, [/Failed to load resource/]);

browserTest('with project 0 closed: an empty hash and #board show the first open project, whose write names it; a closed #0/board lands on Home', b, async o => {
  const { page } = await o(srv, '#home');
  await waitView(page, 'v-home');
  await removeOnHome(page, env.project);
  await waitToast(page, closedToast);
  const { page: fresh } = await o(srv, ''); // an empty hash: the first open project's Overview (BL-171)
  await waitView(fresh, 'v-overview');
  await fresh.waitForFunction(() => location.hash === '#1/overview');
  expect(await fresh.textContent('#subPath')).toContain('second-project');
  await fresh.keyboard.press('1'); // Tasks, for the write
  await waitView(fresh, 'v-board');
  expect(await fresh.evaluate(() => location.hash)).toBe('#1/board');
  const moved = fresh.waitForRequest(r => r.url().includes('/api/tasks/move?project=1'));
  await fresh.locator('#boardMode .row[data-col="backlog"][data-i="1"]').focus(); // BL-002 has no Type or Priority
  await fresh.keyboard.press('Alt+ArrowRight');
  await moved;
  const { page: byName } = await o(srv, '#board');
  await waitView(byName, 'v-board');
  expect(await byName.textContent('#subPath')).toContain('second-project');
  const { page: closedOne } = await o(srv, '#0/board');
  await waitView(closedOne, 'v-home');
}, [/Failed to load resource/]);

browserTest('a page that missed an earlier close lands on the right project: three projects, the viewer on #2, the other page closes 0 then 2', b, async o => {
  const third = makeProject(join(env.home, 'dev'), 'third-project');
  remember(env, [env.project, second, third]);
  const three = await serve(env, [env.project, second, third]);
  try {
    const { page: viewer } = await o(three, '#2/board');
    await waitView(viewer, 'v-board');
    const { page } = await o(three, '#home');
    await waitView(page, 'v-home');
    await removeOnHome(page, env.project); // the viewer shows 2 and hears nothing of 0
    await waitToast(page, closedToast);
    await removeOnHome(page, third);
    await waitToast(viewer, closedToast);
    await waitView(viewer, 'v-home');
    await viewer.waitForFunction(() => document.querySelector('#subPath')?.textContent?.includes('second-project') ?? false);
    expect(await tiles(viewer)).toEqual(['1']);
    await viewer.keyboard.press('1'); // the Tasks shortcut: the page's own project number, no rail switch
    await waitView(viewer, 'v-board');
    expect(await viewer.evaluate(() => location.hash)).toBe('#1/board');
    const moved = viewer.waitForRequest(r => r.url().includes('/api/tasks/move?'));
    await viewer.locator('#boardMode .row[data-col="backlog"][data-i="1"]').focus();
    await viewer.keyboard.press('Alt+ArrowRight');
    expect(new URL((await moved).url()).searchParams.get('project')).toBe('1');
  } finally {
    await three.close();
  }
}, [/Failed to load resource/]);

for (const isLight of [false, true]) {
  browserTest(`at 420px nothing scrolls sideways: before, while the remove is in flight, after a close, with every project closed, after a refused remove (${isLight ? 'light' : 'dark'})`, b, async o => {
    const { page } = await o(srv, '#home', { width: 420, light: isLight });
    await waitView(page, 'v-home');
    expect(await noSideScroll(page)).toBe(true); // before
    let release: () => void = () => undefined;
    const held = new Promise<void>(r => (release = r));
    await page.route('**/api/projects/remove', async route => {
      await held;
      await route.continue();
    });
    await removeOnHome(page, second);
    expect(await noSideScroll(page)).toBe(true); // in flight
    release();
    await waitToast(page, closedToast);
    await page.unroute('**/api/projects/remove');
    expect(await noSideScroll(page)).toBe(true); // after
    await page.route('**/api/projects/remove', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'That folder is not in the list.' }) }));
    await removeOnHome(page, env.project);
    await waitToast(page, /^That folder is not in the list\.$/);
    expect(await noSideScroll(page)).toBe(true); // refused
    await page.unroute('**/api/projects/remove');
    await removeOnHome(page, env.project);
    await waitToast(page, closedToast);
    await page.waitForFunction(() => document.querySelectorAll('#projList [data-project]').length === 0);
    expect(await noSideScroll(page)).toBe(true); // every project closed
  }, [/Failed to load resource/]);
}
