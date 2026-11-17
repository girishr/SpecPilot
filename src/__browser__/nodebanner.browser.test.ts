// The banner for a server Node.js outside engines.node (BL-190, REQ-002.H.78), TESTS-002.4. The server judges a
// fixed version (the test-only `nodeVersion`); every expected word and version comes from the built nodeCheck.js.
import { Browser, Page } from 'playwright-core';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, REPO, serve, Served, waitView } from './harness';

const nodeCheck: typeof import('../utils/nodeCheck') = require(join(REPO, 'dist', 'utils', 'nodeCheck.js'));
const OLD = '25.9.0';
const list = (xs: string[]) => `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
const PATCHED = list(nodeCheck.nodeStatus(OLD).patched);
const LONG = (v: string) =>
  `Node.js ${v} on this server has known security vulnerabilities, including TLS certificate bypass, memory disclosure and denial of service (Node.js security releases, ${nodeCheck.RELEASE}). Update to ${PATCHED} or later.`;
const SHORT = `Node.js ${OLD} has known security vulnerabilities. Update to ${PATCHED}+.`;

let browser: Browser;
let env: Env;
const servers: Served[] = [];
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(() => (env = makeEnv()));
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  env.cleanup();
});
const b = () => browser;
const start = async (opts: Parameters<typeof serve>[2] = {}, roots = [env.project]) => {
  const s = await serve(env, roots, opts);
  servers.push(s);
  return s;
};

const shown = (page: Page) => page.evaluate(() => !(document.querySelector('#nodeBar') as HTMLElement).hidden);
const waitHidden = (page: Page) => page.waitForFunction(() => (document.querySelector('#nodeBar') as HTMLElement).hidden);
const visibleText = (page: Page) => page.evaluate(() => (document.querySelector('#nodeBar p') as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
/** The banner sits above the rail: its bottom at or above the rail's top. */
const above = (page: Page) =>
  page.evaluate(() => document.querySelector('#nodeBar')!.getBoundingClientRect().bottom <= document.querySelector('#rail')!.getBoundingClientRect().top + 0.5);

browserTest('a patched Node shows no banner', b, async o => {
  const srv = await start(); // the harness default, 26.13.1
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  expect(await shown(page)).toBe(false);
});

browserTest('an unpatched Node: the banner above the rail on a project and on Home, its text, link and role, no focus taken', b, async o => {
  const srv = await start({ nodeVersion: OLD });
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  expect(await shown(page)).toBe(true);
  expect(await page.textContent('#nodeLong')).toBe(LONG(OLD));
  expect(await visibleText(page)).toBe(`${LONG(OLD)} Read the advisory`);
  expect(await page.getAttribute('#nodeBar', 'role')).toBe('status');
  expect(await page.getAttribute('#nodeLink', 'href')).toBe(nodeCheck.ADVISORY);
  expect(await page.getAttribute('#nodeLink', 'target')).toBe('_blank');
  expect(await page.getAttribute('#nodeLink', 'rel')).toBe('noopener noreferrer');
  expect(await page.getAttribute('#nodeX', 'aria-label')).toBe('Dismiss');
  expect(await page.evaluate(() => document.querySelector('#nodeBar')!.contains(document.activeElement))).toBe(false);
  expect(await above(page)).toBe(true);
  await page.click('#homeBtn');
  await waitView(page, 'v-home');
  expect(await shown(page)).toBe(true);
  expect(await above(page)).toBe(true);
});

browserTest('with no project open and with --read-only the banner shows too', b, async o => {
  const none = await start({ nodeVersion: OLD }, []);
  const a = await o(none);
  await waitView(a.page, 'v-home');
  expect(await shown(a.page)).toBe(true);
  expect(await a.page.textContent('#nodeLong')).toBe(LONG(OLD));
  const ro = await start({ nodeVersion: OLD, readOnly: true });
  const r = await o(ro);
  await waitView(r.page, 'v-overview');
  expect(await shown(r.page)).toBe(true);
});

browserTest('the version is set as text: markup in it is shown, never parsed', b, async o => {
  const srv = await start({ nodeVersion: OLD });
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  await page.route(/\/api\/specs(\?|$)/, async route => {
    const res = await route.fetch();
    const d = await res.json();
    d.node = { ...d.node, version: '<b>x</b>' };
    await route.fulfill({ response: res, json: d });
  });
  await page.reload();
  await page.waitForFunction(() => (document.querySelector('#nodeLong')!.textContent ?? '').includes('<b>x</b>'));
  expect(await page.textContent('#nodeLong')).toBe(LONG('<b>x</b>'));
  expect(await page.locator('#nodeBar b').count()).toBe(0);
});

browserTest('Dismiss hides it for the tab: still hidden on another section and after a reload; a new tab shows it again', b, async o => {
  const srv = await start({ nodeVersion: OLD });
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  await page.click('#nodeX');
  await waitHidden(page);
  await page.click('.src .srow[data-v="board"]');
  await waitView(page, 'v-board');
  expect(await shown(page)).toBe(false);
  await page.reload();
  await waitView(page, 'v-board');
  expect(await shown(page)).toBe(false);
  const other = await o(srv);
  await waitView(other.page, 'v-overview');
  expect(await shown(other.page)).toBe(true);
});

for (const light of [false, true]) {
  browserTest(`at 420px the short form, and nothing scrolls sideways with the banner shown, dismissed and under the open drawer (${light ? 'light' : 'dark'})`, b, async o => {
    const srv = await start({ nodeVersion: OLD });
    const { page } = await o(srv, '', { width: 420, light });
    await waitView(page, 'v-overview');
    expect(await visibleText(page)).toBe(`${SHORT} Advisory`);
    expect(await noSideScroll(page)).toBe(true);
    await page.click('#menuBtn');
    await page.waitForFunction(() => document.querySelector('#win')!.classList.contains('nav'));
    expect(await noSideScroll(page)).toBe(true);
    await page.click('#scrim', { position: { x: 380, y: 450 } });
    await page.waitForFunction(() => !document.querySelector('#win')!.classList.contains('nav'));
    expect(await shown(page)).toBe(true); // back once the drawer closes
    expect(await page.evaluate(() => document.querySelector('#nodeBar')!.getBoundingClientRect().height)).toBeGreaterThan(0);
    await page.click('#nodeX');
    await waitHidden(page);
    expect(await noSideScroll(page)).toBe(true);
  });
}
