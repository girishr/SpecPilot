// Overview, each project's landing page (BL-171, REQ-002.H.76, SEC-004.38), TESTS-002.4.
// The fixture project's known rows; each test writes its own roadmap Timeline, prompts.md entries and .git/logs/HEAD.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, read, serve, Served, waitView } from './harness';

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

const specs = (rel: string) => join(env.project, '.specs', rel);
const LONG = '- 2026-11-17: ' + 'a long entry '.repeat(240) + 'END-OF-ENTRY';
/** Every card's data: a Timeline, three prompt entries (one long), a reflog with an author, odd-case Type and Priority, six sprint rows. */
function fill(): void {
  writeFileSync(specs('planning/roadmap.md'), '# Roadmap\n\n## Timeline\n\nIntro.\n\n### v1 shipped\n\n- old\n\n### Next - the plan [ROADMAP-9]\n\nLine one\n\nLine two\nLine three\nLine four\nLine five\nLine six\n\n## Risks\n\nnone\n');
  writeFileSync(specs('development/prompts.md'), `# Prompts\n\n## Latest Entries\n${LONG}\n- 2026-11-16: second entry\n- 2026-11-15: third entry\n- 2026-11-01: fourth entry\n`);
  mkdirSync(join(env.project, '.git', 'logs'), { recursive: true });
  const e = (n: number, msg: string) => `${'a'.repeat(40)} ${String(n).repeat(40)} Ann Author <ann@example.com> ${1763300000 + n} +0000\tcommit: ${msg}\n`;
  writeFileSync(join(env.project, '.git', 'logs', 'HEAD'), e(1, 'first commit') + e(2, 'second commit'));
  const t = read(env.tasks());
  const sprint = [2, 3, 4, 5, 6].map(n => `| CS-00${n} |  |  | Sprint row ${n} |`).join('\n');
  writeFileSync(env.tasks(), t.replace('| BL-002 |  |  | Fixture backlog row two |', '| BL-002 |  |  | Fixture backlog row two |\n| BL-003 | Feat | p1 | Odd case |').replace('| CS-001 | bug | P2 | Fixture sprint row |', '| CS-001 | bug | P2 | Fixture sprint row |\n' + sprint));
}
const card = (page: Page, key: string) => page.locator(`#ovBox [data-card="${key}"]`);
const cards = (page: Page) => page.$$eval('#ovBox .ovcard', els => els.map(e => (e as HTMLElement).dataset.card));

browserTest('serve start, a tile and an empty hash land on Overview; the row is current; the palette lists it first; 1 still opens Tasks', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  expect(await page.evaluate(() => location.hash)).toBe('#overview');
  expect(await page.textContent('#title')).toBe('Overview');
  expect(await page.getAttribute('.src .srow[data-v="overview"]', 'aria-current')).toBe('page');
  await page.keyboard.press('1');
  await waitView(page, 'v-board');
  await page.click('#projList [data-project="0"]');
  await waitView(page, 'v-board'); // the shown project's tile on a project view keeps the view
  await page.click('#homeBtn');
  await waitView(page, 'v-home');
  await page.click('#projList [data-project="0"]');
  await waitView(page, 'v-overview');
  await page.keyboard.press('Meta+k');
  await page.locator('#palList li').first().waitFor();
  expect(await page.textContent('#palList li .lbl')).toBe('Overview');
});

