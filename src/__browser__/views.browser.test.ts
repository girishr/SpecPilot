// Project views: Commands and Skills with Regenerate All (BL-PM-006), the Open in VS Code link (BL-PM-008), Open in AI IDE
// (BL-PM-010) and the per-file Open in VS Code links (BL-PM-013), TESTS-002.4.
import { Browser } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Page } from 'playwright-core';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, remember, routeJs, serve, Served, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let odd: string;
let empty: string;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  // the user's own command and skill, and SpecPilot's skill path
  mkdirSync(join(env.project, '.claude', 'commands'), { recursive: true });
  writeFileSync(join(env.project, '.claude', 'commands', 'mine.md'), '---\ndescription: Mine\n---\n\nMy command.\n');
  for (const dir of ['specpilot-project', 'my-skill']) {
    mkdirSync(join(env.project, '.claude', 'skills', dir), { recursive: true });
    writeFileSync(join(env.project, '.claude', 'skills', dir, 'SKILL.md'), `---\nname: ${dir}\n---\n\nA skill.\n`);
  }
  odd = makeProject(join(env.home, 'dev'), 'My Projé 日本');
  empty = join(env.home, 'dev', 'empty-folder');
  mkdirSync(empty);
  srv = await serve(env, [env.project, odd, empty]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;
const PROJECT_VIEWS = ['#board', '#file/planning/roadmap.md', '#file/project/requirements.md', '#explorer', '#file/architecture/architecture.md', '#file/quality/tests.md', '#security', '#instructions', '#commands', '#skills'];

browserTest('Commands and Skills split into From SpecPilot and Yours; Regenerate All shows its result lines and gives focus back', b, async open => {
  const { page } = await open(srv, '#commands');
  await waitView(page, 'v-commands');
  expect(await page.locator('#v-commands').textContent()).toContain('From SpecPilot');
  expect(await page.locator('#cmdYouCnt').textContent()).toBe('1');
  expect(await page.locator('#cmdSpCnt').textContent()).toBe('0');
  await page.locator('#cmdRegen').focus();
  await page.keyboard.press('Enter');
  await page.locator('#regenNote').waitFor({ state: 'visible' });
  expect(await page.locator('#regenNote').textContent()).toMatch(/^Added: \.claude\/commands\/specpilot-/);
  await page.waitForFunction(() => document.activeElement?.id === 'cmdRegen');
  await page.waitForFunction(() => Number(document.querySelector('#cmdSpCnt')!.textContent) > 0);
  expect(existsSync(join(env.project, '.claude', 'commands', 'specpilot-status.md'))).toBe(true);
  expect(await page.locator('#cmdYouCnt').textContent()).toBe('1');
  await page.goto(`${srv.url}/#skills`);
  await waitView(page, 'v-skills');
  expect(await page.locator('#sklSpCnt').textContent()).toBe('1');
  expect(await page.locator('#sklYouCnt').textContent()).toBe('1');
  expect(await page.locator('#sklBox').textContent()).toContain('.claude/skills/specpilot-project/SKILL.md');
});

browserTest('Open in VS Code: on every project view and guided setup, encoded for spaces and non-ASCII, never on Home or New project', b, async open => {
  const { page } = await open(srv);
  for (const [n, root] of [[0, env.project], [1, odd]] as const) {
    for (const hash of PROJECT_VIEWS) {
      await page.goto(`${srv.url}/${n ? `#${n}/${hash.slice(1)}` : hash}`);
      // the hash changes first; the link follows once the project's /api/specs has been drawn
      const want = routeJs.editorUrl(root);
      await page.waitForFunction(
        ([h, href]) => location.hash === h && !document.querySelector<HTMLElement>('#editorBtn')!.hidden && document.querySelector('#editorBtn')!.getAttribute('href') === href,
        [n ? `#${n}/${hash.slice(1)}` : hash, want],
      );
      expect(await page.locator('#subName').isVisible()).toBe(true);
    }
  }
  expect(routeJs.editorUrl(odd)).toContain('My%20Proj%C3%A9%20%E6%97%A5%E6%9C%AC');
  await page.goto(`${srv.url}/#2/setup`);
  await waitView(page, 'v-chat');
  await page.locator('#setupStart').waitFor({ state: 'visible' });
  expect(await page.locator('#editorBtn').isVisible()).toBe(true);
  expect(await page.locator('#editorBtn').getAttribute('href')).toBe(routeJs.editorUrl(empty));
  for (const hash of ['#home', '#new']) {
    await page.goto(`${srv.url}/${hash}`);
    await waitView(page, hash === '#home' ? 'v-home' : 'v-chat');
    expect(await page.locator('#editorBtn').isHidden()).toBe(true);
  }
});

browserTest('with --read-only the link is on every project view, and there is no Regenerate All', b, async open => {
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await open(ro);
    for (const hash of PROJECT_VIEWS) {
      await page.goto(`${ro.url}/${hash}`);
      await page.waitForFunction(h => location.hash === h, hash);
      expect(await page.locator('#editorBtn').isVisible()).toBe(true);
    }
    expect(await page.locator('#cmdRegen').isHidden()).toBe(true);
  } finally {
    await ro.close();
  }
});

// ---------------- Open in AI IDE (BL-PM-010) ----------------
const RULES = ['.cursor', 'rules', 'specpilot.mdc'];
const ONB = ['.specs', 'development', 'onboarding.md'];
const cursorOn = (root: string) => {
  mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(root, ...RULES), '---\nalwaysApply: true\n---\n');
};
const onboarding = (prompt: string) => `---\ntitle: Onboarding Prompt\n---\n\n> **One-time file — delete after use.**\n\n---\n\n${prompt}\n`;
/** Open the menu and give back its items as [label, href or null]. */
async function ideItems(page: Page): Promise<[string, string | null][]> {
  await page.locator('#ideBtn').click();
  await page.locator('#ideMenu').waitFor({ state: 'visible' });
  return page.$$eval('#ideMenu [role=menuitem]', els => els.map(e => [e.textContent!, e.getAttribute('href')] as [string, string | null]));
}

