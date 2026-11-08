// Every IDE file SpecPilot writes is listed (BL-152, REQ-002.H.65), TESTS-002.4. The fixture copy is made
// Cursor-only: its CLAUDE.md removed, SpecPilot's Cursor rules file and its 8 current commands written by the
// built generator, so the rows are known and never this repo's own.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, REPO, serve, Served, waitView } from './harness';

type Slash = typeof import('../utils/slashCommandGenerator');
// The built module, as the harness loads the server: the browser suite tests what ships.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const slash: Slash = require(join(REPO, 'dist', 'utils', 'slashCommandGenerator.js'));

const RULES = '.cursor/rules/specpilot.mdc';
let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  rmSync(join(env.project, 'CLAUDE.md'));
  mkdirSync(join(env.project, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(env.project, ...RULES.split('/')), '---\nalwaysApply: true\n---\n\n# Rules\n');
  new slash.SlashCommandGenerator().refreshCommands(env.project, 'cursor', false);
  srv = await serve(env, [env.project]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;
const go = async (page: Page, view: string) => {
  await page.goto(page.url().replace(/#.*$/, '#' + view));
  await waitView(page, 'v-' + view);
};
/** The Automation rows Commands and Skills carry no folder label, in any project (BL-155). */
const bareRows = async (page: Page, state: string) => {
  const rows = page.locator('[aria-labelledby="gAuto"]');
  const text = async (view: string) => (await rows.locator(`[data-v="${view}"]`).textContent())!.trim();
  expect([state, await text('commands'), await text('skills')]).toEqual([state, 'Commands', 'Skills']);
  expect([state, await page.locator('#cmdMeta, #sklMeta').count()]).toEqual([state, 0]);
  expect([state, await rows.textContent()]).not.toEqual([state, expect.stringContaining('.claude')]);
};
const regenDone = (page: Page) =>
  page.waitForFunction(() => !(document.querySelector('#cmdRegen') as HTMLButtonElement).disabled && !!document.querySelector('#regenNote')?.textContent);

browserTest("a Cursor-only project's commands show under From SpecPilot, its rules file under Instructions", b, async open => {
  const { page } = await open(srv, '#commands');
  await waitView(page, 'v-commands');
  expect(await page.locator('#cmdSpCnt').textContent()).toBe('8');
  expect(await page.locator('#cmdYouCnt').textContent()).toBe('0');
  expect(await page.locator('#cmdBox').textContent()).toContain('.cursor/commands/specpilot-status.md');
  await page.click('[data-open=".cursor/commands/specpilot-status.md"]');
  await page.locator('#insp .md').waitFor();
  expect(await page.locator('#insp').textContent()).toContain('.cursor/commands/specpilot-status.md');
  await page.keyboard.press('Escape');
  await page.click('#cmdRegen');
  await regenDone(page);
  expect(await page.locator('#regenNote').innerText()).toBe('Every SpecPilot command file is current.');
  await go(page, 'instructions');
  expect(await page.locator('#insMeta').textContent()).toBe('1 of 7');
  expect(await page.locator(`#insBox [data-open="${RULES}"]`).count()).toBe(1);
  expect(await page.locator('#insBox').textContent()).toContain('CODEX_INSTRUCTIONS.md');
});

browserTest('the left menu names no folder for Commands or Skills, and Instructions keeps its count', b, async open => {
  const { page } = await open(srv, '#commands');
  await waitView(page, 'v-commands');
  await bareRows(page, 'Cursor-only');
  expect(await page.locator('#insMeta').textContent()).toBe('1 of 7');
});

browserTest('at 420px in both themes the Commands and Instructions views fit idle, while Regenerate All runs and after an error', b, async open => {
  for (const light of [false, true]) {
    const { page } = await open(srv, '#commands', { width: 420, light });
    const theme = light ? 'light' : 'dark';
    await waitView(page, 'v-commands');
    expect([theme, 'commands idle', await noSideScroll(page)]).toEqual([theme, 'commands idle', true]);
    await bareRows(page, `${theme} idle`);
    await go(page, 'instructions');
    expect([theme, 'instructions idle', await noSideScroll(page)]).toEqual([theme, 'instructions idle', true]);
    await go(page, 'commands');
    // while it runs: the answer is held until the page has shown the busy button
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    await page.route('**/api/commands/regenerate**', async route => {
      await held;
      await route.continue();
    });
    await page.click('#cmdRegen');
    await page.waitForFunction(() => (document.querySelector('#cmdRegen') as HTMLButtonElement).disabled);
    expect([theme, 'commands running', await noSideScroll(page)]).toEqual([theme, 'commands running', true]);
    await bareRows(page, `${theme} running`);
    release();
    await regenDone(page);
    await page.unroute('**/api/commands/regenerate**');
    // an error answer
    await page.route('**/api/commands/regenerate**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The server could not finish this request.' }) }));
    await page.click('#cmdRegen');
    await regenDone(page);
    expect(await page.locator('#regenNote').innerText()).toBe('The server could not finish this request. Command files may have been partly written.');
    expect([theme, 'commands error', await noSideScroll(page)]).toEqual([theme, 'commands error', true]);
    await bareRows(page, `${theme} error`);
    expect(await page.locator('#cmdSpCnt').textContent()).toBe('8');
    await page.unroute('**/api/commands/regenerate**');
  }
}, [/status of 500/]);
