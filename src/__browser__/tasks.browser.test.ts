// The Tasks view (BL-079 row, BL-053, BL-PM-005, BL-PM-008's task link, BL-052 live reload), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, serve, Served, specArchiver, taskMover, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  // A known row at the top of each movable section, beside the fixture's own rows (BL-099), so the tests
  // below find their rows by these IDs.
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
  return lines.slice(start + 1, end < 0 ? undefined : end).filter(l => /^\| (?!ID |# |-)/.test(l) && !/^\|---/.test(l)); // not the header row of either table shape
}
const idOf = (row: string) => row.split('|')[1].trim();
/** The row button for section/index on the board. */
const row = (page: Page, col: string, i: number) => page.locator(`#boardMode .row[data-col="${col}"][data-i="${i}"]`);
const archive = () => readFileSync(join(env.project, '.specs', 'planning', 'tasks-archive.md'), 'utf-8');
/** The `+ Add` button in a lane's header (BL-TB-05). */
const laneAdd = (page: Page, col: string) => page.locator(`#boardMode .gl[data-col="${col}"] .gh [data-add="${col}"]`);
const focusOn = (page: Page, col: string) => page.waitForFunction(c => document.activeElement?.matches(`#boardMode [data-add="${c}"]`) ?? false, col);

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
  await page.waitForFunction(i => document.activeElement?.matches(`#boardMode .row[data-col="currentSprint"][data-i="${i}"]`) ?? false, sprint);
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
});

browserTest('dragging a Current Sprint row onto the Backlog moves it there', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const first = rowsIn(read(env.tasks()), 'Current Sprint')[0];
  await row(page, 'currentSprint', 0).dragTo(page.locator('#boardMode .gl[data-col="backlog"] .gh'));
  await until(() => rowsIn(read(env.tasks()), 'Backlog').includes(first), 'the row in Backlog on disk');
  expect(rowsIn(read(env.tasks()), 'Current Sprint')).not.toContain(first);
});

