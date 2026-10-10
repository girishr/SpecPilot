// Browser tests for the specpilot serve page (BL-079, ARCH-004.51): `npm run test:browser`, never `npm test`.
// They drive the built server (dist/) in headless Chromium through playwright-core.
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.browser.json' }] },
  roots: ['<rootDir>/src'],
  testMatch: ['**/__browser__/**/*.test.ts'],
  maxWorkers: 1,
  testTimeout: 60000,
};
