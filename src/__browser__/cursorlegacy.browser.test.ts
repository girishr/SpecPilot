// SpecPilot's old Cursor rules file on the Instructions view (BL-194, REQ-002.H.79), TESTS-002.4. Each state is
// written by the test into a fresh copy of the fixture project under a temp HOME, never this repo's own files.
import { Browser, Page } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, serve, Served, waitToast, waitView } from './harness';

const OLD_FRONT = '---\ndescription: Project mandates and AI coding rules\nglobs:\nalwaysApply: true\n---\n\n';
const OLD = '.cursor/rules/project.mdc';
const NEW = '.cursor/rules/specpilot.mdc';
let browser: Browser;
let env: Env;
let srv: Served | null = null;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(() => {
  env = makeEnv();
  mkdirSync(join(env.project, '.cursor', 'rules'), { recursive: true });
});
afterEach(async () => {
  if (srv) await srv.close();
  srv = null;
  env.cleanup();
});
const b = () => browser;
const at = (rel: string) => join(env.project, ...rel.split('/'));
const put = (rel: string, text: string) => writeFileSync(at(rel), text);
const start = async (readOnly = false) => (srv = await serve(env, [env.project], { readOnly }));
const instructions = async (open: (s: Served, h?: string, o?: { width?: number; light?: boolean }) => Promise<{ page: Page }>, o: { width?: number; light?: boolean } = {}) => {
  const { page } = await open(srv!, '#instructions', o);
  await waitView(page, 'v-instructions');
  return page;
};
const rowOf = (page: Page, path: string) => page.locator('#insBox .row', { has: page.locator(`.id:text-is("${path}")`) });
const pills = (page: Page) => page.locator('#insBox .pill').allTextContents();

browserTest('old name: the specpilot.mdc row says where the file is, with Rename and Open in editor', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  const row = rowOf(page, NEW);
  expect(await row.locator('.pill').textContent()).toBe('old name');
  expect(await row.locator('.det').textContent()).toBe('Found as .cursor/rules/project.mdc, its name before v2.1.0. Cursor still loads it; SpecPilot looks for specpilot.mdc.');
  expect(await row.locator('button').allTextContents()).toEqual(['Rename']);
  // Open in editor: Cursor's scheme, since the old file counts as Cursor's signal
  expect(await row.locator('a', { hasText: 'Open in editor' }).getAttribute('href')).toBe(`cursor://file${env.project}/.cursor/rules/project.mdc`);
  expect(await pills(page)).not.toContain('missing');
});

browserTest('renaming, then renamed: the button waits, the toast, and the row is a present file', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  await page.route('**/api/ide/cursor-rules*', async route => {
    await held;
    await route.continue();
  });
  await page.click('[data-mdc="rename"]');
  const busy = page.locator('[data-mdc="rename"]');
  await page.waitForFunction(() => (document.querySelector('[data-mdc="rename"]') as HTMLButtonElement | null)?.disabled === true);
  expect(await busy.textContent()).toBe('Renaming…');
  release();
  await waitToast(page, /Renamed to \.cursor\/rules\/specpilot\.mdc\./);
  await page.locator(`#insBox [data-open="${NEW}"]`).waitFor();
  expect(await pills(page)).not.toContain('old name');
  expect(existsSync(at(OLD))).toBe(false);
  expect(readFileSync(at(NEW), 'utf-8')).toBe(OLD_FRONT + 'Rule one.\n');
});

browserTest('refused: the server\'s text shows under the row as text, and Rename comes back', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  await page.route('**/api/ide/cursor-rules*', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'No <b>links</b> here.' }) }));
  await page.click('[data-mdc="rename"]');
  const note = rowOf(page, NEW).locator('.note');
  await note.waitFor();
  expect(await note.textContent()).toBe('No <b>links</b> here.');
  expect(await note.locator('b').count()).toBe(0);
  expect(await page.locator('[data-mdc="rename"]').isDisabled()).toBe(false);
  expect(existsSync(at(OLD))).toBe(true);
}, [/status of 422/]);

