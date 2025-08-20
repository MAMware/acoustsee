const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './future/web/test',
  testMatch: '**/*.js',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: 'npm run start:static',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage'
          ]
        },
        permissions: ['camera']
      } }
  ]
};