for (const section of ['backlog', 'currentSprint'] as const) {
  browserTest(`New Task adds the next ID to ${section === 'backlog' ? 'Backlog' : 'Current Sprint'}, selects the row and opens the inspector`, b, async open => {
    const { page } = await open(srv);
    await waitView(page, 'v-board');
    const before = read(env.tasks());
    const id = taskMover.nextTaskId(section === 'backlog' ? 'BL' : 'CS', [before, archive()]);
    await laneAdd(page, section).click(); // BL-TB-05: the lane's header button; the lane is the section
    await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
    await page.fill('#taskIn', 'Browser suite task');
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
    await laneAdd(page, 'backlog').click();
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
      await laneAdd(page, 'backlog').click();
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

browserTest('--read-only has no Add or Archive buttons, no drag handles and no Home tile', b, async open => {
  const completed = addCompletedRows(40); // past the limit, so Archive would be due with a token (BL-TB-06)
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await open(ro);
    await waitView(page, 'v-board');
    await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed);
    expect(await page.locator('#newTask').count()).toBe(0); // gone since BL-TB-05
    expect(await page.locator('#boardMode [data-add]').count()).toBe(0); // BL-TB-05: the lane headers' Add buttons need the token
    expect(await page.locator('#boardMode [data-archive]').count()).toBe(0); // BL-TB-06: so does Archive
    expect(await page.locator('#homeBtn').isHidden()).toBe(true);
    expect(await page.locator('#boardMode .row[draggable="true"]').count()).toBe(0);
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
  await t.page.locator('#boardMode .gl[data-col="currentSprint"] .row', { hasText: 'Written outside the page' }).waitFor();
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

// BL-TB-01: the board is the only Tasks view; no List mode and no List/Board switch. BL-TB-04: the lanes run
// Backlog, Current Sprint, Completed, on screen (left edges at the harness's 1280px) as well as in the DOM.
browserTest('Tasks is the board alone: no switch, no list, three lanes in order, every Backlog row shown', b, async open => {
  const lines = read(env.tasks()).split('\n');
  const at = lines.findIndex(l => l.trim() === '## Backlog');
  const sep = lines.findIndex((l, i) => i > at && /^\|---/.test(l));
  lines.splice(sep + 1, 0, ...[2, 3, 4, 5, 6, 7].map(n => `| BL-90${n} | Fixture backlog row ${n} |`)); // nine Backlog rows in all
  writeFileSync(env.tasks(), lines.join('\n'));
  const backlog = rowsIn(read(env.tasks()), 'Backlog').length;
  expect(backlog).toBeGreaterThan(6);
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length === n, backlog);
  expect(await page.locator('#modeSeg').count()).toBe(0);
  expect(await page.locator('#listMode').count()).toBe(0);
  expect(await page.locator('#boardMode').isVisible()).toBe(true);
  expect(await page.$$eval('#boardMode .gl[data-col]', els => els.map(e => (e as HTMLElement).dataset.col))).toEqual(['backlog', 'currentSprint', 'completed']);
  const lefts = await page.$$eval('#boardMode .gl[data-col]', els => els.map(e => e.getBoundingClientRect().left));
  expect(lefts[0]).toBeLessThan(lefts[1]);
  expect(lefts[1]).toBeLessThan(lefts[2]);
  expect(await page.locator('#boardMode [data-more="backlog"]').count()).toBe(0);
  expect(await page.locator('#boardMode .gl[data-col="backlog"] .row').last().textContent()).toContain('Fixture backlog row two');
});

/** Thirty more Backlog rows in the fixture, more than fit a 900px-high lane (BL-TB-03). */
function addBacklogRows(): number {
  const lines = read(env.tasks()).split('\n');
  const at = lines.findIndex(l => l.trim() === '## Backlog');
  const sep = lines.findIndex((l, i) => i > at && /^\|---/.test(l));
  lines.splice(sep + 1, 0, ...Array.from({ length: 30 }, (_, n) => `| BL-9${String(n + 10)} | Fixture backlog row ${n + 10} with a longer description so that the card wraps onto two lines |`));
  writeFileSync(env.tasks(), lines.join('\n'));
  return rowsIn(read(env.tasks()), 'Backlog').length;
}
/** `count` more Completed rows in the fixture (three columns): 30 are more than fit a 900px-high lane (BL-TB-07); 40 put the section past its 40-line limit (BL-TB-06). */
function addCompletedRows(count = 30): number {
  const lines = read(env.tasks()).split('\n');
  const at = lines.findIndex(l => l.trim() === '## Completed');
  const sep = lines.findIndex((l, i) => i > at && /^\|---/.test(l));
  lines.splice(sep + 1, 0, ...Array.from({ length: count }, (_, n) => `| 9${String(n + 10)} | [CD-fixture-9${String(n + 10)}] | Fixture completed row ${n + 10} with a longer description so that the card wraps onto two lines |`));
  writeFileSync(env.tasks(), lines.join('\n'));
  return rowsIn(read(env.tasks()), 'Completed').length;
}
/** The `Archive` button in the Completed lane's header (BL-TB-06). */
const laneArchive = (page: Page) => page.locator('#boardMode .gl[data-col="completed"] .gh [data-archive]');
const stamp = (s: string) => s.replace(/## Archived on \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '## Archived on <T>');
/** Write a Current Sprint row outside the page and wait for the live reload that draws it (the payload, branch included, is rebuilt). */
async function reloadThrough(page: Page, id: string): Promise<void> {
  const rev = Number(await page.evaluate(() => document.documentElement.dataset.rev || 0));
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, `| ${id} | Written outside the page |`);
  writeFileSync(env.tasks(), lines.join('\n'));
  await page.waitForFunction(r => Number(document.documentElement.dataset.rev || 0) > r, rev);
}
/** What `specpilot archive` would move from the fixture's tasks.md now (forced: within the limit too, D8): tasks.md after, the block (timestamp masked), the count, the section's lines. */
function archivePlan(force = false): { after: string; block: string; moved: number; lines: number } {
  const lines = read(env.tasks()).split('\n');
  const plan = specArchiver.planCompletedArchive(lines, force)!;
  return { after: [...lines.slice(0, plan.start), ...lines.slice(plan.end)].join('\n'), block: stamp(specArchiver.completedArchiveBlock(lines, plan)), moved: plan.end - plan.start, lines: taskMover.completedArchiveStatus(lines.join('\n')).lines };
}
const HEAD = () => join(env.project, '.git', 'HEAD');
const archOpen = (page: Page) => page.waitForFunction(() => document.querySelector('#archVeil')!.classList.contains('open'));
const archClosed = (page: Page) => page.waitForFunction(() => !document.querySelector('#archVeil')!.classList.contains('open'));
const focusOnArchive = (page: Page) => page.waitForFunction(() => document.activeElement?.hasAttribute('data-archive') ?? false);
const gateText = (page: Page, i: number) => page.locator('#archGates .gate').nth(i).textContent();
const pageScrolls = (page: Page) => page.evaluate(() => { const c = document.querySelector('#content')!; return c.scrollHeight > c.clientHeight; });
const laneBox = (page: Page, col: string) => page.locator(`#boardMode .gl[data-col="${col}"] .box`);
/** [scrollHeight, clientHeight, header top, box bottom, scrollTop] of a lane's box. */
const laneGeom = (page: Page, col: string) =>
  page.evaluate(c => {
    const gl = document.querySelector(`#boardMode .gl[data-col="${c}"]`)!;
    const box = gl.querySelector('.box')!;
    return [box.scrollHeight, box.clientHeight, gl.querySelector('.gh')!.getBoundingClientRect().top, box.getBoundingClientRect().bottom, box.scrollTop];
  }, col);

// BL-TB-03: the board takes the window's height; a lane with more rows than fit scrolls inside its own box, header
// in place; the page does not scroll, with the inspector open either; a live reload keeps the box's scroll.
browserTest('the lanes fit the window at 1280px: the page does not scroll, a long lane does inside its box, and live reload keeps the box\'s scroll', b, async open => {
  const backlog = addBacklogRows();
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length === n, backlog);
  expect(await pageScrolls(page)).toBe(false);
  const [sh, ch, ghTop, boxBottom] = await laneGeom(page, 'backlog');
  expect(sh).toBeGreaterThan(ch);
  expect(ghTop).toBeGreaterThanOrEqual(0);
  expect(boxBottom).toBeLessThanOrEqual(900);
  for (const col of ['currentSprint', 'completed']) {
    const [s2, c2] = await laneGeom(page, col);
    expect(s2).toBe(c2);
  }
  await laneBox(page, 'backlog').evaluate(b => { b.scrollTop = b.scrollHeight; });
  const [, , ghTop2, boxBottom2, top] = await laneGeom(page, 'backlog');
  expect(top).toBeGreaterThan(0);
  expect(ghTop2).toBe(ghTop);
  expect(boxBottom2).toBe(boxBottom);
  expect(await page.evaluate(() => document.querySelector('#content')!.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('#boardMode .gl[data-col="backlog"] .box')!.lastElementChild!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(900);
  await row(page, 'backlog', backlog - 1).click(); // the last row, in view at the box's end
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  expect(await pageScrolls(page)).toBe(false);
  const kept = (await laneGeom(page, 'backlog'))[4];
  expect(kept).toBeGreaterThan(0);
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, '| CS-900 | Written outside the page |');
  writeFileSync(env.tasks(), lines.join('\n'));
  await page.waitForFunction(() => document.documentElement.dataset.rev === '1');
  expect((await laneGeom(page, 'backlog'))[4]).toBe(kept);
});

// BL-TB-07: Completed shows every row, no Show All; a long Completed lane scrolls inside its box like the others.
browserTest('Completed shows every row at 1280px with no Show All, and a long Completed lane scrolls inside its box', b, async open => {
  const completed = addCompletedRows();
  expect(completed).toBeGreaterThan(8);
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed);
  expect(await page.locator('#boardMode [data-more]').count()).toBe(0);
  expect(await page.locator('#boardMode .gl[data-col="completed"] .gh .cnt').textContent()).toBe(String(completed));
  expect(await pageScrolls(page)).toBe(false);
  const [sh, ch] = await laneGeom(page, 'completed');
  expect(sh).toBeGreaterThan(ch);
  await laneBox(page, 'completed').evaluate(b => { b.scrollTop = b.scrollHeight; });
  // The last drawn row is the file's first (Completed is newest first): the first row addCompletedRows() wrote.
  const last = page.locator('#boardMode .gl[data-col="completed"] .row').last();
  expect(await last.textContent()).toContain('CD-fixture-910');
  expect(await last.evaluate(e => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => document.querySelector('#content')!.scrollTop)).toBe(0);
});

// BL-TB-05: `+ Add` at the right of the Backlog and Current Sprint lane headers, in view while the rows scroll; it opens
// the New Task dialog for its lane (title, next ID, a multi-line field that Enter submits), and focus comes back to it.
/** [button left, top, bottom, count right, header top, header bottom] of a lane. */
const addGeom = (page: Page, col: string) =>
  page.evaluate(c => {
    const gh = document.querySelector(`#boardMode .gl[data-col="${c}"] .gh`)!;
    const b = gh.querySelector('[data-add]')!.getBoundingClientRect();
    const h = gh.getBoundingClientRect();
    return [b.left, b.top, b.bottom, gh.querySelector('.cnt')!.getBoundingClientRect().right, h.top, h.bottom];
  }, col);

browserTest('Add sits in the Backlog and Current Sprint lane headers, opens the dialog for its lane with the next ID, Enter adds, and focus comes back', b, async open => {
  const backlog = addBacklogRows();
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length === n, backlog);
  expect(await page.locator('#boardMode [data-add]').count()).toBe(2);
  expect(await laneAdd(page, 'backlog').textContent()).toContain('Add');
  expect(await laneAdd(page, 'currentSprint').getAttribute('aria-label')).toBe('Add new task to Current Sprint');
  expect(await page.locator('#boardMode .gl[data-col="completed"] [data-add]').count()).toBe(0);
  expect(await page.locator('#boardMode [data-archive]').count()).toBe(1); // BL-TB-06 (D8): Archive is always in the Completed header
  expect(await page.locator('#newTask').count()).toBe(0);
  expect(await page.locator('#taskSec').count()).toBe(0);
  expect(await pageScrolls(page)).toBe(false);
  for (const col of ['backlog', 'currentSprint']) {
    const [left, top, bottom, cntRight, ghTop, ghBottom] = await addGeom(page, col);
    expect(left).toBeGreaterThanOrEqual(cntRight); // right of the count, inside the header
    expect(top).toBeGreaterThanOrEqual(ghTop);
    expect(bottom).toBeLessThanOrEqual(ghBottom);
    expect(bottom).toBeLessThanOrEqual(900);
  }
  const before0 = await addGeom(page, 'backlog');
  await laneBox(page, 'backlog').evaluate(b => { b.scrollTop = b.scrollHeight; });
  expect(await addGeom(page, 'backlog')).toEqual(before0); // the header, button included, stays put while the rows scroll
  expect(await pageScrolls(page)).toBe(false);
  // a live reload keeps focus on the button
  await laneAdd(page, 'backlog').focus();
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, '| CS-900 | Written outside the page |');
  writeFileSync(env.tasks(), lines.join('\n'));
  await page.waitForFunction(() => document.documentElement.dataset.rev === '1');
  await focusOn(page, 'backlog');
  // the Current Sprint button opens the dialog for its lane; the hint is the ID the server will give; Enter adds
  const before = read(env.tasks());
  const id = taskMover.nextTaskId('CS', [before, archive()]);
  await laneAdd(page, 'currentSprint').click();
  await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
  expect(await page.evaluate(() => document.activeElement!.tagName)).toBe('TEXTAREA');
  expect(await page.locator('#taskTitle').textContent()).toBe('New Task · Current Sprint');
  expect(await page.locator('#taskNext').textContent()).toBe(id);
  await page.keyboard.type('Lane header task');
  await page.keyboard.press('Enter');
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint').includes(`| ${id} | Lane header task |`), 'the new row on disk');
  expect(read(env.tasks()).split('\n').length).toBe(before.split('\n').length + 1);
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  expect(await page.locator('#insp .ih .id').first().textContent()).toBe(id);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  await focusOn(page, 'currentSprint');
  await laneAdd(page, 'currentSprint').click(); // the hint moved on with the file
  await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
  expect(await page.locator('#taskNext').textContent()).toBe(taskMover.nextTaskId('CS', [read(env.tasks()), archive()]));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#taskVeil')!.classList.contains('open'));
  await focusOn(page, 'currentSprint');
  // Escape from a dialog opened by the Backlog button returns to it
  await laneAdd(page, 'backlog').click();
  await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
  expect(await page.locator('#taskTitle').textContent()).toBe('New Task · Backlog');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#taskVeil')!.classList.contains('open'));
  await focusOn(page, 'backlog');
  // BL-TB-06 (D8): the fixture's one-row Completed opens the Archive dialog with nothing to archive and the action disabled
  await laneArchive(page).click();
  await archOpen(page);
  expect(await page.locator('#archGates .gate').count()).toBe(2);
  expect(await gateText(page, 0)).toBe('On main.');
  expect(await page.locator('#archGates .gate.off').textContent()).toBe('Nothing to archive: ## Completed has 1 row, and an archive keeps the newest 20.');
  expect(await page.locator('#archGates input').count()).toBe(0);
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  await page.waitForFunction(() => document.activeElement?.id === 'archCancel');
  await page.keyboard.press('Escape');
  await archClosed(page);
  await focusOnArchive(page);
});