browserTest('yours: a project.mdc without SpecPilot\'s front matter gets no pill and no row', b, async open => {
  put(OLD, '---\ndescription: my own rule\n---\n\nUse tabs.\n');
  await start();
  const page = await instructions(open);
  expect(await rowOf(page, OLD).count()).toBe(0);
  expect(await page.locator('[data-mdc]').count()).toBe(0);
  expect(await pills(page)).not.toContain('old name');
});

browserTest('duplicate: Remove old file asks first with the undo note, then removes; Keep both is offered', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\n');
  put(NEW, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  const row = rowOf(page, OLD);
  expect(await row.locator('.pill').textContent()).toBe('duplicate');
  expect(await row.locator('.det').textContent()).toBe("SpecPilot's old rules file. Cursor loads both files, so its rules are there twice.");
  expect(await row.locator('button').allTextContents()).toEqual(['Remove old file', 'Keep both']);
  const asked: string[] = [];
  page.once('dialog', d => (asked.push(d.message()), d.dismiss()));
  await page.click('[data-mdc="remove"]');
  await page.waitForFunction(() => true);
  expect(asked).toEqual(["Remove .cursor/rules/project.mdc? This can't be undone unless the file is committed to git."]);
  expect(existsSync(at(OLD))).toBe(true);
  page.once('dialog', d => d.accept());
  await page.click('[data-mdc="remove"]');
  await page.waitForFunction(() => !document.querySelector('[data-mdc]'));
  expect(existsSync(at(OLD))).toBe(false);
  expect(existsSync(at(NEW))).toBe(true);
});

browserTest('edited duplicate: Compare shows the lines only in project.mdc, and the confirm names them', b, async open => {
  const mine = Array.from({ length: 12 }, (_, i) => `Mine ${i + 1}.`);
  put(OLD, OLD_FRONT + 'Rule one.\n' + mine.join('\n') + '\n<b>x</b>\n');
  put(NEW, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  const row = rowOf(page, OLD);
  expect(await row.locator('.pill').textContent()).toBe('edited copy');
  expect(await row.locator('button').allTextContents()).toEqual(['Remove old file', 'Keep both', 'Compare']);
  await page.click('[data-mdc-cmp]');
  await row.locator('.cmp pre').waitFor();
  expect(await row.locator('.cmp .det').textContent()).toBe('Only in project.mdc (13 lines):');
  expect(await row.locator('.cmp pre').textContent()).toBe([...mine, '<b>x</b>'].join('\n'));
  expect(await page.locator('[data-mdc-cmp]').getAttribute('aria-expanded')).toBe('true');
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-mdc-cmp'))).toBe(true);
  const asked: string[] = [];
  page.once('dialog', d => (asked.push(d.message()), d.dismiss()));
  await page.click('[data-mdc="remove"]');
  await page.waitForFunction(() => true);
  expect(asked).toEqual([`Remove .cursor/rules/project.mdc? This can't be undone unless the file is committed to git.\n\nThese 13 lines are only in it and would be lost:\n${mine.slice(0, 10).join('\n')}\nand 3 more`]);
  await page.click('[data-mdc-cmp]');
  await page.waitForFunction(() => !document.querySelector('#insBox .cmp'));
});

browserTest('kept: Keep both turns the row gray, survives a reload, and leaves Remove old file and Compare', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\nMine.\n');
  put(NEW, OLD_FRONT + 'Rule one.\n');
  await start();
  const page = await instructions(open);
  await page.click('[data-mdc="keep"]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#insBox .row.mdc .pill')).some(p => p.textContent === 'kept both'));
  const row = rowOf(page, OLD);
  expect(await row.locator('.det').first().textContent()).toBe('Kept on this machine: SpecPilot does not warn about it here.');
  expect(await row.locator('button').allTextContents()).toEqual(['Remove old file', 'Compare']);
  expect(JSON.parse(readFileSync(join(env.home, '.specpilot', 'cursor-rules.json'), 'utf-8')).keepBoth).toEqual([env.project]);
  await page.reload();
  await waitView(page, 'v-instructions');
  expect(await rowOf(page, OLD).locator('.pill').textContent()).toBe('kept both');
});