/** Live reloads the page has drawn: `redraw()` counts them on <html data-rev>, so a test that changes a file
    waits for the redraw itself before it opens the menu (a redraw closes an open menu). */
const rev = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.rev ?? 0));
const redrawn = (page: Page, before: number) => page.waitForFunction(n => Number(document.documentElement.dataset.rev ?? 0) > n, before);

browserTest('Open in AI IDE: Cursor and the onboarding prompt, only when they apply, never on Home, New project or Home rows', b, async open => {
  const { page } = await open(srv, '#board');
  await waitView(page, 'v-board');
  expect(await page.locator('#ideWrap').isHidden()).toBe(true); // no Cursor rules, no onboarding.md
  cursorOn(env.project);
  await page.reload();
  await page.locator('#ideBtn').waitFor({ state: 'visible' });
  expect(await ideItems(page)).toEqual([['Open in Cursor', routeJs.editorUrl(env.project, 0, 'cursor')]]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#ideMenu')!.hidden && document.activeElement?.id === 'ideBtn');

  // onboarding.md appears outside the page: live reload brings the prompt items
  const prompt = 'You are the specification co-pilot for "spec-project".\nFill every file & keep #IDs, 100% of them. Étape 日本.';
  let r = await rev(page);
  writeFileSync(join(env.project, ...ONB), onboarding(prompt));
  await redrawn(page, r);
  const items = await ideItems(page);
  expect(items.map(i => i[0])).toEqual(['Open in Cursor', 'Send onboarding prompt to Cursor', 'Copy onboarding prompt']);
  expect(items[1][1]).toBe(routeJs.cursorPromptUrl(prompt));
  expect(new URL(items[1][1]!).searchParams.get('text')).toBe(prompt);
  // keys: focus starts on the first item; Down moves on, Up wraps from the first to the last
  const focused = () => page.evaluate(() => document.activeElement?.textContent);
  expect(await focused()).toBe('Open in Cursor');
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('Send onboarding prompt to Cursor');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focused()).toBe('Copy onboarding prompt');
  // a click outside closes it
  await page.locator('#title').click();
  await page.locator('#ideMenu').waitFor({ state: 'hidden' });
  expect(await page.locator('#ideBtn').getAttribute('aria-expanded')).toBe('false');
  // so does live reload: a watched file changes while it is open
  await ideItems(page);
  r = await rev(page);
  writeFileSync(env.tasks(), readFileSync(env.tasks(), 'utf-8') + '\n');
  await redrawn(page, r);
  expect(await page.locator('#ideMenu').isHidden()).toBe(true);
  expect(await page.locator('#ideBtn').getAttribute('aria-expanded')).toBe('false');
  await ideItems(page);
  await page.locator('#ideMenu [role=menuitem]', { hasText: 'Copy onboarding prompt' }).click();
  await waitToast(page, /^Copied\. Paste it into Claude Code started in .*spec-project, or into your IDE’s chat\.$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  expect(await page.locator('#ideMenu').isHidden()).toBe(true);

  // a prompt too long for a link: the Cursor item copies instead
  const long = 'x '.repeat(4000).trim();
  expect(routeJs.cursorPromptUrl(long)).toBeNull();
  r = await rev(page);
  writeFileSync(join(env.project, ...ONB), onboarding(long));
  await redrawn(page, r);
  expect((await ideItems(page))[1]).toEqual(['Send onboarding prompt to Cursor', null]);
  await page.locator('#ideMenu [role=menuitem]', { hasText: 'Send onboarding prompt to Cursor' }).click();
  await waitToast(page, /^The prompt is too long for a Cursor link\. Copied; paste it into Cursor’s chat\.$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(long);

  // the clipboard refuses
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) }));
  await ideItems(page);
  await page.locator('#ideMenu [role=menuitem]', { hasText: 'Copy onboarding prompt' }).click();
  await waitToast(page, /^Could not copy\. Open development\/onboarding\.md and copy it\.$/);

  // onboarding.md deleted: back to Open in Cursor only
  r = await rev(page);
  rmSync(join(env.project, ...ONB));
  await redrawn(page, r);
  expect(await ideItems(page)).toEqual([['Open in Cursor', routeJs.editorUrl(env.project, 0, 'cursor')]]);
  await page.keyboard.press('Escape');

  // the other project's path, with spaces and non-ASCII
  cursorOn(odd);
  await page.goto(`${srv.url}/#1/board`);
  // drawn from project 1's data: its folder in the VS Code link (the button alone may still be project 0's)
  await page.waitForFunction(href => document.querySelector('#editorBtn')!.getAttribute('href') === href && !document.querySelector<HTMLElement>('#ideWrap')!.hidden, routeJs.editorUrl(odd));
  const [[, href]] = await ideItems(page);
  await page.goto(`${srv.url}/#1/explorer`); // a view switch closes the open menu
  await page.locator('#ideMenu').waitFor({ state: 'hidden' });
  expect(href).toBe(routeJs.editorUrl(odd, 0, 'cursor'));
  expect(href).toContain('cursor://file/');
  expect(href).toContain('My%20Proj%C3%A9%20%E6%97%A5%E6%9C%AC');

  // guided setup (no .specs/): Open in Cursor only
  cursorOn(empty);
  await page.goto(`${srv.url}/#2/setup`);
  await waitView(page, 'v-chat');
  await page.locator('#setupStart').waitFor({ state: 'visible' });
  await page.waitForFunction(href => document.querySelector('#editorBtn')!.getAttribute('href') === href && !document.querySelector<HTMLElement>('#ideWrap')!.hidden, routeJs.editorUrl(empty));
  expect(await ideItems(page)).toEqual([['Open in Cursor', routeJs.editorUrl(empty, 0, 'cursor')]]);

  for (const hash of ['#home', '#new']) {
    await page.goto(`${srv.url}/${hash}`);
    await waitView(page, hash === '#home' ? 'v-home' : 'v-chat');
    expect(await page.locator('#ideWrap').isHidden()).toBe(true);
  }
  remember(env, [env.project, odd]); // both have the Cursor rules file
  await page.goto(`${srv.url}/#home`);
  await page.locator('#homeBox .hrow').nth(1).waitFor();
  expect(await page.locator('#homeBox .hrow a[href^="vscode:"]').count()).toBe(2);
  expect(await page.locator('#homeBox').innerHTML()).not.toMatch(/AI IDE|cursor:/);
});

