// The Connect Your AI IDE card (BL-PM-007), TESTS-002.4.
import { Browser } from 'playwright-core';
import { browserTest, Env, launch, makeEnv, routeJs, serve, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(() => (env = makeEnv()));
afterEach(() => env.cleanup());
const b = () => browser;

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
  browserTest(`with --mcp the card holds the config line and Copy puts it on the clipboard (${light ? 'light' : 'dark'}, 1280px and 420px)`, b, async open => {
    const srv = await serve(env, [env.project], { mcp: true });
    try {
      for (const width of [1280, 420]) {
        const { page } = await open(srv, '#home', { light, width });
        await waitView(page, 'v-home');
        await page.locator('#homeMcp').waitFor({ state: 'visible' });
        const line = routeJs.mcpConfigLine(srv.host, srv.handle.mcpToken!);
        expect(await page.locator('#mcpLine').textContent()).toBe(line);
        expect(await page.locator('#mcpNote').textContent()).toBe(
          'Add this to your IDE\u2019s MCP settings, or to .mcp.json in your project and add .mcp.json to .gitignore. The token changes each time specpilot serve starts.',
        );
        await page.click('#mcpCopy');
        await waitToast(page, /^Copied\.$/);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    } finally {
      await srv.close();
    }
  });
}

browserTest('with SPECPILOT_MCP_TOKEN the line names the variable and the page never holds its value', b, async open => {
  const value = 'e'.repeat(40);
  const srv = await serve(env, [env.project], { mcp: true, mcpToken: value });
  try {
    const { page } = await open(srv, '#home');
    await page.locator('#homeMcp').waitFor({ state: 'visible' });
    expect(await page.locator('#mcpLine').textContent()).toBe(routeJs.mcpConfigLine(srv.host, '${SPECPILOT_MCP_TOKEN}'));
    // The file then holds the variable's name, not a secret, so this note does not ask for .gitignore (BL-089/BL-087 default 15).
    expect(await page.locator('#mcpNote').textContent()).toBe(
      'Add this to your IDE\u2019s MCP settings or to .mcp.json in your project. Claude Code fills in ${SPECPILOT_MCP_TOKEN} from the environment; for other IDEs, put the token in its place.',
    );
    expect(await page.content()).not.toContain(value);
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
