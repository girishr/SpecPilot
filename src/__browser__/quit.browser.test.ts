// Quit in the rail (BL-098, REQ-002.H.37), TESTS-002.4. A fixture project with known rows; the server's
// onQuit is a mock, so the test sees the call while the server keeps answering for the checks after it.
import { Browser, Page } from 'playwright-core';
import { join } from 'path';
import { browserTest, Env, fixtureProject, launch, makeEnv, noSideScroll, serve, Served, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let onQuit: jest.Mock;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  onQuit = jest.fn();
  srv = await serve(env, [fixtureProject(join(env.home, 'dev'), 'quit-project')], { onQuit });
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const NOTICE = 'SpecPilot has stopped. Run specpilot serve to start it again.';
/** The requests the page sends to these paths, from now on. */
const watch = (page: Page, re: RegExp) => {
  const seen: string[] = [];
  page.on('request', r => {
    if (re.test(new URL(r.url()).pathname)) seen.push(new URL(r.url()).pathname);
  });
  return seen;
};
/** Click Quit and answer the confirm; at narrow widths the rail is opened first. */
const quit = async (page: Page, accept: boolean) => {
  if (await page.evaluate(() => innerWidth <= 900 && !document.querySelector('#win')!.classList.contains('nav'))) await page.click('#menuBtn');
  const asked = new Promise<string>(resolve =>
    page.once('dialog', d => {
      resolve(d.message());
      void (accept ? d.accept() : d.dismiss());
    }),
  );
  await page.click('#quitBtn');
  expect(await asked).toBe('Quit SpecPilot? Open pages stop updating.');
};

browserTest('Quit dismissed sends nothing; accepted stops the server once, shows the notice and does not reconnect', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const quits = watch(page, /^\/api\/quit$/);
  await quit(page, false);
  await page.waitForFunction(() => !document.querySelector('.stopped'));
  expect(quits).toEqual([]);
  expect(onQuit).not.toHaveBeenCalled();

  await until(() => srv.handle.streams() === 1, 'the page to hold its event stream');
  const events = watch(page, /^\/api\/events$/);
  await quit(page, true);
  await page.locator('.stopped').waitFor();
  expect(await page.locator('.stopped').textContent()).toBe(NOTICE);
  await until(() => onQuit.mock.calls.length === 1, 'onQuit to be called');
  await until(() => srv.handle.streams() === 0, 'the page to close its event stream');
  expect(quits).toEqual(['/api/quit']);
  expect(events).toEqual([]);
});

browserTest('a refused or unanswered Quit is toasted and the page stays', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.route('**/api/quit', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'This request did not carry the page token, so it was refused. Reload the page and try again.' }) }));
  await quit(page, true);
  await waitToast(page, /^This request did not carry the page token/);
  await page.unroute('**/api/quit');
  await page.route('**/api/quit', route => route.abort());
  await quit(page, true);
  await waitToast(page, /^The server did not answer\.$/);
  expect(await page.locator('.stopped').count()).toBe(0);
  expect(onQuit).not.toHaveBeenCalled();
}, [/Failed to load resource/]);

browserTest('at 420px Quit is reachable and nothing scrolls sideways: idle, after an error, after the notice', b, async open => {
  const { page } = await open(srv, '', { width: 420 });
  await waitView(page, 'v-board');
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#menuBtn');
  await page.locator('#quitBtn').waitFor({ state: 'visible' });
  expect(await page.locator('#quitBtn').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#scrim');
  await page.route('**/api/quit', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The server could not finish this request.' }) }));
  await quit(page, true);
  await waitToast(page, /^The server could not finish this request\.$/);
  expect(await noSideScroll(page)).toBe(true);
  await page.unroute('**/api/quit');
  await quit(page, true);
  await page.locator('.stopped').waitFor();
  expect(await noSideScroll(page)).toBe(true);
}, [/Failed to load resource/]);

describe('with --read-only', () => {
  let ro: Served;
  beforeEach(async () => (ro = await serve(env, [fixtureProject(join(env.home, 'dev'), 'ro-project')], { readOnly: true })));
  afterEach(async () => ro.close());

  browserTest('there is no Quit', b, async open => {
    const { page } = await open(ro);
    await waitView(page, 'v-board');
    expect(await page.locator('#quitBtn').isHidden()).toBe(true);
  });
});
