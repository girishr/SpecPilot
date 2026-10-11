// Start a New Project from Home (BL-090, BL-PM-003, BL-PM-004), TESTS-002.4: the chat to its recap,
// Preview files, Create Project. The create runs the real generateSpecs() into a folder under the temp HOME.
import { Browser, Page } from 'playwright-core';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, makeProject, launch, makeEnv, read, serve, Served, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  srv = await serve(env, [makeProject(join(env.home, 'dev'), 'first-project')]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const composerState = (page: Page) => page.evaluate(() => (document.querySelector('#chatSub')?.textContent ?? '') + '|' + (document.querySelector('#comp')?.innerHTML ?? ''));

/** Answer to the recap like a user taking the defaults: Skip, the first choice, `~/dev` for the parent folder, a handle. */
async function answerAll(page: Page): Promise<string[]> {
  const asked: string[] = [];
  for (let n = 0; n < 80; n++) {
    if (await page.locator('#chatCreate').count()) return asked;
    const before = await composerState(page);
    asked.push(await page.evaluate(() => document.querySelector('#chatSub')?.textContent ?? ''));
    if (await page.locator('#chatSkip').count()) await page.click('#chatSkip');
    else if (await page.locator('#chatIn').count()) {
      if (!(await page.inputValue('#chatIn'))) await page.fill('#chatIn', (await page.getAttribute('#chatIn', 'placeholder')) === '~/dev' ? '~/dev' : 'jsmith');
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

browserTest('Start a New Project: the name, the chat to the recap, Preview files, Create Project; the folder holds what init writes and is served next', b, async open => {
  const { page } = await open(srv, '#home');
  await waitView(page, 'v-home');
  await page.click('#homeNew');
  await waitView(page, 'v-chat');
  await page.locator('#nameIn').waitFor({ state: 'visible' });
  await page.fill('#nameIn', 'parcel-track');
  await page.click('#nameGo');
  await page.locator('#composer').waitFor({ state: 'visible' });
  expect((await answerAll(page)).length).toBeGreaterThan(3);
  const target = join(env.home, 'dev', 'parcel-track');
  const before = readdirSync(join(env.home, 'dev'));
  expect(existsSync(target)).toBe(false); // nothing is written before Create Project

  await page.click('#pv summary');
  await page.waitForFunction(() => document.querySelectorAll('#pvList .pf').length > 0);
  const previewed = await page.$$eval('#pvList .pf summary', els => els.map(e => e.textContent ?? ''));
  expect(previewed).toEqual(expect.arrayContaining(['.specs/project/project.yaml', '.specs/planning/tasks.md']));
  expect(existsSync(target)).toBe(false); // the preview writes nothing

  await page.click('#chatCreate');
  await waitToast(page, /created and opened as project 1$/);
  for (const f of previewed.map(p => p.replace(/ Already here.*$/, ''))) expect(existsSync(join(target, f))).toBe(true);
  expect(read(join(target, '.specs', 'project', 'project.yaml'))).toContain('parcel-track');
  expect(readdirSync(join(env.home, 'dev')).sort()).toEqual([...before, 'parcel-track'].sort()); // one new folder, nothing else
  await page.waitForFunction(() => location.hash.startsWith('#1/'));
  expect(await page.$$eval('#projList .tile', els => els.length)).toBe(2);
});
