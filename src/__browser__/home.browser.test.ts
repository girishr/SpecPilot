// Home and opening projects (BL-079 row, BL-PM-001, BL-PM-014, BL-PM-008's Home links), TESTS-002.4.
import { Browser } from 'playwright-core';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, read, remember, routeJs, serve, Served, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let other: string;
let missing: string;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  other = makeProject(join(env.home, 'dev'), 'other-project');
  makeProject(join(env.home, 'dev'), 'third-project');
  missing = join(env.home, 'dev', 'gone-project');
  remember(env, [other, missing, env.project]);
  srv = await serve(env, [env.project]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

browserTest('the Home tile, the h key and #home show Home; + shows Home with focus on Open a Project Folder', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.click('#homeBtn');
  await waitView(page, 'v-home');
  await page.click('#projList .tile');
  await waitView(page, 'v-board');
  await page.locator('#content').focus();
  await page.keyboard.press('h');
  await waitView(page, 'v-home');
  await page.click('#projList .tile');
  await waitView(page, 'v-board');
  await page.click('#addBtn');
  await waitView(page, 'v-home');
  await page.waitForFunction(() => document.activeElement?.id === 'homeOpen');
  const direct = await open(srv, '#home');
  await waitView(direct.page, 'v-home');
  expect(await direct.page.locator('#v-home svg.wordmark').isVisible()).toBe(true);
});

browserTest('Open a Project Folder opens a typed folder as the next project, with its tile, Tasks view and focus in the content', b, async open => {
  const { page } = await open(srv, '#home');
  await waitView(page, 'v-home');
  await page.click('#homeOpen');
  await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open') && document.activeElement?.id === 'pathIn');
  await page.fill('#pathIn', '~/dev/third-project');
  await page.click('#openGo');
  await page.waitForFunction(() => document.querySelectorAll('#projList .tile').length === 2);
  await waitView(page, 'v-board');
  await waitToast(page, /third-project/);
  await page.waitForFunction(() => document.activeElement?.id === 'content');
  expect(await page.evaluate(() => location.hash)).toBe('#1/board');
  expect(read(env.registryFile)).toContain(join(env.home, 'dev', 'third-project'));
});

browserTest(
  'a Recent projects row opens its project; a missing folder says Folder not found; Remove from list drops only the entry',
  b,
  async open => {
    const { page } = await open(srv, '#home');
    const rows = page.locator('#homeBox .hrow');
    await rows.first().waitFor();
    expect(await rows.count()).toBe(3);
    // the VS Code link only where the folder exists (BL-PM-008)
    const links = await page.$$eval('#homeBox .hrow', els => els.map(e => (e.querySelector('a.ib') as HTMLAnchorElement | null)?.getAttribute('href') ?? null));
    expect(links).toEqual([routeJs.editorUrl(other), null, routeJs.editorUrl(env.project)]);
    await page.click(`#homeBox [data-path="${missing}"]`);
    await waitToast(page, /Folder not found/);
    expect(await page.evaluate(() => document.querySelector('.content>.view.on')!.id)).toBe('v-home');
    await page.click(`#homeBox [data-remove="${missing}"]`);
    await page.waitForFunction(() => document.querySelectorAll('#homeBox .hrow').length === 2);
    expect(read(env.registryFile)).not.toContain(missing);
    expect(read(env.registryFile)).toContain(other);
    await page.click(`#homeBox [data-path="${other}"]`);
    await page.waitForFunction(() => document.querySelectorAll('#projList .tile').length === 2);
    await waitView(page, 'v-board');
    await page.waitForFunction(() => document.activeElement?.id === 'content');
  },
  [/status of 422/],
);

for (const light of [false, true]) {
  browserTest(`Home and the Open a Project sheet in ${light ? 'light' : 'dark'} at 1280px and 420px, with no sideways scroll`, b, async open => {
    const wide = await open(srv, '#home', { light });
    const narrow = await open(srv, '#home', { light, width: 420 });
    const backgrounds: string[] = [];
    for (const { page } of [wide, narrow]) {
      await waitView(page, 'v-home');
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(light ? 'light' : null);
      backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
      expect(await noSideScroll(page)).toBe(true);
      await page.click('#homeOpen');
      await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
      expect(await noSideScroll(page)).toBe(true);
    }
    expect(backgrounds[0]).toBe(backgrounds[1]);
    // the other theme's background differs
    const flip = await open(srv, '#home', { light: !light });
    await waitView(flip.page, 'v-home');
    expect(await flip.page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(backgrounds[0]);
  });
}

browserTest('both network checks every test ends with: a cross-host fetch is a console error (the page CSP), a navigation away is fenced', b, async open => {
  const t = await open(srv, '#home');
  await t.page.evaluate(() => fetch('https://example.com/').catch(() => null));
  await until(() => t.errors.some(e => /Content Security Policy/.test(e)), 'the CSP refusal in the console');
  t.errors.length = 0; // seen: the end-of-test check would fail the test otherwise
  await t.page.goto('https://example.com/').catch(() => null);
  expect(t.offHost).toEqual(['https://example.com/']);
  t.offHost.length = 0;
  t.errors.length = 0;
});