browserTest('--read-only shows the pills, Compare and Open in editor, but no write button', b, async open => {
  put(OLD, OLD_FRONT + 'Rule one.\nMine.\n');
  put(NEW, OLD_FRONT + 'Rule one.\n');
  await start(true);
  const page = await instructions(open);
  const row = rowOf(page, OLD);
  expect(await row.locator('.pill').textContent()).toBe('edited copy');
  expect(await row.locator('button').allTextContents()).toEqual(['Compare']);
  expect(await row.locator('a', { hasText: 'Open in editor' }).count()).toBe(1);
  rmSync(at(NEW));
  await page.reload();
  await waitView(page, 'v-instructions');
  expect(await rowOf(page, NEW).locator('.pill').textContent()).toBe('old name');
  expect(await page.locator('[data-mdc]').count()).toBe(0);
});

browserTest('at 420px in both themes every state fits: old name, renaming, refused, renamed, yours, duplicate, edited (Compare open), kept', b, async open => {
  const fits = async (page: Page, what: string) => expect([what, await noSideScroll(page)]).toEqual([what, true]);
  for (const light of [false, true]) {
    const theme = light ? 'light' : 'dark';
    rmSync(join(env.project, '.cursor'), { recursive: true, force: true });
    rmSync(join(env.home, '.specpilot', 'cursor-rules.json'), { force: true });
    mkdirSync(join(env.project, '.cursor', 'rules'), { recursive: true });
    put(OLD, OLD_FRONT + 'Rule one.\n');
    if (srv) await srv.close();
    await start();
    const page = await instructions(open, { width: 420, light });
    await fits(page, `${theme} old name`);
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    await page.route('**/api/ide/cursor-rules*', async route => {
      await held;
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'This file system does not allow the rename SpecPilot uses. Rename .cursor/rules/project.mdc to specpilot.mdc by hand.' }) });
    });
    await page.click('[data-mdc="rename"]');
    await page.waitForFunction(() => (document.querySelector('[data-mdc="rename"]') as HTMLButtonElement | null)?.disabled === true);
    await fits(page, `${theme} renaming`);
    release();
    await rowOf(page, NEW).locator('.note').waitFor();
    await fits(page, `${theme} refused`);
    await page.unroute('**/api/ide/cursor-rules*');
    await page.click('[data-mdc="rename"]');
    await page.locator(`#insBox [data-open="${NEW}"]`).waitFor();
    await fits(page, `${theme} renamed`);
    put(OLD, '---\ndescription: mine\n---\n');
    await page.reload();
    await waitView(page, 'v-instructions');
    await fits(page, `${theme} yours`);
    put(OLD, OLD_FRONT + 'Rule one.\n');
    await page.reload();
    await waitView(page, 'v-instructions');
    expect(await rowOf(page, OLD).locator('.pill').textContent()).toBe('duplicate');
    await fits(page, `${theme} duplicate`);
    put(OLD, OLD_FRONT + 'Rule one.\n' + 'A very long line that SpecPilot never wrote, without any break in it at all, '.repeat(6) + '\n');
    await page.reload();
    await waitView(page, 'v-instructions');
    await page.click('[data-mdc-cmp]');
    await rowOf(page, OLD).locator('.cmp pre').waitFor();
    await fits(page, `${theme} edited, Compare open`);
    await page.click('[data-mdc="keep"]');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#insBox .row.mdc .pill')).some(p => p.textContent === 'kept both'));
    await fits(page, `${theme} kept`);
  }
}, [/status of 422/]);
