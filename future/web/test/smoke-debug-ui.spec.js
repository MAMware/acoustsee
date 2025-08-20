import { test, expect } from '@playwright/test';

// Smoke test: confirm debug UI mounts and action buttons respond (non-audio assertions only).
test('debug UI mounts and action buttons exist', async ({ page }) => {
  // Intercept ingest network calls to avoid external network dependency and CORS issues
  await page.route('https://acoustsee-analytics.mamware.workers.dev/**', route => route.fulfill({ status: 204, body: '' }));
  await page.goto('http://localhost:3000/?debug=true');
  // wait for panel
  const panel = await page.locator('#acoustsee-debug-panel');
  await expect(panel).toBeVisible({ timeout: 5000 });

  // check log view exists
  await expect(page.locator('#debug-log-view')).toBeVisible();

  // Click Resume Audio button (exists and wired)
  const resumeBtn = page.locator('#debug-controls-actions button', { hasText: 'Resume Audio' }).first();
  await expect(resumeBtn).toBeVisible();
  await resumeBtn.click();

  // Click Run Device Diags button
  const diagsBtn = page.locator('#debug-controls-actions button', { hasText: 'Run Device Diags' }).first();
  await expect(diagsBtn).toBeVisible();
  await diagsBtn.click();

  // Ensure log contains 'Device Diags' summary entry within a short period
  await expect(page.locator('#debug-log-view')).toContainText('Device Diags', { timeout: 8000 });
});
