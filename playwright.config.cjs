const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './future/web/test/e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
};
