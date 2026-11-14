// Every IDE file SpecPilot writes is listed (BL-152, REQ-002.H.65), TESTS-002.4. The fixture copy is made
// Cursor-only: its CLAUDE.md removed, SpecPilot's Cursor rules file and its 8 current commands written by the
// built generator, so the rows are known and never this repo's own.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

// Every documented project skills folder (BL-156, REQ-002.H.67): the skills are written here, so the rows are known.
const skill = (rel: string) => {
  mkdirSync(join(env.project, ...rel.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(env.project, ...rel.split('/')), '---\nname: x\ndescription: A skill.\n---\n\nA skill.\n');
};
const counts = async (page: Page) => [await page.locator('#sklSpCnt').textContent(), await page.locator('#sklYouCnt').textContent()];

browserTest("a Cursor-only project's .cursor/skills and .agents/skills skills are listed under Yours and open", b, async open => {
  skill('.cursor/skills/x/SKILL.md');
  skill('.agents/skills/y/SKILL.md');
  const { page } = await open(srv, '#skills');
  await waitView(page, 'v-skills');
  await page.waitForFunction(() => document.querySelector('#sklYouCnt')?.textContent === '2');
  expect(await counts(page)).toEqual(['0', '2']);
  expect(await page.locator('#sklMine').textContent()).toEqual(expect.stringContaining('.agents/skills/y/SKILL.md'));
  expect(await page.locator('#sklMine').textContent()).toEqual(expect.stringContaining('.cursor/skills/x/SKILL.md'));
  expect(await page.locator('[aria-labelledby="gAuto"] [data-v="skills"]').count()).toBe(1);
  await page.click('[data-open=".cursor/skills/x/SKILL.md"]');
  await page.locator('#insp .md').waitFor();
  expect(await page.locator('#insp').textContent()).toContain('.cursor/skills/x/SKILL.md');
});

browserTest('at 420px in both themes the Skills view fits empty, with skills, with a long path, with a skill open and after its file is deleted', b, async open => {
  const LONG = `.github/skills/${'a-very-long-skill-folder-name-'.repeat(4)}end/SKILL.md`;
  for (const light of [false, true]) {
    const theme = light ? 'light' : 'dark';
    rmSync(join(env.project, '.cursor', 'skills'), { recursive: true, force: true });
    rmSync(join(env.project, '.agents'), { recursive: true, force: true });
    rmSync(join(env.project, '.github', 'skills'), { recursive: true, force: true });
    const { page } = await open(srv, '#skills', { width: 420, light });
    await waitView(page, 'v-skills');
    expect([theme, await counts(page)]).toEqual([theme, ['0', '0']]);
    expect([theme, 'empty', await noSideScroll(page)]).toEqual([theme, 'empty', true]);
    skill('.cursor/skills/x/SKILL.md');
    skill('.agents/skills/y/SKILL.md');
    await page.waitForFunction(() => document.querySelector('#sklYouCnt')?.textContent === '2');
    expect([theme, 'present', await noSideScroll(page)]).toEqual([theme, 'present', true]);
    skill(LONG);
    await page.waitForFunction(() => document.querySelector('#sklYouCnt')?.textContent === '3');
    expect([theme, 'long path', await noSideScroll(page)]).toEqual([theme, 'long path', true]);
    await page.click(`[data-open="${LONG}"]`);
    await page.locator('#insp .md').waitFor();
    expect([theme, 'open', await noSideScroll(page)]).toEqual([theme, 'open', true]);
    rmSync(join(env.project, ...LONG.split('/')));
    await page.waitForFunction(() => /no longer exists/i.test(document.querySelector('#insp')!.textContent!));
    expect([theme, 'deleted', await noSideScroll(page)]).toEqual([theme, 'deleted', true]);
  }
});

// The IDEs project.yaml lists decide Open in Cursor (BL-158, REQ-002.A.13); the fixture copy's project.yaml has none.
const listIdes = (line: string) => {
  const f = join(env.project, '.specs', 'project', 'project.yaml');
  writeFileSync(f, readFileSync(f, 'utf-8') + `\n${line}\n`);
};
const ideMenu = async (page: Page) => {
  await page.locator('#ideBtn').click();
  await page.locator('#ideMenu').waitFor({ state: 'visible' });
  return page.$$eval('#ideMenu [role=menuitem]', els => els.map(e => e.textContent));
};

browserTest('ides: [cursor] shows Open in Cursor without the rules file, at 420px in both themes', b, async open => {
  rmSync(join(env.project, ...RULES.split('/')));
  listIdes('ides: [cursor]');
  for (const light of [false, true]) {
    const { page } = await open(srv, '#board', { width: 420, light });
    await waitView(page, 'v-board');
    await page.locator('#ideBtn').waitFor({ state: 'visible' });
    expect(await ideMenu(page)).toEqual(['Open in Cursor']);
    expect([light, await noSideScroll(page)]).toEqual([light, true]);
  }
});

browserTest('ides: [vscode] hides Open in Cursor though the rules file is there', b, async open => {
  listIdes('ides: [vscode]');
  const { page } = await open(srv, '#board');
  await waitView(page, 'v-board');
  expect(await page.locator('#ideWrap').isHidden()).toBe(true);
});


// An absent instruction file says why (BL-161, REQ-002.H.69): the fixture copy is Cursor-only (its rules file, no
// CLAUDE.md) and its project.yaml lists no IDEs until a test appends a list.
const absent = (page: Page) => page.$$eval('#insBox > .row:not(.act)', rows => rows.map(r => [
  r.querySelector('.id')!.textContent, r.querySelector('.trail .pill')!.textContent, r.querySelector('.pill')!.className,
  r.querySelector('.det')?.textContent ?? null,
]));
const insAt420 = async (open: Parameters<Parameters<typeof browserTest>[2]>[0], state: string, check: (page: Page) => Promise<void>) => {
  for (const light of [false, true]) {
    const { page } = await open(srv, '#instructions', { width: 420, light });
    await waitView(page, 'v-instructions');
    await check(page);
    expect([state, light, await noSideScroll(page)]).toEqual([state, light, true]);
  }
};
const NOT_NEEDED = (path: string, uses: string) => [path, 'not needed', 'pill gray', `This project uses ${uses}.`];

browserTest('without a list, a Cursor project reads every other file as not needed, at 420px in both themes', b, async open => {
  await insAt420(open, 'not needed', async page => {
    expect(await absent(page)).toEqual(['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md', '.windsurfrules', '.antigravity/rules.md', 'CODEX_INSTRUCTIONS.md'].map(p => NOT_NEEDED(p, 'Cursor')));
    expect(await page.locator('#insMeta').textContent()).toBe('1 of 7');
    expect(await page.locator(`#insBox [data-open="${RULES}"] .det`).textContent()).toMatch(/^\d+ bytes$/);
  });
});

browserTest('a listed IDE without its file reads missing, names joined with a comma, at 420px in both themes', b, async open => {
  listIdes('ides: [cursor, vscode, codex]');
  await insAt420(open, 'missing', async page => {
    const uses = 'Cursor, VS Code, Codex';
    expect(await absent(page)).toEqual([
      NOT_NEEDED('CLAUDE.md', uses), NOT_NEEDED('AGENTS.md', uses),
      ['.github/copilot-instructions.md', 'missing', 'pill orange', 'SpecPilot writes it for VS Code, Codex.'],
      NOT_NEEDED('.windsurfrules', uses), NOT_NEEDED('.antigravity/rules.md', uses),
      ['CODEX_INSTRUCTIONS.md', 'missing', 'pill orange', 'SpecPilot writes it for Codex.'],
    ]);
    expect(await page.locator('#insMeta').textContent()).toBe('1 of 7');
  });
});

browserTest('with ides: [] no IDE is known, so an absent file reads not in this repo, at 420px in both themes', b, async open => {
  listIdes('ides: []');
  await insAt420(open, 'not in this repo', async page => {
    const rows = await absent(page);
    expect(rows).toHaveLength(6);
    expect(rows.every(([, pill, cls, det]) => pill === 'not in this repo' && cls === 'pill gray' && det === null)).toBe(true);
    expect(await page.locator(`#insBox [data-open="${RULES}"]`).count()).toBe(1);
  });
});

// Windsurf's project skills folders (BL-164, REQ-002.H.70): its docs name .devin/skills/ and the legacy .windsurf/skills/.
browserTest("Windsurf's .devin/skills and .windsurf/skills skills are listed under Yours and open, at 420px in both themes", b, async open => {
  skill('.devin/skills/d/SKILL.md');
  skill('.windsurf/skills/w/SKILL.md');
  for (const light of [false, true]) {
    const { page } = await open(srv, '#skills', { width: 420, light });
    await waitView(page, 'v-skills');
    await page.waitForFunction(() => document.querySelector('#sklYouCnt')?.textContent === '2');
    expect(await counts(page)).toEqual(['0', '2']);
    expect(await page.$$eval('#sklMine [data-open]', els => els.map(e => e.getAttribute('data-open')))).toEqual(['.devin/skills/d/SKILL.md', '.windsurf/skills/w/SKILL.md']);
    expect([light, 'listed', await noSideScroll(page)]).toEqual([light, 'listed', true]);
    await page.click('[data-open=".windsurf/skills/w/SKILL.md"]');
    await page.locator('#insp .md').waitFor();
    expect(await page.locator('#insp').textContent()).toContain('.windsurf/skills/w/SKILL.md');
    expect([light, 'open', await noSideScroll(page)]).toEqual([light, 'open', true]);
  }
});
