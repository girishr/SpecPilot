// The Setup view (BL-103, REQ-002.H.41), TESTS-002.4: Open, Clone and Start a New Project in the states
// idle, connected, MCP off and --read-only (BL-103), and running and done driven by real setup tool calls (BL-104).
// Folders are fixture projects or empty scratch folders; a stub `git` (POSIX only) stands in for a clone.
import { Browser, Page } from 'playwright-core';
import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { request } from 'http';
import { browserTest, Env, launch, makeEnv, noSideScroll, routeJs, serve, Served, until, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let bare: string; // a folder without .specs/
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(() => {
  env = makeEnv();
  bare = join(env.home, 'dev', 'acme-api');
  mkdirSync(bare);
  writeFileSync(join(bare, 'README.md'), '# acme\n');
});
afterEach(() => env.cleanup());
const b = () => browser;

/** One JSON-RPC message to /mcp with the server's token, as an IDE sends it. */
const mcp = (srv: Served, msg: unknown) =>
  new Promise<number>((resolve, reject) => {
    const body = JSON.stringify(msg);
    const req = request(`${srv.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SpecPilot-Token': srv.handle.mcpToken!, 'Content-Length': Buffer.byteLength(body) } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode!));
    });
    req.on('error', reject);
    req.end(body);
  });
/** One tools/call to /mcp, as an IDE sends it: the parsed result. */
const tool = (srv: Served, name: string, args: Record<string, unknown>) =>
  new Promise<{ structuredContent?: any; isError?: boolean; content: { text: string }[] }>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    const req = request(`${srv.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SpecPilot-Token': srv.handle.mcpToken!, 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve(JSON.parse(text).result));
    });
    req.on('error', reject);
    req.end(body);
  });
const BARE_ANSWERS = { projectType: 'brownfield', language: 'python', framework: 'none', apiParadigm: 'none', handle: 'jsmith', ide: 'vscode' };
/** Record, in the page, each row's done text and whether the page scrolls sideways at that moment: the view may flip to Tasks right after. */
const watchRows = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { seen: string[]; wide: boolean[] };
    w.seen = [];
    w.wide = [];
    new MutationObserver(() => {
      document.querySelectorAll('#suProgress li.done .d').forEach(d => {
        if (d.textContent && !w.seen.includes(d.textContent)) w.seen.push(d.textContent);
      });
      w.wide.push(document.documentElement.scrollWidth <= window.innerWidth);
    }).observe(document.querySelector('#suProgress')!, { subtree: true, childList: true, characterData: true, attributes: true });
  });
const seen = (page: Page) => page.evaluate(() => { const w = window as unknown as { seen: string[]; wide: boolean[] }; return { seen: w.seen, wide: w.wide }; });
const rowClasses = (page: Page) => page.locator('#suProgress li').evaluateAll(els => els.map(e => e.className));

const initialize = (srv: Served, clientInfo?: { name: string }) =>
  mcp(srv, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, ...(clientInfo ? { clientInfo } : {}) } });

const text = (page: Page, sel: string) => page.locator(sel).textContent();
const status = (page: Page) => text(page, '#suStatus');
const waitStatus = (page: Page, want: string) => page.waitForFunction(w => document.querySelector('#suStatus')!.textContent === w, want);
const STEPS = ['Read the code', 'Answer the questions', 'Write the files', 'Validate'];

browserTest('Open: heading, crumb, lead, the connect card with Copy, the prompt line, four rows not started, the add-specs footer', b, async open => {
  const srv = await serve(env, [env.project, bare], { mcp: true });
  try {
    const { page } = await open(srv, '#1/board');
    await waitView(page, 'v-setup');
    expect(await text(page, '#title')).toBe('Set up SpecPilot for this project');
    expect(await text(page, '#crumb')).toBe(`${bare} · no specs yet`);
    expect(await text(page, '#suLead')).toBe('acme-api has no SpecPilot specs yet. Your AI IDE sets them up: it reads the code, answers what it can, and asks you the rest.');
    expect(await page.locator('#suNew').isHidden()).toBe(true);
    expect(await page.locator('#suOff').isHidden()).toBe(true);
    const line = routeJs.mcpConfigLine(srv.host, srv.handle.mcpToken!);
    expect(await text(page, '#suConfig')).toBe(JSON.stringify(JSON.parse(line), null, 2));
    await page.click('#suConfigCopy');
    await waitToast(page, /^Copied\.$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line);
    expect(await status(page)).toBe('Waiting for a connection');
    expect(await text(page, '#suPrompt')).toBe(`Set up SpecPilot for ${bare}`);
    await page.click('#suPromptCopy');
    await page.waitForFunction(p => navigator.clipboard.readText().then(t => t === p), `Set up SpecPilot for ${bare}`);
    expect(await page.locator('#suProgress li').allTextContents()).toEqual(STEPS);
    expect(await page.locator('#suProgress li.wait').count()).toBe(4);
    expect(await text(page, '#suFoot')).toBe('Prefer the terminal? specpilot add-specs in that folder asks the same questions one by one.');
  } finally {
    await srv.close();
  }
});