browserTest('Open in AI IDE with --read-only, and its menu at 420px in light, with no sideways scroll', b, async open => {
  cursorOn(env.project);
  const ro = await serve(env, [env.project], { readOnly: true });
  try {
    const { page } = await open(ro, '#board');
    await page.locator('#ideBtn').waitFor({ state: 'visible' });
    expect(await ideItems(page)).toEqual([['Open in Cursor', routeJs.editorUrl(env.project, 0, 'cursor')]]);
    const narrow = await open(ro, '#board', { width: 420, light: true });
    await narrow.page.locator('#ideBtn').waitFor({ state: 'visible' });
    await ideItems(narrow.page);
    const box = (await narrow.page.locator('#ideMenu').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(420);
    expect(await noSideScroll(narrow.page)).toBe(true);
  } finally {
    await ro.close();
  }
});

// ---------------- per-file Open in VS Code (BL-PM-013) ----------------
browserTest('Open in VS Code on the file view and the Instructions, Commands and Skills inspectors; not in Explorer or Security, nor for a gone file', b, async open => {
  const { page } = await open(srv, '#file/planning/roadmap.md');
  const fileLink = (p: string) => page.waitForFunction(
    href => document.querySelector('#fmBox .gh a.more')?.getAttribute('href') === href, routeJs.editorUrl(`${env.project}/.specs/${p}`));
  await fileLink('planning/roadmap.md');
  expect(await page.locator('#fmBox .box').count()).toBe(1); // the front matter box, the link in its header
  await page.goto(`${srv.url}/#file/project/project.yaml`);
  await fileLink('project/project.yaml');
  expect(await page.locator('#fmBox .box').count()).toBe(0); // YAML: the header line only
  expect(await page.locator('#fmBox .gh').textContent()).toBe('.specs/project/project.yamlOpen in VS Code');

  const inspLink = async (view: string, path: string) => {
    await page.goto(`${srv.url}/#${view}`);
    await waitView(page, 'v-' + view);
    await page.locator(`[data-open="${path}"]`).click();
    await page.waitForFunction(href => document.querySelector('#insp.open .actions a')?.getAttribute('href') === href, routeJs.editorUrl(`${env.project}/${path}`));
    expect(await page.locator('#insp .actions a').textContent()).toBe('Open in VS Code');
  };
  await inspLink('instructions', 'CLAUDE.md');
  await inspLink('skills', '.claude/skills/my-skill/SKILL.md');
  await inspLink('commands', '.claude/commands/mine.md');
  rmSync(join(env.project, '.claude', 'commands', 'mine.md'));
  await page.waitForFunction(() => /no longer exists/i.test(document.querySelector('#insp')!.textContent!));
  expect(await page.locator('#insp .actions a').count()).toBe(0);

  for (const view of ['explorer', 'security']) {
    await page.goto(`${srv.url}/#${view}`);
    await waitView(page, 'v-' + view);
    expect(await page.locator(`#v-${view}`).textContent()).not.toContain('Open in VS Code');
    expect(await page.locator(`#v-${view} a[href^="vscode:"]`).count()).toBe(0);
  }
});
