// Edit a Backlog description in the details panel (BL-TB-08, REQ-002.H.73, SEC-004.36), TESTS-002.4.
// The fixture project's known rows: BL-001 and BL-002 in Backlog, CS-001, CS-801 in Review, CD-fixture-002, BL-801 in Won't do.
import { Browser, Page } from 'playwright-core';
import { writeFileSync } from 'fs';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, serve, Served, taskMover, until, waitToast, waitView } from './harness';

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

const ROW = '| BL-001 | feat | P1 | Fixture backlog row one |';
const STALE = taskMover.REVIEW_STALE_ERROR;
const row = (page: Page, col: string, i: number) => page.locator(`#boardMode .row[data-col="${col}"][data-i="${i}"]`);
const inspOpen = (page: Page) => page.waitForFunction(() => { const el = document.querySelector('#insp')!; return el.classList.contains('open') && el.getAnimations().length === 0; });
/** Open a card's panel; an open panel is closed first, since it lies over the lanes on its side. */
const open = async (page: Page, col: string, i: number) => {
  if (await page.evaluate(() => document.querySelector('#insp')!.classList.contains('open'))) {
    await page.click('#inspX');
    await page.waitForFunction(() => { const el = document.querySelector('#insp')!; return !el.classList.contains('open') && el.getAnimations().length === 0; });
  }
  await row(page, col, i).click();
  await inspOpen(page);
};
const focused = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const formShown = (page: Page) => page.evaluate(() => { const f = document.querySelector<HTMLElement>('#edForm'); return !!f && !f.hidden; });
const text = (page: Page) => page.inputValue('#edText');
const fileRow = (id: string) => read(env.tasks()).split('\n').find(l => l.startsWith(`| ${id} |`));
/** Hold the next description write until the returned function is called; `before` runs on disk first. */
const hold = async (page: Page, before: () => void = () => undefined) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>(r => (release = r));
  await page.route('**/api/tasks/fields**', async route => {
    await held;
    before();
    await route.continue();
  });
  return release;
};

browserTest('Edit is on a Backlog row only, with a token; not Current Sprint, Review, Completed or Won\'t do', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await page.click('#boardMode .gl[data-col="wontDo"] [data-fold]'); // the strip folded by default
  await page.waitForFunction(() => document.querySelector('#boardMode .gl[data-col="wontDo"] [data-fold]')?.getAttribute('aria-expanded') === 'true');
  await open(page, 'backlog', 0);
  expect(await page.isVisible('#edBtn')).toBe(true);
  expect(await formShown(page)).toBe(false);
  for (const col of ['currentSprint', 'review', 'completed']) {
    await open(page, col, 0);
    expect(await page.locator('#edBtn, #edForm').count()).toBe(0);
  }
  await open(page, 'wontDo', 0);
  expect(await page.locator('#edBtn, #edForm').count()).toBe(0);
});

browserTest('with --read-only there is no Edit', b, async o => {
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await o(ro);
    await waitView(page, 'v-board');
    await open(page, 'backlog', 0);
    expect(await page.locator('#edBtn, #edForm').count()).toBe(0);
  } finally {
    await ro.close();
  }
});

