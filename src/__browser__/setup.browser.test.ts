// Guided setup of a folder without .specs/ (BL-079 row, BL-055, BL-PM-004), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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

// Guided setup on existing code (BL-PM-016, REQ-002.H.35): a folder holding only an Xcode project.
describe('guided setup on existing code (BL-PM-016)', () => {
  let swift: string;
  let xsrv: Served;
  beforeEach(async () => {
    swift = join(env.home, 'dev', 'swift-app');
    mkdirSync(join(swift, 'Demo.xcodeproj'), { recursive: true });
    writeFileSync(join(swift, 'Demo.xcodeproj', 'project.pbxproj'), '// fixture\n');
    xsrv = await serve(env, [env.project, swift]);
  });
  afterEach(async () => {
    chmodSync(swift, 0o755);
    await xsrv.close();
  });

  const intro = (page: Page) => page.evaluate(() => ({
    heading: document.querySelector('#introH')!.textContent,
    hey: document.querySelector('#intro')!.textContent!.includes("Hey, I'm SpecPilot"),
    fine: !document.querySelector<HTMLElement>('#introFine')!.hidden,
    detected: document.querySelector('#introDetected')!.textContent,
  }));
  /** Platform or language asked: the platform grid's iOS chip, or the language choice for swift. */
  const askedDetected = (page: Page) => page.evaluate(() => !!document.querySelector('#comp .chip[data-v="ios"], #comp .chip[data-v="swift"]'));
  const start = async (page: Page) => {
    await waitView(page, 'v-chat');
    await page.locator('#setupStart').waitFor({ state: 'visible' });
    await page.click('#setupStart');
    await page.locator('#composer').waitFor({ state: 'visible' });
  };
  /** Pick the first choice of the project type and continue; the handle is next. */
  const pastType = async (page: Page) => {
    await page.locator('#comp .chip[data-v]').first().click();
    const before = await composerState(page);
    await page.click('#chatGo');
    await page.waitForFunction(prev => (document.querySelector('#chatSub')?.textContent ?? '') + '|' + (document.querySelector('#comp')?.innerHTML ?? '') !== prev, before);
  };
  const toRecap = async (page: Page) => {
    for (let n = 0; n < 80 && !(await page.locator('#chatCreate').count()); n++) {
      expect(await askedDetected(page)).toBe(false);
      await answerAll(page).catch(() => undefined); // answerAll returns at the recap
    }
    await page.locator('#chatCreate').waitFor();
  };
  /** No sideways scroll, and no two visible items of the same group (composer actions, recap cards, intro, top bar) on top of each other. */
  const fits = async (page: Page, state: string) => {
    expect([state, await noSideScroll(page)]).toEqual([state, true]);
    // compared within each group only: the thread scrolls under the top bar by design
    const overlap = await page.evaluate(() =>
      ['#comp .act > *', '.recap .rc', '#intro > *', '.tb .right > *'].some(sel => {
        const boxes = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(e => e.offsetParent !== null && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect());
        return boxes.some((a, i) => boxes.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      }),
    );
    expect([state, overlap]).toEqual([state, false]);
  };

  browserTest('an Xcode project: the intro is the paragraph, platform and language are never asked, detected rows show, only the platform can be changed, no saved setups', b, async open => {
    const { page } = await open(xsrv, '#1/setup');
    await waitView(page, 'v-chat');
    await page.evaluate(() => localStorage.setItem('sp-setups', '[{"id":"n1","kind":"new","answers":{"name":"old"}}]'));
    await page.reload();
    await waitView(page, 'v-chat');
    expect(await page.evaluate(() => localStorage.getItem('sp-setups'))).toBeNull(); // a leftover key is removed on load
    await page.locator('#setupStart').waitFor({ state: 'visible' });
    expect(await intro(page)).toEqual({
      heading: `There is no .specs/ folder in ${swift} yet. I'll ask the same questions as specpilot add-specs, one at a time, then write it and the files for your AI IDE. Existing files are never changed.`,
      hey: false,
      fine: false,
      detected: '✅ Detected swift/ios project',
    });
    expect(await page.locator('#chatSetups, #setups, #setupList').count()).toBe(0);
    await start(page);
    expect(await page.textContent('#chatSub')).toContain('Project identity'); // the first unanswered question: the project type
    expect(await page.locator('#comp .chip[data-v="brownfield"]').count()).toBe(1);
    await toRecap(page);
    expect(await page.locator('#msgs .me.fixed').allTextContents()).toEqual(['Project name: DemoDetected', 'Language: swiftDetected', 'Framework: iosDetected'].map(t => t.replace('Detected', 'detected')));
    expect(await page.locator('.recap .l.fixed').allTextContents()).toEqual(['Project name detectedDemo', 'Language detectedswift', 'Framework detectedios']);
    const platformsRow = page.locator('.recap button.l', { hasText: 'iOS Native' });
    expect(await platformsRow.textContent()).toContain('detected');
    // a detected row cannot be changed: tapping it does nothing
    const before = await composerState(page);
    await page.locator('.recap .l.fixed', { hasText: 'Language' }).click();
    expect(await composerState(page)).toBe(before);
    // the seeded platforms can: add Android, and the mark goes
    await platformsRow.click();
    await page.locator('#comp .chip[data-v="ios"][aria-pressed="true"]').waitFor();
    await page.locator('#comp .tab', { hasText: 'MOBILE' }).click().catch(() => undefined);
    await page.locator('#comp .chip[data-v="android"]').click();
    await page.click('#chatGo');
    await page.locator('#chatCreate').waitFor();
    expect(await page.locator('.recap button.l', { hasText: 'Android Native' }).textContent()).not.toContain('detected');
    // the New Project chat has no Setups list either
    await page.goto(`${xsrv.url}/#new`);
    await waitView(page, 'v-chat');
    expect(await page.locator('#chatSetups, #setups').count()).toBe(0);
  });

  browserTest('at 420px: no sideways scroll or overlap at the intro, a question, a refused handle, the platform being edited, the recap, the preview, a refused create and after the create', b, async open => {
    const { page } = await open(xsrv, '#1/setup', { width: 420 });
    await waitView(page, 'v-chat');
    await page.locator('#setupStart').waitFor({ state: 'visible' });
    await fits(page, 'intro');
    await start(page);
    await fits(page, 'question');
    await pastType(page);
    await page.fill('#chatIn', 'bad handle');
    await page.click('#chatGo');
    await page.waitForFunction(() => !!document.querySelector('#compErr')?.textContent);
    await fits(page, 'refused handle');
    await page.fill('#chatIn', 'jsmith');
    await page.click('#chatGo');
    await toRecap(page);
    await fits(page, 'recap');
    await page.locator('.recap button.l', { hasText: 'iOS Native' }).click();
    await page.locator('#comp .chip[data-v="ios"]').waitFor();
    await fits(page, 'platform being edited');
    await page.click('#chatCancel');
    await page.locator('#chatCreate').waitFor();
    await page.click('#pv summary');
    await page.locator('#pvList.pvl').waitFor();
    await fits(page, 'preview');
    chmodSync(swift, 0o555); // the create is refused: the folder cannot be written
    await page.click('#chatCreate');
    await page.waitForFunction(() => !!document.querySelector('#chatErr')?.textContent);
    await fits(page, 'refused create');
    chmodSync(swift, 0o755);
    await page.click('#chatCreate');
    await waitToast(page, /\.specs\/ created in /);
    await waitView(page, 'v-file');
    await fits(page, 'after the create');
    expect(existsSync(join(swift, '.specs', 'project', 'project.yaml'))).toBe(true);
  }, [/status of 500/]); // the refused create: a folder that cannot be written answers 500, as before BL-PM-016
});