// BL-TB-06 (D8): `Archive` is always in the Completed lane header and opens the Archive Completed dialog, which lists the gates
// (the CLI's branch guard, the 40-line limit) from the latest payload with a box to tick for each that warns; Archive runs the
// Completed step with the CLI's plan and block; within the limit a ticked limit gate sends {force:true}.
browserTest('Archive sits in the Completed header; past the limit on main the dialog has no box to tick, one click archives the oldest rows as the CLI does, and the next open says nothing is left', b, async open => {
  const completed = addCompletedRows(40);
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed);
  expect(await page.locator('#boardMode [data-archive]').count()).toBe(1);
  expect(await laneArchive(page).count()).toBe(1);
  expect(await laneArchive(page).textContent()).toContain('Archive');
  expect(await laneArchive(page).getAttribute('aria-label')).toBe('Archive Completed rows to planning/tasks-archive.md');
  const [left, top, bottom, cntRight, ghTop, ghBottom] = await page.evaluate(() => {
    const gh = document.querySelector('#boardMode .gl[data-col="completed"] .gh')!;
    const r = gh.querySelector('[data-archive]')!.getBoundingClientRect();
    const h = gh.getBoundingClientRect();
    return [r.left, r.top, r.bottom, gh.querySelector('.cnt')!.getBoundingClientRect().right, h.top, h.bottom];
  });
  expect(left).toBeGreaterThanOrEqual(cntRight); // right of the count, inside the header
  expect(top).toBeGreaterThanOrEqual(ghTop);
  expect(bottom).toBeLessThanOrEqual(ghBottom);
  // a live reload keeps focus on the button
  await laneArchive(page).focus();
  await reloadThrough(page, 'CS-900');
  await focusOnArchive(page);
  const { after, block, moved, lines } = archivePlan();
  expect(moved).toBeGreaterThan(0);
  const archiveBefore = archive();
  await laneArchive(page).click();
  await archOpen(page);
  expect(await page.locator('#archTitle').textContent()).toBe('Archive Completed');
  expect(await page.locator('#archGates .gate').count()).toBe(2);
  expect(await page.locator('#archGates .gate.ok').count()).toBe(2);
  expect(await page.locator('#archGates input').count()).toBe(0); // on main, over the limit: nothing warns
  expect(await gateText(page, 0)).toBe('On main.');
  expect(await gateText(page, 1)).toBe(`## Completed is ${lines} lines, over its 40-line limit: ${moved} rows move, the newest 20 stay.`);
  expect(await page.locator('#archGo').isEnabled()).toBe(true);
  await page.waitForFunction(() => document.activeElement?.id === 'archGo');
  for (const key of ['h', '1', 'j']) await page.keyboard.press(key); // the open dialog swallows the page's single-key shortcuts
  expect(await page.evaluate(() => document.querySelector('#archVeil')!.classList.contains('open'))).toBe(true);
  await waitView(page, 'v-board');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('archGo');
  await page.click('#archGo');
  await until(() => read(env.tasks()) === after, 'tasks.md without the archived rows');
  expect(stamp(archive())).toBe(archiveBefore + block);
  await waitToast(page, new RegExp(`^Moved ${moved} rows from ## Completed to planning/tasks-archive.md$`));
  await archClosed(page);
  expect(await page.locator('#boardMode .gl[data-col="completed"] .gh .cnt').textContent()).toBe(String(completed - moved));
  expect(await page.locator('#boardMode .row[data-col="completed"]').count()).toBe(completed - moved);
  expect(await page.locator('#boardMode [data-archive]').count()).toBe(1); // still there: it opens the dialog, due or not
  await focusOnArchive(page);
  // the next open: nothing left to archive, the action disabled, Escape returns to the button
  await laneArchive(page).click();
  await archOpen(page);
  expect(await page.locator('#archGates .gate.off').textContent()).toBe('Nothing to archive: ## Completed has 20 rows, and an archive keeps the newest 20.');
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  await page.waitForFunction(() => document.activeElement?.id === 'archCancel');
  await page.keyboard.press('Escape');
  await archClosed(page);
  await focusOnArchive(page);
});

