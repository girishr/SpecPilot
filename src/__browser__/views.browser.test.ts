// Project views: Commands and Skills with Regenerate All (BL-PM-006) and the Open in VS Code link (BL-PM-008), TESTS-002.4.
import { Browser } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, makeProject, routeJs, serve, Served, waitView } from './harness';

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
