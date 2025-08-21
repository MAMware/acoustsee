import { test, expect } from '@playwright/test';

test('boot captures dynamic import errors (browser)', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for boot to initialize and ensure debugStatus element exists in the DOM (may be hidden)
  await page.waitForSelector('#debugStatus', { state: 'attached', timeout: 10000 });

  // Trigger a dynamic import that throws; capture the exception and allow boot handlers to run
  const result = await page.evaluate(async () => {
    try {
      await import('/thrower.mjs');
      return { imported: true };
    } catch (err) {
      // give the boot error handler a short moment to update the UI
      await new Promise(r => setTimeout(r, 300));
      const status = document.querySelector('#debugStatus')?.textContent || '';
      return { imported: false, errorMessage: err && err.message, debugStatus: status };
    }
  });

  expect(result.imported).toBeFalsy();
  // Error message can vary across environments (fetch vs module-eval), ensure boot UI updated
  expect(result.debugStatus.length).toBeGreaterThan(0);
});