browserTest('off main and within the limit the dialog warns twice, Archive waits for both ticks, a redraw keeps a tick and shows the new branch, and a ticked limit gate forces the rows past the newest 20', b, async open => {
  const completed = addCompletedRows(25); // 26 rows, 31 lines: within the limit
  writeFileSync(HEAD(), 'ref: refs/heads/feature\n');
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed);
  const archiveBefore = archive();
  await laneArchive(page).click();
  await archOpen(page);
  expect(await page.locator('#archGates .gate').count()).toBe(2);
  expect(await page.locator('#archGates .gate.warn').count()).toBe(2);
  expect(await page.locator('#archGates input').count()).toBe(2);
  expect(await gateText(page, 0)).toBe('On branch feature. Archive is recommended only on the default branch after merging. Archive on this branch anyway.');
  expect(await gateText(page, 1)).toBe('## Completed is 31 lines, within its 40-line limit. Archive 6 rows anyway; the newest 20 stay.');
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  await page.waitForFunction(() => document.activeElement?.matches('#archGates input') ?? false); // focus starts on the first box
  await page.check('#archGates input[data-gate="force"]');
  expect(await page.locator('#archGo').isDisabled()).toBe(true); // one of two
  // the branch switched after the last payload: the open dialog redraws at the next one, the tick kept
  writeFileSync(HEAD(), 'ref: refs/heads/other\n');
  await reloadThrough(page, 'CS-900');
  expect(await gateText(page, 0)).toMatch(/^On branch other\. /);
  expect(await page.isChecked('#archGates input[data-gate="force"]')).toBe(true);
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  await page.check('#archGates input[data-gate="branch:other"]');
  expect(await page.locator('#archGo').isEnabled()).toBe(true);
  await page.click('#archCancel'); // nothing written, focus back on the button
  await archClosed(page);
  await focusOnArchive(page);
  expect(archive()).toBe(archiveBefore);
  expect(rowsIn(read(env.tasks()), 'Completed')).toHaveLength(completed);
  // a detached HEAD is guarded like the CLI's HEAD: the gate names the commit; every box starts unticked
  writeFileSync(HEAD(), 'a'.repeat(40) + '\n');
  await reloadThrough(page, 'CS-901');
  await laneArchive(page).click();
  await archOpen(page);
  expect(await gateText(page, 0)).toBe(`On branch ${'a'.repeat(40)}. Archive is recommended only on the default branch after merging. Archive on this branch anyway.`);
  expect(await page.locator('#archGates input:checked').count()).toBe(0);
  await page.keyboard.press('Escape');
  await archClosed(page);
  await focusOnArchive(page);
  // no .git: no branch to warn about; the limit gate alone, ticked, forces the archive
  rmSync(join(env.project, '.git'), { recursive: true, force: true });
  await reloadThrough(page, 'CS-902');
  await laneArchive(page).click();
  await archOpen(page);
  expect(await gateText(page, 0)).toBe('No git branch.');
  expect(await page.locator('#archGates input').count()).toBe(1);
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  const { after, block, moved } = archivePlan(true);
  expect(moved).toBe(6);
  await page.check('#archGates input[data-gate="force"]');
  expect(await page.locator('#archGo').isEnabled()).toBe(true);
  await page.click('#archGo');
  await until(() => read(env.tasks()) === after, 'tasks.md without the forced rows');
  expect(stamp(archive())).toBe(archiveBefore + block);
  await waitToast(page, new RegExp(`^Moved ${moved} rows from ## Completed`));
  await archClosed(page);
  await focusOnArchive(page);
  expect(await page.locator('#boardMode .row[data-col="completed"]').count()).toBe(20);
});