browserTest('Connected: an initialize shows the client name without a reload, and one without a name shows Connected', b, async open => {
  const srv = await serve(env, [env.project, bare], { mcp: true });
  try {
    const { page } = await open(srv, '#1/board');
    await waitView(page, 'v-setup');
    expect(await status(page)).toBe('Waiting for a connection');
    expect(await initialize(srv, { name: 'claude-code' })).toBe(200);
    await waitStatus(page, 'Connected · claude-code');
    expect(await initialize(srv)).toBe(200);
    await waitStatus(page, 'Connected');
    const later = await open(srv, '#1/board'); // a page opened afterwards reads it from /api/specs
    await waitView(later.page, 'v-setup');
    await waitStatus(later.page, 'Connected');
  } finally {
    await srv.close();
  }
});

browserTest('MCP off: the amber block, steps dimmed and inert, no config line', b, async open => {
  const srv = await serve(env, [env.project, bare]);
  try {
    const { page } = await open(srv, '#1/board');
    await waitView(page, 'v-setup');
    expect(await text(page, '#suOff')).toBe('!This server was started with --no-mcp, so your IDE cannot reach it. Restart with specpilot serve and come back here.');
    expect(await page.locator('#suOff').isVisible()).toBe(true);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('#v-setup .step')).every(el => el.inert && el.classList.contains('off')))).toBe(true);
    expect(await page.locator('#suConfigBox').isHidden()).toBe(true);
    expect(await status(page)).toBe('');
  } finally {
    await srv.close();
  }
});

browserTest('--read-only: the read-only line in place of the blocks', b, async open => {
  const srv = await serve(env, [env.project, bare], { readOnly: true, mcp: true });
  try {
    const { page } = await open(srv, '#1/board');
    await waitView(page, 'v-setup');
    expect(await text(page, '#suNote')).toBe('Started with --read-only, so nothing can be set up here.');
    for (const id of ['#suLead', '#suConnect', '#suTell', '#suProgress', '#suFoot']) expect(await page.locator(id).isHidden()).toBe(true);
  } finally {
    await srv.close();
  }
});

browserTest('a .specs/ written outside the page replaces the Setup view with Tasks', b, async open => {
  const srv = await serve(env, [env.project, bare], { mcp: true });
  try {
    const { page } = await open(srv, '#1/board');
    await waitView(page, 'v-setup');
    mkdirSync(join(bare, '.specs', 'planning'), { recursive: true });
    writeFileSync(join(bare, '.specs', 'planning', 'tasks.md'), '# Tasks\n\n## Backlog\n\n| ID | Description |\n|---|---|\n| BL-001 | Fixture row |\n');
    await waitView(page, 'v-board');
  } finally {
    await srv.close();
  }
});

browserTest('New: a refused parent shows the server\'s message; a valid name and parent register the path, nothing is created', b, async open => {
  const srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#home');
    await waitView(page, 'v-home');
    await page.click('#homeNew');
    await waitView(page, 'v-setup');
    expect(await text(page, '#title')).toBe('Start a new project with SpecPilot');
    expect(await text(page, '#suLead')).toBe('Name the project and choose where it goes. Your AI IDE creates it and writes the specs from your answers.');
    expect(await page.locator('#crumb').isHidden()).toBe(true);
    expect(await page.locator('#suPromptCopy').isDisabled()).toBe(true);
    expect(await text(page, '#suFoot')).toBe('Prefer the terminal? specpilot init in that folder asks the same questions one by one.');
    await page.fill('#suName', 'bad name');
    await page.waitForFunction(() => /^Project name must start/.test(document.querySelector('#suErr')!.textContent ?? ''));
    await page.fill('#suName', 'acme-api');
    await page.fill('#suParent', '~/dev');
    expect(srv.handle.pending()).toBeNull(); // typing registers nothing; leaving the field does (BL-104)
    await page.press('#suParent', 'Tab');
    await page.waitForFunction(() => /acme-api already exists and is not empty\. Use Open a Project Folder/.test(document.querySelector('#suErr')!.textContent ?? ''));
    expect(srv.handle.pending()).toBeNull();
    const before = readdirSync(join(env.home, 'dev')).sort();
    await page.fill('#suName', 'fresh-app');
    await page.press('#suName', 'Tab');
    const target = join(env.home, 'dev', 'fresh-app');
    await page.waitForFunction(t => document.querySelector('#crumb')!.textContent === `${t} · no specs yet`, target);
    expect(srv.handle.pending()).toBe(target);
    expect(await page.locator('#suErr').textContent()).toBe('');
    expect(await text(page, '#suPrompt')).toBe('Start a SpecPilot project called fresh-app in ~/dev');
    expect(await page.locator('#suPromptCopy').isDisabled()).toBe(false);
    expect(readdirSync(join(env.home, 'dev')).sort()).toEqual(before);
    await page.fill('#suName', 'fresh-app2'); // changing a field takes the line back until the new path is registered
    await page.press('#suName', 'Tab');
    await until(() => srv.handle.pending() === join(env.home, 'dev', 'fresh-app2'), 'the new path to replace the old');
  } finally {
    await srv.close();
  }
}, [/Failed to load resource/]);

