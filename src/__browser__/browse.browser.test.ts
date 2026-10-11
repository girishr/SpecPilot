// Browse… beside Clone's Parent folder and the New Project chat's parent folder (BL-097, REQ-002.H.38),
// TESTS-002.4. The stand-in dialog of BL-PM-011's tests first on PATH (`osascript` on macOS, `zenity` on
// Linux; a shell script, so POSIX only), so no real dialog opens. STUB_MODE picks what it does.
import { Browser, Page } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, serve, Served, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let bin: string;
let realPath: string | undefined;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
const pidFile = () => join(env.base, 'dialog.pid');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
beforeEach(async () => {
  env = makeEnv();
  bin = join(env.base, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, process.platform === 'darwin' ? 'osascript' : 'zenity'),
    `#!/bin/sh
echo $$ > "${pidFile()}"
case "$STUB_MODE" in
  cancel) echo "execution error: User canceled. (-128)" >&2; exit 1 ;;
  fail) echo "Gtk-WARNING: cannot open display: :0" >&2; exit 3 ;;
  hang) exec /bin/sleep 30 ;;
  *) printf '%s\\n' "$STUB_OUT" ;;
esac
`,
    { mode: 0o755 },
  );
  realPath = process.env.PATH;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  mkdirSync(join(env.home, 'work'));
  process.env.STUB_OUT = join(env.home, 'work') + '/';
  srv = await serve(env, [makeProject(join(env.home, 'dev'), 'browse-project')]);
});
afterEach(async () => {
  process.env.PATH = realPath;
  delete process.env.STUB_MODE;
  delete process.env.STUB_OUT;
  await srv.close();
  env.cleanup();
});
const b = () => browser;
const PICKED = () => join(env.home, 'work');

const state = (page: Page, id: string) =>
  page.evaluate(i => {
    const el = document.getElementById(i) as HTMLButtonElement | null;
    return el ? { disabled: el.disabled, busy: el.getAttribute('aria-busy') } : null;
  }, id);
const waiting = (page: Page, id: string) => page.waitForFunction(i => { const el = document.getElementById(i) as HTMLButtonElement | null; return !!el && el.disabled && el.getAttribute('aria-busy') === 'true'; }, id);
const focused = (page: Page, id: string) => page.waitForFunction(i => document.activeElement?.id === i, id);
/** The field and its button are on one row: their boxes overlap vertically. */
const oneRow = (page: Page, field: string, btn: string) =>
  page.evaluate(([f, bt]) => {
    const a = document.getElementById(f)!.getBoundingClientRect(), c = document.getElementById(bt)!.getBoundingClientRect();
    return c.top < a.bottom && a.top < c.bottom && c.right <= innerWidth;
  }, [field, btn]);
const dialogStarted = async () => {
  await until(() => existsSync(pidFile()), 'the dialog to start');
  return Number(readFileSync(pidFile(), 'utf-8'));
};

const openClone = async (page: Page) => {
  await waitView(page, 'v-home');
  await page.click('#homeClone');
  await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
};
/** Start a New Project and answer until the parent-folder question; no Browse… on any question before it. */
const toParent = async (page: Page) => {
  await waitView(page, 'v-home');
  await page.click('#homeNew');
  await waitView(page, 'v-chat');
  await page.fill('#nameIn', 'browse-demo');
  await page.click('#nameGo');
  await page.locator('#composer').waitFor({ state: 'visible' });
  for (let n = 0; n < 40; n++) {
    if ((await page.getAttribute('#chatIn', 'placeholder').catch(() => null)) === '~/dev') return;
    expect(await page.locator('#chatBrowse').count()).toBe(0);
    const before = await page.evaluate(() => document.querySelector('#comp')!.innerHTML);
    if (await page.locator('#chatSkip').count()) await page.click('#chatSkip');
    else if (await page.locator('#chatIn').count()) {
      if (!(await page.inputValue('#chatIn'))) await page.fill('#chatIn', 'jsmith');
      await page.click('#chatGo');
    } else {
      if (await page.locator('#chatGo').isDisabled()) await page.locator('#comp .chip[data-v]').first().click();
      await page.click('#chatGo');
    }
    await page.waitForFunction(prev => document.querySelector('#comp')!.innerHTML !== prev, before);
  }
  throw new Error('the chat did not ask for the parent folder');
};