browserTest('the cards show the files\' own text; counts open their views; rows open their details; no author and no MCP line', b, async o => {
  fill();
  const { page } = await o(srv, '#overview');
  await waitView(page, 'v-overview');
  await card(page, 'roadmap').waitFor();
  expect(await cards(page)).toEqual(['project', 'tasks', 'review', 'sprint', 'roadmap', 'recent', 'ide', 'files']);
  expect(await card(page, 'project').locator('.ovkv').allInnerTexts()).toEqual(['name\nfixture-project', 'description\nA typescript project', 'version\n1.0.0', 'language\ntypescript']);
  expect(await card(page, 'tasks').locator('.ovlane').allInnerTexts()).toEqual(['3\nBacklog', '6\nCurrent Sprint', '1\nReview', '1\nCompleted']);
  // exact match on the served cell: Feat and p1 are not counted
  expect(await card(page, 'tasks').locator('.ovcount .v').allInnerTexts()).toEqual(['feat 1 · bug 1 · chore 1', 'P1 1 · P2 1']);
  expect(await card(page, 'sprint').locator('[data-task]').count()).toBe(5);
  expect(await card(page, 'sprint').locator('.ovmore').innerText()).toBe('All 6 in Tasks');
  expect(await card(page, 'roadmap').locator('.ovroad :is(h3, h4)').innerText()).toContain('Next - the plan [ROADMAP-9]'); // the heading verbatim
  expect(await card(page, 'roadmap').innerText()).toContain('Line five');
  expect(await card(page, 'roadmap').innerText()).not.toContain('Line six');
  const recent = card(page, 'recent');
  expect(await recent.locator('.ovcommit .mono').allInnerTexts()).toEqual(['2222222', '1111111']);
  expect(await recent.locator('.ovcommit .det').first().innerText()).toBe(await page.evaluate(() => (window as unknown as { when: (s: string) => string }).when('2025-11-16T13:33:22+00:00')));
  expect(await recent.innerText()).not.toMatch(/Ann Author|ann@example/);
  expect(await recent.innerText()).toContain('Fixture completed row');
  const long = recent.locator('[data-f="development/prompts.md"] .ttl').first();
  expect(await long.evaluate(el => getComputedStyle(el).webkitLineClamp)).toBe('3');
  expect(await long.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await card(page, 'ide').innerText()).not.toMatch(/MCP/);
  expect(await card(page, 'ide').locator('.ovcount .v').first().innerText()).toBe(await page.evaluate(() => {
    const t = document.querySelector('#insMeta')!.textContent!;
    return t;
  }));
  const files = card(page, 'files');
  expect(await files.locator('[data-f]').count()).toBe(8);
  const all = await files.locator('.ovmore').innerText();
  // the long prompt opens prompts.md with the whole entry
  await long.click();
  await waitView(page, 'v-file');
  await page.waitForFunction(() => document.querySelector('#fileBody')?.textContent?.includes('END-OF-ENTRY') ?? false);
  // All <n> in Explorer: n is what Explorer lists
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'files').locator('.ovmore').click();
  await waitView(page, 'v-explorer');
  expect(all).toBe(`All ${await page.locator('#exBody .row.act').count()} in Explorer`);
  // a count opens Tasks; a Review row opens its details there
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'tasks').locator('.ovlane').first().click();
  await waitView(page, 'v-board');
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'review').locator('[data-task]').click();
  await waitView(page, 'v-board');
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open') && document.querySelector('#insp .ih .id')?.textContent === 'CS-801');
});

browserTest('a card with nothing to show is left out; live reload redraws a card', b, async o => {
  rmSync(specs('development/prompts.md'));
  writeFileSync(env.tasks(), read(env.tasks()).replace('| 2 | [CD-fixture-002] | Fixture completed row |\n', ''));
  const { page } = await o(srv, '#overview');
  await waitView(page, 'v-overview');
  await card(page, 'files').waitFor();
  expect(await cards(page)).toEqual(['project', 'tasks', 'review', 'sprint', 'ide', 'files']); // no Timeline, no .git log, no prompts, no Completed rows
  const rev = await page.evaluate(() => Number(document.documentElement.dataset.rev || 0));
  writeFileSync(specs('project/project.yaml'), read(specs('project/project.yaml')).replace('description: A typescript project', 'description: Changed outside the page'));
  await page.waitForFunction(r => Number(document.documentElement.dataset.rev || 0) > r, rev);
  await page.waitForFunction(() => document.querySelector('#ovBox [data-card="project"]')?.textContent?.includes('Changed outside the page') ?? false);
});

browserTest('two columns when the content area is 901px or wider, one below', b, async o => {
  const cols = (page: Page) => page.$eval('#ovBox', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  const { page } = await o(srv, '#overview', { width: 1600 });
  await waitView(page, 'v-overview');
  expect(await page.$eval('#v-overview', el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(901);
  expect(await cols(page)).toBe(2);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForFunction(() => document.querySelector('#v-overview')!.getBoundingClientRect().width < 901);
  expect(await cols(page)).toBe(1);
});

browserTest('with --read-only Overview is the same, with no MCP line', b, async o => {
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await o(ro);
    await waitView(page, 'v-overview');
    await card(page, 'files').waitFor();
    expect(await cards(page)).toEqual(['project', 'tasks', 'review', 'sprint', 'recent', 'ide', 'files']);
    expect(await card(page, 'ide').innerText()).not.toMatch(/MCP/);
  } finally {
    await ro.close();
  }
});

for (const isLight of [false, true]) {
  browserTest(`at 420px the lane tiles are two by two and nothing scrolls sideways: every card, cards left out, during a live reload (${isLight ? 'light' : 'dark'})`, b, async o => {
    fill();
    const { page } = await o(srv, '#overview', { width: 420, light: isLight });
    await waitView(page, 'v-overview');
    await card(page, 'roadmap').waitFor();
    const lanes = () => page.$eval('#ovBox .ovlanes', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(await lanes()).toBe(2);
    expect(await noSideScroll(page)).toBe(true); // every card
    const rev = await page.evaluate(() => Number(document.documentElement.dataset.rev || 0));
    rmSync(specs('development/prompts.md'));
    writeFileSync(specs('planning/roadmap.md'), '# Roadmap\n');
    rmSync(join(env.project, '.git', 'logs'), { recursive: true });
    expect(await noSideScroll(page)).toBe(true); // during the reload
    await page.waitForFunction(r => Number(document.documentElement.dataset.rev || 0) > r, rev);
    await page.waitForFunction(() => !document.querySelector('#ovBox [data-card="roadmap"]'));
    expect(await lanes()).toBe(2);
    expect(await noSideScroll(page)).toBe(true); // cards left out
  });
}
