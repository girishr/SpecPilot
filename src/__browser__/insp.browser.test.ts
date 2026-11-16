// Resize the details panel (BL-TB-02, REQ-002.H.74), TESTS-002.4. The fixture project's known rows (BL-001 in Backlog).
import { Browser, Page } from 'playwright-core';
import { writeFileSync } from 'fs';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, serve, Served, until, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  srv = await serve(env, [env.project]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const row = (page: Page, col: string, i: number) => page.locator(`#boardMode .row[data-col="${col}"][data-i="${i}"]`);
const settled = (page: Page) => page.waitForFunction(() => { const el = document.querySelector('#insp')!; return el.getAnimations().length === 0; });
const openTask = async (page: Page) => {
  await row(page, 'backlog', 0).click();
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  await settled(page);
};
const width = (page: Page) => page.evaluate(() => Math.round(document.querySelector('#insp')!.getBoundingClientRect().width));
const pane = (page: Page) => page.evaluate(() => document.querySelector('#insp')!.parentElement!.clientWidth);
const aria = (page: Page) => page.evaluate(() => { const g = document.querySelector('#inspGrip')!; return [g.getAttribute('aria-valuemin'), g.getAttribute('aria-valuemax'), g.getAttribute('aria-valuenow')].map(Number); });
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('sp-insp-width'));
const gripShown = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('#inspGrip')!).display !== 'none');
/** Drag the handle by dx (negative: left, wider), optionally pressing Escape before letting go. */
const drag = async (page: Page, dx: number, escape = false) => {
  const r = (await page.locator('#inspGrip').boundingBox())!;
  const x = r.x + r.width / 2, y = r.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y);
  await page.mouse.move(x + dx, y);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
};

browserTest('the handle is a separator on the open panel\'s left edge, hidden and out of the tab order while the panel is closed', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  expect(await gripShown(page)).toBe(false);
  await openTask(page);
  expect(await gripShown(page)).toBe(true);
  const g = page.locator('#inspGrip');
  expect(await g.getAttribute('role')).toBe('separator');
  expect(await g.getAttribute('aria-orientation')).toBe('vertical');
  expect(await g.getAttribute('aria-controls')).toBe('insp');
  expect(await g.getAttribute('aria-label')).toBe('Resize Details');
  expect(await aria(page)).toEqual([320, (await pane(page)) - 160, 400]);
  expect(await width(page)).toBe(400);
  const edge = await page.evaluate(() => { const g = document.querySelector('#inspGrip')!.getBoundingClientRect(), p = document.querySelector('#insp')!.getBoundingClientRect(); return Math.round(g.left + g.width / 2 - p.left); });
  expect(Math.abs(edge)).toBeLessThanOrEqual(1);
  await page.click('#inspX');
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  expect(await gripShown(page)).toBe(false);
  // a live reload that loses the open row closes the panel without closeInsp: the handle goes with it
  await openTask(page);
  writeFileSync(env.tasks(), read(env.tasks()).replace(/\| BL-001 \|[^\n]*\n/, ''));
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  expect(await gripShown(page)).toBe(false);
  await page.focus('#boardMode .row[data-col="backlog"][data-i="0"]');
  for (let n = 0; n < 40; n++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('inspGrip');
  }
});

browserTest('a drag widens and narrows, clamped at 320px and at the pane minus 160px; the width is kept and survives a reload', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await openTask(page);
  await drag(page, -100);
  expect(await width(page)).toBe(500);
  expect(await stored(page)).toBe('500');
  expect((await aria(page))[2]).toBe(500);
  await drag(page, 2000);
  expect(await width(page)).toBe(320);
  await drag(page, -3000);
  const max = (await pane(page)) - 160;
  expect(await width(page)).toBe(max);
  expect(await stored(page)).toBe(String(max));
  await drag(page, max - 450); // to 450
  expect(await width(page)).toBe(450);
  await page.reload();
  await waitView(page, 'v-board');
  await openTask(page);
  expect(await width(page)).toBe(450);
  // a file opens in the same panel, at the same width
  await page.goto(`${srv.url}/#0/instructions`);
  await page.locator('#insBox [data-open]').first().click();
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  await settled(page);
  expect(await width(page)).toBe(450);
});

browserTest('keys, a double-click reset, and Escape during a drag', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await openTask(page);
  await page.focus('#inspGrip');
  await page.keyboard.press('ArrowLeft');
  expect(await width(page)).toBe(416);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await width(page)).toBe(384);
  expect(await stored(page)).toBe('384');
  await page.keyboard.press('Home');
  expect(await width(page)).toBe(320);
  await page.keyboard.press('End');
  expect(await width(page)).toBe((await pane(page)) - 160);
  await page.dblclick('#inspGrip');
  expect(await width(page)).toBe(400);
  expect(await stored(page)).toBe(null);
  await drag(page, -200, true);
  expect(await width(page)).toBe(400);
  expect(await stored(page)).toBe(null);
  expect(await page.evaluate(() => document.querySelector('#insp')!.classList.contains('open'))).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains('resizing'))).toBe(false);
});

browserTest('a smaller window clamps the width without rewriting it; the ARIA values follow; a bad stored value means 400', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await openTask(page);
  await drag(page, -300);
  expect(await width(page)).toBe(700);
  await page.setViewportSize({ width: 1000, height: 900 });
  await until(async () => (await width(page)) === (await pane(page)) - 160, 'clamped to the smaller pane');
  const small = (await pane(page)) - 160;
  expect(small).toBeLessThan(700);
  expect(await aria(page)).toEqual([320, small, small]);
  expect(await stored(page)).toBe('700');
  await page.setViewportSize({ width: 1280, height: 900 });
  await until(async () => (await width(page)) === 700, 'back to the chosen width');
  expect((await aria(page))[1]).toBe((await pane(page)) - 160);
  await page.evaluate(() => localStorage.setItem('sp-insp-width', 'wide'));
  await page.reload();
  await waitView(page, 'v-board');
  await openTask(page);
  expect(await width(page)).toBe(400);
});

for (const isLight of [false, true]) {
  browserTest(`at 420px no handle and a full-width panel with nothing scrolling sideways: closed, a task open, the Edit form, an Edit error (${isLight ? 'light' : 'dark'})`, b, async o => {
    const { page } = await o(srv, '', { width: 420, light: isLight });
    await page.evaluate(() => localStorage.setItem('sp-insp-width', '700'));
    await page.reload();
    await waitView(page, 'v-board');
    const check = async () => {
      expect(await gripShown(page)).toBe(false);
      expect(await noSideScroll(page)).toBe(true);
    };
    await check(); // closed
    await openTask(page);
    await check();
    expect(await width(page)).toBe(Math.min(400, await pane(page))); // min(400px, 100%) as before, the stored 700 not applied
    await page.click('#edBtn');
    await check();
    await page.fill('#edText', 'a | b');
    await page.keyboard.press('Enter');
    await page.locator('#edErr').waitFor({ state: 'visible' });
    await check();
  }, [/Failed to load resource/]);
}