browserTest(
  'a tasks.md changed after the page loaded shows the 409 text in the Archive dialog, which stays open, and writes nothing',
  b,
  async open => {
    const completed = addCompletedRows(40);
    const slow = await serve(env, [env.project], { pollMs: 60000 }); // the page still holds the old hash when Archive is clicked
    try {
      const { page } = await open(slow);
      const narrow = (await open(slow, '', { width: 420 })).page; // the error state at 420px too, on a page that also holds the old hash
      for (const pg of [page, narrow]) {
        await waitView(pg, 'v-board');
        await pg.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed);
      }
      const archiveBefore = archive();
      const changed = read(env.tasks()).replace('# Task Tracking', '# Task Tracking\n\nEdited outside the page.');
      writeFileSync(env.tasks(), changed);
      for (const pg of [page, narrow]) {
        await laneArchive(pg).click();
        await archOpen(pg);
        await pg.click('#archGo');
        await pg.locator('#archErr').waitFor({ state: 'visible' });
        expect(await pg.locator('#archErr').textContent()).toBe(taskMover.ARCHIVE_STALE_ERROR);
        expect(await pg.evaluate(() => document.querySelector('#archVeil')!.classList.contains('open'))).toBe(true);
        expect(await pg.locator('#archGo').isEnabled()).toBe(true); // the gates redrawn from the fresh payload: still on main, still over the limit
      }
      expect(await noSideScroll(narrow)).toBe(true);
      expect(read(env.tasks())).toBe(changed);
      expect(archive()).toBe(archiveBefore);
    } finally {
      await slow.close();
    }
  },
  [/status of 409/],
);

