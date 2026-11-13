// The Connect Your AI IDE card (BL-PM-007), per IDE since BL-157 (REQ-002.H.68), TESTS-002.4.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, routeJs, serve, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(() => (env = makeEnv()));
afterEach(() => env.cleanup());
const b = () => browser;

const chosen = (page: Page, group = '#mcpIde') => page.locator(`${group} [aria-checked="true"]`).textContent();
const choose = async (page: Page, ide: string, group = '#mcpIde') => {
  await page.click(`${group} [data-v="${ide}"]`);
  await page.waitForFunction(([g, v]) => document.querySelector(`${g} [aria-checked="true"]`)?.textContent === v, [group, ide]);
};
/** The block, the note and the buttons show `ide`'s config, and no button says more than its name. */
const shows = async (page: Page, ide: string, token: string | null, pre = '#mcpLine', note = '#mcpNote', group = '#mcpIde') => {
  const c = routeJs.mcpConfig(ide, page.url().split('/')[2], token);
  expect([ide, await page.locator(pre).textContent(), await page.locator(note).textContent()]).toEqual([ide, c.text, c.note]);
  expect(await page.locator(`${group} [role="radio"]`).allTextContents()).toEqual(routeJs.MCP_IDES);
  return c;
};
const homeCard = async (page: Page) => {
  await waitView(page, 'v-home');
  await page.locator('#homeMcp').waitFor({ state: 'visible' });
};

browserTest('no card without --mcp', b, async open => {
  const srv = await serve(env, [env.project]);
  try {
    const { page } = await open(srv, '#home');
    await waitView(page, 'v-home');
    expect(await page.locator('#homeMcp').isHidden()).toBe(true);
  } finally {
    await srv.close();
  }
});

for (const light of [false, true]) {
  browserTest(`with --mcp each IDE shows its own file and config, and Copy copies it (${light ? 'light' : 'dark'}, 1280px and 420px)`, b, async open => {
    const srv = await serve(env, [env.project], { mcp: true });
    try {
      for (const width of [1280, 420]) {
        const { page } = await open(srv, '#home', { light, width });
        await homeCard(page);
        expect(await page.locator('#homeMcp .gh .cnt').textContent()).toBe('optional');
        expect(await chosen(page)).toBe('Claude Code'); // the fixture has CLAUDE.md
        for (const ide of routeJs.MCP_IDES) {
          await choose(page, ide);
          const c = await shows(page, ide, srv.handle.mcpToken!);
          expect([ide, width, await noSideScroll(page)]).toEqual([ide, width, true]);
          await page.click('#mcpCopy');
          await waitToast(page, /^Copied\.$/);
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(c.text);
        }
        // the clipboard refused: the error toast, and the card still fits
        await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
        await page.click('#mcpCopy');
        await waitToast(page, /^Could not copy\. Select the line and copy it\.$/);
        expect([width, 'copy failed', await noSideScroll(page)]).toEqual([width, 'copy failed', true]);
      }
    } finally {
      await srv.close();
    }
  });
}

browserTest('arrow keys move the choice, as a radio group does', b, async open => {
  const srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await page.focus('#mcpIde [data-v="Claude Code"]');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#mcpIde [aria-checked="true"]')?.textContent === 'Cursor');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.v)).toBe('Cursor');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('#mcpIde [aria-checked="true"]')?.textContent === 'Antigravity');
  } finally {
    await srv.close();
  }
});

browserTest('with SPECPILOT_MCP_TOKEN each config names the variable its IDE reads, or a placeholder, and the page never holds its value', b, async open => {
  const value = 'e'.repeat(40);
  const srv = await serve(env, [env.project], { mcp: true, mcpToken: value });
  try {
    for (const light of [false, true]) {
      const { page } = await open(srv, '#home', { width: 420, light });
      await homeCard(page);
      for (const ide of routeJs.MCP_IDES) {
        await choose(page, ide);
        await shows(page, ide, null);
        expect([ide, light, await noSideScroll(page)]).toEqual([ide, light, true]);
      }
      await choose(page, 'Cursor');
      expect(await page.locator('#mcpLine').textContent()).toContain('"X-SpecPilot-Token": "${env:SPECPILOT_MCP_TOKEN}"');
      await choose(page, 'Antigravity');
      expect(await page.locator('#mcpLine').textContent()).toContain('"X-SpecPilot-Token": "<SPECPILOT_MCP_TOKEN value>"');
      expect(await page.locator('#mcpNote').textContent()).toContain('add .agents/mcp_config.json to .gitignore');
      expect(await page.content()).not.toContain(value);
    }
  } finally {
    await srv.close();
  }
});

