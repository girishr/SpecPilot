// Explorer rows show size, lines and ≈tokens (BL-205, REQ-002.H.80), TESTS-002.4.
// The fixture project; each test writes its own files under .specs/planning/.
import { Browser, Page } from 'playwright-core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, launch, makeEnv, noSideScroll, serve, Served, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  const put = (name: string, text: string) => writeFileSync(join(env.project, '.specs', 'planning', name), text);
  put('fm.md', '---\nfileID: FM-001\nversion: 1.0\n---\n\n# Front matter\n');
  put('one.md', 'one line, no newline');
  put('empty.md', '');
  put('k5000.md', 'x'.repeat(5000));
  put('m15.md', 'x'.repeat(1.5 * 1048576));
  for (const n of [1023, 1024, 1048575, 1048576, 3996, 3997]) put(`b${n}.md`, 'x'.repeat(n));
  srv = await serve(env, [env.project]);
});
afterEach(async () => {
  await srv.close();
  env.cleanup();
});
const b = () => browser;

const det = (page: Page, path: string) => page.locator(`#exBody .row[data-file="${path}"] .det`).innerText();

browserTest('each row shows size, lines and tokens after its front matter, units picked after rounding', b, async o => {
  const { page } = await o(srv, '#explorer');
  await waitView(page, 'v-explorer');
  expect(await det(page, 'planning/fm.md')).toBe('fileID: FM-001 · version: 1.0 · 52 B · 6 lines · ~13 tokens');
  expect(await det(page, 'planning/one.md')).toBe('20 B · 1 line · ~5 tokens');
  expect(await det(page, 'planning/empty.md')).toBe('0 B · 0 lines · ~0 tokens');
  expect(await det(page, 'planning/k5000.md')).toBe('4.9 KB · 1 line · ~1.3k tokens');
  expect(await det(page, 'planning/m15.md')).toBe('1.5 MB · 1 line · ~393.2k tokens');
  expect(await det(page, 'planning/b1023.md')).toBe('1023 B · 1 line · ~256 tokens');
  expect(await det(page, 'planning/b1024.md')).toBe('1.0 KB · 1 line · ~256 tokens');
  expect(await det(page, 'planning/b1048575.md')).toBe('1.0 MB · 1 line · ~262.1k tokens');
  expect(await det(page, 'planning/b1048576.md')).toBe('1.0 MB · 1 line · ~262.1k tokens');
  expect(await det(page, 'planning/b3996.md')).toBe('3.9 KB · 1 line · ~999 tokens');
  expect(await det(page, 'planning/b3997.md')).toBe('3.9 KB · 1 line · ~1.0k tokens');
});

browserTest('the Overview Spec files card shows no size; at 420px Explorer scrolls nowhere sideways', b, async o => {
  const { page } = await o(srv);
  await waitView(page, 'v-overview');
  expect(await page.locator('#ovBox [data-card="files"]').innerText()).not.toMatch(/ B ·|tokens/);
  const narrow = (await o(srv, '#explorer', { width: 420 })).page;
  await waitView(narrow, 'v-explorer');
  await narrow.locator('#exBody .row[data-file="planning/b1048575.md"]').waitFor();
  expect(await noSideScroll(narrow)).toBe(true);
});
