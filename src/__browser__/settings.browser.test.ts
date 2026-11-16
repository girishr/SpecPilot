// Settings in the rail (BL-UI-02, REQ-002.H.72): the cog opens a menu holding the theme item and Quit.
// A fixture project with known rows; the server's onQuit is a mock, so a Quit here never stops it.
import { Browser, Page } from 'playwright-core';
import { join } from 'path';
import { browserTest, Env, makeProject, launch, makeEnv, noSideScroll, serve, Served, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  srv = await serve(env, [makeProject(join(env.home, 'dev'), 'settings-project')], { onQuit: jest.fn() });
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const open = (page: Page) => page.evaluate(() => !document.querySelector<HTMLElement>('#setMenu')!.hidden);
const expanded = (page: Page) => page.getAttribute('#setBtn', 'aria-expanded');
const focused = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const light = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light');
/** The menu lies inside the window. */
const inside = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('#setMenu')!.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });

browserTest('the cog replaces the theme and Quit tiles and opens and closes its menu by click, Escape, an outside click and Tab', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  expect(await page.locator('#rail #themeBtn, #rail #quitBtn').count()).toBe(0);
  expect(await page.getAttribute('#setBtn', 'aria-label')).toBe('Settings');
  expect(await expanded(page)).toBe('false');

  await page.click('#setBtn');
  expect(await open(page)).toBe(true);
  expect(await expanded(page)).toBe('true');
  expect(await focused(page)).toBe('themeBtn');
  expect(await page.locator('#setMenu [role=menuitem]:visible').allTextContents()).toEqual(['Light appearance', 'Quit SpecPilot…']);
  expect(await inside(page)).toBe(true);
  await page.click('#setBtn');
  expect(await open(page)).toBe(false);
  expect(await expanded(page)).toBe('false');

  await page.click('#setBtn');
  await page.keyboard.press('Escape');
  expect(await open(page)).toBe(false);
  expect(await focused(page)).toBe('setBtn');

  await page.click('#setBtn');
  await page.click('main.pane', { position: { x: 200, y: 200 } });
  expect(await open(page)).toBe(false);

  await page.click('#setBtn');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await open(page)).toBe(false);
  expect(await expanded(page)).toBe('false');
});

browserTest('keys move within the menu, and no page shortcut runs while it is open', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await page.click('#setBtn');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('quitBtn');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('themeBtn');
  await page.keyboard.press('ArrowUp');
  expect(await focused(page)).toBe('quitBtn');
  await page.keyboard.press('Home');
  expect(await focused(page)).toBe('themeBtn');
  await page.keyboard.press('End');
  expect(await focused(page)).toBe('quitBtn');
  const hash = await page.evaluate(() => location.hash);
  for (const k of ['2', 'h']) await page.keyboard.press(k);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await open(page)).toBe(true);
});

browserTest('the theme item switches, relabels, keeps the choice and puts focus back on the cog', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  expect(await light(page)).toBe(false);
  await page.click('#setBtn');
  await page.click('#themeBtn');
  expect(await light(page)).toBe(true);
  expect(await open(page)).toBe(false);
  expect(await focused(page)).toBe('setBtn');
  await waitToast(page, /^Appearance: light$/);
  expect(await page.evaluate(() => localStorage.getItem('sp-theme'))).toBe('light');
  await page.click('#setBtn');
  expect(await page.textContent('#themeBtn')).toBe('Dark appearance');
  await page.keyboard.press('Enter');
  expect(await light(page)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('sp-theme'))).toBe(null);
});

browserTest('a cancelled Quit sends nothing and puts focus back on the cog', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  const quits: string[] = [];
  page.on('request', r => void (new URL(r.url()).pathname === '/api/quit' && quits.push(r.url())));
  page.once('dialog', d => void d.dismiss());
  await page.click('#setBtn');
  await page.click('#quitBtn');
  expect(await open(page)).toBe(false);
  expect(await focused(page)).toBe('setBtn');
  expect(quits).toEqual([]);
});

for (const isLight of [false, true]) {
  browserTest(`at 420px the menu fits beside the drawer, nothing scrolls sideways: idle, after a Quit error, after the notice (${isLight ? 'light' : 'dark'})`, b, async o => {
    const { page } = await o(srv, '', { width: 420, light: isLight });
    await waitView(page, 'v-board');
    const check = async () => {
      if (!(await page.evaluate(() => document.querySelector('#win')!.classList.contains('nav')))) await page.click('#menuBtn');
      await page.click('#setBtn');
      expect(await open(page)).toBe(true);
      expect(await inside(page)).toBe(true);
      expect(await noSideScroll(page)).toBe(true);
    };
    await check();
    await page.route('**/api/quit', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The server could not finish this request.' }) }));
    page.once('dialog', d => void d.accept());
    await page.click('#quitBtn');
    await waitToast(page, /^The server could not finish this request\.$/);
    expect(await noSideScroll(page)).toBe(true);
    await check();
    await page.unroute('**/api/quit');
    page.once('dialog', d => void d.accept());
    await page.click('#quitBtn');
    await page.locator('.stopped').waitFor();
    await check();
  }, [/Failed to load resource/]);
}

describe('with --read-only', () => {
  let ro: Served;
  beforeEach(async () => (ro = await serve(env, [makeProject(join(env.home, 'dev'), 'ro-project')], { readOnly: true })));
  afterEach(async () => ro.close());

  browserTest('Settings holds the theme item only', b, async o => {
    const { page } = await o(ro);
    await waitView(page, 'v-board');
    await page.click('#setBtn');
    expect(await page.locator('#setMenu [role=menuitem]:visible').allTextContents()).toEqual(['Light appearance']);
  });
});
