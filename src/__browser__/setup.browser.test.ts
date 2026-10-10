// Guided setup of a folder without .specs/ (BL-079 row, BL-055, BL-PM-004), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, serve, Served, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let empty: string;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  empty = join(env.home, 'dev', 'empty-folder');
  mkdirSync(empty);
  srv = await serve(env, [env.project, empty]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

/** What the composer shows now: the step line and its controls, to wait for the next question. */
const composerState = (page: Page) => page.evaluate(() => (document.querySelector('#chatSub')?.textContent ?? '') + '|' + (document.querySelector('#comp')?.innerHTML ?? ''));

/**
 * Answer every question the chat asks the way a user taking the defaults would: Skip where there is one,
 * the seeded or first choice, and a handle for the one required text question. Returns how many it answered.
 */
async function answerAll(page: Page): Promise<number> {
  for (let n = 0; n < 80; n++) {
    if (await page.locator('#chatCreate').count()) return n;
    const before = await composerState(page);
    if (await page.locator('#chatSkip').count()) await page.click('#chatSkip');
    else if (await page.locator('#chatIn').count()) {
      if (!(await page.inputValue('#chatIn'))) await page.fill('#chatIn', 'jsmith');
      await page.click('#chatGo');
    } else {
      if (await page.locator('#chatGo').isDisabled()) await page.locator('#comp .chip[data-v]').first().click();
      await page.click('#chatGo');
    }
    await page.waitForFunction(prev => {
      const now = (document.querySelector('#chatSub')?.textContent ?? '') + '|' + (document.querySelector('#comp')?.innerHTML ?? '');
      return now !== prev || !!document.querySelector('#chatCreate');
    }, before);
  }
  throw new Error('the chat did not reach its recap in 80 answers');
}

browserTest('a folder without .specs/ is set up from the chat: Start Guided Setup, the answers, Create .specs/, then onboarding.md', b, async open => {
  const { page } = await open(srv, '#1/setup');
  await waitView(page, 'v-chat');
  await page.locator('#setupStart').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'setupStart');
  await page.click('#setupStart');
  await page.locator('#composer').waitFor({ state: 'visible' });
  expect(await answerAll(page)).toBeGreaterThan(3);
  expect(existsSync(join(empty, '.specs'))).toBe(false);
  await page.click('#chatCreate');
  await waitToast(page, /\.specs\/ created in /);
  await page.waitForFunction(() => location.hash === '#1/file/development/onboarding.md' && document.activeElement?.id === 'content');
  for (const f of ['project/project.yaml', 'planning/tasks.md', 'development/onboarding.md']) expect(existsSync(join(empty, '.specs', f))).toBe(true);
  // the folder is now a project like any other: its Tasks view lists the new tasks.md
  await page.goto(`${srv.url}/#1/board`);
  await waitView(page, 'v-board');
  await page.locator('#gConv').waitFor();
});

browserTest('the setup chat has no sideways scroll at 420px', b, async open => {
  const { page } = await open(srv, '#1/setup', { width: 420 });
  await waitView(page, 'v-chat');
  await page.locator('#setupStart').waitFor({ state: 'visible' });
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#setupStart');
  await page.locator('#composer').waitFor({ state: 'visible' });
  expect(await noSideScroll(page)).toBe(true);
});
