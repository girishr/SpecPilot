// The Tasks view (BL-079 row, BL-053, BL-PM-005, BL-PM-008's task link, BL-052 live reload), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, routeJs, serve, Served, specArchiver, taskMover, until, waitToast, waitView } from './harness';

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
    await row(page, 'backlog', 0).click({ button: 'right' }); // BL-TB-11: the card menu without the token holds the two read items only
    await menuOpen(page);
    expect(await menuLabels(page)).toEqual(['Open details', 'Copy ID']);
    expect(await page.locator('#cardMenu .mh').count()).toBe(0);
    await page.keyboard.press('Escape');
    await menuClosed(page);
    await row(page, 'review', 0).click(); // BL-113: History shown, no Approve or Send back footer, the menu's two items
    await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
    expect(await page.locator('#insp .hist').count()).toBe(1);
    expect(await page.locator('#inspFoot').count()).toBe(0);
    await page.keyboard.press('Escape');
    await row(page, 'review', 0).click({ button: 'right' });
    await menuOpen(page);
    expect(await menuLabels(page)).toEqual(['Open details', 'Copy ID']);
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
browserTest('Tasks is the board alone: no switch, no list, the lanes in order, every Backlog row shown', b, async open => {
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
  expect(await page.$$eval('#boardMode .gl[data-col]', els => els.map(e => (e as HTMLElement).dataset.col))).toEqual(['backlog', 'currentSprint', 'review', 'completed', 'wontDo']); // BL-113: five lanes
  const lefts = await page.$$eval('#boardMode .gl[data-col]', els => els.map(e => e.getBoundingClientRect().left));
  for (let k = 1; k < lefts.length; k++) expect(lefts[k - 1]).toBeLessThan(lefts[k]);
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

// BL-TB-06 (D8): `Archive` is always in the Completed lane header and opens the `Archive oldest Completed rows` dialog, which lists the gates
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
  expect(await laneArchive(page).getAttribute('aria-label')).toBe('Archive the oldest Completed rows to planning/tasks-archive.md');
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
  expect(await page.locator('#archTitle').textContent()).toBe('Archive oldest Completed rows');
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

// BL-112 (D10): a Warning per missing heading and a Note per unknown one above the lanes; Copy prompt; warnings collapse for the
// session into a strip; a hidden note stays hidden across a reload; a fixed file clears every message.
const tasksFile = () => join(env.project, '.specs', 'planning', 'tasks.md');
const msgsAfterRawAndBeforeLanes = (page: Page) => page.evaluate(() => {
  const after = (a: string, b: string) => (document.querySelector(a)!.compareDocumentPosition(document.querySelector(b)!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return after('#gRaw', '#gHead') && after('#gHead', '#gConv') && after('#gHead', '#boardMode');
});

browserTest('a missing heading shows a Warning and an unknown heading a Note at 1280px and 420px; Copy prompt, the session strip, a note hidden across a reload, and a fixed file clearing them', b, async open => {
  const before = read(env.tasks());
  const odd = '## <b>Parked</b> & co';
  writeFileSync(env.tasks(), before.replace('## Backlog', '### backlog') + `\n${odd}\n\n| ID | Description |\n|---|---|\n| PK-001 | Parked row |\n| PK-002 | Parked row two |\n\n## Later\n\nNothing tabled yet.\n`);
  const wide = (await open(srv)).page;
  const narrow = (await open(srv, '', { width: 420 })).page;
  for (const page of [wide, narrow]) {
    await waitView(page, 'v-board');
    await page.locator('#gHead .msg.warn').waitFor({ state: 'visible' });
    const warn = (await page.locator('#gHead .msg.warn').textContent())!;
    expect(warn).toContain('Warning The Backlog lane is empty: tasks.md has no "## Backlog" heading');
    expect(warn).toContain('The file has "### backlog" instead, so the rows under it are not shown.');
    expect(warn).toContain('Fix: edit .specs/planning/tasks.md and rename "### backlog" to "## Backlog", best done by your AI IDE so that anything referring to the section is updated too.');
    const notes = await page.locator('#gHead .msg.info').allTextContents();
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain(`Note "${odd}" is not a board lane, so its 2 rows are not shown here`);
    expect(notes[0]).toContain('The board shows Backlog, Current Sprint, Review and Completed. The rows stay in tasks.md.'); // the four required lanes (BL-113)
    expect(notes[1]).toContain('Note "## Later" is not a board lane, so its rows would not be shown here (it has no rows)');
    expect(await page.locator('#gHead b').count()).toBe(0); // the heading is text, not markup
    for (const href of await page.locator('#gHead a.btn').evaluateAll(as => as.map(a => a.getAttribute('href')))) expect(href).toBe(routeJs.editorUrl(tasksFile()));
    expect(await page.locator('#boardMode .row', { hasText: 'Parked row' }).count()).toBe(0);
    expect(await page.locator('#boardMode .row', { hasText: 'Fixture backlog row' }).count()).toBe(0); // under ### backlog, which no lane reads
    expect(await msgsAfterRawAndBeforeLanes(page)).toBe(true);
  }
  expect(await noSideScroll(narrow)).toBe(true);
  // Copy prompt: the literal sentence for the AI IDE
  await narrow.click('#gHead .msg.warn [data-prompt]');
  await waitToast(narrow, /Copied\./);
  expect(await narrow.evaluate(() => navigator.clipboard.readText())).toBe('In .specs/planning/tasks.md, rename the heading "### backlog" to "## Backlog" so SpecPilot\'s Tasks board reads the section, and update anything that refers to it.');
  // the warnings collapse for the session into a strip; Show brings them back; the notes stay
  await narrow.click('#gHead .msg.warn [data-hidewarn]');
  await narrow.locator('#gHead .msgbar').waitFor({ state: 'visible' });
  expect(await narrow.locator('#gHead .msgbar').textContent()).toContain('1 warning about tasks.md');
  expect(await narrow.locator('#gHead .msg.warn').count()).toBe(0);
  expect(await narrow.locator('#gHead .msg.info').count()).toBe(2);
  expect(await noSideScroll(narrow)).toBe(true);
  await narrow.click('#gHead .msgbar [data-showwarn]');
  await narrow.locator('#gHead .msg.warn').waitFor({ state: 'visible' });
  expect(await narrow.locator('#gHead .msgbar').count()).toBe(0);
  // hiding the Parked note keeps it hidden across a reload; the Later note stays shown
  await narrow.locator('#gHead .msg.info [data-hidenote]').first().click();
  await narrow.waitForFunction(() => document.querySelectorAll('#gHead .msg.info').length === 1);
  expect(await narrow.locator('#gHead .msg.info').textContent()).toContain('"## Later"');
  await narrow.reload();
  await waitView(narrow, 'v-board');
  await narrow.locator('#gHead .msg.warn').waitFor({ state: 'visible' });
  expect(await narrow.locator('#gHead .msg.info').count()).toBe(1);
  expect(await narrow.locator('#gHead .msg.info').textContent()).toContain('"## Later"');
  expect(await noSideScroll(narrow)).toBe(true);
  // the file put right: every message goes and the Backlog rows return
  writeFileSync(env.tasks(), before);
  for (const page of [wide, narrow]) {
    await page.locator('#gHead').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length > 0);
  }
});

browserTest('a `## backlog` heading gets one Warning and no Note, and a lane with no heading at all gets the no-candidate prompt naming its columns', b, async open => {
  const lines = read(env.tasks()).split('\n');
  const at = lines.findIndex(l => l.trim() === '## Completed');
  writeFileSync(env.tasks(), lines.slice(0, at).join('\n').replace('## Backlog', '## backlog') + '\n');
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  await page.waitForFunction(() => document.querySelectorAll('#gHead .msg.warn').length === 2);
  expect(await page.locator('#gHead .msg.info').count()).toBe(0);
  const warns = await page.locator('#gHead .msg.warn').allTextContents();
  expect(warns[0]).toContain('Warning The Backlog lane is empty: tasks.md has no "## Backlog" heading');
  expect(warns[0]).toContain('The file has "## backlog" instead');
  expect(warns[1]).toContain('Warning The Completed lane is empty: tasks.md has no "## Completed" heading');
  expect(warns[1]).toContain('The board reads "## Backlog", "## Current Sprint", "## Review" and "## Completed".'); // BL-113
  expect(warns[1]).toContain('Fix: edit .specs/planning/tasks.md and add a "## Completed" section, best done by your AI IDE');
  await page.locator('#gHead .msg.warn [data-prompt]').nth(1).click();
  await waitToast(page, /Copied\./);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('In .specs/planning/tasks.md, add a "## Completed" section (a table with #, ID and Description columns) so SpecPilot\'s Tasks board reads it, and update anything that refers to it.');
});

// BL-116: a known section whose tasks are plain lines or a list, not a table: a Warning per section, counted in the session strip
browserTest('a section whose tasks are lines or a list, not a table, gets a Warning per section at 1280px and 420px, counted in the strip', b, async open => {
  const before = read(env.tasks());
  const lines = before.split('\n');
  const bounds = (h: string): [number, number] => {
    const s = lines.findIndex(l => l.trim() === h);
    const e = lines.findIndex((l, i) => i > s && /^## /.test(l));
    return [s, e < 0 ? lines.length : e];
  };
  const [cs, ce] = bounds('## Completed'); // the later section first, so the earlier indices hold
  lines.splice(cs + 1, ce - cs - 1, '', '1. [CD-fixture-001] Listed, not tabled (2026-10-20)', '');
  const [bs, be] = bounds('## Backlog');
  lines.splice(bs + 1, be - bs - 1, '', '[BL-001] Line one', '[BL-002] Line two', '[BL-003] Line three', '');
  writeFileSync(env.tasks(), lines.join('\n'));
  const wide = (await open(srv)).page;
  const narrow = (await open(srv, '', { width: 420 })).page;
  for (const page of [wide, narrow]) {
    await waitView(page, 'v-board');
    await page.waitForFunction(() => document.querySelectorAll('#gHead .msg.warn').length === 2);
    const warns = await page.locator('#gHead .msg.warn').allTextContents();
    expect(warns[0]).toContain('Warning The Backlog lane shows none of the 3 lines under "## Backlog"');
    expect(warns[0]).toContain('They are not table rows. The board reads a markdown table with ID and Description columns.');
    expect(warns[0]).toContain('Fix: edit .specs/planning/tasks.md and turn the section into a table with ID and Description columns, one row per task, best done by your AI IDE so that every task keeps its ID and references.');
    expect(warns[1]).toContain('Warning The Completed lane shows none of the 1 line under "## Completed"');
    expect(warns[1]).toContain('a markdown table with #, ID and Description columns.');
    expect(await page.locator('#gHead .msg.info').count()).toBe(0);
    expect(await page.locator('#boardMode .row[data-col="backlog"]').count()).toBe(0);
    expect(await page.locator('#boardMode .row[data-col="completed"]').count()).toBe(0);
    expect(await page.locator('#boardMode .row[data-col="currentSprint"]').count()).toBeGreaterThan(0); // the untouched section still reads
  }
  expect(await noSideScroll(narrow)).toBe(true);
  await narrow.locator('#gHead .msg.warn [data-prompt]').nth(1).click();
  await waitToast(narrow, /Copied\./);
  expect(await narrow.evaluate(() => navigator.clipboard.readText())).toBe('In .specs/planning/tasks.md, turn the "## Completed" section into a markdown table with #, ID and Description columns, one row per task, keeping every task and its ID, so SpecPilot\'s Tasks board reads it.');
  await narrow.click('#gHead .msg.warn [data-hidewarn]');
  await narrow.locator('#gHead .msgbar').waitFor({ state: 'visible' });
  expect(await narrow.locator('#gHead .msgbar').textContent()).toContain('2 warnings about tasks.md');
  expect(await noSideScroll(narrow)).toBe(true);
  writeFileSync(env.tasks(), before);
  for (const page of [wide, narrow]) {
    await page.locator('#gHead').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#boardMode .row[data-col="backlog"]').length > 0);
  }
});

// BL-120: a table whose header has another column count than its lane reads: a Warning per section, after the others, counted in the strip
browserTest('a table with the wrong column count gets a Warning per section at 1280px and 420px, counted in the strip', b, async open => {
  const before = read(env.tasks());
  const lines = before.split('\n');
  const header = (h: string, row: string, sep: string) => {
    const s = lines.findIndex(l => l.trim() === h);
    const i = lines.findIndex((l, j) => j > s && /^\|[\s:|-]+$/.test(l.trim()));
    lines.splice(i - 1, 2, row, sep);
  };
  const cs = lines.findIndex(l => l.trim() === '## Completed'); // the later section first, so the earlier indices hold
  const ce = lines.findIndex((l, i) => i > cs && /^## /.test(l));
  lines.splice(cs + 1, ce - cs - 1, '', '| ID | Task |', '|---|---|', '| CD-fixture-002 | Two cells, not three |', '| CD-fixture-003 | Another two-cell row |', '');
  header('## Backlog', '| ID | Description | Owner | Due |', '|---|---|---|---|');
  writeFileSync(env.tasks(), lines.join('\n'));
  const wide = (await open(srv)).page;
  const narrow = (await open(srv, '', { width: 420 })).page;
  for (const page of [wide, narrow]) {
    await waitView(page, 'v-board');
    await page.waitForFunction(() => document.querySelectorAll('#gHead .msg.warn').length === 2);
    const warns = await page.locator('#gHead .msg.warn').allTextContents();
    expect(warns[0]).toContain('Warning The Backlog lane cannot read its table: it has 4 columns, the board reads 2');
    expect(warns[0]).toContain("The extra columns show inside each row's description.");
    expect(warns[0]).toContain('Fix: edit .specs/planning/tasks.md and give the table ID and Description columns, one row per task, best done by your AI IDE so that every task keeps its ID and text.');
    expect(warns[1]).toContain('Warning The Completed lane cannot read its table: it has 2 columns, the board reads 3');
    expect(warns[1]).toContain('2 rows are listed under Rows that could not be parsed.');
    expect(await page.locator('#boardMode .row[data-col="completed"]').count()).toBe(0);
    expect(await page.locator('#boardMode .row[data-col="backlog"]').count()).toBeGreaterThan(0); // more columns still read, extras in the description
  }
  expect(await noSideScroll(narrow)).toBe(true);
  await narrow.locator('#gHead .msg.warn [data-prompt]').nth(1).click();
  await waitToast(narrow, /Copied\./);
  expect(await narrow.evaluate(() => navigator.clipboard.readText())).toBe('In .specs/planning/tasks.md, turn the "## Completed" section into a markdown table with #, ID and Description columns, one row per task (numbered from 1 with the oldest entry first), keeping every task\'s ID and text, so SpecPilot\'s Tasks board reads it.');
  await narrow.click('#gHead .msg.warn [data-hidewarn]');
  await narrow.locator('#gHead .msgbar').waitFor({ state: 'visible' });
  expect(await narrow.locator('#gHead .msgbar').textContent()).toContain('2 warnings about tasks.md');
  expect(await noSideScroll(narrow)).toBe(true);
  writeFileSync(env.tasks(), before);
  for (const page of [wide, narrow]) {
    await page.locator('#gHead').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#boardMode .row[data-col="completed"]').length > 0);
  }
});

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

browserTest('the Tasks view, a task\'s details, the New Task dialog, the card menu and Archive have no sideways scroll at 420px; the lanes stack and the page scrolls', b, async open => {
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
  // BL-TB-11: the ⋯ button shown without hover and inside the window; the menu open; a move from it with the Undo toast; Escape back to the card
  const dots = page.locator('#boardMode .card [data-menu="backlog:0"]');
  expect(await dots.evaluate(e => getComputedStyle(e).opacity)).toBe('1');
  const [dLeft, dRight] = await dots.evaluate(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  expect(dLeft).toBeGreaterThanOrEqual(0);
  expect(dRight).toBeLessThanOrEqual(420);
  await dots.click();
  await menuOpen(page);
  expect(await noSideScroll(page)).toBe(true);
  const [mLeft, mRight] = await page.locator('#cardMenu').evaluate(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  expect(mLeft).toBeGreaterThanOrEqual(0);
  expect(mRight).toBeLessThanOrEqual(420);
  await page.keyboard.press('Escape');
  await menuClosed(page);
  await rowFocused(page, 'backlog', 0);
  const beforeMenuMove = read(env.tasks());
  const menuRow = rowsIn(beforeMenuMove, 'Backlog')[0];
  await dots.click();
  await menuOpen(page);
  await page.locator('#cardMenu [role=menuitem]').first().click(); // Current Sprint, the lane's end
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint').includes(menuRow), 'the row in Current Sprint on disk');
  await waitToast(page, new RegExp(`${idOf(menuRow)} moved from ## Backlog to ## Current Sprint`));
  expect(await noSideScroll(page)).toBe(true);
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === beforeMenuMove, 'tasks.md back as it was');
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

// BL-TB-11: a card's context menu, built from the move table the server sends.
const menuOpen = (page: Page) => page.waitForFunction(() => !(document.querySelector('#cardMenu') as HTMLElement).hidden);
const menuClosed = (page: Page) => page.waitForFunction(() => (document.querySelector('#cardMenu') as HTMLElement).hidden);
/** The items' labels, without the key hints. */
const menuLabels = (page: Page) => page.$$eval('#cardMenu [role=menuitem]', els => els.map(e => e.firstChild!.textContent));
const itemFocused = (page: Page, k: number) => page.waitForFunction(n => document.activeElement === document.querySelectorAll('#cardMenu [role=menuitem]')[n], k);
const rowFocused = (page: Page, col: string, i: number) =>
  page.waitForFunction(([c, n]) => document.activeElement?.matches(`#boardMode .row[data-col="${c}"][data-i="${n}"]`) ?? false, [col, i] as [string, number]);
/** The item whose label (its first text node, before any key hint) is `label`. */
async function item(page: Page, label: string) {
  const k = await page.$$eval('#cardMenu [role=menuitem]', (els, l) => els.findIndex(e => e.firstChild!.textContent === l), label);
  expect(k).toBeGreaterThanOrEqual(0);
  return page.locator('#cardMenu [role=menuitem]').nth(k);
}

browserTest('a card\'s menu opens by right-click, Shift+F10 and the ⋯ button; its items come from the move table; a move from it is one line with Undo, a Completed card offers details and Copy ID only', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  const first = rowsIn(before, 'Backlog')[0];
  const sprint = rowsIn(before, 'Current Sprint').length;
  // Every card has the ⋯ button; at 1280px it is transparent until the card is hovered or focused.
  expect(await page.locator('#boardMode .card [data-menu]').count()).toBe(await page.locator('#boardMode .row[data-col]').count());
  const dots = page.locator('#boardMode .card [data-menu="backlog:0"]');
  expect(await dots.evaluate(e => getComputedStyle(e).opacity)).toBe('0');
  await row(page, 'backlog', 0).hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#boardMode .card [data-menu="backlog:0"]')!).opacity === '1');
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#boardMode .card [data-menu="backlog:0"]')!).opacity === '0');
  await row(page, 'backlog', 0).focus();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#boardMode .card [data-menu="backlog:0"]')!).opacity === '1');
  // Right-click: the items in order, the hint on the key's move, no Move up on the first card; arrows wrap; Escape back to the card.
  await row(page, 'backlog', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Current Sprint', 'Current Sprint, top', 'Move down', 'Open details', 'Copy ID']);
  expect(await page.locator('#cardMenu .mh').textContent()).toBe('Move to');
  expect(await page.locator('#cardMenu [role=menuitem] .hint').allTextContents()).toEqual(['Alt+→', 'Alt+↓']);
  expect(await page.locator('#cardMenu [role=menuitem]').first().getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowRight');
  await itemFocused(page, 0);
  await page.keyboard.press('ArrowUp');
  await itemFocused(page, 4);
  await page.keyboard.press('ArrowDown');
  await itemFocused(page, 0);
  await page.keyboard.press('End');
  await itemFocused(page, 4);
  await page.locator('#cardMenu .mh').click(); // a press inside the menu (here on the heading) does not close it
  await menuOpen(page);
  await itemFocused(page, 4);
  await page.keyboard.press('Escape');
  await menuClosed(page);
  await rowFocused(page, 'backlog', 0);
  expect(await dots.getAttribute('aria-expanded')).toBe('false');
  // Shift+F10 on the focused card; the default target is the lane's end; the toast's Undo puts the file back.
  await page.keyboard.press('Shift+F10');
  await menuOpen(page);
  expect(await dots.getAttribute('aria-expanded')).toBe('true');
  await (await item(page, 'Current Sprint')).click();
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint').includes(first), 'the row in Current Sprint on disk');
  const after = read(env.tasks());
  expect(after.split('\n').sort()).toEqual(before.split('\n').sort());
  expect(rowsIn(after, 'Current Sprint')[sprint]).toBe(first);
  await waitToast(page, new RegExp(`${idOf(first)} moved from ## Backlog to ## Current Sprint`));
  await rowFocused(page, 'currentSprint', sprint);
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
  await rowFocused(page, 'backlog', 0);
  // The ⋯ button; `<Lane>, top` puts the row first; Move down swaps it with the next row.
  await dots.click();
  await menuOpen(page);
  await (await item(page, 'Current Sprint, top')).click();
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === first, 'the row first in Current Sprint');
  await waitToast(page, new RegExp(`${idOf(first)} moved from ## Backlog to ## Current Sprint`));
  await rowFocused(page, 'currentSprint', 0);
  await row(page, 'currentSprint', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Backlog', 'Backlog, top', 'Review', 'Review, top', 'Move down', 'Open details', 'Copy ID']); // Review since BL-113
  expect(await page.locator('#cardMenu [role=menuitem] .hint').allTextContents()).toEqual(['Alt+←', 'Alt+→', 'Alt+↓']);
  await (await item(page, 'Move down')).click();
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[1] === first, 'the row second in Current Sprint');
  await waitToast(page, new RegExp(`${idOf(first)} moved within ## Current Sprint`));
  await rowFocused(page, 'currentSprint', 1);
  await row(page, 'currentSprint', 1).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Backlog', 'Backlog, top', 'Review', 'Review, top', 'Move up', 'Move down', 'Open details', 'Copy ID']);
  await page.keyboard.press('Escape');
  await menuClosed(page);
  // A Completed card: Open details and Copy ID only; Copy ID puts the ID cell on the clipboard; Open details opens the inspector on it.
  const doneId = rowsIn(before, 'Completed')[0].split('|')[2].trim();
  await row(page, 'completed', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Open details', 'Copy ID']);
  expect(await page.locator('#cardMenu .mh').count()).toBe(0);
  await (await item(page, 'Copy ID')).click();
  await waitToast(page, /^Copied\.$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(doneId);
  await rowFocused(page, 'completed', 0);
  await page.keyboard.press('Shift+F10');
  await menuOpen(page);
  await (await item(page, 'Open details')).click();
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
  expect(await page.locator('#insp .ih .pill').textContent()).toBe('Completed');
  expect(await page.locator('#insp .ih .id').last().textContent()).toBe(doneId);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
  // A live reload closes an open menu and leaves focus on its card; a click outside closes it too.
  await row(page, 'backlog', 0).click({ button: 'right' });
  await menuOpen(page);
  await reloadThrough(page, 'CS-902');
  await menuClosed(page);
  await rowFocused(page, 'backlog', 0);
  await row(page, 'backlog', 0).click({ button: 'right' });
  await menuOpen(page);
  await page.mouse.click(5, 5);
  await menuClosed(page);
});

// ---- BL-113: the Review lane (Approve, Send back, History), the Won't do strip, the toast's × (BL-UI-03)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inspOpen = (page: Page) => page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open'));
const inspClosed = (page: Page) => page.waitForFunction(() => !document.querySelector('#insp')!.classList.contains('open'));
const formOpen = (page: Page) => page.waitForFunction(() => !(document.querySelector('#rvForm') as HTMLElement | null)?.hidden && document.activeElement?.id === 'rvNote');
const formClosed = (page: Page) => page.waitForFunction(() => (document.querySelector('#rvForm') as HTMLElement | null)?.hidden === true);
const toastHidden = (page: Page, timeout = 10000) => page.waitForFunction(() => !document.querySelector('#toast')!.classList.contains('show'), undefined, { timeout });
/** The fixture's Review row, as the file has it. */
const REVIEW_ROW = '| CS-801 | Fixture review row Sent back 2026-10-01: an earlier note |';
/** The row with `suffix` appended inside its cell, before the closing pipe. */
const mark = (suffix: string) => REVIEW_ROW.slice(0, -2) + suffix + ' |';

browserTest('the five lanes: the Review header\'s HITL abbr and empty text, the Won\'t do strip folded by default, opened and closed by its title, read-only with the Reason in the panel; lanes without their heading are not drawn', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const hitl = page.locator('#boardMode .gl[data-col="review"] .gh abbr.hitl');
  expect(await hitl.textContent()).toBe('HITL');
  expect(await hitl.getAttribute('title')).toBe('Human-in-the-loop: you check the agent\'s work here before it counts as done');
  expect(await hitl.getAttribute('aria-label')).toBe('Human-in-the-loop: you check the agent\'s work here before it counts as done');
  expect(await page.locator('#boardMode .gl[data-col="review"] .gh .cnt').textContent()).toBe('1');
  expect(await page.locator('#boardMode .gl[data-col="review"] .gh [data-add]').count()).toBe(0); // no Add on Review
  // no view has a width cap (the developer's call, 2026-10-21): the board fills the content column at 1280px and at 1920px, and the file view too
  const fills = (p: Page) => p.evaluate(() => { const c = document.querySelector('#content')!; const cs = getComputedStyle(c); return Math.abs(document.querySelector('#v-board')!.getBoundingClientRect().width - (c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))) < 1; });
  expect(await fills(page)).toBe(true);
  expect(await page.locator('#v-board').evaluate(e => e.getBoundingClientRect().width)).toBeGreaterThan(880);
  const wide = (await open(srv, '', { width: 1920 })).page;
  await waitView(wide, 'v-board');
  await wide.waitForFunction(() => document.querySelectorAll('#boardMode .gl[data-col]').length === 5);
  expect(await fills(wide)).toBe(true);
  expect(await wide.locator('#v-board').evaluate(e => e.getBoundingClientRect().width)).toBeGreaterThan(1060);
  expect(await wide.locator('#v-file').evaluate(e => getComputedStyle(e).maxWidth)).toBe('none'); // the other views have none either
  await wide.close();
  // the strip: folded, the box hidden, a narrow column; the title opens it
  const strip = page.locator('#boardMode .gl[data-col="wontDo"]');
  expect(await strip.getAttribute('class')).toContain('fold');
  expect(await strip.locator('.box').isHidden()).toBe(true);
  expect(await strip.locator('[data-fold]').getAttribute('aria-expanded')).toBe('false');
  expect(await strip.evaluate(e => e.getBoundingClientRect().width)).toBeLessThan(60);
  expect(await page.locator('#boardMode .row[data-col="wontDo"]').first().isVisible()).toBe(false);
  await strip.locator('[data-fold]').click();
  await page.waitForFunction(() => document.querySelector('#boardMode .gl[data-col="wontDo"] [data-fold]')?.getAttribute('aria-expanded') === 'true');
  expect(await page.locator('#boardMode .gl[data-col="wontDo"]').getAttribute('class')).not.toContain('fold');
  expect(await page.locator('#boardMode .row[data-col="wontDo"]').count()).toBe(1);
  expect(await page.locator('#boardMode .row[data-col="wontDo"]').isVisible()).toBe(true);
  expect(await page.locator('#boardMode .row[data-col="wontDo"][draggable="true"]').count()).toBe(0); // read-only, like Completed
  expect(await page.locator('#boardMode .gl[data-col="wontDo"] .gh [data-add]').count()).toBe(0);
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-fold') ?? false); // focus stays on the title through the redraw
  await row(page, 'wontDo', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Open details', 'Copy ID']);
  await (await item(page, 'Open details')).click();
  await inspOpen(page);
  expect(await page.locator('#insp .ih .pill').first().textContent()).toBe("Won't do");
  expect(await page.locator('#insp .gl .gh', { hasText: 'Reason' }).count()).toBe(1);
  expect(await page.locator('#insp .desc').last().textContent()).toBe('Not needed');
  await page.keyboard.press('Escape');
  await inspClosed(page);
  await page.locator('#boardMode .gl[data-col="wontDo"] [data-fold]').click();
  await page.waitForFunction(() => document.querySelector('#boardMode .gl[data-col="wontDo"] [data-fold]')?.getAttribute('aria-expanded') === 'false');
  expect(await page.locator('#boardMode .gl[data-col="wontDo"] .box').isHidden()).toBe(true);
  // an empty Review lane says so; without its heading the lane is not drawn and the Warning says "not shown"; without Won't do: no lane, no warning
  const before = read(env.tasks());
  writeFileSync(env.tasks(), before.replace(REVIEW_ROW + '\n', ''));
  await page.waitForFunction(() => document.querySelector('#boardMode .gl[data-col="review"] .empty') !== null);
  expect(await page.locator('#boardMode .gl[data-col="review"] .empty').textContent()).toBe('Nothing waiting for you. Agents move finished work here.');
  const lines = before.split('\n');
  const cut = (heading: string) => {
    const s = lines.findIndex(l => l.trim() === heading);
    const e = lines.findIndex((l, i) => i > s && /^## /.test(l));
    return [...lines.slice(0, s), ...lines.slice(e < 0 ? lines.length : e)].join('\n');
  };
  const lanesAre = (page: Page, cols: string[]) => page.waitForFunction(c => Array.from(document.querySelectorAll('#boardMode .gl[data-col]')).map(e => (e as HTMLElement).dataset.col).join() === c, cols.join());
  writeFileSync(env.tasks(), cut('## Review'));
  await lanesAre(page, ['backlog', 'currentSprint', 'completed', 'wontDo']);
  await page.locator('#gHead .msg.warn').waitFor({ state: 'visible' });
  expect(await page.locator('#gHead .msg.warn').textContent()).toContain('Warning The Review lane is not shown: tasks.md has no "## Review" heading');
  writeFileSync(env.tasks(), cut("## Won't do"));
  await lanesAre(page, ['backlog', 'currentSprint', 'review', 'completed']);
  await page.locator('#gHead').waitFor({ state: 'hidden' });
  writeFileSync(env.tasks(), before);
  await page.waitForFunction(() => document.querySelectorAll('#boardMode .gl[data-col]').length === 5);
});

browserTest('Approve from the panel appends the dated marker as one line, shows the chip, toasts with Undo and ×; Undo puts the file back; the × hides a toast early and a toast left alone hides on its timer', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  await row(page, 'review', 0).click();
  await inspOpen(page);
  expect(await page.locator('#insp .hist').count()).toBe(1); // History: the fixture's earlier note
  expect(await page.locator('#insp .hist .hd').textContent()).toBe('Sent back 2026-10-01');
  expect(await page.locator('#insp .hist .hn').textContent()).toBe('an earlier note');
  expect(await page.locator('#rvForm').isHidden()).toBe(true);
  await page.click('#rvApprove');
  const approved = mark(` Approved ${today()}`);
  await until(() => rowsIn(read(env.tasks()), 'Review')[0] === approved, 'the Approved marker on disk');
  const after = read(env.tasks());
  expect(after.split('\n').length).toBe(before.split('\n').length);
  expect(after.split('\n').filter(l => !before.split('\n').includes(l))).toEqual([approved]); // one line changed
  await page.waitForFunction(() => document.querySelector('#boardMode .row[data-col="review"] .chip')?.textContent === 'Approved');
  await waitToast(page, /^CS-801 approved: marked in planning\/tasks\.md\. Next: tell your agent to wrap it up; it writes the Completed entry\./); // D14
  expect(await page.locator('#toast .tact').textContent()).toBe('Undo');
  expect(await page.locator('#toast .tx').getAttribute('aria-label')).toBe('Dismiss');
  await inspOpen(page); // the panel stays, on the same row, without an Approve button now
  expect(await page.locator('#rvApprove').count()).toBe(0);
  expect(await page.locator('#rvSend').count()).toBe(1);
  expect(await page.locator('#insp .ih .pill').last().textContent()).toBe('Approved');
  expect(await page.locator('#rvDone').textContent()).toBe(`Approved ${today()}. Tell your agent to wrap it up: it writes the Completed entry (number, CD ID, commit) and the row leaves Review.`); // D14
  expect(await page.locator('#rvCopy').count()).toBe(1); // Copy prompt itself is checked in the 420px case: its toast would replace this one's Undo
  await page.waitForFunction(() => document.activeElement?.id === 'rvSend' || document.activeElement?.id === 'rvCopy');
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
  await waitToast(page, /^CS-801 is no longer marked Approved/);
  await page.waitForFunction(() => document.querySelector('#boardMode .row[data-col="review"] .chip') === null);
  expect(await page.locator('#rvApprove').count()).toBe(1);
  expect(await page.locator('#rvDone').count()).toBe(0);
  // BL-UI-03: × hides the toast before its 8 s timer (the toast is shown again by Copy ID); a toast left alone hides by itself (D13: every toast 8 s)
  await page.keyboard.press('Escape');
  await inspClosed(page);
  await row(page, 'backlog', 0).click({ button: 'right' });
  await menuOpen(page);
  await (await item(page, 'Copy ID')).click();
  await waitToast(page, /^Copied\.$/);
  const t0 = Date.now();
  await page.click('#toast .tx');
  await toastHidden(page);
  expect(Date.now() - t0).toBeLessThan(1500);
  await row(page, 'backlog', 0).click({ button: 'right' });
  await menuOpen(page);
  await (await item(page, 'Copy ID')).click();
  await page.waitForFunction(() => document.querySelector('#toast')!.classList.contains('show') && /^Copied\.$/.test(document.querySelector('#toast')!.textContent ?? '')); // shown again (the hidden toast still holds the old text)
  const t1 = Date.now();
  await toastHidden(page, 12000); // the 8 s timer
  expect(Date.now() - t1).toBeGreaterThan(7000);
});

browserTest('Send back with a note (a line break and a | typed) writes one space and \\|, moves the row to the top of Current Sprint, closes the panel and toasts; Undo restores the file; no note gives the dot form; Escape and Cmd+Enter; the menu items', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-board');
  const before = read(env.tasks());
  await row(page, 'review', 0).click();
  await inspOpen(page);
  await page.click('#rvSend');
  await formOpen(page);
  expect(await page.locator('#rvApprove').isHidden()).toBe(true);
  expect(await page.locator('#rvSend').isHidden()).toBe(true);
  expect(await page.locator('#inspFoot label').textContent()).toBe('What needs fixing? (optional)');
  expect(await page.locator('#rvCount').textContent()).toBe('0/200');
  await page.keyboard.type('tests | docs');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('missing');
  expect(await page.locator('#rvCount').textContent()).toBe('20/200');
  // Escape cancels and returns focus to Send back; the typed text is not sent
  await page.keyboard.press('Escape');
  await formClosed(page);
  await page.waitForFunction(() => document.activeElement?.id === 'rvSend');
  await inspOpen(page);
  expect(read(env.tasks())).toBe(before);
  await page.click('#rvSend');
  await formOpen(page);
  expect(await page.inputValue('#rvNote')).toBe(''); // a fresh box
  await page.keyboard.type('tests | docs');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('missing');
  await page.click('#rvGo');
  const sent = mark(` Sent back ${today()}: tests \\| docs missing`);
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === sent, 'the row first in Current Sprint with the note (D12)');
  const after = read(env.tasks());
  expect(after.split('\n').length).toBe(before.split('\n').length);
  expect(rowsIn(after, 'Review')).toEqual([]);
  expect(after.split('\n').filter(l => !before.split('\n').includes(l))).toEqual([sent]);
  await inspClosed(page);
  await waitToast(page, /^Sent CS-801 back to Current Sprint/);
  await page.waitForFunction(i => document.activeElement?.matches(`#boardMode .row[data-col="currentSprint"][data-i="${i}"]`) ?? false, 0);
  expect(await row(page, 'currentSprint', 0).textContent()).toContain('tests \\| docs missing'); // the cell as the file has it, backslash included
  await row(page, 'currentSprint', 0).click(); // ...and in the panel's Description box
  await inspOpen(page);
  expect(await page.locator('#insp .desc').first().textContent()).toContain('tests \\| docs missing');
  await page.keyboard.press('Escape');
  await inspClosed(page);
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
  await waitToast(page, /^CS-801 is back in ## Review/);
  await page.waitForFunction(() => document.activeElement?.matches('#boardMode .row[data-col="review"][data-i="0"]') ?? false);
  // a plain move back after a send back keeps the note, which History then lists with its backslash
  await row(page, 'review', 0).click();
  await inspOpen(page);
  await page.click('#rvSend');
  await formOpen(page);
  await page.keyboard.type('a | b');
  await page.click('#rvGo');
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === mark(` Sent back ${today()}: a \\| b`), 'the second note on disk');
  await inspClosed(page);
  await waitToast(page, /^Sent CS-801 back to Current Sprint/);
  await page.waitForFunction(i => document.activeElement?.matches(`#boardMode .row[data-col="currentSprint"][data-i="${i}"]`) ?? false, 0);
  await page.keyboard.press('Alt+ArrowRight'); // Current Sprint → Review, the line as it is
  await until(() => rowsIn(read(env.tasks()), 'Review')[0] === mark(` Sent back ${today()}: a \\| b`), 'the row back in Review with its note');
  await waitToast(page, /moved from ## Current Sprint to ## Review/);
  await row(page, 'review', 0).click();
  await inspOpen(page);
  expect(await page.locator('#insp .hist .hn').allTextContents()).toEqual(['an earlier note', 'a \\| b']);
  await page.keyboard.press('Escape');
  await inspClosed(page);
  writeFileSync(env.tasks(), before); // the fixture as it was for the rest of the case
  await page.waitForFunction(() => document.querySelector('#boardMode .row[data-col="review"] .chip') === null && document.querySelectorAll('#boardMode .row[data-col="currentSprint"]').length === 2);
  // no note: the dot form, sent with Cmd/Ctrl+Enter from the box; the History of a row that was sent back before lists both notes when it comes back
  await row(page, 'review', 0).click();
  await inspOpen(page);
  await page.click('#rvSend');
  await formOpen(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  const dot = mark(` Sent back ${today()}.`);
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === dot, 'the dot form on disk');
  await inspClosed(page);
  await waitToast(page, /^Sent CS-801 back to Current Sprint/);
  // the context menu of a Review card: Approve and Send back… first, then the table's items; Send back… opens the panel with the box open
  await page.click('#toast .tact');
  await until(() => read(env.tasks()) === before, 'tasks.md back as it was');
  await waitToast(page, /^CS-801 is back in ## Review/); // the page has applied the payload (a menu opened before that would close on the redraw)
  await page.waitForFunction(() => document.activeElement?.matches('#boardMode .row[data-col="review"][data-i="0"]') ?? false);
  await row(page, 'review', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Approve', 'Send back…', 'Open details', 'Copy ID']); // D16: no plain move out of Review
  expect(await page.locator('#cardMenu .mh').count()).toBe(0);
  await (await item(page, 'Send back…')).click();
  await inspOpen(page);
  await formOpen(page);
  await page.keyboard.press('Escape');
  await formClosed(page);
  await page.keyboard.press('Escape');
  await inspClosed(page);
  await row(page, 'review', 0).click({ button: 'right' });
  await menuOpen(page);
  await (await item(page, 'Approve')).click();
  await until(() => rowsIn(read(env.tasks()), 'Review')[0] === mark(` Approved ${today()}`), 'the Approved marker on disk');
  await page.waitForFunction(() => document.querySelector('#boardMode .row[data-col="review"] .chip')?.textContent === 'Approved'); // drawn by the page's apply
  await page.keyboard.press('Escape'); // the panel the menu's Approve opened
  await inspClosed(page);
  await row(page, 'review', 0).click({ button: 'right' });
  await menuOpen(page);
  expect(await menuLabels(page)).toEqual(['Send back…', 'Open details', 'Copy ID']); // approved: no Approve item
  await page.keyboard.press('Escape');
  await menuClosed(page);
  // D15: a Review card cannot go to Completed from the page; a drag onto the lane and Alt+→ say why instead of refusing in silence
  const hint = /^Nothing moves to Completed from here\. Approve the card in Review, then tell your agent to wrap it up: it writes the Completed entry\.$/;
  const fileBeforeHint = read(env.tasks());
  await row(page, 'review', 0).dragTo(page.locator('#boardMode .gl[data-col="completed"] .gh'));
  await waitToast(page, hint);
  expect(read(env.tasks())).toBe(fileBeforeHint);
  expect(await page.locator('#boardMode .gl.drop').count()).toBe(0);
  await page.click('#toast .tx');
  await toastHidden(page);
  await row(page, 'review', 0).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await waitToast(page, hint);
  expect(read(env.tasks())).toBe(fileBeforeHint);
  expect(rowsIn(read(env.tasks()), 'Review')[0]).toBe(mark(` Approved ${today()}`)); // still in Review
  // D16: Alt+← and a drag out of Review are Send backs without a note, so an approved row loses its Approved state on the way out (the dot marker is now last) and comes back unapproved
  await row(page, 'review', 0).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  const out = mark(` Approved ${today()} Sent back ${today()}.`);
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === out, 'the approved row sent back without a note, first in Current Sprint');
  await waitToast(page, /^Sent CS-801 back to Current Sprint/);
  await page.waitForFunction(() => document.activeElement?.matches('#boardMode .row[data-col="currentSprint"][data-i="0"]') ?? false);
  await page.keyboard.press('Alt+ArrowRight'); // back to Review as a plain move: no chip now
  await until(() => rowsIn(read(env.tasks()), 'Review')[0] === out, 'the row back in Review');
  await page.waitForFunction(() => document.querySelectorAll('#boardMode .row[data-col="review"]').length === 1 && document.querySelector('#boardMode .row[data-col="review"] .chip') === null);
  await row(page, 'review', 0).dragTo(page.locator('#boardMode .gl[data-col="currentSprint"] .gh'));
  await until(() => rowsIn(read(env.tasks()), 'Current Sprint')[0] === mark(` Approved ${today()} Sent back ${today()}. Sent back ${today()}.`), 'a drag out of Review is a Send back too');
});

browserTest('a Send back refused by the server (the file changed under a slow poll) shows the text in the footer with the note kept; the Review panel, its note box, its error, the strip and the lanes have no sideways scroll at 420px', b, async open => {
  const slow = await serve(env, [env.project], { pollMs: 60000 });
  try {
    const { page } = await open(slow, '', { width: 420 });
    await waitView(page, 'v-board');
    expect(await page.$$eval('#boardMode .gl[data-col]', els => els.map(e => (e as HTMLElement).dataset.col))).toEqual(['backlog', 'currentSprint', 'review', 'completed', 'wontDo']);
    expect(await noSideScroll(page)).toBe(true);
    await page.locator('#boardMode .gl[data-col="wontDo"] [data-fold]').click();
    await page.waitForFunction(() => document.querySelector('#boardMode .gl[data-col="wontDo"] [data-fold]')?.getAttribute('aria-expanded') === 'true');
    expect(await noSideScroll(page)).toBe(true);
    await row(page, 'review', 0).click();
    await inspOpen(page);
    expect(await noSideScroll(page)).toBe(true); // idle: the footer in view once the panel has slid in
    await page.waitForFunction(() => { const r = document.querySelector('#inspFoot')!.getBoundingClientRect(); return r.left >= 0 && r.right <= 420 && r.bottom <= innerHeight; });
    await page.click('#rvSend');
    await formOpen(page);
    expect(await noSideScroll(page)).toBe(true); // the note box open
    const changed = read(env.tasks()).replace('# Task Tracking', '# Task Tracking\n\nEdited outside the page.');
    writeFileSync(env.tasks(), changed);
    await page.keyboard.type('kept note');
    await page.click('#rvGo');
    await page.locator('#rvErr').waitFor({ state: 'visible' });
    expect(await page.locator('#rvErr').textContent()).toBe(taskMover.REVIEW_STALE_ERROR);
    expect(await page.inputValue('#rvNote')).toBe('kept note');
    expect(read(env.tasks())).toBe(changed);
    expect(await noSideScroll(page)).toBe(true); // the error shown
    // a note the server refuses (over 200 code points, past the box's own limit) shows its reason the same way
    await page.evaluate(() => { (document.querySelector('#rvNote') as HTMLTextAreaElement).value = 'x'.repeat(201); });
    await page.click('#rvGo');
    await page.waitForFunction(() => document.querySelector('#rvErr')?.textContent === 'The note is longer than 200 characters.');
    expect(read(env.tasks())).toBe(changed);
    expect(await noSideScroll(page)).toBe(true);
    await page.keyboard.press('Escape');
    await formClosed(page);
    await page.click('#rvApprove'); // the page now holds the fresh hash: the approve lands, with its toast's Undo and × inside the window
    await until(() => rowsIn(read(env.tasks()), 'Review')[0] === mark(` Approved ${today()}`), 'the Approved marker on disk');
    await waitToast(page, /^CS-801 approved: marked/);
    expect(await noSideScroll(page)).toBe(true); // the approved row's note and Copy prompt in the footer at 420px
    expect(await page.locator('#rvDone').textContent()).toBe(`Approved ${today()}. Tell your agent to wrap it up: it writes the Completed entry (number, CD ID, commit) and the row leaves Review.`);
    await page.click('#rvCopy'); // D14: the wrap-up line for the agent
    await waitToast(page, /^Copied\.$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('CS-801 is approved in .specs/planning/tasks.md: write its Completed entry with the number, CD ID and commit, and remove the row from ## Review.');
    const [tl, tr] = await page.locator('#toast').evaluate(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
    expect(tl).toBeGreaterThanOrEqual(0);
    expect(tr).toBeLessThanOrEqual(420);
    expect(await noSideScroll(page)).toBe(true);
  } finally {
    await slow.close();
  }
}, [/status of 409/, /status of 422/]);
