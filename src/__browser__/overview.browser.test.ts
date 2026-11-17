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

const ROAD_OK = '# Roadmap\n\n## Timeline\n\n### Next - the plan [ROADMAP-9]\n\nLine one\n';
const decisions = '---\nfileID: SEC-002\nlastUpdated: 2026-10-11\n---\n\n# Security Decisions\n\n### [SEC-1] One\n\nx\n\n```\n### not a heading\n```\n\n### [SEC-2] Two\n\n### [SEC-3] Three\n';
const setIdes = (line: string | null) => writeFileSync(specs('project/project.yaml'), read(specs('project/project.yaml')).replace(/\nides:.*\n?/, '\n').replace(/\n?$/, '\n') + (line ? `${line}\n` : '')); // the fixture's file has no final newline

browserTest('the top band, the two columns and Spec files in order; every card\'s parts; counts and rows open their views; no author, no MCP tile', b, async o => {
  fill();
  writeFileSync(specs('security/security-decisions.md'), decisions);
  mkdirSync(join(env.project, '.claude', 'skills', 'my-skill'), { recursive: true });
  writeFileSync(join(env.project, '.claude', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\n# My skill\n');
  writeFileSync(env.tasks(), read(env.tasks()).replace('| 2 | [CD-fixture-002] | Fixture completed row |', '| 2 | [CD-fixture-002] | Fixture completed row, feature commit abc1234. |'));
  const { page } = await o(srv, '#overview', { width: 1600 });
  await waitView(page, 'v-overview');
  await card(page, 'roadmap').waitFor();
  expect(await cards(page)).toEqual(['project', 'review', 'sprint', 'recent', 'roadmap', 'security', 'guide', 'files']);
  // one h1 (the top bar's), the project name an h2, card titles h3
  expect(await page.locator('h1:visible').count()).toBe(1);
  expect(await card(page, 'project').locator('h2.ovname').innerText()).toBe('fixture-project');
  expect(await page.$$eval('#ovBox .ovcard h3', els => els.map(e => e.textContent))).toEqual(['Review', 'Current Sprint', 'Recent activity', 'Roadmap', 'Security', 'Agent Guidance', 'Spec files']);
  expect(await page.$$eval('#ovBox .ovcard:not(.ovhero)', els => els.map(e => e.querySelector('.ovsrc')?.textContent ?? ''))).toEqual(['## Review', '## Current Sprint', '.git/logs/HEAD · prompts.md · ## Completed', 'planning/roadmap.md', 'security/', '', 'newest first']);
  expect((await page.$$eval('#ovBox .ovcf .ovlink', els => els.map(e => e.textContent))).slice(0, 4)).toEqual(['Open Review in Tasks', 'All 6 in Tasks', 'Open Roadmap', 'Open Security']);
  // top band: badge, description, chips, two buttons, lanes with the board's dots, Type and Priority lines (exact match only)
  const top = card(page, 'project');
  expect(await top.locator('.ovbig').innerText()).toBe('FP');
  expect(await top.locator('.ovfact').allInnerTexts()).toEqual(['version 1.0.0', 'typescript']);
  expect(await top.locator('.ovlane').allInnerTexts()).toEqual(['3\nBacklog', '6\nCurrent Sprint', '1\nReview', '1\nCompleted']);
  expect(await top.locator('.ovlane .st').evaluateAll(els => els.map(e => e.className))).toEqual(['st hollow', 'st orange', 'st violet', 'st green']);
  expect(await top.locator('[data-mix="type"] .pill').evaluateAll(els => els.map(e => `${e.className}|${e.textContent}`))).toEqual(['pill chip ty v-feat|feat 1', 'pill chip ty v-bug|bug 1', 'pill chip ty v-chore|chore 1']);
  expect(await top.locator('[data-mix="priority"] .pill').allInnerTexts()).toEqual(['P1 1', 'P2 1']);
  // rows: ID, description, chips; footers
  expect(await card(page, 'review').locator('.ovrow .id').innerText()).toBe('CS-801');
  expect(await card(page, 'sprint').locator('[data-task]').count()).toBe(5);
  expect(await card(page, 'sprint').locator('.ovcount').innerText()).toBe('6');
  expect(await card(page, 'sprint').locator('.ovcf').innerText()).toBe('All 6 in Tasks');
  // Recent activity: three groups, nothing taken out of a row, no author
  const recent = card(page, 'recent');
  expect(await recent.locator('.ovsub').allInnerTexts()).toEqual(['Commits', 'Prompt log', 'Completed']);
  expect(await recent.locator('.ovcommit .id').allInnerTexts()).toEqual(['2222222', '1111111']);
  expect(await recent.locator('.ovcommit .when').first().innerText()).toBe(await page.evaluate(() => (window as unknown as { when: (s: string) => string }).when('2025-11-16T13:33:22+00:00')));
  expect(await recent.innerText()).not.toMatch(/Ann Author|ann@example/);
  expect(await recent.locator('.ovdone .id').innerText()).toBe('#2 [CD-fixture-002]');
  expect(await recent.locator('.ovdone .d').innerText()).toBe('Fixture completed row, feature commit abc1234.');
  const long = recent.locator('.ovprompt .d').first();
  expect(await long.evaluate(el => getComputedStyle(el).webkitLineClamp)).toBe('2');
  expect(await long.evaluate(el => el.scrollHeight > el.clientHeight && el.textContent!.includes('END-OF-ENTRY'))).toBe(true);
  // Roadmap, Security (decisions outside fences only), Agent Guidance (no MCP), Spec files
  expect(await card(page, 'roadmap').locator('.ovroad :is(h3, h4)').innerText()).toContain('Next - the plan [ROADMAP-9]');
  expect(await card(page, 'security').locator('.ovfile .p').allInnerTexts()).toEqual(['security/threat-model.md', 'security/security-decisions.md']);
  await page.waitForFunction(() => !(document.querySelector('#ovDec') as HTMLElement).hidden);
  expect(await page.locator('#ovDec').innerText()).toBe('Decisions\n3');
  expect(await card(page, 'guide').innerText()).not.toMatch(/MCP/);
  expect(await card(page, 'guide').locator('.ovtile .k').allInnerTexts()).toEqual(['Instructions', 'Commands', 'Skills']);
  expect(await card(page, 'guide').locator('.ovtile .v').allInnerTexts()).toEqual(['1 of 7', '0', '1']);
  expect(await card(page, 'guide').locator('.ovtile small').allInnerTexts()).toEqual(['CLAUDE.md', 'From SpecPilot 0 · Yours 0', 'From SpecPilot 0 · Yours 1 · my-skill']);
  expect(await page.$eval('.src .srow[data-v="overview"] use', el => el.getAttribute('href'))).toBe('#i-grid');
  expect(await page.locator('#gAuto').innerText()).toMatch(/^Agent Guidance$/i);
  const files = card(page, 'files');
  expect(await files.locator('.ovfile').count()).toBe(8);
  const n = await files.locator('.ovcount').innerText();
  expect(await files.locator('.ovcf').innerText()).toBe(`All ${n} in Explorer`);
  // targets and focus
  const heights = await page.$$eval('#ovBox :is(.ovrow, .ovlink, .btn, .ovtile, .ovfile, .ovmix)', els => els.map(e => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
  await card(page, 'review').locator('[data-task]').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await card(page, 'review').locator('[data-task]').evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
  // navigation: the long prompt opens prompts.md whole; All in Explorer; a lane and Open Tasks open Tasks; a Review row its details
  await long.click();
  await waitView(page, 'v-file');
  await page.waitForFunction(() => document.querySelector('#fileBody')?.textContent?.includes('END-OF-ENTRY') ?? false);
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'files').locator('.ovlink').click();
  await waitView(page, 'v-explorer');
  expect(String(await page.locator('#exBody .row.act').count())).toBe(n);
  for (const sel of ['.ovlane', '[data-mix="type"]', 'button.btn.pri']) {
    await page.goto(`${srv.url}/#overview`);
    await waitView(page, 'v-overview');
    await card(page, 'project').locator(sel).first().click();
    await waitView(page, 'v-board');
  }
  // Security's rows, its decisions tile and its footer open Security; the Roadmap footer opens roadmap.md
  for (const sel of ['.ovfile', '#ovDec', '.ovcf .ovlink']) {
    await page.goto(`${srv.url}/#overview`);
    await waitView(page, 'v-overview');
    if (sel === '#ovDec') await page.waitForFunction(() => !(document.querySelector('#ovDec') as HTMLElement).hidden);
    await card(page, 'security').locator(sel).first().click();
    await waitView(page, 'v-security');
  }
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'roadmap').locator('.ovcf .ovlink').click();
  await waitView(page, 'v-file');
  expect(await page.evaluate(() => location.hash)).toBe('#file/planning/roadmap.md');
  await page.goto(`${srv.url}/#overview`);
  await waitView(page, 'v-overview');
  await card(page, 'review').locator('[data-task]').click();
  await waitView(page, 'v-board');
  await page.waitForFunction(() => document.querySelector('#insp')!.classList.contains('open') && document.querySelector('#insp .ih .id')?.textContent === 'CS-801');
});

browserTest('Review always shows, with the board\'s sentence when empty; All <n> in Tasks always; an empty activity group is left out; Security left out without its files; live reload redraws', b, async o => {
  rmSync(specs('development/prompts.md'));
  for (const f of ['security/security-decisions.md', 'security/threat-model.md']) rmSync(specs(f));
  writeFileSync(specs('planning/roadmap.md'), ROAD_OK);
  writeFileSync(env.tasks(), read(env.tasks()).replace(/\| CS-801 \|[^\n]*\n/, ''));
  const { page } = await o(srv, '#overview');
  await waitView(page, 'v-overview');
  await card(page, 'roadmap').waitFor();
  expect(await cards(page)).toEqual(['project', 'review', 'sprint', 'recent', 'roadmap', 'guide', 'files']);
  expect(await card(page, 'review').locator('.ovempty').innerText()).toBe('Nothing waiting for you. Agents move finished work here.');
  expect(await card(page, 'review').locator('.ovcf').innerText()).toBe('Open Review in Tasks');
  expect(await card(page, 'sprint').locator('.ovcf').innerText()).toBe('All 1 in Tasks');
  expect(await card(page, 'recent').locator('.ovsub').allInnerTexts()).toEqual(['Completed']); // no .git log, no prompts
  const rev = await page.evaluate(() => Number(document.documentElement.dataset.rev || 0));
  writeFileSync(specs('project/project.yaml'), read(specs('project/project.yaml')).replace('description: A typescript project', 'description: Changed outside the page'));
  await page.waitForFunction(r => Number(document.documentElement.dataset.rev || 0) > r, rev);
  await page.waitForFunction(() => document.querySelector('#ovBox [data-card="project"]')?.textContent?.includes('Changed outside the page') ?? false);
});

const ROAD_CASES: [string, string | null, string[], string, boolean][] = [
  ['norel', '# Roadmap\n\n## Timeline\n\nIntro only.\n', ['Warning ## Timeline in planning/roadmap.md has no ### release', 'The card shows the last ### heading under ## Timeline and its first lines, and there is none.', 'Fix: add a ### heading for the next release under ## Timeline, with its first lines, best done by your AI IDE.'], 'In .specs/planning/roadmap.md, add a ### heading for the next release under ## Timeline, with its first lines, so SpecPilot’s Overview shows the next release.', true],
  ['notl', '# Roadmap\n\n## Milestones\n\n### v1\n', ['Warning planning/roadmap.md has no ## Timeline', 'The card shows the last ### release under ## Timeline, and the file has no such section.', 'Fix: add a ## Timeline section with a ### heading for the next release, best done by your AI IDE.'], 'In .specs/planning/roadmap.md, add a ## Timeline section with a ### heading for the next release, so SpecPilot’s Overview shows the next release.', true],
  ['nofile', null, ['Warning No planning/roadmap.md in .specs/', 'Every project needs a roadmap; the card shows its latest release.', 'Fix: create planning/roadmap.md with a ## Timeline section and a ### heading for the next release, best done by your AI IDE.'], 'Create .specs/planning/roadmap.md with a ## Timeline section and a ### heading for the next release, so SpecPilot’s Overview shows it.', false],
];
for (const [kind, text, lines, prompt, openBtn] of ROAD_CASES) {
  browserTest(`a roadmap without a release (${kind}): the flagged card word for word, its Copy prompt, the banner`, b, async o => {
    if (text === null) rmSync(specs('planning/roadmap.md'));
    else writeFileSync(specs('planning/roadmap.md'), text);
    const { page } = await o(srv, '#overview');
    await waitView(page, 'v-overview');
    await card(page, 'roadmap').waitFor();
    const rc = card(page, 'roadmap');
    expect(await rc.evaluate(el => el.classList.contains('flag'))).toBe(true);
    expect(await rc.locator('.msg.warn .mt').evaluate(el => el.textContent)).toBe(lines[0]); // .mw is drawn in capitals
    expect(await rc.locator('.msg.warn p').allInnerTexts()).toEqual(lines.slice(1));
    expect(await rc.locator('[data-prompt]').getAttribute('data-prompt')).toBe(prompt);
    expect(await rc.locator('button', { hasText: 'Open Roadmap' }).count()).toBe(openBtn ? 1 : 0);
    expect(await rc.locator('[role="alert"]').count()).toBe(0);
    expect(await page.locator('#ovFlag').innerText()).toBe('This project’s roadmap has no release to show. The Roadmap card says what to fix.');
    await rc.locator('[data-prompt]').click();
    await page.waitForFunction(p => navigator.clipboard.readText().then(t => t === p), prompt);
  });
}

browserTest('the IDE button: Cursor for a Cursor project, Copy folder path for a terminal agent (and its refused toast), VS Code when none is known; the top bar unchanged', b, async o => {
  writeFileSync(specs('planning/roadmap.md'), ROAD_OK);
  setIdes('ides: [cursor]');
  let { page } = await o(srv, '#overview');
  await waitView(page, 'v-overview');
  const btn = () => card(page, 'project').locator('.ovacts > :nth-child(2)');
  expect(await btn().innerText()).toBe('Open in Cursor');
  expect(await btn().getAttribute('href')).toMatch(/^cursor:\/\/file\//);
  expect(await page.getAttribute('#editorBtn', 'aria-label')).toBe('Open in VS Code');
  setIdes('ides: [claude-code]');
  ({ page } = await o(srv, '#overview'));
  await waitView(page, 'v-overview');
  expect(await btn().innerText()).toBe('Copy folder path');
  await btn().click();
  const root = await page.evaluate(() => document.querySelector('#subPath')!.textContent!.split(' · ')[0]);
  await page.waitForFunction(r => navigator.clipboard.readText().then(t => t === r), root);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
  await btn().click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.startsWith('Could not copy.') ?? false);
  setIdes(null);
  rmSync(join(env.project, 'CLAUDE.md'));
  ({ page } = await o(srv, '#overview'));
  await waitView(page, 'v-overview');
  expect(await btn().innerText()).toBe('Open in VS Code');
  expect(await btn().getAttribute('href')).toBe(await page.getAttribute('#editorBtn', 'href'));
});

browserTest('two columns at 1600px, the left cards first in one column at 1100px; at 860px lane tiles two by two', b, async o => {
  fill();
  const { page } = await o(srv, '#overview', { width: 1600 });
  await waitView(page, 'v-overview');
  await card(page, 'roadmap').waitFor();
  const left = await card(page, 'review').evaluate(el => el.getBoundingClientRect().left);
  const right = await card(page, 'roadmap').evaluate(el => el.getBoundingClientRect().left);
  expect(right).toBeGreaterThan(left + 300);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ovBox .ovcols')!).gridTemplateColumns.split(' ').length === 1);
  const tops = await page.$$eval('#ovBox .ovcols .ovcard', els => els.map(e => [(e as HTMLElement).dataset.card, e.getBoundingClientRect().top] as [string, number]));
  expect(tops.slice().sort((a, b) => a[1] - b[1]).map(x => x[0])).toEqual(['review', 'sprint', 'recent', 'roadmap', 'security', 'guide']);
  await page.setViewportSize({ width: 860, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ovBox .ovlanes')!).gridTemplateColumns.split(' ').length === 2);
  expect(await noSideScroll(page)).toBe(true);
});

browserTest('with --read-only Overview is the same, with no MCP tile', b, async o => {
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await o(ro);
    await waitView(page, 'v-overview');
    await card(page, 'files').waitFor();
    await card(page, 'roadmap').waitFor();
    expect(await cards(page)).toEqual(['project', 'review', 'sprint', 'recent', 'roadmap', 'security', 'guide', 'files']);
    expect(await card(page, 'guide').innerText()).not.toMatch(/MCP/);
  } finally {
    await ro.close();
  }
});

const STATES: [string, () => void][] = [
  ['full', () => fill()],
  ['sparse, Review empty', () => { writeFileSync(specs('planning/roadmap.md'), ROAD_OK); rmSync(specs('development/prompts.md')); writeFileSync(env.tasks(), read(env.tasks()).replace(/\| CS-801 \|[^\n]*\n/, '')); }],
  ['no ### release', () => writeFileSync(specs('planning/roadmap.md'), '# Roadmap\n\n## Timeline\n\nIntro only.\n')],
  ['no ## Timeline', () => writeFileSync(specs('planning/roadmap.md'), '# Roadmap\n\n## Milestones\n')],
  ['no roadmap.md', () => rmSync(specs('planning/roadmap.md'))],
  ['Copy folder path', () => { fill(); setIdes('ides: [claude-code]'); }],
];
for (const [width, isLight] of [[420, false], [420, true], [1024, false], [1024, true]] as const) {
  browserTest(`at ${width}px nothing scrolls sideways in every state (${isLight ? 'light' : 'dark'})`, b, async o => {
    for (const [name, set] of STATES) {
      const fresh = makeEnv();
      try {
        const prev = env;
        env = fresh;
        set();
        env = prev;
        const s = await serve(fresh, [fresh.project]);
        try {
          const { page } = await o(s, '#overview', { width, light: isLight });
          await waitView(page, 'v-overview');
          await page.locator('#ovBox [data-card="roadmap"]').waitFor();
          if (width <= 860) expect(await page.$eval('#ovBox .ovlanes', el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
          expect([name, await noSideScroll(page)]).toEqual([name, true]);
        } finally {
          await s.close();
        }
      } finally {
        fresh.cleanup();
      }
    }
  });
}
