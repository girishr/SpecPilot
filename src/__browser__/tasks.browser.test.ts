// The Tasks view (BL-079 row, BL-053, BL-PM-005, BL-PM-008's task link, BL-052 live reload), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, serve, Served, taskMover, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  // A known row at the top of each movable section, so no test depends on what this repo's own tasks.md
  // holds today (its Current Sprint is empty whenever no item is in progress).
  const lines = read(env.tasks()).split('\n');
  for (const [heading, line] of [['Current Sprint', '| CS-901 | Fixture sprint row |'], ['Backlog', '| BL-901 | Fixture backlog row |']]) {
    const at = lines.findIndex(l => l.trim() === `## ${heading}`);
    lines.splice(lines.findIndex((l, i) => i > at && /^\|---/.test(l)) + 1, 0, line);
  }
  writeFileSync(env.tasks(), lines.join('\n'));
  srv = await serve(env, [env.project]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

/** The table rows of one `## <heading>` section of tasks.md, as lines. */
function rowsIn(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === `## ${heading}`);
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter(l => /^\| (?!ID |-)/.test(l) && !/^\|---/.test(l));
}
const idOf = (row: string) => row.split('|')[1].trim();
/** The row button for section/index in the list mode. */
const row = (page: Page, col: string, i: number) => page.locator(`#listMode .row[data-col="${col}"][data-i="${i}"]`);
const archive = () => readFileSync(join(env.project, '.specs', 'planning', 'tasks-archive.md'), 'utf-8');

browserTest('Alt+ArrowRight moves a Backlog row to Current Sprint as one line, and the toast Undo puts the file back byte for byte', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  const first = rowsIn(before, 'Backlog')[0];
  const sprint = rowsIn(before, 'Current Sprint').length;
  await row(page, 'backlog', 0).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint').includes(first), 'the row in Current Sprint on disk');
  const after = read(env.tasks());
  expect(after.split('\n').sort()).toEqual(before.split('\n').sort()); // the same lines: one moved, none changed
  expect(rowsIn(after, 'Current Sprint')[sprint]).toBe(first);
  await waitToast(page, new RegExp(`${idOf(first)} moved from ## Backlog to ## Current Sprint`));
  await page.waitForFunction(i => document.activeElement?.matches(`#listMode .row[data-col="currentSprint"][data-i="${i}"]`) ?? false, sprint);
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
});

browserTest('dragging a Current Sprint row onto the Backlog moves it there', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const first = rowsIn(read(env.tasks()), 'Current Sprint')[0];
  await row(page, 'currentSprint', 0).dragTo(page.locator('#listMode #gBacklog .gh'));
  await until(() => rowsIn(read(env.tasks()), 'Backlog').includes(first), 'the row in Backlog on disk');
  expect(rowsIn(read(env.tasks()), 'Current Sprint')).not.toContain(first);
});

for (const section of ['backlog', 'currentSprint'] as const) {
  browserTest(`New Task adds the next ID to ${section === 'backlog' ? 'Backlog' : 'Current Sprint'}, selects the row and opens the inspector`, b, async open => {
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    const before = read(env.tasks());
    const id = taskMover.nextTaskId(section === 'backlog' ? 'BL' : 'CS', [before, archive()]);
    await page.click('#newTask');
    await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
    await page.fill('#taskIn', 'Browser suite task');
    await page.click(`#taskSec [data-s="${section}"]`);
    await page.click('#taskGo');
    const heading = section === 'backlog' ? 'Backlog' : 'Current Sprint';
    await until(() => rowsIn(read(env.tasks()), heading).includes(`| ${id} | Browser suite task |`), 'the new row on disk');
    expect(read(env.tasks()).split('\n').length).toBe(before.split('\n').length + 1);
    await waitToast(page, new RegExp(`${id} added to ## ${heading}`));
    const index = rowsIn(read(env.tasks()), heading).length - 1;
    await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
    expect(await page.locator('#insp .ih .id').first().textContent()).toBe(id);
    expect(await row(page, section, index).getAttribute('class')).toContain('sel');
  });
}