(process.platform === 'darwin' || process.platform === 'linux' ? describe : describe.skip)('Browse… for the parent folder (BL-097)', () => {
  browserTest("Clone's Browse… fills Parent folder; a cancel changes nothing; a failure is toasted; closing the sheet closes the dialog", b, async open => {
    const { page } = await open(srv, '#home');
    await openClone(page);
    await page.fill('#cloneParentIn', '~/typed');
    process.env.STUB_MODE = 'cancel';
    await page.click('#cloneBrowseBtn');
    await focused(page, 'cloneBrowseBtn');
    expect(await page.inputValue('#cloneParentIn')).toBe('~/typed');
    rmSync(pidFile(), { force: true });
    process.env.STUB_MODE = 'fail';
    await page.click('#cloneBrowseBtn');
    await waitToast(page, /^The folder dialog could not be opened: /);
    await focused(page, 'cloneBrowseBtn');
    delete process.env.STUB_MODE;
    await page.click('#cloneBrowseBtn');
    await focused(page, 'cloneParentIn');
    expect(await page.inputValue('#cloneParentIn')).toBe(PICKED());
    expect(await state(page, 'cloneBrowseBtn')).toEqual({ disabled: false, busy: null });

    rmSync(pidFile(), { force: true });
    process.env.STUB_MODE = 'hang';
    await page.click('#cloneBrowseBtn');
    const pid = await dialogStarted();
    await waiting(page, 'cloneBrowseBtn');
    expect(await page.locator('#cloneIn').isDisabled()).toBe(false); // the rest of the sheet stays usable
    // one dialog at a time for the page: the Folder tab's Browse… sends nothing while this one is out
    const browses: string[] = [];
    page.on('request', r => {
      if (new URL(r.url()).pathname === '/api/projects/browse') browses.push(r.method());
    });
    await page.click('#tabFolder');
    await page.click('#browseBtn');
    await page.click('#tabClone');
    await waiting(page, 'cloneBrowseBtn');
    expect(browses).toEqual([]);
    expect(Number(readFileSync(pidFile(), 'utf-8'))).toBe(pid); // no second dialog started
    await page.click('#openCancel');
    await until(() => !alive(pid), 'the dialog to be closed with the sheet');
   }, [/Failed to load resource/]);

  browserTest("the chat's Browse… is only on the parent-folder question, fills its answer, and leaving the chat closes the dialog", b, async open => {
    const { page } = await open(srv, '#home');
    await toParent(page);
    expect(await page.locator('#chatBrowse').count()).toBe(1);
    await page.click('#chatBrowse');
    await focused(page, 'chatIn');
    expect(await page.inputValue('#chatIn')).toBe(PICKED());
    const before = await page.evaluate(() => document.querySelector('#comp')!.innerHTML);
    await page.click('#chatGo'); // the picked folder is the answer
    await page.waitForFunction(prev => document.querySelector('#comp')!.innerHTML !== prev, before);
    expect(await page.locator('#msgs').textContent()).toContain(PICKED());

    await page.click('#msgs [data-k="parent"]'); // back to the question
    await page.locator('#chatBrowse').waitFor();
    rmSync(pidFile(), { force: true });
    process.env.STUB_MODE = 'hang';
    await page.click('#chatBrowse');
    const pid = await dialogStarted();
    await waiting(page, 'chatBrowse');
    await page.click('#homeBtn');
    await waitView(page, 'v-home');
    await until(() => !alive(pid), 'the dialog to be closed on leaving the chat');
  });

  browserTest('at 420px each field and its Browse… stay on one row with no sideways scroll: idle, waiting and after an error', b, async open => {
    const { page } = await open(srv, '#home', { width: 420 });
    await openClone(page);
    const check = async (field: string, btn: string) => {
      expect(await oneRow(page, field, btn)).toBe(true);
      expect(await noSideScroll(page)).toBe(true);
    };
    await check('cloneParentIn', 'cloneBrowseBtn');
    process.env.STUB_MODE = 'hang';
    await page.click('#cloneBrowseBtn');
    let pid = await dialogStarted();
    await waiting(page, 'cloneBrowseBtn');
    await check('cloneParentIn', 'cloneBrowseBtn');
    process.kill(pid);
    await waitToast(page, /^The folder dialog could not be opened/);
    await check('cloneParentIn', 'cloneBrowseBtn');
    await page.click('#openCancel');

    delete process.env.STUB_MODE;
    await toParent(page);
    await check('chatIn', 'chatBrowse');
    rmSync(pidFile(), { force: true });
    process.env.STUB_MODE = 'hang';
    await page.click('#chatBrowse');
    pid = await dialogStarted();
    await waiting(page, 'chatBrowse');
    await check('chatIn', 'chatBrowse');
    process.kill(pid);
    await waitToast(page, /^The folder dialog could not be opened/);
    await check('chatIn', 'chatBrowse');
   }, [/Failed to load resource/]);
});
