// No project served (BL-080): Home first, every project hash to Home, the first open becomes project 0,
// and 420px with no sideways scroll in every state the page has there. TESTS-002.4.
import { Browser } from 'playwright-core';
import { request } from 'http';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, makeProject, noSideScroll, read, serve, Served, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  makeProject(join(env.home, 'dev'), 'third-project');
  srv = await serve(env, [], { mcp: true });
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

/** One tools/call to /mcp, as an IDE sends it: the parsed result. */
const tool = (s: Served, name: string, args: Record<string, unknown>) =>
  new Promise<{ isError?: boolean; content: { text: string }[] }>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    const req = request(`${s.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SpecPilot-Token': s.handle.mcpToken!, 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve(JSON.parse(text).result));
    });
    req.on('error', reject);
    req.end(body);
  });

browserTest('with no project served the page opens on Home with no tile; project hashes land on #home and #new opens the Setup view', b, async open => {
  const { page } = await open(srv);
  await waitView(page, 'v-home');
  expect(await page.locator('#projList .tile').count()).toBe(0);
  expect(await page.evaluate(() => location.hash)).toBe('#home');
  expect(await page.locator('#homeBox .empty').textContent()).toBe('No projects remembered yet.');
  for (const hash of ['#board', '#2/file/quality/tests.md']) {
    const t = await open(srv, hash);
    await waitView(t.page, 'v-home');
    expect(await t.page.evaluate(() => location.hash)).toBe('#home');
  }
  const n = await open(srv, '#new');
  await waitView(n.page, 'v-setup');
  expect(await n.page.locator('#title').textContent()).toBe('Start a new project with SpecPilot');
}, [/Failed to load resource/]); // #2/…: the boot asks for project 2, gets 404 and retries without the parameter, by design

browserTest('Open a Project Folder on a server with no project gives project 0, its tile, its Tasks view and a registry entry', b, async open => {
  const { page } = await open(srv, '#home');
  await waitView(page, 'v-home');
  await page.click('#homeOpen');
  await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
  await page.fill('#pathIn', '~/dev/third-project');
  await page.click('#openGo');
  await page.waitForFunction(() => document.querySelectorAll('#projList .tile').length === 1);
  await waitView(page, 'v-board');
  expect(await page.evaluate(() => location.hash)).toBe('#board');
  expect(await page.locator('#curGrp').textContent()).not.toBe('');
  expect(read(env.registryFile)).toContain(join(env.home, 'dev', 'third-project'));
});

browserTest('420px, no sideways scroll: Home with no project, the New project Setup view in progress, and a refused registry, light and dark', b, async open => {
  for (const light of [false, true]) {
    const { page } = await open(srv, '#home', { width: 420, light });
    await waitView(page, 'v-home');
    expect(await noSideScroll(page)).toBe(true);
    const name = `fresh-project-${light ? 'light' : 'dark'}`;
    const n = await open(srv, '#new', { width: 420, light });
    await waitView(n.page, 'v-setup');
    await n.page.fill('#suName', name);
    await n.page.fill('#suParent', '~/dev');
    await n.page.press('#suParent', 'Tab');
    await n.page.waitForFunction(() => !(document.querySelector('#suPromptCopy') as HTMLButtonElement).disabled);
    await tool(srv, 'specpilot_setup_questions', { path: join(env.home, 'dev', name) });
    await n.page.waitForFunction(() => document.querySelectorAll('#suProgress li.done').length === 1 && document.querySelectorAll('#suProgress li.run').length === 1);
    expect(await noSideScroll(n.page)).toBe(true);
  }
  mkdirSync(join(env.home, '.specpilot'), { recursive: true });
  writeFileSync(env.registryFile, '{broken');
  const { page } = await open(srv, '#home', { width: 420 });
  await waitView(page, 'v-home');
  await page.waitForFunction(() => /could not be used/.test(document.querySelector('#homeBox')!.textContent ?? ''));
  expect(await noSideScroll(page)).toBe(true);
});