browserTest('the preselection: the project\'s instruction file, else Claude Code; a kept choice wins; a throwing localStorage still renders', b, async open => {
  // Cursor's rules file and no CLAUDE.md
  rmSync(join(env.project, 'CLAUDE.md'));
  mkdirSync(join(env.project, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(env.project, '.cursor', 'rules', 'specpilot.mdc'), '---\nalwaysApply: true\n---\n');
  let srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await page.waitForFunction(() => document.querySelector('#mcpIde [aria-checked="true"]')?.textContent === 'Cursor');
    await shows(page, 'Cursor', srv.handle.mcpToken!);
    // a kept choice beats the guess, after a reload
    await choose(page, 'Codex');
    await page.reload();
    await homeCard(page);
    await page.waitForFunction(() => !!document.querySelector('#mcpIde [aria-checked="true"]'));
    expect(await chosen(page)).toBe('Codex');
    // localStorage throwing: the guess, and the card renders
    await page.context().addInitScript(() => {
      const no = () => { throw new Error('blocked'); };
      Object.defineProperty(window, 'localStorage', { get: no });
    });
    await page.reload();
    await homeCard(page);
    await page.waitForFunction(() => document.querySelector('#mcpIde [aria-checked="true"]')?.textContent === 'Cursor');
    await choose(page, 'VS Code'); // choosing still works, though nothing is kept
    await shows(page, 'VS Code', srv.handle.mcpToken!);
  } finally {
    await srv.close();
  }
  // no instruction file at all
  rmSync(join(env.project, '.cursor'), { recursive: true });
  srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    expect(await chosen(page)).toBe('Claude Code');
  } finally {
    await srv.close();
  }
});

browserTest('project.yaml ides beats the file guess: [windsurf] beside CLAUDE.md, [] over Cursor\'s rules file; a kept choice still wins (BL-158)', b, async open => {
  const yamlFile = join(env.project, '.specs', 'project', 'project.yaml');
  const base = readFileSync(yamlFile, 'utf-8');
  writeFileSync(yamlFile, base + '\nides: [windsurf]\n');
  let srv = await serve(env, [env.project], { mcp: true });
  try {
    for (const light of [false, true]) {
      const { page } = await open(srv, '#home', { width: 420, light });
      await homeCard(page);
      await page.waitForFunction(() => document.querySelector('#mcpIde [aria-checked="true"]')?.textContent === 'Windsurf');
      await shows(page, 'Windsurf', srv.handle.mcpToken!);
      expect([light, await noSideScroll(page)]).toEqual([light, true]);
    }
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await choose(page, 'Codex'); // kept in the browser
    await page.reload();
    await homeCard(page);
    await page.waitForFunction(() => !!document.querySelector('#mcpIde [aria-checked="true"]'));
    expect(await chosen(page)).toBe('Codex');
  } finally {
    await srv.close();
  }
  // an empty list: Claude Code, not the Cursor rules file's guess
  rmSync(join(env.project, 'CLAUDE.md'));
  mkdirSync(join(env.project, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(env.project, '.cursor', 'rules', 'specpilot.mdc'), '---\nalwaysApply: true\n---\n');
  writeFileSync(yamlFile, base + '\nides: []\n');
  srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await page.waitForFunction(() => !!document.querySelector('#mcpIde [aria-checked="true"]'));
    expect(await chosen(page)).toBe('Claude Code');
  } finally {
    await srv.close();
  }
});