browserTest('the form holds the cell text and counts; Enter saves the one cell, Shift+Enter does nothing; then Save saves', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  await open(page, 'backlog', 0);
  await page.click('#edBtn');
  expect(await formShown(page)).toBe(true);
  expect(await focused(page)).toBe('edText');
  expect(await text(page)).toBe('Fixture backlog row one');
  expect(await page.textContent('#edCount')).toBe('23/4000');
  expect(await page.isHidden('#edBox')).toBe(true);
  const before = read(env.tasks());
  await page.keyboard.press('End');
  await page.keyboard.type(', edited `a`');
  await page.keyboard.press('Shift+Enter');
  expect(await text(page)).toBe('Fixture backlog row one, edited `a`');
  expect(await page.textContent('#edCount')).toBe('35/4000');
  await page.keyboard.press('Enter');
  await until(() => fileRow('BL-001') === '| BL-001 | feat | P1 | Fixture backlog row one, edited `a` |', 'the description on disk');
  expect(read(env.tasks())).toBe(before.replace(ROW, '| BL-001 | feat | P1 | Fixture backlog row one, edited `a` |')); // one line changed
  await waitToast(page, /^Description saved\.$/);
  await page.waitForFunction(() => document.activeElement?.id === 'edBtn');
  expect(await formShown(page)).toBe(false);
  expect(await page.textContent('#edBox .desc')).toBe('Fixture backlog row one, edited a');
  await page.click('#edBtn');
  await page.fill('#edText', '  By the button  ');
  await page.click('#edSave');
  await until(() => fileRow('BL-001') === '| BL-001 | feat | P1 | By the button |', 'trimmed on disk');
});

browserTest('Escape and Cancel write nothing and keep the panel open; typed text goes when the panel closes or another card opens', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  await open(page, 'backlog', 0);
  await page.click('#edBtn');
  await page.fill('#edText', 'Typed');
  await page.keyboard.press('Escape');
  expect(await formShown(page)).toBe(false);
  expect(await focused(page)).toBe('edBtn');
  expect(await page.evaluate(() => document.querySelector('#insp')!.classList.contains('open'))).toBe(true);
  await page.click('#edBtn');
  expect(await text(page)).toBe('Fixture backlog row one'); // the cell's text again, not what was typed
  await page.fill('#edText', 'Typed');
  await page.click('#edCancel');
  expect(await formShown(page)).toBe(false);
  expect(await focused(page)).toBe('edBtn');
  await page.click('#edBtn');
  await page.fill('#edText', 'Typed');
  await page.click('#inspX');
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  await open(page, 'backlog', 0);
  expect(await formShown(page)).toBe(false);
  await page.click('#edBtn');
  await page.fill('#edText', 'Typed');
  await open(page, 'backlog', 1);
  expect(await formShown(page)).toBe(false);
  await page.click('#edBtn');
  expect(await text(page)).toBe('Fixture backlog row two');
  expect(read(env.tasks())).toBe(before);
});

browserTest('a refusal and no answer keep the typed text with the error; a plain Backlog row saves too', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  await open(page, 'backlog', 0);
  await page.click('#edBtn');
  await page.fill('#edText', 'a | b');
  await page.keyboard.press('Enter');
  await page.locator('#edErr').waitFor({ state: 'visible' });
  expect(await page.textContent('#edErr')).toBe('The description cannot contain |, because it would split the table cell. Write it another way, e.g. "or".');
  expect(await text(page)).toBe('a | b');
  await page.route('**/api/tasks/fields**', route => route.abort());
  await page.fill('#edText', 'No answer');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#edErr')?.textContent === 'The server did not answer. Nothing was changed.');
  expect(await text(page)).toBe('No answer');
  await page.unroute('**/api/tasks/fields**');
  expect(read(env.tasks())).toBe(before);
  // the Backlog table in the plain shape (ID, Description): its last cell is the second
  writeFileSync(env.tasks(), before.replace('| ID | Type | Priority | Description |\n|---|---|---|---|\n| BL-001 | feat | P1 | Fixture backlog row one |\n| BL-002 |  |  |', '| ID | Description |\n|---|---|\n| BL-001 | Fixture backlog row one |\n| BL-002 |'));
  await until(async () => (await page.evaluate(() => document.querySelector('#tfNote') !== null)), 'the plain lane drawn');
  await page.fill('#edText', 'Plain edit');
  await page.keyboard.press('Enter');
  await until(() => fileRow('BL-001') === '| BL-001 | Plain edit |', 'the plain row on disk');
}, [/Failed to load resource/]);