(process.platform === 'win32' ? describe.skip : describe)('Clone into the Setup view (stub git)', () => {
  let realPath: string | undefined;
  beforeEach(() => {
    const bin = join(env.base, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$1" = config ]; then exit 1; fi\nfor target; do :; done\nmkdir -p "$target/.git"; echo \'ref: refs/heads/main\' > "$target/.git/HEAD"; echo hi > "$target/README.md"\n', { mode: 0o755 });
    realPath = process.env.PATH;
    process.env.PATH = `${bin}:/usr/bin:/bin`;
  });
  afterEach(() => (process.env.PATH = realPath));

  browserTest('a clone without .specs/ shows the Clone lead with its URL', b, async open => {
    const srv = await serve(env, [env.project], { mcp: true });
    try {
      const { page } = await open(srv, '#home');
      await waitView(page, 'v-home');
      await page.click('#homeClone');
      await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
      await page.fill('#cloneIn', 'https://example.com/acme/widgets.git');
      await page.fill('#cloneParentIn', '~/dev');
      await page.click('#openGo');
      await waitView(page, 'v-setup');
      expect(await text(page, '#suLead')).toBe('Cloned https://example.com/acme/widgets.git. It has no SpecPilot specs yet. Your AI IDE sets them up: it reads the code, answers what it can, and asks you the rest.');
      expect(await text(page, '#suFoot')).toBe('Prefer the terminal? specpilot add-specs in that folder asks the same questions one by one.');
      // BL-104: the IDE's first call runs the rows of the cloned folder
      await tool(srv, 'specpilot_setup_questions', { path: join(env.home, 'dev', 'widgets') });
      await page.waitForFunction(() => document.querySelectorAll('#suProgress li.done').length === 1 && document.querySelectorAll('#suProgress li.run').length === 1);
    } finally {
      await srv.close();
    }
  });

  browserTest('420px, no sideways scroll: Clone with a long URL, idle, connected and MCP off, light and dark', b, async open => {
    const on = await serve(env, [env.project], { mcp: true });
    const off = await serve(env, [env.project]);
    try {
      let n = 0;
      for (const light of [false, true]) {
        for (const srv of [on, off]) {
          const { page } = await open(srv, '#home', { width: 420, light });
          await waitView(page, 'v-home');
          await page.click('#homeClone');
          await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
          await page.fill('#cloneIn', `https://git.example.com/a-long-organisation-name/a-rather-long-repository-name-${++n}.git`);
          await page.fill('#cloneParentIn', '~/dev');
          await page.click('#openGo');
          await waitView(page, 'v-setup');
          await page.waitForFunction(() => /^Cloned https:\/\/git\.example\.com\//.test(document.querySelector('#suLead')!.textContent ?? ''));
          expect(await noSideScroll(page)).toBe(true);
          if (srv === on) {
            await initialize(srv, { name: 'a-client-with-a-long-name-that-should-wrap-in-a-narrow-window' });
            await page.waitForFunction(() => /^Connected · /.test(document.querySelector('#suStatus')!.textContent ?? ''));
            expect(await noSideScroll(page)).toBe(true);
          } else expect(await page.locator('#suOff').isVisible()).toBe(true);
        }
      }
    } finally {
      await on.close();
      await off.close();
    }
  });
});

browserTest('420px, no sideways scroll: Open and New, idle, connected and MCP off, light and dark', b, async open => {
  const on = await serve(env, [env.project, bare], { mcp: true });
  const off = await serve(env, [env.project, bare]);
  mkdirSync(join(env.home, 'dev', 'occupied'));
  writeFileSync(join(env.home, 'dev', 'occupied', 'notes.txt'), 'mine\n');
  try {
    for (const light of [false, true]) {
      for (const srv of [on, off]) {
        for (const hash of ['#1/board', '#new']) {
          const { page } = await open(srv, hash, { width: 420, light });
          await waitView(page, 'v-setup');
          if (hash === '#new') {
            await page.fill('#suName', 'occupied'); // exists and is not empty: the refused registration
            await page.fill('#suParent', '~/dev');
            await page.press('#suParent', 'Tab');
            await page.waitForFunction(() => /already exists and is not empty/.test(document.querySelector('#suErr')!.textContent ?? ''));
            expect(await noSideScroll(page)).toBe(true);
            await page.fill('#suName', 'a-rather-long-project-name-for-a-narrow-window');
            await page.press('#suName', 'Tab');
          }
          expect(await noSideScroll(page)).toBe(true);
          if (srv === on) {
            await initialize(srv, { name: 'a-client-with-a-long-name-that-should-wrap-in-a-narrow-window' });
            await page.waitForFunction(() => /^Connected · /.test(document.querySelector('#suStatus')!.textContent ?? ''));
            expect(await noSideScroll(page)).toBe(true);
          }
        }
      }
    }
  } finally {
    await on.close();
    await off.close();
  }
}, [/Failed to load resource/]);

browserTest('Open: the IDE\'s calls move the rows from not started to running to done, then Tasks; 420px, light and dark', b, async open => {
  for (const light of [false, true]) {
    const folder = join(env.home, 'dev', `bare-${light ? 'light' : 'dark'}`);
    mkdirSync(folder);
    writeFileSync(join(folder, 'README.md'), '# bare\n');
    const srv = await serve(env, [env.project, folder], { mcp: true });
    try {
      const { page } = await open(srv, '#1/board', { width: 420, light });
      await waitView(page, 'v-setup');
      expect(await rowClasses(page)).toEqual(['wait', 'wait', 'wait', 'wait']);
      await watchRows(page);
      const q = await tool(srv, 'specpilot_setup_questions', { path: folder });
      expect(q.isError).toBeUndefined();
      await page.waitForFunction(() => document.querySelectorAll('#suProgress li.done').length === 1 && document.querySelectorAll('#suProgress li.run').length === 1);
      expect(await rowClasses(page)).toEqual(['done', 'run', 'wait', 'wait']);
      expect(await page.locator('#suProgress li').first().locator('.d').textContent()).toMatch(/^\d+ detected$/);
      expect(await noSideScroll(page)).toBe(true);
      const r = await tool(srv, 'specpilot_setup_project', { path: folder, answers: BARE_ANSWERS, asked: ['handle'] });
      expect(r.isError).toBeUndefined();
      await waitView(page, 'v-board'); // .specs/ appeared: the existing live reload opens the project
      const s2 = await seen(page);
      expect(s2.seen).toEqual(expect.arrayContaining(['5 from the code, 1 from you (Handle)', `${r.structuredContent.written.length} files`, `${r.structuredContent.validate.errors.length} errors, ${r.structuredContent.validate.warnings.length} warnings`]));
      expect(s2.wide.every(Boolean)).toBe(true);
    } finally {
      await srv.close();
    }
  }
});

browserTest('New: the rows run under #new, then the page switches to the created project; 420px', b, async open => {
  const srv = await serve(env, [env.project], { mcp: true });
  try {
    const { page } = await open(srv, '#new', { width: 420 });
    await waitView(page, 'v-setup');
    await page.fill('#suName', 'parcel-track');
    await page.fill('#suParent', '~/dev');
    await page.press('#suParent', 'Tab');
    const target = join(env.home, 'dev', 'parcel-track');
    await until(() => srv.handle.pending() === target, 'the target to be registered');
    await watchRows(page);
    await tool(srv, 'specpilot_setup_questions', { path: target });
    await page.waitForFunction(() => document.querySelectorAll('#suProgress li.run').length === 1);
    expect(await rowClasses(page)).toEqual(['done', 'run', 'wait', 'wait']);
    expect(await noSideScroll(page)).toBe(true);
    const r = await tool(srv, 'specpilot_setup_project', { path: target, answers: { projectType: 'greenfield', language: 'typescript', framework: 'none', apiParadigm: 'rest', handle: 'jsmith', ide: 'vscode', whatItDoes: 'Tracks parcels' }, asked: ['whatItDoes'] });
    expect(r.structuredContent.project).toBe(1);
    await waitView(page, 'v-board');
    await page.waitForFunction(() => location.hash.startsWith('#1/'));
    expect(await page.locator('#projList .tile').count()).toBe(2);
    const s2 = await seen(page);
    expect(s2.seen).toEqual(expect.arrayContaining(['6 from the code, 1 from you (What it does)', `${r.structuredContent.written.length} files`]));
    expect(s2.wide.every(Boolean)).toBe(true);
  } finally {
    await srv.close();
  }
});