browserTest('one choice for Home and the Setup view, kept across a reload, and the Setup view fits at 420px with each IDE', b, async open => {
  const bare = join(env.home, 'dev', 'acme-api'); // a folder without .specs/: the Setup view
  mkdirSync(bare, { recursive: true });
  const srv = await serve(env, [env.project, bare], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await choose(page, 'Windsurf');
    await page.goto(`${srv.url}/#1/board`);
    await waitView(page, 'v-setup');
    expect(await chosen(page, '#suIde')).toBe('Windsurf');
    await shows(page, 'Windsurf', srv.handle.mcpToken!, '#suConfig', '#suMcpNote', '#suIde');
    await page.reload();
    await waitView(page, 'v-setup');
    expect(await chosen(page, '#suIde')).toBe('Windsurf');
    for (const light of [false, true]) {
      const { page: narrow } = await open(srv, '#1/board', { width: 420, light });
      await waitView(narrow, 'v-setup');
      for (const ide of routeJs.MCP_IDES) {
        await choose(narrow, ide, '#suIde');
        const c = await shows(narrow, ide, srv.handle.mcpToken!, '#suConfig', '#suMcpNote', '#suIde');
        expect([ide, light, await noSideScroll(narrow)]).toEqual([ide, light, true]);
        if (ide === 'Codex') {
          await narrow.click('#suConfigCopy');
          await waitToast(narrow, /^Copied\.$/);
          expect(await narrow.evaluate(() => navigator.clipboard.readText())).toBe(c.text);
        }
      }
    }
  } finally {
    await srv.close();
  }
});

browserTest('a live reload keeps focus on the IDE button that had it', b, async open => {
  const srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await homeCard(page);
    await page.focus('#mcpIde [data-v="Claude Code"]');
    const rev = await page.evaluate(() => Number(document.documentElement.dataset.rev || 0));
    const roadmap = join(env.project, '.specs', 'planning', 'roadmap.md');
    writeFileSync(roadmap, readFileSync(roadmap, 'utf-8') + '\nA line.\n');
    await page.waitForFunction(r => Number(document.documentElement.dataset.rev || 0) > r, rev);
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.v)).toBe('Claude Code');
  } finally {
    await srv.close();
  }
});

browserTest('the Setup view at 420px in both themes with SPECPILOT_MCP_TOKEN, per IDE, and after a Copy failure', b, async open => {
  const bare = join(env.home, 'dev', 'acme-api');
  mkdirSync(bare, { recursive: true });
  const value = 'e'.repeat(40);
  const srv = await serve(env, [env.project, bare], { mcp: true, mcpToken: value });
  try {
    for (const light of [false, true]) {
      const { page } = await open(srv, '#1/board', { width: 420, light });
      await waitView(page, 'v-setup');
      for (const ide of routeJs.MCP_IDES) {
        await choose(page, ide, '#suIde');
        await shows(page, ide, null, '#suConfig', '#suMcpNote', '#suIde');
        expect([ide, light, await noSideScroll(page)]).toEqual([ide, light, true]);
      }
      expect(await page.locator('#suMcpNote').textContent()).toContain('add .agents/mcp_config.json to .gitignore'); // Antigravity, the last
      await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
      await page.click('#suConfigCopy');
      await waitToast(page, /^Could not copy\. Select the line and copy it\.$/);
      expect([light, 'copy failed', await noSideScroll(page)]).toEqual([light, 'copy failed', true]);
      expect(await page.content()).not.toContain(value);
    }
  } finally {
    await srv.close();
  }
});

browserTest('--read-only --mcp has no Home and no card', b, async open => {
  const srv = await serve(env, [env.project], { mcp: true, readOnly: true });
  try {
    const { page } = await open(srv, '#home');
    await waitView(page, 'v-board'); // #home falls back to Tasks without Home
    expect(await page.locator('#homeBtn').isHidden()).toBe(true);
    expect(await page.locator('#homeMcp').isHidden()).toBe(true);
  } finally {
    await srv.close();
  }
});