browserTest('a 409: still in Backlog keeps the form; moved to Current Sprint, the panel there with no Edit; gone, the panel closed', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  await open(page, 'backlog', 0);
  await page.click('#edBtn');
  await page.fill('#edText', 'Kept');
  let release = await hold(page, () => writeFileSync(env.tasks(), read(env.tasks()).replace('# Task Tracking', '# Task Tracking\n\nEdited outside the page.')));
  await page.keyboard.press('Enter');
  release();
  await page.waitForFunction(t => document.querySelector('#edErr')?.textContent === t, STALE);
  expect(await formShown(page)).toBe(true);
  expect(await text(page)).toBe('Kept');
  await page.unroute('**/api/tasks/fields**');

  release = await hold(page, () => {
    const s = read(env.tasks());
    writeFileSync(env.tasks(), s.replace(ROW + '\n', '').replace('| CS-001 | bug | P2 | Fixture sprint row |', '| CS-001 | bug | P2 | Fixture sprint row |\n' + ROW));
  });
  await page.keyboard.press('Enter');
  release();
  await waitToast(page, new RegExp('^' + STALE.replace(/\./g, '\\.') + '$'));
  await page.waitForFunction(() => document.querySelector('#insp .ih .pill')?.textContent === 'Current Sprint' && document.querySelector('#insp .ih .id')?.textContent === 'BL-001');
  expect(await page.locator('#edBtn, #edForm').count()).toBe(0);
  await page.unroute('**/api/tasks/fields**');

  writeFileSync(env.tasks(), before);
  await page.waitForFunction(() => document.querySelector('#boardMode .row[data-col="backlog"][data-i="0"]')?.textContent?.includes('Fixture backlog row one') ?? false);
  await open(page, 'backlog', 0);
  await page.click('#edBtn');
  await page.fill('#edText', 'Gone');
  release = await hold(page, () => writeFileSync(env.tasks(), read(env.tasks()).replace(ROW + '\n', '')));
  await page.keyboard.press('Enter');
  release();
  await waitToast(page, new RegExp('^' + STALE.replace(/\./g, '\\.') + '$'));
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  expect(fileRow('BL-001')).toBeUndefined();
}, [/Failed to load resource/]);

for (const isLight of [false, true]) {
  browserTest(`at 420px the form fits with nothing scrolling sideways: idle, saving, after an error, after a 409 move (${isLight ? 'light' : 'dark'})`, b, async o => {
    const { page } = await o(srv, '', { width: 420, light: isLight });
    await waitView(page, 'v-board');
    await open(page, 'backlog', 0);
    await page.click('#edBtn');
    const fits = async () => {
      expect(await noSideScroll(page)).toBe(true);
      expect(await page.evaluate(() => { const r = document.querySelector('#edForm')!.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; })).toBe(true);
    };
    await fits(); // idle
    let release = await hold(page);
    await page.fill('#edText', 'x'.repeat(300));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#edForm')?.getAttribute('aria-busy') === 'true');
    await fits(); // saving
    expect(await page.isDisabled('#edSave')).toBe(true);
    release();
    await waitToast(page, /^Description saved\.$/);
    await page.unroute('**/api/tasks/fields**');
    await page.click('#edBtn');
    await page.fill('#edText', 'a | b');
    await page.keyboard.press('Enter');
    await page.locator('#edErr').waitFor({ state: 'visible' });
    await fits(); // error
    release = await hold(page, () => {
      const s = read(env.tasks());
      const line = s.split('\n').find(l => l.startsWith('| BL-001 |'))!;
      writeFileSync(env.tasks(), s.replace(line + '\n', '').replace('| CS-001 | bug | P2 | Fixture sprint row |', '| CS-001 | bug | P2 | Fixture sprint row |\n' + line));
    });
    await page.fill('#edText', 'Moved meanwhile');
    await page.keyboard.press('Enter');
    release();
    await page.waitForFunction(() => document.querySelector('#insp .ih .pill')?.textContent === 'Current Sprint');
    expect(await noSideScroll(page)).toBe(true); // after the 409
    await page.unroute('**/api/tasks/fields**');
  }, [/Failed to load resource/]);
}