browserTest(
  'New Task shows the server reason in the dialog for a description with | and writes nothing',
  b,
  async open => {
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    const before = read(env.tasks());
    await page.click('#newTask');
    await page.fill('#taskIn', 'a | b');
    await page.click('#taskGo');
    await page.locator('#taskErr').waitFor({ state: 'visible' });
    expect(await page.locator('#taskErr').textContent()).toContain('cannot contain |');
    expect(await page.inputValue('#taskIn')).toBe('a | b');
    expect(read(env.tasks())).toBe(before);
  },
  [/status of 422/],
);

browserTest(
  'New Task on a file changed after the page loaded shows the 409 text in the dialog and writes nothing',
  b,
  async open => {
    // live reload slowed to a minute, so the page still holds the old hash when the dialog is sent
    const slow = await serve(env, [env.project], { pollMs: 60000 });
    try {
      const { page } = await open(slow);
      await waitView(page, 'v-board');
      const changed = read(env.tasks()).replace('# Task Tracking', '# Task Tracking\n\nEdited outside the page.');
      writeFileSync(env.tasks(), changed);
      await page.click('#newTask');
      await page.fill('#taskIn', 'Stale task');
      await page.click('#taskGo');
      await page.locator('#taskErr').waitFor({ state: 'visible' });
      expect(await page.locator('#taskErr').textContent()).toBe(taskMover.NEW_STALE_ERROR);
      expect(read(env.tasks())).toBe(changed);
    } finally {
      await slow.close();
    }
  },
  [/status of 409/],
);

browserTest('--read-only has no New Task button, no drag handles and no Home tile', b, async open => {
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await open(ro);
    await waitView(page, 'v-board');
    expect(await page.locator('#newTask').isHidden()).toBe(true);
    expect(await page.locator('#homeBtn').isHidden()).toBe(true);
    expect(await page.locator('#listMode .row[draggable="true"]').count()).toBe(0);
  } finally {
    await ro.close();
  }
});

browserTest('a row written to tasks.md outside the page appears through live reload, without a page load', b, async open => {
  const t = await open(srv);
  await waitView(t.page, 'v-board');
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, '| CS-900 | Written outside the page |');
  writeFileSync(env.tasks(), lines.join('\n'));
  await t.page.locator('#gSprint .row', { hasText: 'Written outside the page' }).waitFor();
  expect(t.loads).toBe(1);
});

browserTest('the inspector link opens tasks.md at the row line, and follows the row when lines are written above it', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await row(page, 'backlog', 0).click();
  const link = page.locator('#insp .actions a');
  await link.waitFor();
  const lineOf = async () => Number(/:(\d+)$/.exec((await link.getAttribute('href'))!)![1]);
  const n = await lineOf();
  const first = rowsIn(read(env.tasks()), 'Backlog')[0];
  expect(read(env.tasks()).split('\n')[n - 1]).toBe(first);
  expect(await link.getAttribute('href')).toMatch(/^vscode:\/\/file\/.*\/\.specs\/planning\/tasks\.md:\d+$/);
  writeFileSync(env.tasks(), read(env.tasks()).replace('## Backlog', 'Two lines\nwritten above.\n## Backlog'));
  await page.waitForFunction(m => (document.querySelector('#insp .actions a')?.getAttribute('href') ?? '').endsWith(':' + m), n + 2);
});

browserTest('the Tasks view and the New Task dialog have no sideways scroll at 420px', b, async open => {
  const { page } = await open(srv, '', { width: 420 });
  await waitView(page, 'v-board');
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#newTask');
  await page.waitForFunction(() => document.querySelector('#taskVeil')!.classList.contains('open'));
  expect(await noSideScroll(page)).toBe(true);
});
