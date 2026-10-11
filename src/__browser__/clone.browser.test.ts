// Clone a Repository's refusals (BL-091, BL-PM-002), TESTS-002.4. A stub `git` first on PATH (a shell
// script, so POSIX only) records each clone and fails it with git's own words, so nothing touches the
// network. Its progress, success and Cancel are BL-PM-009's tests in home.browser.test.ts.
import { Browser, Page } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { browserTest, Env, fixtureProject, launch, makeEnv, read, serve, Served, viewOf, waitToast, waitView } from './harness';

let browser: Browser;
let env: Env;
let srv: Served;
let bin: string;
let realPath: string | undefined;
beforeAll(async () => (browser = await launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
  env = makeEnv();
  bin = join(env.base, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh
if [ "$1" = config ]; then exit 1; fi
echo "$@" >> "${bin}/clones.log"
for target; do :; done
mkdir -p "$target/partial"
echo "Cloning into '$target'..." >&2
echo "fatal: repository 'https://example.com/owner/missing.git/' not found" >&2
exit 128
`,
    { mode: 0o755 },
  );
  realPath = process.env.PATH;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  srv = await serve(env, [fixtureProject(join(env.home, 'dev'), 'clone-project')]);
});
afterEach(async () => {
  process.env.PATH = realPath;
  await srv.close();
  env.cleanup();
});
const b = () => browser;
const log = () => (existsSync(join(bin, 'clones.log')) ? read(join(bin, 'clones.log')) : '');

const startClone = async (page: Page, url: string) => {
  if ((await viewOf(page)) !== 'v-home') await page.click('#homeBtn');
  await waitView(page, 'v-home');
  await page.click('#homeClone');
  await page.waitForFunction(() => document.querySelector('#openVeil')!.classList.contains('open'));
  await page.fill('#cloneIn', url);
  await page.fill('#cloneParentIn', '~/dev');
  await page.click('#openGo');
};
const sheetOpen = (page: Page) => page.evaluate(() => document.querySelector('#openVeil')!.classList.contains('open'));

(process.platform === 'win32' ? describe.skip : describe)('Clone a Repository refusals (BL-091)', () => {
  browserTest('a refused URL shows its text, runs no git, and the sheet stays open', b, async open => {
    const { page } = await open(srv, '#home');
    await startClone(page, 'http://example.com/owner/demo.git');
    await waitToast(page, /^Only https:\/\/host\/path, git@host:path and ssh:\/\/host\/path repository URLs can be cloned\.$/);
    expect(await sheetOpen(page)).toBe(true);
    expect(await page.inputValue('#cloneIn')).toBe('http://example.com/owner/demo.git');
    expect(log()).toBe('');
    expect(existsSync(join(env.home, 'dev', 'demo'))).toBe(false);
  }, [/Failed to load resource/]);

  browserTest("a failing clone shows git's own line, leaves no folder, and the sheet stays open", b, async open => {
    const { page } = await open(srv, '#home');
    await startClone(page, 'https://example.com/owner/missing.git');
    await waitToast(page, /^git clone failed: .*fatal: repository 'https:\/\/example\.com\/owner\/missing\.git\/' not found$/);
    expect(log()).toContain('https://example.com/owner/missing.git');
    expect(await sheetOpen(page)).toBe(true);
    expect(await page.locator('#openGo').isDisabled()).toBe(false);
    expect(existsSync(join(env.home, 'dev', 'missing'))).toBe(false);
  }, [/Failed to load resource/]);
});