browserTest('the tasks.md intro sits above the lanes, folded on load, and stays open through a live reload', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  expect(await page.evaluate(() => (document.querySelector('#gConv')!.compareDocumentPosition(document.querySelector('#boardMode')!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)).toBe(true);
  expect(await page.locator('#gIntro').getAttribute('open')).toBeNull();
  expect(await page.locator('#gIntro .box').isVisible()).toBe(false);
  await page.click('#introSum');
  expect(await page.locator('#gIntro').getAttribute('open')).not.toBeNull();
  expect(await page.locator('#gIntro .box').textContent()).toContain('Task ID conventions');
  const lines = read(env.tasks()).split('\n');
  const sep = lines.findIndex((l, i) => i > lines.findIndex(x => x.trim() === '## Current Sprint') && /^\|---/.test(l));
  lines.splice(sep + 1, 0, '| CS-900 | Written outside the page |');
  writeFileSync(env.tasks(), lines.join('\n'));
  await page.waitForFunction(() => document.documentElement.dataset.rev === '1');
  expect(await page.locator('#gIntro').getAttribute('open')).not.toBeNull();
});

browserTest('the Tasks view, a task\'s details, the New Task dialog and Archive have no sideways scroll at 420px; the lanes stack and the page scrolls', b, async open => {
  const backlog = addBacklogRows();
  const completed = addCompletedRows(40); // past the limit: Archive is drawn (BL-TB-06)
  writeFileSync(join(env.project, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
  const { page } = await open(srv, '', { width: 420 });
  await waitView(page, 'v-board');
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length === n, backlog);
  await page.waitForFunction(n => document.querySelectorAll('#boardMode .row[data-col="completed"]').length === n, completed); // BL-TB-07: every Completed row
  expect(await page.locator('#boardMode [data-more]').count()).toBe(0);
  expect(await noSideScroll(page)).toBe(true);
  expect(await pageScrolls(page)).toBe(true); // BL-TB-03: one column at its natural height, no lane scrolls on its own
  for (const col of ['backlog', 'currentSprint', 'completed']) {
    const [sh, ch] = await laneGeom(page, col);
    expect(sh).toBe(ch);
  }
  await row(page, 'backlog', 0).click();
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  expect(await noSideScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  await laneAdd(page, 'backlog').click(); // BL-TB-05: the dialog opens from a lane header
  await page.waitForFunction(() => document.querySelector('#taskVeil')!.classList.contains('open'));
  expect(await noSideScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#taskVeil')!.classList.contains('open'));
  await page.click('#introSum'); // the intro open (BL-TB-03)
  await page.waitForFunction(() => document.querySelector('#gIntro')!.hasAttribute('open'));
  expect(await noSideScroll(page)).toBe(true);
  expect(await pageScrolls(page)).toBe(true);
  // BL-TB-05: the header buttons, the dialog opened from one, its empty-description error, and focus back on it
  expect(await page.locator('#boardMode .gh [data-add]').count()).toBe(2);
  await laneAdd(page, 'currentSprint').click();
  await page.waitForFunction(() => document.activeElement?.id === 'taskIn');
  expect(await page.locator('#taskTitle').textContent()).toBe('New Task · Current Sprint');
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#taskGo');
  await page.locator('#taskErr').waitFor({ state: 'visible' });
  expect(await page.locator('#taskErr').textContent()).toBe('Type a description for the task.');
  expect(await noSideScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#taskVeil')!.classList.contains('open'));
  await focusOn(page, 'currentSprint');
  expect(await noSideScroll(page)).toBe(true);
  // BL-TB-06 (D8): Archive in the Completed header; the dialog warning about the branch; the archived state; nothing to archive
  expect(await laneArchive(page).count()).toBe(1);
  const [aLeft, aRight, ghLeft, ghRight] = await page.evaluate(() => {
    const gh = document.querySelector('#boardMode .gl[data-col="completed"] .gh')!;
    const r = gh.querySelector('[data-archive]')!.getBoundingClientRect();
    const h = gh.getBoundingClientRect();
    return [r.left, r.right, h.left, h.right];
  });
  expect(aLeft).toBeGreaterThanOrEqual(ghLeft);
  expect(aRight).toBeLessThanOrEqual(ghRight);
  expect(aRight).toBeLessThanOrEqual(420);
  const { after, moved } = archivePlan();
  await laneArchive(page).click();
  await archOpen(page);
  expect(await page.locator('#archGates .gate.warn').count()).toBe(1); // the branch; the limit gate is passed
  expect(await gateText(page, 0)).toMatch(/^On branch feature\. Archive is recommended/);
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  await page.check('#archGates input');
  await page.click('#archGo');
  await until(() => read(env.tasks()) === after, 'tasks.md without the archived rows');
  await waitToast(page, new RegExp(`^Moved ${moved} rows from ## Completed`));
  await archClosed(page);
  expect(await page.locator('#boardMode .row[data-col="completed"]').count()).toBe(completed - moved);
  expect(await noSideScroll(page)).toBe(true);
  expect(await pageScrolls(page)).toBe(true);
  await laneArchive(page).click(); // nothing left: the dialog says so
  await archOpen(page);
  expect(await page.locator('#archGates .gate.off').count()).toBe(1);
  expect(await page.locator('#archGo').isDisabled()).toBe(true);
  expect(await noSideScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  await archClosed(page);
  await focusOnArchive(page);
});
