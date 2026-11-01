// BL-146 (REQ-002.H.64 (2)): serve --open starts the browser without any SPECPILOT_* variable.
const spawn = jest.fn(() => ({ on: jest.fn(), unref: jest.fn() }));
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn }));

import { openBrowser } from '../commands/serve';
import { Logger } from '../utils/logger';

test('openBrowser passes an environment without SPECPILOT_* to the browser', () => {
  process.env.SPECPILOT_MCP_TOKEN = 'x'.repeat(40);
  try {
    openBrowser('http://127.0.0.1:4321/', new Logger());
  } finally {
    delete process.env.SPECPILOT_MCP_TOKEN;
  }
  expect(spawn).toHaveBeenCalledTimes(1);
  const opts = (spawn.mock.calls[0] as unknown[])[2] as { env?: NodeJS.ProcessEnv };
  expect(opts.env).toBeDefined();
  expect(Object.keys(opts.env!).filter(k => k.startsWith('SPECPILOT_'))).toEqual([]);
  expect(opts.env!.PATH).toBe(process.env.PATH);
});
