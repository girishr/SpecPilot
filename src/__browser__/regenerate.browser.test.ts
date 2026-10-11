// Regenerate All refreshes the Claude Code skill (BL-PM-012, REQ-002.H.40), TESTS-002.4. The fixture project
// has CLAUDE.md and an init-written project.yaml; the released render is made with the built code's own fill.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, REPO, serve, Served, waitView } from './harness';

type Agent = typeof import('../core/agentConfig');
type Slash = typeof import('../utils/slashCommandGenerator');
// The built modules, as the harness loads the server: the browser suite tests what ships.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const agent: Agent = require(join(REPO, 'dist', 'core', 'agentConfig.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const slash: Slash = require(join(REPO, 'dist', 'utils', 'slashCommandGenerator.js'));

const SKILL = '.claude/skills/specpilot-project/SKILL.md';
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
const skillFile = () => join(env.project, ...SKILL.split('/'));
const putSkill = (text: string) => {
  mkdirSync(join(env.project, '.claude', 'skills', 'specpilot-project'), { recursive: true });
  writeFileSync(skillFile(), text);
};
/** What v2.13.0 wrote for this project's project.yaml: SpecPilot's own, out of date. */
const released = () => {
  const context = slash.readSkillContext(env.project, '.specs');
  if (typeof context === 'string') throw new Error(`the fixture's project.yaml: ${context}`);
  return agent.fillReleasedSkill(agent.KNOWN_SKILL_TEMPLATES[1], context);
};
const note = (page: Page) => page.locator('#regenNote').innerText();
const regenerateAll = async (page: Page) => {
  await page.goto(page.url().replace(/#.*$/, '#commands'));
  await waitView(page, 'v-commands');
  await page.click('#cmdRegen');
  await page.waitForFunction(() => !(document.querySelector('#cmdRegen') as HTMLButtonElement).disabled && !!document.querySelector('#regenNote')?.textContent);
};
const skillGroup = async (page: Page) => {
  await page.goto(page.url().replace(/#.*$/, '#skills'));
  await waitView(page, 'v-skills');
  return page.evaluate(path => (document.querySelector('#sklBox')!.textContent!.includes(path) ? 'From SpecPilot' : document.querySelector('#sklMine')!.textContent!.includes(path) ? 'Yours' : null), SKILL);
};
/** No sideways scroll, and no two visible items of one group on top of each other. */
const fits = async (page: Page, state: string) => {
  expect([state, await noSideScroll(page)]).toEqual([state, true]);
  const overlap = await page.evaluate(() =>
    ['.gh > *', '#regenNote > *'].some(sel => {
      const boxes = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(e => e.offsetParent !== null && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect());
      return boxes.some((a, i) => boxes.some((c, j) => j > i && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1));
    }),
  );
  expect([state, overlap]).toEqual([state, false]);
};

browserTest("Regenerate All updates SpecPilot's own out-of-date skill, which stays under From SpecPilot", b, async open => {
  putSkill(released());
  const { page } = await open(srv, '#skills');
  expect(await skillGroup(page)).toBe('From SpecPilot');
  await regenerateAll(page);
  expect(await note(page)).toContain(`Updated: ${SKILL}.`);
  expect(await note(page)).not.toContain('Not listed on this page');
  expect(readFileSync(skillFile(), 'utf-8')).not.toBe(released());
  expect(await skillGroup(page)).toBe('From SpecPilot');
});

browserTest('Regenerate All keeps an edited skill, says why, and lists it under Yours', b, async open => {
  putSkill('---\nname: specpilot-project\n---\n\nMy own notes.\n');
  const { page } = await open(srv, '#commands');
  await regenerateAll(page);
  expect(await note(page)).toContain(`Kept as they were: ${SKILL} (does not match SpecPilot's render of project.yaml).`);
  expect(readFileSync(skillFile(), 'utf-8')).toBe('---\nname: specpilot-project\n---\n\nMy own notes.\n');
  expect(await skillGroup(page)).toBe('Yours');
});

browserTest('at 420px the Commands and Skills views fit idle, while Regenerate All runs, with its result lines and after an error', b, async open => {
  putSkill(released());
  const { page } = await open(srv, '#commands', { width: 420 });
  await waitView(page, 'v-commands');
  await fits(page, 'commands idle');
  expect(await skillGroup(page)).toBe('From SpecPilot');
  await fits(page, 'skills idle');
  // while it runs: the answer is held until the page has shown the busy button
  await page.goto(page.url().replace(/#.*$/, '#commands'));
  await waitView(page, 'v-commands');
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  await page.route('**/api/commands/regenerate**', async route => {
    await held;
    await route.continue();
  });
  await page.click('#cmdRegen');
  await page.waitForFunction(() => (document.querySelector('#cmdRegen') as HTMLButtonElement).disabled);
  await fits(page, 'commands running');
  release();
  await page.waitForFunction(() => !(document.querySelector('#cmdRegen') as HTMLButtonElement).disabled && !!document.querySelector('#regenNote')?.textContent);
  await page.unroute('**/api/commands/regenerate**');
  expect(await note(page)).toContain(`Updated: ${SKILL}.`);
  await fits(page, 'commands result');
  expect(await skillGroup(page)).toBe('From SpecPilot');
  await fits(page, 'skills after the result');
  // an error answer
  await page.route('**/api/commands/regenerate**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The server could not finish this request.' }) }));
  await regenerateAll(page);
  expect(await note(page)).toBe('The server could not finish this request. Command files may have been partly written.');
  await fits(page, 'commands error');
  expect(await skillGroup(page)).toBe('From SpecPilot');
  await fits(page, 'skills after the error');
}, [/status of 500/]);
