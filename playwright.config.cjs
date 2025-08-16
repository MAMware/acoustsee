const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './future/web/test/e2e',
  testMatch: '**/*.mjs',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  // Start a local static server for tests; Playwright will manage lifecycle.
  webServer: {
    command: 'npm run start:static',
    port: 3000,
    timeout: 120000,
    // In CI we want Playwright to always start a fresh server; locally reuse if present
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Use fake media stream device so getUserMedia resolves in headless
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            // Reduce GPU issues in CI
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage'
          ]
        },
        permissions: ['camera']
      } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'],
        launchOptions: {
          // Firefox doesn't support Chrome's fake media flags; rely on Playwright defaults
        },
        permissions: ['camera']
      } },
    { name: 'webkit', use: { ...devices['Desktop Safari'],
        launchOptions: {
          // WebKit on Linux in CI may be emulated; keep defaults
        },
        permissions: ['camera']
      } }
  ]
};
